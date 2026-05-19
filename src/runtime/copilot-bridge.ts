import * as http from "node:http";
import * as net from "node:net";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { buildCopilotBridgeBaseUrl, isCopilotBridgeProvider, ProviderRecord } from "../domain/providers";
import { cliError } from "../domain/errors";
import {
  clearCopilotBridgeState,
  CopilotBridgeState,
  readCopilotBridgeState,
  writeCopilotBridgeState,
} from "../storage/runtime-state-repo";
import { RuntimeAvailability } from "./types";

type SpawnLike = typeof spawn;

let spawnImplementation: SpawnLike = spawn;

/**
 * Overrides the spawn implementation for bridge runtime tests.
 */
export function setCopilotBridgeSpawnImplementation(spawnLike: SpawnLike): void {
  spawnImplementation = spawnLike;
}

/**
 * Restores the default spawn implementation for bridge runtime tests.
 */
export function resetCopilotBridgeSpawnImplementation(): void {
  spawnImplementation = spawn;
}

type ChatCompletionResponse = {
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

type BridgeRequestContext = {
  apiKey: string;
  executeChatCompletion: (payload: Record<string, unknown>) => Promise<ChatCompletionResponse>;
};

/**
 * Result returned when a managed bridge is started or reused.
 */
export type CopilotBridgeStartResult = {
  baseUrl: string;
  host: string;
  port: number;
  reused: boolean;
  portChanged: boolean;
  replaced: boolean;
};

/**
 * Returns the last known Copilot bridge runtime status.
 */
export async function probeCopilotBridgeRuntime(
  provider: ProviderRecord | null,
  persistedState?: CopilotBridgeState | null,
  runtimeDir?: string
): Promise<RuntimeAvailability> {
  const state = persistedState === undefined ? readCopilotBridgeState(runtimeDir) : persistedState;
  if (state && (!provider || !isCopilotBridgeProvider(provider))) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "failed",
      cause: "Copilot bridge runtime state exists but no active Copilot bridge provider is selected.",
      details: state,
    };
  }
  if (!provider || !isCopilotBridgeProvider(provider)) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "missing",
      cause: "No active Copilot bridge provider is selected.",
    };
  }
  const runtime = provider.runtime;
  if (!runtime) {
    throw cliError("RUNTIME_PROVIDER_INVALID", "Provider runtime block is missing.", {
      provider: state?.provider ?? null,
    });
  }
  if (!state) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "missing",
      cause: "Copilot bridge state manifest is missing.",
      details: {
        expectedBaseUrl: buildCopilotBridgeBaseUrl(runtime),
      },
    };
  }
  if (state.baseUrl !== buildCopilotBridgeBaseUrl(runtime)) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "failed",
      cause: "Copilot bridge state base URL does not match the provider runtime configuration.",
      details: {
        stateBaseUrl: state.baseUrl,
        providerBaseUrl: buildCopilotBridgeBaseUrl(runtime),
      },
    };
  }
  const healthy = await healthcheckCopilotBridge(state.host, state.port);
  if (!healthy.ok) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "failed",
      cause: healthy.cause,
      details: state,
    };
  }
  writeCopilotBridgeState({
    ...state,
    lastHealthcheckAt: new Date().toISOString(),
  }, runtimeDir);
  return {
    ok: true,
    runtime: "copilot-bridge",
    details: state,
  };
}

/**
 * Starts or reuses a Copilot bridge worker, then verifies its health before returning.
 */
export async function ensureCopilotBridge(providerName: string, provider: ProviderRecord, runtimeDir?: string): Promise<CopilotBridgeStartResult> {
  return startOrReuseCopilotBridge(providerName, provider, runtimeDir);
}

/**
 * Starts or reuses a Copilot bridge worker and reports the chosen port.
 */
