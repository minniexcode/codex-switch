import { cliError } from "../domain/errors";
import { loadCopilotSdk } from "./copilot-sdk-loader";
import { probeCopilotSdkInstall } from "./copilot-installer";
import { RuntimeAvailability } from "./types";

type CopilotSdkModule = Record<string, unknown>;
type CopilotSessionLike = Record<string, unknown>;
type CopilotPermissionRequest = Record<string, unknown>;
type CopilotClientLike = {
  createSession?: (...args: unknown[]) => unknown;
  stop?: () => unknown;
};
type CopilotSessionOptions = {
  onPermissionRequest: (request: CopilotPermissionRequest) => boolean | Promise<boolean>;
};

/**
 * Probes whether the optional Copilot SDK runtime is installed and loadable.
 */
export function probeCopilotSdkRuntime(runtimesDir?: string): RuntimeAvailability {
  const status = probeCopilotSdkInstall(runtimesDir);
  if (!status.installed) {
    return {
      ok: false,
      runtime: "copilot-sdk",
      reason: "missing",
      cause: "The optional Copilot SDK runtime is not installed.",
      details: {
        installDir: status.installDir,
        packageName: status.packageName,
      },
    };
  }
  return {
    ok: true,
    runtime: "copilot-sdk",
    version: status.packageVersion ?? undefined,
    details: {
      installDir: status.installDir,
      packageName: status.packageName,
    },
  };
}

/**
 * Loads the lazily installed Copilot SDK and returns the module.
 */
export async function requireCopilotSdk(runtimesDir?: string): Promise<unknown> {
  return loadCopilotSdk(runtimesDir);
}

/**
 * Probes whether the lazily installed Copilot SDK can create a usable session.
 */
export async function readCopilotAuthState(runtimesDir?: string): Promise<{ ready: boolean; source: string; mode: string }> {
  const runtime = probeCopilotSdkRuntime(runtimesDir);
  if (!runtime.ok) {
    throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed.", runtime.details);
  }
  const { client, session } = await createCopilotSession(runtimesDir);
  await stopCopilotClient(client);
  return {
    ready: Boolean(session),
    source: "official-sdk",
    mode: "session",
  };
}

/**
 * Executes a single chat-completions style request through the optional Copilot SDK when available.
 */
