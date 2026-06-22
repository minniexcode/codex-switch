import { EventEmitter } from "node:events";
import { cliError } from "../domain/errors";
import { loadCopilotSdk } from "./copilot-sdk-loader";
import {
  assertCopilotNodeRuntimeSupported,
  getSupportedCopilotSdkVersion,
  isSupportedCopilotSdkVersion,
  probeCopilotSdkInstall,
} from "./copilot-installer";
import { resolveCopilotCliInvocation } from "./copilot-cli";
import { RuntimeAvailability } from "./types";

type CopilotSdkModule = Record<string, unknown>;
type CopilotPermissionRequest = Record<string, unknown>;
type CopilotClientLike = Record<string, unknown> & {
  createSession?: (...args: unknown[]) => unknown;
  getAuthStatus?: () => unknown;
  start?: () => unknown;
  stop?: () => unknown;
};
type CopilotSessionLike = Record<string, unknown> & {
  sendAndWait?: (...args: unknown[]) => unknown;
  send?: (...args: unknown[]) => unknown;
  abort?: () => unknown;
  disconnect?: () => unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};
type CopilotSessionOptions = {
  onPermissionRequest: (request: CopilotPermissionRequest) => boolean | Promise<boolean>;
};
type CopilotRuntimeClient = {
  sdk: CopilotSdkModule;
  client: CopilotClientLike;
};

export type CopilotChatCompletionResponse = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
};

export type CopilotStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "done"; text: string };

const DEFAULT_UPSTREAM_TIMEOUT_MS = 300000;

/**
 * Probes whether the optional Copilot SDK runtime is installed, supported, and shaped correctly.
 */