export async function startOrReuseCopilotBridge(providerName: string, provider: ProviderRecord, runtimeDir?: string): Promise<CopilotBridgeStartResult> {
  if (!isCopilotBridgeProvider(provider)) {
    throw cliError("RUNTIME_PROVIDER_INVALID", "Provider is not backed by a Copilot bridge runtime.", {
      provider: providerName,
    });
  }
  const runtime = provider.runtime;
  if (!runtime) {
    throw cliError("RUNTIME_PROVIDER_INVALID", "Provider runtime block is missing.", {
      provider: providerName,
    });
  }
  const expectedBaseUrl = buildCopilotBridgeBaseUrl(runtime);
  const current = readCopilotBridgeState(runtimeDir);
  let replaced = false;
  if (current && current.provider === providerName && current.baseUrl === expectedBaseUrl) {
    const healthy = await healthcheckCopilotBridge(current.host, current.port);
    if (healthy.ok) {
      writeCopilotBridgeState({
        ...current,
        lastHealthcheckAt: new Date().toISOString(),
      });
      return {
        baseUrl: expectedBaseUrl,
        host: current.host,
        port: current.port,
        reused: true,
        portChanged: false,
        replaced: false,
      };
    }
  }

  if (current && current.provider !== providerName) {
    stopCopilotBridge(runtimeDir);
    replaced = true;
  }

  const selectedPort = await selectBridgePort(runtime.bridgeHost, runtime.bridgePort);
  const selectedBaseUrl = `http://${runtime.bridgeHost}:${selectedPort}${runtime.bridgePath}`;

  const workerPath = path.join(__dirname, "copilot-bridge-worker.js");
  let child;
  try {
    child = spawnImplementation(process.execPath, [workerPath], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CODEX_SWITCH_BRIDGE_PROVIDER: providerName,
        CODEX_SWITCH_BRIDGE_HOST: runtime.bridgeHost,
        CODEX_SWITCH_BRIDGE_PORT: String(selectedPort),
        CODEX_SWITCH_BRIDGE_API_KEY: provider.apiKey,
        CODEX_SWITCH_BRIDGE_BASE_URL: selectedBaseUrl,
      },
    });
  } catch (error: unknown) {
    throw cliError("BRIDGE_START_FAILED", "Failed to start the Copilot bridge worker.", {
      provider: providerName,
      host: runtime.bridgeHost,
      port: selectedPort,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  child.unref();

  const startedAt = new Date().toISOString();
  const healthy = await waitForCopilotBridgeStartup(child, runtime.bridgeHost, selectedPort, 15, 200);
  if (!healthy.ok) {
    clearCopilotBridgeState(runtimeDir);
    if (healthy.reason === "start-failed") {
      throw cliError("BRIDGE_START_FAILED", "Copilot bridge worker exited before becoming healthy.", {
        provider: providerName,
        host: runtime.bridgeHost,
        port: selectedPort,
        cause: healthy.cause,
      });
    }
    throw cliError("BRIDGE_HEALTHCHECK_FAILED", "Copilot bridge did not become healthy after startup.", {
      provider: providerName,
      host: runtime.bridgeHost,
      port: selectedPort,
      cause: healthy.cause,
    });
  }

  const state: CopilotBridgeState = {
    provider: providerName,
    pid: child.pid ?? null,
    host: runtime.bridgeHost,
    port: selectedPort,
    baseUrl: selectedBaseUrl,
    startedAt,
    lastHealthcheckAt: new Date().toISOString(),
  };
  writeCopilotBridgeState(state, runtimeDir);

  return {
    baseUrl: selectedBaseUrl,
    host: runtime.bridgeHost,
    port: selectedPort,
    reused: false,
    portChanged: selectedPort !== runtime.bridgePort,
    replaced,
  };
}

/**
 * Creates an HTTP request handler implementing the minimal OpenAI-compatible bridge contract.
 */
export function createCopilotBridgeRequestHandler(context: BridgeRequestContext): http.RequestListener {
  return async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = request.url ?? "/";
      if (method === "GET" && url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (!isAuthorized(request, context.apiKey)) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Unauthorized" } }));
        return;
      }

      if (method === "GET" && url === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ object: "list", data: [] }));
        return;
      }
      if (method !== "POST" || url !== "/v1/chat/completions") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Not found" } }));
        return;
      }

      const body = await readJsonBody(request);
      const stream = Boolean(body.stream);
      const payload = await context.executeChatCompletion(body);
      if (stream) {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    } catch (error: unknown) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }));
    }
  };
}

/**
 * Starts an in-process local bridge server. Primarily used by the worker entrypoint and tests.
 */