export async function sendCopilotChatCompletion(args: {
  provider: string;
  payload: Record<string, unknown>;
  runtimesDir?: string;
}): Promise<Record<string, unknown>> {
  const { client, session, sdk } = await createCopilotSession(args.runtimesDir);
  try {
    const sendAndWait = resolveCallable(session, "sendAndWait") ?? resolveCallable(sdk, "sendAndWait");
    if (!sendAndWait) {
      throw cliError("COPILOT_SDK_UNSUPPORTED", "The installed Copilot SDK does not expose a supported sendAndWait API.", {
        provider: args.provider,
      });
    }

    const prompt = Array.isArray(args.payload.messages)
      ? args.payload.messages
          .map((entry) => {
            const message = entry as Record<string, unknown>;
            return `${String(message.role ?? "user")}: ${String(message.content ?? "")}`;
          })
          .join("\n")
      : "";

    const result = await Promise.resolve(sendAndWait({ model: args.payload.model, prompt }));
    const content =
      typeof result === "string"
        ? result
        : typeof (result as Record<string, unknown>)?.content === "string"
          ? String((result as Record<string, unknown>).content)
          : typeof (result as Record<string, unknown>)?.data === "object" &&
              typeof ((result as Record<string, unknown>).data as Record<string, unknown>).content === "string"
            ? String(((result as Record<string, unknown>).data as Record<string, unknown>).content)
            : JSON.stringify(result);

    return {
      id: `copilot-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: args.payload.model ?? "copilot",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
    };
  } finally {
    await stopCopilotClient(client);
  }
}

async function createCopilotSession(runtimesDir?: string): Promise<{
  sdk: CopilotSdkModule;
  client: CopilotClientLike | null;
  session: CopilotSessionLike;
}> {
  const sdk = (await requireCopilotSdk(runtimesDir)) as CopilotSdkModule;
  const client = createCopilotClient(sdk);
  const createSession =
    resolveCallable(client ? (client as Record<string, unknown>) : null, "createSession") ?? resolveCallable(sdk, "createSession");
  if (!createSession) {
    throw cliError("COPILOT_SDK_UNSUPPORTED", "The installed Copilot SDK does not expose a supported createSession API.", {});
  }
  try {
    const session = (await Promise.resolve(createSession(createSessionOptions(sdk)))) as CopilotSessionLike;
    return {
      sdk,
      client,
      session,
    };
  } catch (error: unknown) {
    if (classifyCopilotSessionError(error) === "unsupported") {
      throw cliError("COPILOT_SDK_UNSUPPORTED", "The installed Copilot SDK does not expose a compatible permission-handling session API.", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    throw cliError("COPILOT_AUTH_REQUIRED", "Copilot authentication is required before the local bridge can be used.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Builds the session options used consistently across auth probes and request execution.
 */
function createSessionOptions(sdk: CopilotSdkModule): CopilotSessionOptions {
  const approveAll = resolveApproveAll(sdk);
  if (approveAll) {
    return {
      onPermissionRequest: (request) => approveAll(request),
    };
  }

  return {
    onPermissionRequest: () => true,
  };
}

function createCopilotClient(sdk: CopilotSdkModule): CopilotClientLike | null {
  const ClientCtor = resolveConstructor(sdk, "CopilotClient");
  if (!ClientCtor) {
    return null;
  }
  try {
    return new ClientCtor();
  } catch (error: unknown) {
    throw cliError("COPILOT_SDK_UNSUPPORTED", "The installed Copilot SDK CopilotClient could not be constructed.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function stopCopilotClient(client: CopilotClientLike | null): Promise<void> {
  if (client && typeof client.stop === "function") {
    await Promise.resolve(client.stop());
  }
}

/**
 * Distinguishes true auth failures from SDK API-shape mismatches.
 */
function classifyCopilotSessionError(error: unknown): "auth" | "unsupported" {
  const message = error instanceof Error ? error.message : String(error);
  if (/onPermissionRequest/i.test(message) || /permission/i.test(message)) {
    return "unsupported";
  }
  return "auth";
}

function resolveCallable(target: Record<string, unknown> | null, name: string): ((...args: unknown[]) => unknown) | null {
  if (!target) {
    return null;
  }
  const direct = target[name];
  if (typeof direct === "function") {
    return (direct as (...args: unknown[]) => unknown).bind(target);
  }
  const nestedDefault = target.default as Record<string, unknown> | undefined;
  if (nestedDefault && typeof nestedDefault[name] === "function") {
    return (nestedDefault[name] as (...args: unknown[]) => unknown).bind(nestedDefault);
  }
  return null;
}

function resolveConstructor(target: Record<string, unknown>, name: string): (new (...args: unknown[]) => CopilotClientLike) | null {
  const direct = target[name];
  if (typeof direct === "function") {
    return direct as new (...args: unknown[]) => CopilotClientLike;
  }
  const nestedDefault = target.default as Record<string, unknown> | undefined;
  if (nestedDefault && typeof nestedDefault[name] === "function") {
    return nestedDefault[name] as new (...args: unknown[]) => CopilotClientLike;
  }
  return null;
}

/**
 * Resolves the SDK-provided permission helper when available.
 */
function resolveApproveAll(target: Record<string, unknown>): ((request: CopilotPermissionRequest) => boolean | Promise<boolean>) | null {
  const direct = target.approveAll;
  if (typeof direct === "function") {
    return direct as (request: CopilotPermissionRequest) => boolean | Promise<boolean>;
  }
  const nestedDefault = target.default as Record<string, unknown> | undefined;
  if (nestedDefault && typeof nestedDefault.approveAll === "function") {
    return nestedDefault.approveAll as (request: CopilotPermissionRequest) => boolean | Promise<boolean>;
  }
  return null;
}