export function probeCopilotSdkRuntime(runtimesDir?: string): RuntimeAvailability {
  const nodeStatus = safeCopilotNodeRuntimeStatus();
  if (!nodeStatus.ok) {
    return nodeStatus.availability;
  }

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
  if (!isSupportedCopilotSdkVersion(status.packageVersion)) {
    return {
      ok: false,
      runtime: "copilot-sdk",
      reason: "unsupported",
      version: status.packageVersion ?? undefined,
      cause: `The installed Copilot SDK version is unsupported. Install ${status.packageName}@${getSupportedCopilotSdkVersion()}.`,
      details: {
        installDir: status.installDir,
        packageName: status.packageName,
        packageVersion: status.packageVersion,
        supportedVersion: getSupportedCopilotSdkVersion(),
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
 * Probes Copilot auth readiness through the SDK client status endpoint.
 */
export async function readCopilotAuthState(runtimesDir?: string): Promise<{ ready: boolean; source: string; mode: string }> {
  const runtime = probeCopilotSdkRuntime(runtimesDir);
  if (!runtime.ok) {
    throw cliError(runtime.reason === "unsupported" ? "COPILOT_SDK_VERSION_UNSUPPORTED" : "COPILOT_SDK_MISSING", runtime.cause, runtime.details);
  }

  const runtimeClient = await createCopilotRuntimeClient(runtimesDir);
  try {
    await startCopilotClient(runtimeClient.client);
    const getAuthStatus = resolveCallable(runtimeClient.client, "getAuthStatus");
    if (!getAuthStatus) {
      throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose CopilotClient.getAuthStatus().", {});
    }
    const status = await Promise.resolve(getAuthStatus());
    if (!isAuthReady(status)) {
      throw cliError("COPILOT_AUTH_REQUIRED", "Copilot authentication is required before the local bridge can be used.", {
        status,
      });
    }
    return {
      ready: true,
      source: "official-sdk",
      mode: "auth-status",
    };
  } finally {
    await stopCopilotClient(runtimeClient.client);
  }
}

/**
 * Creates one long-lived Copilot SDK client for bridge workers.
 */
export async function createCopilotRuntimeClient(runtimesDir?: string): Promise<CopilotRuntimeClient> {
  assertCopilotNodeRuntimeSupported();
  const runtime = probeCopilotSdkRuntime(runtimesDir);
  if (!runtime.ok) {
    throw cliError(runtime.reason === "unsupported" ? "COPILOT_SDK_VERSION_UNSUPPORTED" : "COPILOT_SDK_MISSING", runtime.cause, runtime.details);
  }

  const sdk = (await requireCopilotSdk(runtimesDir)) as CopilotSdkModule;
  const client = createCopilotClient(sdk, runtimesDir);
  assertCopilotSdkApiContract(sdk, client);
  return { sdk, client };
}

/**
 * Starts a Copilot SDK client if the installed SDK exposes an explicit start hook.
 */
export async function startCopilotRuntimeClient(runtimeClient: CopilotRuntimeClient): Promise<void> {
  await startCopilotClient(runtimeClient.client);
}

/**
 * Stops a Copilot SDK client.
 */
export async function stopCopilotRuntimeClient(runtimeClient: CopilotRuntimeClient): Promise<void> {
  await stopCopilotClient(runtimeClient.client);
}

/**
 * Executes one OpenAI-compatible request through a fresh Copilot session.
 */
export async function sendCopilotChatCompletion(args: {
  provider: string;
  payload: Record<string, unknown>;
  runtimesDir?: string;
  runtimeClient?: CopilotRuntimeClient;
  timeoutMs?: number;
  onStreamEvent?: (event: CopilotStreamEvent) => void;
}): Promise<CopilotChatCompletionResponse> {
  const ownsClient = !args.runtimeClient;
  const runtimeClient = args.runtimeClient ?? await createCopilotRuntimeClient(args.runtimesDir);
  if (ownsClient) {
    await startCopilotRuntimeClient(runtimeClient);
  }
  let session: CopilotSessionLike | null = null;
  try {
    session = await createCopilotSession(runtimeClient, args.payload);
    const prompt = buildPrompt(args.payload);
    const timeoutMs = args.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
    const result = await sendSessionRequest(session, prompt, timeoutMs, args.onStreamEvent);
    const content = extractCopilotContent(result);
    return {
      id: `copilot-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: typeof args.payload.model === "string" ? args.payload.model : "copilot",
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
    if (session) {
      await disconnectCopilotSession(session);
    }
    if (ownsClient) {
      await stopCopilotRuntimeClient(runtimeClient);
    }
  }
}

async function createCopilotSession(runtimeClient: CopilotRuntimeClient, payload: Record<string, unknown>): Promise<CopilotSessionLike> {
  const createSession = resolveCallable(runtimeClient.client, "createSession");
  if (!createSession) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose CopilotClient.createSession().", {});
  }
  try {
    const session = await Promise.resolve(createSession({
      model: typeof payload.model === "string" ? payload.model : undefined,
      ...createSessionOptions(runtimeClient.sdk),
    }));
    if (!session || typeof session !== "object") {
      throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK returned an invalid CopilotSession.", {});
    }
    assertCopilotSessionContract(session as CopilotSessionLike);
    return session as CopilotSessionLike;
  } catch (error: unknown) {
    if (isCliError(error)) {
      throw error;
    }
    if (classifyCopilotSessionError(error) === "unsupported") {
      throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose a compatible session API.", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    throw cliError("COPILOT_AUTH_REQUIRED", "Copilot authentication is required before the local bridge can be used.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendSessionRequest(
  session: CopilotSessionLike,
  prompt: string,
  timeoutMs: number,
  onStreamEvent?: (event: CopilotStreamEvent) => void
): Promise<unknown> {
  const sendAndWait = resolveCallable(session, "sendAndWait");
  const send = resolveCallable(session, "send");
  if (!sendAndWait && !send) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK session does not expose sendAndWait() or send().", {});
  }

  const deltaHandler = (event: unknown) => {
    const delta = extractDelta(event);
    if (delta) {
      onStreamEvent?.({ type: "delta", delta });
    }
  };
  if (onStreamEvent && session.on) {
    session.on("data", deltaHandler);
    session.on("message", deltaHandler);
    session.on("delta", deltaHandler);
  }
  try {
    const sendPromise = Promise.resolve(sendAndWait ? sendAndWait({ prompt }, timeoutMs) : send!({ prompt }));
    const result = await withTimeout(sendPromise, timeoutMs, async () => {
      await abortCopilotSession(session);
    });
    if (onStreamEvent) {
      onStreamEvent({ type: "done", text: extractCopilotContent(result) });
    }
    return result;
  } finally {
    if (onStreamEvent && session.off) {
      session.off("data", deltaHandler);
      session.off("message", deltaHandler);
      session.off("delta", deltaHandler);
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Promise<void>): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          void onTimeout().finally(() => {
            reject(cliError("BRIDGE_UPSTREAM_TIMEOUT", "Copilot upstream request timed out.", { timeoutMs }));
          });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createSessionOptions(sdk: CopilotSdkModule): CopilotSessionOptions {
  const approveAll = resolveApproveAll(sdk);
  if (approveAll) {
    return {
      onPermissionRequest: (request) => approveAll(request),
    };
  }

  throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose an approveAll permission handler.", {});
}

function createCopilotClient(sdk: CopilotSdkModule, runtimesDir?: string): CopilotClientLike {
  const ClientCtor = resolveConstructor(sdk, "CopilotClient");
  if (!ClientCtor) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose CopilotClient.", {});
  }
  const invocation = resolveCopilotCliInvocation([], runtimesDir);
  const clientOptions = {
    copilotCommand: invocation.command,
    command: invocation.command,
    executable: invocation.command,
  };
  try {
    return new ClientCtor(clientOptions);
  } catch (error: unknown) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK CopilotClient could not be constructed.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertCopilotSdkApiContract(sdk: CopilotSdkModule, client: CopilotClientLike): void {
  const createSession = resolveCallable(client, "createSession");
  const getAuthStatus = resolveCallable(client, "getAuthStatus");
  if (!createSession || !getAuthStatus) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose the required CopilotClient API.", {
      hasCreateSession: Boolean(createSession),
      hasGetAuthStatus: Boolean(getAuthStatus),
    });
  }
  if (!resolveApproveAll(sdk)) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK does not expose a supported permission handler.", {});
  }
}

function assertCopilotSessionContract(session: CopilotSessionLike): void {
  const hasSendAndWait = typeof session.sendAndWait === "function";
  const hasSend = typeof session.send === "function";
  const hasAbort = typeof session.abort === "function";
  if ((!hasSendAndWait && !hasSend) || !hasAbort) {
    throw cliError("COPILOT_SDK_API_UNSUPPORTED", "The installed Copilot SDK session does not expose the required request API.", {
      hasSendAndWait,
      hasSend,
      hasAbort,
    });
  }
}

async function startCopilotClient(client: CopilotClientLike): Promise<void> {
  const start = resolveCallable(client, "start");
  if (start) {
    await Promise.resolve(start());
  }
}

async function stopCopilotClient(client: CopilotClientLike): Promise<void> {
  const stop = resolveCallable(client, "stop");
  if (stop) {
    await Promise.resolve(stop());
  }
}

async function abortCopilotSession(session: CopilotSessionLike): Promise<void> {
  const abort = resolveCallable(session, "abort");
  if (abort) {
    await Promise.resolve(abort());
  }
}

async function disconnectCopilotSession(session: CopilotSessionLike): Promise<void> {
  const disconnect = resolveCallable(session, "disconnect");
  if (disconnect) {
    await Promise.resolve(disconnect());
  }
}

function buildPrompt(payload: Record<string, unknown>): string {
  if (Array.isArray(payload.messages)) {
    return payload.messages
      .map((entry) => {
        const message = entry as Record<string, unknown>;
        return `${String(message.role ?? "user")}: ${String(message.content ?? "")}`;
      })
      .join("\n");
  }
  if (typeof payload.prompt === "string") {
    return payload.prompt;
  }
  return "";
}

function extractCopilotContent(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return JSON.stringify(result);
  }
  const record = result as Record<string, unknown>;
  if (typeof record.content === "string") {
    return record.content;
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (typeof data.content === "string") {
      return data.content;
    }
    if (typeof data.text === "string") {
      return data.text;
    }
  }
  return JSON.stringify(result);
}

function extractDelta(event: unknown): string | null {
  if (typeof event === "string") {
    return event;
  }
  if (!event || typeof event !== "object") {
    return null;
  }
  const record = event as Record<string, unknown>;
  for (const key of ["delta", "text", "content"]) {
    if (typeof record[key] === "string") {
      return record[key] as string;
    }
  }
  return null;
}

function isAuthReady(status: unknown): boolean {
  if (status === true) {
    return true;
  }
  if (!status || typeof status !== "object") {
    return false;
  }
  const record = status as Record<string, unknown>;
  if (record.ready === true || record.isAuthenticated === true || record.authenticated === true) {
    return true;
  }
  if (typeof record.status === "string" && /^(ok|ready|authenticated|logged_in)$/i.test(record.status)) {
    return true;
  }
  return false;
}

function classifyCopilotSessionError(error: unknown): "auth" | "unsupported" {
  const message = error instanceof Error ? error.message : String(error);
  if (/onPermissionRequest|permission|sendAndWait|createSession|unsupported/i.test(message)) {
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

function resolveApproveAll(target: Record<string, unknown>): ((request: CopilotPermissionRequest) => boolean | Promise<boolean>) | null {
  const direct = target.approveAll;
  if (typeof direct === "function") {
    return direct as (request: CopilotPermissionRequest) => boolean | Promise<boolean>;
  }
  const permissionHandler = target.PermissionHandler;
  if (permissionHandler && typeof permissionHandler === "object" && typeof (permissionHandler as Record<string, unknown>).approveAll === "function") {
    return (permissionHandler as Record<string, (request: CopilotPermissionRequest) => boolean | Promise<boolean>>).approveAll;
  }
  const nestedDefault = target.default as Record<string, unknown> | undefined;
  if (nestedDefault) {
    return resolveApproveAll(nestedDefault);
  }
  return null;
}

function isCliError(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string");
}

function safeCopilotNodeRuntimeStatus():
  | { ok: true }
  | { ok: false; availability: RuntimeAvailability } {
  try {
    assertCopilotNodeRuntimeSupported();
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      availability: {
        ok: false,
        runtime: "copilot-sdk",
        reason: "unsupported",
        cause: error instanceof Error ? error.message : String(error),
        details: isCliError(error) ? (error as unknown as { details?: Record<string, unknown> }).details : undefined,
      },
    };
  }
}

export { EventEmitter };