export function startCopilotBridgeServer(args: {
  host: string;
  port: number;
  apiKey: string;
  executeChatCompletion: (payload: Record<string, unknown>) => Promise<ChatCompletionResponse>;
}): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(
      createCopilotBridgeRequestHandler({
        apiKey: args.apiKey,
        executeChatCompletion: args.executeChatCompletion,
      })
    );
    server.once("error", reject);
    server.listen(args.port, args.host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

/**
 * Polls the bridge health endpoint until it becomes available or the retry budget is exhausted.
 */
export async function waitForCopilotBridgeHealth(host: string, port: number, attempts = 10, delayMs = 150): Promise<{ ok: true } | { ok: false; cause: string }> {
  for (let index = 0; index < attempts; index += 1) {
    const result = await healthcheckCopilotBridge(host, port);
    if (result.ok) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return {
    ok: false,
    cause: "Timed out waiting for Copilot bridge health endpoint.",
  };
}

/**
 * Stops the currently persisted Copilot bridge worker when possible.
 */
export function stopCopilotBridge(runtimeDir?: string): void {
  const state = readCopilotBridgeState(runtimeDir);
  if (state?.pid) {
    try {
      process.kill(state.pid);
    } catch {
      // Ignore best-effort bridge cleanup failures.
    }
  }
  clearCopilotBridgeState(runtimeDir);
}

async function checkPortAvailability(host: string, port: number): Promise<{ ok: true } | { ok: false; cause: string }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve({
        ok: false,
        cause: error.message,
      });
    });
    server.listen(port, host, () => {
      server.close((error) => {
        if (error) {
          resolve({
            ok: false,
            cause: error.message,
          });
          return;
        }
        resolve({ ok: true });
      });
    });
  });
}

async function selectBridgePort(host: string, preferredPort: number): Promise<number> {
  const preferred = await checkPortAvailability(host, preferredPort);
  if (preferred.ok) {
    return preferredPort;
  }
  for (let port = 10000; port <= 99999; port += 1) {
    if (port === preferredPort) {
      continue;
    }
    const available = await checkPortAvailability(host, port);
    if (available.ok) {
      return port;
    }
  }
  throw cliError("BRIDGE_PORT_CONFLICT", "Unable to find a free 5-digit bridge port.", {
    host,
    port: preferredPort,
  });
}

async function waitForCopilotBridgeStartup(
  child: ReturnType<SpawnLike>,
  host: string,
  port: number,
  attempts: number,
  delayMs: number
): Promise<{ ok: true } | { ok: false; reason: "start-failed" | "healthcheck-failed"; cause: string }> {
  let startupFailure: string | null = null;
  const onError = (error: Error) => {
    startupFailure = error.message;
  };
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    startupFailure = `Worker exited with code ${String(code)} signal ${String(signal)}.`;
  };
  child.once("error", onError);
  child.once("exit", onExit);
  try {
    for (let index = 0; index < attempts; index += 1) {
      if (startupFailure !== null) {
        return {
          ok: false,
          reason: "start-failed",
          cause: startupFailure,
        };
      }
      const result = await healthcheckCopilotBridge(host, port);
      if (result.ok) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (startupFailure !== null) {
      return {
        ok: false,
        reason: "start-failed",
        cause: startupFailure,
      };
    }
    return {
      ok: false,
      reason: "healthcheck-failed",
      cause: "Timed out waiting for Copilot bridge health endpoint.",
    };
  } finally {
    child.off("error", onError);
    child.off("exit", onExit);
  }
}

async function healthcheckCopilotBridge(host: string, port: number): Promise<{ ok: true } | { ok: false; cause: string }> {
  return new Promise((resolve) => {
    const request = http.request(
      {
        host,
        port,
        method: "GET",
        path: "/healthz",
        timeout: 1000,
      },
      (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve({ ok: true });
          return;
        }
        resolve({
          ok: false,
          cause: `Health endpoint returned status ${String(response.statusCode ?? 0)}.`,
        });
      }
    );
    request.on("error", (error) => {
      resolve({
        ok: false,
        cause: error.message,
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Health endpoint timed out."));
    });
    request.end();
  });
}

async function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
}

function isAuthorized(request: http.IncomingMessage, expectedApiKey: string): boolean {
  const authorization = request.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return false;
  }
  return authorization.slice("Bearer ".length) === expectedApiKey;
}
