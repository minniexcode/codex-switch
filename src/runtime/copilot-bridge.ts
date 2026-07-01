import * as http from "node:http";
import * as net from "node:net";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildCopilotBridgeBaseUrl, isCopilotBridgeProvider, ProviderRecord } from "../domain/providers";
import { cliError } from "../domain/errors";
import {
  clearCopilotBridgeState,
  CopilotBridgeState,
  getCopilotBridgeLogPath,
  readCopilotBridgeState,
  writeCopilotBridgeState,
} from "../storage/runtime-state-repo";
import { RuntimeAvailability } from "./types";
import { CopilotBridgeRuntimeEvent } from "./copilot-adapter";

type SpawnLike = typeof spawn;

type BridgeProbeStage = "health" | "auth" | "startup";

type BridgeProbeCause =
  | "health-non-200"
  | "auth-rejected"
  | "provider-mismatch"
  | "base-url-mismatch"
  | "worker-build-stale"
  | "transport-timeout"
  | "transport-error"
  | "startup-timeout"
  | "startup-failed";

type BridgeProbeResult =
  | { ok: true; stage: BridgeProbeStage; attempts: number }
  | {
      ok: false;
      stage: BridgeProbeStage;
      attempts: number;
      cause: BridgeProbeCause;
      retryable: boolean;
      message: string;
      statusCode?: number;
    };

type BridgeReuseDecision =
  | {
      reuse: true;
      health: Extract<BridgeProbeResult, { ok: true }>;
      auth: Extract<BridgeProbeResult, { ok: true }>;
      probeAt: string;
      logPath: string;
    }
  | {
      reuse: false;
      reason: string;
      replacedExisting: boolean;
      probeAt: string;
      logPath: string;
      probe?: Extract<BridgeProbeResult, { ok: false }>;
    };

const BRIDGE_REUSE_ATTEMPTS = 2;
const BRIDGE_REUSE_TIMEOUT_MS = 2500;
const BRIDGE_REUSE_DELAY_MS = 250;

let spawnImplementation: SpawnLike = spawn;
let cachedBridgeWorkerBuildId: string | null = null;

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

type ResponseInputTextItem = {
  type: "input_text";
  text: string;
};

type ResponseTextItem = {
  type: "text" | "output_text";
  text: string;
};

type ResponseInputMessage = {
  role?: string;
  content?: unknown;
};

type ResponsesRequestPayload = {
  model?: unknown;
  input?: unknown;
  stream?: unknown;
  timeout_ms?: unknown;
  timeoutMs?: unknown;
};

type NormalizedResponsesRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  timeoutMs?: number;
};

type BridgeRequestContext = {
  apiKey: string;
  executeChatCompletion: (payload: Record<string, unknown>, options?: BridgeExecutionOptions) => Promise<ChatCompletionResponse>;
};

type BridgeExecutionOptions = {
  onTextDelta?: (delta: string) => void;
  onTextDone?: (text: string) => void;
  onRuntimeEvent?: (event: CopilotBridgeRuntimeEvent) => void;
  timeoutMs?: number;
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
  logPath: string;
  restartReason?: string;
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
  const logPath = state?.logPath ?? getCopilotBridgeLogPath(runtimeDir);
  if (state && (!provider || !isCopilotBridgeProvider(provider))) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "failed",
      cause: "Copilot bridge runtime state exists but no active Copilot bridge provider is selected.",
      details: {
        ...state,
        logPath,
      },
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
        logPath,
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
        logPath,
      },
    };
  }
  const healthy = await probeBridgeEndpoint({
    host: state.host,
    port: state.port,
    stage: "health",
  });
  if (!healthy.ok) {
    return {
      ok: false,
      runtime: "copilot-bridge",
      reason: "failed",
      cause: healthy.message,
      details: {
        ...state,
        logPath,
        probeStage: healthy.stage,
        probeCause: healthy.cause,
        retryable: healthy.retryable,
      },
    };
  }
  writeCopilotBridgeState({
    ...state,
    lastHealthcheckAt: new Date().toISOString(),
    lastProbeAt: new Date().toISOString(),
    logPath,
  }, runtimeDir);
  return {
    ok: true,
    runtime: "copilot-bridge",
    details: {
      ...state,
      logPath,
      lastProbeAt: new Date().toISOString(),
    },
  };
}

/**
 * Starts or reuses a Copilot bridge worker, then verifies its health before returning.
 */
export async function ensureCopilotBridge(
  providerName: string,
  provider: ProviderRecord,
  runtimeDir?: string,
  runtimesDir?: string
): Promise<CopilotBridgeStartResult> {
  return startOrReuseCopilotBridge(providerName, provider, runtimeDir, runtimesDir);
}

/**
 * Starts or reuses a Copilot bridge worker and reports the chosen port.
 */
export async function startOrReuseCopilotBridge(
  providerName: string,
  provider: ProviderRecord,
  runtimeDir?: string,
  runtimesDir?: string
): Promise<CopilotBridgeStartResult> {
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
  const workerBuildId = getCopilotBridgeWorkerBuildId();
  let replaced = false;
  const logPath = current?.logPath ?? getCopilotBridgeLogPath(runtimeDir);
  const reuseDecision = await evaluateBridgeReuse({
    current,
    providerName,
    expectedBaseUrl,
    expectedApiKey: provider.apiKey,
    workerBuildId,
    runtimeDir,
    logPath,
  });
  if (reuseDecision.reuse) {
    writeCopilotBridgeState({
      ...current!,
      lastHealthcheckAt: new Date().toISOString(),
      lastProbeAt: reuseDecision.probeAt,
      workerBuildId,
      logPath: reuseDecision.logPath,
    }, runtimeDir);
    appendBridgeLifecycleLog(logPath, `startup success reused provider=${providerName} host=${current!.host} port=${String(current!.port)}`);
    return {
      baseUrl: expectedBaseUrl,
      host: current!.host,
      port: current!.port,
      reused: true,
      portChanged: false,
      replaced: false,
      logPath: reuseDecision.logPath,
    };
  }
  if (reuseDecision.replacedExisting) {
    stopCopilotBridge(runtimeDir);
    replaced = true;
    appendBridgeLifecycleLog(logPath, `replacement reason=${reuseDecision.reason}`);
  }

  const selectedPort = await selectBridgePort(runtime.bridgeHost, runtime.bridgePort);
  const selectedBaseUrl = `http://${runtime.bridgeHost}:${selectedPort}${runtime.bridgePath}`;

  const workerPath = path.join(__dirname, "copilot-bridge-worker.js");
  ensureBridgeLogFile(logPath);
  appendBridgeLifecycleLog(logPath, `worker start provider=${providerName} host=${runtime.bridgeHost} port=${String(selectedPort)} replaced=${String(replaced)}`);
  let child;
  try {
    child = spawnImplementation(process.execPath, [workerPath], {
      detached: true,
      stdio: ["ignore", openBridgeLogFd(logPath), openBridgeLogFd(logPath)],
      env: {
        ...process.env,
        CODEX_SWITCH_BRIDGE_PROVIDER: providerName,
        CODEX_SWITCH_BRIDGE_HOST: runtime.bridgeHost,
        CODEX_SWITCH_BRIDGE_PORT: String(selectedPort),
        CODEX_SWITCH_BRIDGE_API_KEY: provider.apiKey,
        CODEX_SWITCH_BRIDGE_BASE_URL: selectedBaseUrl,
        CODEX_SWITCH_RUNTIME_DIR: runtimeDir ?? "",
        CODEX_SWITCH_RUNTIMES_DIR: runtimesDir ?? "",
        CODEX_SWITCH_BRIDGE_LOG_PATH: logPath,
      },
    });
  } catch (error: unknown) {
    throw cliError("BRIDGE_START_FAILED", "Failed to start the Copilot bridge worker.", {
      provider: providerName,
      host: runtime.bridgeHost,
      port: selectedPort,
      logPath,
      probeStage: "startup",
      probeCause: "startup-failed",
      retryable: false,
      replacedExisting: replaced,
      providerName,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  child.unref();

  const startedAt = new Date().toISOString();
  // The worker can take a little longer to become healthy on Windows or under loaded test runs.
  const healthy = await waitForCopilotBridgeStartup(child, runtime.bridgeHost, selectedPort, 25, 200);
  if (!healthy.ok) {
    clearCopilotBridgeState(runtimeDir);
    if (healthy.reason === "start-failed") {
      appendBridgeLifecycleLog(logPath, `startup failure provider=${providerName} cause=${healthy.cause}`);
      throw cliError("BRIDGE_START_FAILED", "Copilot bridge worker exited before becoming healthy.", {
        provider: providerName,
        host: runtime.bridgeHost,
        port: selectedPort,
        logPath,
        probeStage: "startup",
        probeCause: "startup-failed",
        retryable: false,
        replacedExisting: replaced,
        cause: healthy.cause,
      });
    }
    appendBridgeLifecycleLog(logPath, `startup timeout provider=${providerName} host=${runtime.bridgeHost} port=${String(selectedPort)}`);
    throw cliError("BRIDGE_HEALTHCHECK_FAILED", "Copilot bridge did not become healthy after startup.", {
      provider: providerName,
      host: runtime.bridgeHost,
      port: selectedPort,
      logPath,
      probeStage: "startup",
      probeCause: "startup-timeout",
      retryable: true,
      replacedExisting: replaced,
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
    workerBuildId,
    logPath,
    lastProbeAt: new Date().toISOString(),
    lastRestartReason: reuseDecision.reuse ? undefined : reuseDecision.reason,
  };
  writeCopilotBridgeState(state, runtimeDir);
  appendBridgeLifecycleLog(logPath, `startup success provider=${providerName} host=${runtime.bridgeHost} port=${String(selectedPort)}`);

  return {
    baseUrl: selectedBaseUrl,
    host: runtime.bridgeHost,
    port: selectedPort,
    reused: false,
    portChanged: selectedPort !== runtime.bridgePort,
    replaced,
    logPath,
    restartReason: replaced ? reuseDecision.reason : undefined,
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
      if (method === "POST" && url === "/v1/chat/completions") {
        const body = await readJsonBody(request);
        const timeoutMs = parseBridgeRequestTimeoutMs(body, "/v1/chat/completions");
        const stream = Boolean(body.stream);
        if (stream) {
          response.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          const heartbeat = startSseHeartbeat(response);
          const payload = await context.executeChatCompletion(body, {
            timeoutMs,
            onTextDelta: (delta) => {
              response.write(`data: ${JSON.stringify({
                choices: [
                  {
                    index: 0,
                    delta: { content: delta },
                    finish_reason: null,
                  },
                ],
              })}\n\n`);
            },
          });
          clearInterval(heartbeat);
          response.write("data: [DONE]\n\n");
          response.end();
          return;
        }

        const payload = await context.executeChatCompletion(body, { timeoutMs });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
        return;
      }

      if (method === "POST" && url === "/v1/responses") {
        const body = await readJsonBody(request);
        const normalized = normalizeResponsesRequest(body);
        const chatPayload = {
          model: normalized.model,
          messages: normalized.messages,
        };
        if (normalized.stream) {
          response.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          const responseId = `resp_${Date.now()}`;
          const messageId = buildResponsesMessageId(responseId);
          writeResponsesStreamStart(response, responseId, normalized.model, messageId);
          const heartbeat = startSseHeartbeat(response);
          let text = "";
          const payload = await context.executeChatCompletion(chatPayload, {
            timeoutMs: normalized.timeoutMs,
            onTextDelta: (delta) => {
              text += delta;
              writeResponsesTextDelta(response, messageId, delta);
            },
            onTextDone: (doneText) => {
              if (text.length === 0) {
                text = doneText;
                writeResponsesTextDelta(response, messageId, doneText);
              }
            },
            onRuntimeEvent: (event) => {
              writeResponsesRuntimeEvent(response, responseId, event);
            },
          });
          clearInterval(heartbeat);
          const outputText = text || getChatCompletionText(payload);
          if (text.length === 0 && outputText.length > 0) {
            writeResponsesTextDelta(response, messageId, outputText);
          }
          writeResponsesStreamDone(response, responseId, normalized.model, messageId, outputText);
          response.end();
          return;
        }
        const payload = await context.executeChatCompletion(chatPayload, {
          timeoutMs: normalized.timeoutMs,
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(buildResponsesPayload(payload)));
        return;
      }

      if (method !== "POST") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Not found" } }));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Not found" } }));
    } catch (error: unknown) {
      const statusCode = mapBridgeErrorStatus(error);
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error), code: isCliError(error) ? error.code : "BRIDGE_RUNTIME_FAILURE" } }));
    }
  };
}

/**
 * Converts one minimal Responses API payload into the existing chat-completions bridge call shape.
 */
function normalizeResponsesRequest(body: Record<string, unknown>): NormalizedResponsesRequest {
  const payload = body as ResponsesRequestPayload;
  if (typeof payload.model !== "string" || payload.model.trim() === "") {
    throw cliError("BRIDGE_UNSUPPORTED_REQUEST", "Copilot bridge /v1/responses requires a non-empty string model.");
  }

  const messages = normalizeResponsesInput(payload.input);
  if (messages.length === 0) {
    throw cliError("BRIDGE_UNSUPPORTED_REQUEST", "Copilot bridge /v1/responses requires at least one input message.");
  }

  return {
    model: payload.model,
    messages,
    stream: payload.stream === true,
    timeoutMs: parseBridgeRequestTimeoutMs(body, "/v1/responses"),
  };
}

/**
 * Extracts one optional request timeout for bridge-backed completions.
 */
function parseBridgeRequestTimeoutMs(body: Record<string, unknown>, endpoint: string): number | undefined {
  const timeoutMsValue = body.timeout_ms ?? body.timeoutMs;
  if (timeoutMsValue === undefined) {
    return undefined;
  }
  if (typeof timeoutMsValue !== "number" || !Number.isFinite(timeoutMsValue) || timeoutMsValue <= 0) {
    throw cliError("BRIDGE_UNSUPPORTED_REQUEST", `Copilot bridge ${endpoint} timeout must be a positive number when provided.`);
  }
  return timeoutMsValue;
}

function normalizeResponsesInput(input: unknown): Array<{ role: string; content: string }> {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) {
    throw cliError("BRIDGE_UNSUPPORTED_REQUEST", "Copilot bridge /v1/responses expects input as a string or message array.");
  }

  if (input.length === 0) {
    return [];
  }

  const entryKinds = input.map(classifyResponsesInputEntry);
  const hasMessages = entryKinds.includes("message");
  const hasContentItems = entryKinds.includes("content-item");
  if (hasMessages && hasContentItems) {
    throw cliError(
      "BRIDGE_UNSUPPORTED_REQUEST",
      "Copilot bridge /v1/responses input array must contain either message objects or content items, not both."
    );
  }

  if (hasContentItems) {
    return [
      {
        role: "user",
        content: extractResponsesTextContent(input, 0),
      },
    ];
  }

  return input.map((entry, index) => normalizeResponsesMessage(entry, index));
}

function normalizeResponsesMessage(entry: unknown, index: number): { role: string; content: string } {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw cliError("BRIDGE_UNSUPPORTED_REQUEST", `Copilot bridge /v1/responses input[${String(index)}] must be an object message.`);
  }

  const message = entry as ResponseInputMessage;
  const role = typeof message.role === "string" && message.role.trim() !== "" ? message.role : "user";
  const content = extractResponsesTextContent(message.content, index);
  return { role, content };
}

/**
 * Classifies one top-level Responses input entry so mixed array shapes can be rejected clearly.
 */
function classifyResponsesInputEntry(entry: unknown): "message" | "content-item" {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw cliError("BRIDGE_UNSUPPORTED_REQUEST", "Copilot bridge /v1/responses input entries must be objects.");
  }

  const record = entry as Record<string, unknown>;
  if ("content" in record || "role" in record) {
    return "message";
  }
  if (typeof record.type === "string") {
    return "content-item";
  }

  throw cliError(
    "BRIDGE_UNSUPPORTED_REQUEST",
    "Copilot bridge /v1/responses input entries must be message objects or typed content items."
  );
}

function extractResponsesTextContent(content: unknown, index: number): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    throw cliError(
      "BRIDGE_UNSUPPORTED_REQUEST",
      `Copilot bridge /v1/responses input[${String(index)}].content must be a string or content item array.`
    );
  }

  const parts = content.map((item, itemIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw cliError(
        "BRIDGE_UNSUPPORTED_REQUEST",
        `Copilot bridge /v1/responses input[${String(index)}].content[${String(itemIndex)}] must be an object item.`
      );
    }
    return renderResponsesContentItem(item as Record<string, unknown>);
  });

  return parts.join("\n");
}

/**
 * Converts one Responses content item into the text-only prompt representation required by the Copilot SDK bridge.
 */
function renderResponsesContentItem(item: Record<string, unknown>): string {
  const type = typeof item.type === "string" ? item.type : null;
  const text = typeof item.text === "string" ? item.text : null;
  if ((type === "input_text" || type === "text" || type === "output_text") && text !== null) {
    return text;
  }
  if (type === "input_image") {
    return buildResponsesPlaceholder("input_image", item.image_url, item.file_id);
  }
  if (type === "input_file") {
    return buildResponsesPlaceholder("input_file", item.filename, item.file_id);
  }
  if (type !== null) {
    return `[unsupported content type: ${type}]`;
  }
  throw cliError("BRIDGE_UNSUPPORTED_REQUEST", "Copilot bridge /v1/responses content items must declare a string type.");
}

/**
 * Builds a readable placeholder for non-text Responses content items preserved as text-only context.
 */
function buildResponsesPlaceholder(type: string, ...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return `[${type}: ${candidate}]`;
    }
  }
  return `[${type} omitted]`;
}

/**
 * Converts the existing chat-completions response into a minimal Responses API payload.
 */
function buildResponsesPayload(payload: ChatCompletionResponse): Record<string, unknown> {
  const firstChoice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const outputText = firstChoice?.message?.content ?? "";
  return {
    id: payload.id ?? `resp_${Date.now()}`,
    object: "response",
    created_at: payload.created ?? Math.floor(Date.now() / 1000),
    model: payload.model ?? "copilot",
    status: "completed",
    output: [
      {
        type: "message",
        id: `${payload.id ?? "resp"}_msg_0`,
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: outputText,
          },
        ],
      },
    ],
    output_text: outputText,
  };
}

/**
 * Emits a minimal OpenAI-compatible Responses API event stream.
 */
function writeResponsesStream(response: http.ServerResponse, payload: ChatCompletionResponse): void {
  const responsePayload = buildResponsesPayload(payload);
  const responseId = typeof responsePayload.id === "string" ? responsePayload.id : `resp_${Date.now()}`;
  const messageId = buildResponsesMessageId(responseId);
  const outputText = typeof responsePayload.output_text === "string" ? responsePayload.output_text : "";

  const inProgressResponse = {
    ...responsePayload,
    status: "in_progress",
    output: [],
  };

  const completedMessage = {
    id: messageId,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [
      {
        type: "output_text",
        text: outputText,
        annotations: [],
      },
    ],
  };

  writeSseEvent(response, "response.created", {
    type: "response.created",
    response: inProgressResponse,
  });
  writeSseEvent(response, "response.in_progress", {
    type: "response.in_progress",
    response: inProgressResponse,
  });
  writeSseEvent(response, "response.output_item.added", {
    type: "response.output_item.added",
    output_index: 0,
    item: {
      id: messageId,
      type: "message",
      status: "in_progress",
      role: "assistant",
      content: [],
    },
  });
  writeSseEvent(response, "response.content_part.added", {
    type: "response.content_part.added",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: {
      type: "output_text",
      text: "",
      annotations: [],
    },
  });
  writeSseEvent(response, "response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    delta: outputText,
  });
  writeSseEvent(response, "response.output_text.done", {
    type: "response.output_text.done",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    text: outputText,
  });
  writeSseEvent(response, "response.content_part.done", {
    type: "response.content_part.done",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: {
      type: "output_text",
      text: outputText,
      annotations: [],
    },
  });
  writeSseEvent(response, "response.output_item.done", {
    type: "response.output_item.done",
    output_index: 0,
    item: completedMessage,
  });
  writeSseEvent(response, "response.completed", {
    type: "response.completed",
    response: {
      ...responsePayload,
      output: [completedMessage],
    },
  });
}

function writeResponsesStreamStart(response: http.ServerResponse, responseId: string, model: string, messageId: string): void {
  const createdAt = Math.floor(Date.now() / 1000);
  const inProgressResponse = {
    id: responseId,
    object: "response",
    created_at: createdAt,
    model,
    status: "in_progress",
    output: [],
    output_text: "",
  };
  writeSseEvent(response, "response.created", {
    type: "response.created",
    response: inProgressResponse,
  });
  writeSseEvent(response, "response.in_progress", {
    type: "response.in_progress",
    response: inProgressResponse,
  });
  writeSseEvent(response, "response.output_item.added", {
    type: "response.output_item.added",
    output_index: 0,
    item: {
      id: messageId,
      type: "message",
      status: "in_progress",
      role: "assistant",
      content: [],
    },
  });
  writeSseEvent(response, "response.content_part.added", {
    type: "response.content_part.added",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: {
      type: "output_text",
      text: "",
      annotations: [],
    },
  });
}

function writeResponsesTextDelta(response: http.ServerResponse, messageId: string, delta: string): void {
  if (delta.length === 0) {
    return;
  }
  writeSseEvent(response, "response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    delta,
  });
}

function writeResponsesStreamDone(response: http.ServerResponse, responseId: string, model: string, messageId: string, outputText: string): void {
  const completedMessage = {
    id: messageId,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [
      {
        type: "output_text",
        text: outputText,
        annotations: [],
      },
    ],
  };
  writeSseEvent(response, "response.output_text.done", {
    type: "response.output_text.done",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    text: outputText,
  });
  writeSseEvent(response, "response.content_part.done", {
    type: "response.content_part.done",
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: {
      type: "output_text",
      text: outputText,
      annotations: [],
    },
  });
  writeSseEvent(response, "response.output_item.done", {
    type: "response.output_item.done",
    output_index: 0,
    item: completedMessage,
  });
  writeSseEvent(response, "response.completed", {
    type: "response.completed",
    response: {
      id: responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model,
      status: "completed",
      output: [completedMessage],
      output_text: outputText,
    },
  });
}

function writeResponsesRuntimeEvent(response: http.ServerResponse, responseId: string, event: CopilotBridgeRuntimeEvent): void {
  if (event.type === "assistant.message_delta") {
    return;
  }
  if (event.type === "assistant.reasoning_delta") {
    writeResponsesReasoningDelta(response, responseId, formatRuntimeEventText(event));
    return;
  }
  if (event.type === "session.unknown") {
    process.stderr.write(`[${new Date().toISOString()}] bridge runtime event ignored type=${event.sdkType} summary=${truncateBridgeText(event.summary, 240)}\n`);
    return;
  }
  const text = formatRuntimeEventText(event);
  if (text.length === 0) {
    return;
  }
  writeResponsesCommentaryItem(response, responseId, text);
  process.stderr.write(`[${new Date().toISOString()}] bridge runtime event type=${event.type} summary=${truncateBridgeText(text, 240)}\n`);
}

function writeResponsesReasoningDelta(response: http.ServerResponse, responseId: string, text: string): void {
  const reasoningId = `${responseId}_rs_0`;
  writeSseEvent(response, "response.reasoning_summary_part.added", {
    type: "response.reasoning_summary_part.added",
    item_id: reasoningId,
    output_index: 0,
    summary_index: 0,
    part: {
      type: "summary_text",
      text: "",
    },
  });
  writeSseEvent(response, "response.reasoning_summary_text.delta", {
    type: "response.reasoning_summary_text.delta",
    item_id: reasoningId,
    output_index: 0,
    summary_index: 0,
    delta: text,
  });
}

function writeResponsesCommentaryItem(response: http.ServerResponse, responseId: string, text: string): void {
  const itemId = `${responseId}_commentary_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  writeSseEvent(response, "response.output_item.done", {
    type: "response.output_item.done",
    output_index: 0,
    item: {
      id: itemId,
      type: "message",
      status: "completed",
      role: "assistant",
      phase: "commentary",
      content: [
        {
          type: "output_text",
          text,
          annotations: [],
        },
      ],
    },
  });
}

function formatRuntimeEventText(event: CopilotBridgeRuntimeEvent): string {
  switch (event.type) {
    case "assistant.intent":
      return truncateBridgeText(event.text, 600);
    case "assistant.reasoning_delta":
      return truncateBridgeText(event.text, 600);
    case "tool.execution_start":
      return truncateBridgeText(`Copilot started ${formatToolName(event.name)}${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "tool.execution_progress":
      return truncateBridgeText(`Copilot progress ${formatToolName(event.name)}${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "tool.execution_partial_result":
      return truncateBridgeText(`Copilot partial result ${formatToolName(event.name)}${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "tool.execution_complete":
      return truncateBridgeText(`Copilot ${event.success === false ? "failed" : "completed"} ${formatToolName(event.name)}${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "permission.requested":
      return truncateBridgeText(`Copilot requested permission${event.kind ? `: ${event.kind}` : ""}${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "permission.completed":
      return truncateBridgeText(`Copilot permission ${event.approved === false ? "denied" : "approved"}${event.kind ? `: ${event.kind}` : ""}${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "user_input.requested":
      return truncateBridgeText(`Copilot requested user input${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "exit_plan_mode.requested":
      return truncateBridgeText(`Copilot requested to exit plan mode${formatRequestId(event.requestId)}${formatSummarySuffix(event.summary)}`, 600);
    case "session.error":
      return truncateBridgeText(`Copilot session error${formatSummarySuffix(event.summary)}`, 600);
    case "session.idle":
      return truncateBridgeText(event.summary, 600);
    case "assistant.message_delta":
    case "session.unknown":
      return "";
  }
}

function formatToolName(name: string | undefined): string {
  return name ? `tool ${name}` : "tool";
}

function formatRequestId(requestId: string | undefined): string {
  return requestId ? ` (${requestId})` : "";
}

function formatSummarySuffix(summary: string): string {
  return summary.length > 0 ? `: ${summary}` : "";
}

function truncateBridgeText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}... [truncated]`;
}
function startSseHeartbeat(response: http.ServerResponse): NodeJS.Timeout {
  return setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 15000);
}

function getChatCompletionText(payload: ChatCompletionResponse): string {
  return payload.choices?.[0]?.message?.content ?? "";
}

/**
 * Formats and writes one server-sent event frame.
 */
function writeSseEvent(response: http.ServerResponse, eventName: string, data: Record<string, unknown>): void {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Derives a stable message identifier for synthesized Responses output items.
 */
function buildResponsesMessageId(responseId: string): string {
  if (responseId.startsWith("resp_")) {
    return `msg_${responseId.slice("resp_".length)}_0`;
  }
  return `${responseId}_msg_0`;
}

function isCliError(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string");
}

function mapBridgeErrorStatus(error: unknown): number {
  if (!isCliError(error)) {
    return 500;
  }
  if (error.code === "BRIDGE_UNSUPPORTED_REQUEST") {
    return 400;
  }
  if (error.code === "COPILOT_AUTH_REQUIRED") {
    return 401;
  }
  if (error.code === "BRIDGE_UPSTREAM_TIMEOUT") {
    return 504;
  }
  return 500;
}

/**
 * Returns a stable build identifier for the compiled bridge worker bundle.
 */
function getCopilotBridgeWorkerBuildId(): string {
  if (cachedBridgeWorkerBuildId) {
    return cachedBridgeWorkerBuildId;
  }
  const workerPath = path.join(__dirname, "copilot-bridge-worker.js");
  const stats = fs.statSync(workerPath);
  cachedBridgeWorkerBuildId = `${stats.size}:${stats.mtimeMs}`;
  return cachedBridgeWorkerBuildId;
}

/**
 * Starts an in-process local bridge server. Primarily used by the worker entrypoint and tests.
 */
export function startCopilotBridgeServer(args: {
  host: string;
  port: number;
  apiKey: string;
  executeChatCompletion: (payload: Record<string, unknown>, options?: BridgeExecutionOptions) => Promise<ChatCompletionResponse>;
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
    const result = await probeBridgeEndpoint({ host, port, stage: "health" });
    if (result.ok) {
      return { ok: true };
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
      const result = await probeBridgeEndpoint({ host, port, stage: "health" });
      if (result.ok) {
        return { ok: true };
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

async function evaluateBridgeReuse(args: {
  current: CopilotBridgeState | null;
  providerName: string;
  expectedBaseUrl: string;
  expectedApiKey: string;
  workerBuildId: string;
  runtimeDir?: string;
  logPath: string;
}): Promise<BridgeReuseDecision> {
  const probeAt = new Date().toISOString();
  if (!args.current) {
    return {
      reuse: false,
      reason: "no persisted bridge state",
      replacedExisting: false,
      probeAt,
      logPath: args.logPath,
    };
  }
  if (args.current.provider !== args.providerName) {
    return {
      reuse: false,
      reason: `provider mismatch: ${args.current.provider} -> ${args.providerName}`,
      replacedExisting: true,
      probeAt,
      logPath: args.logPath,
      probe: {
        ok: false,
        stage: "health",
        attempts: 0,
        cause: "provider-mismatch",
        retryable: false,
        message: "Persisted bridge provider does not match the requested provider.",
      },
    };
  }
  if (args.current.baseUrl !== args.expectedBaseUrl) {
    return {
      reuse: false,
      reason: `base URL mismatch: ${args.current.baseUrl} -> ${args.expectedBaseUrl}`,
      replacedExisting: true,
      probeAt,
      logPath: args.logPath,
      probe: {
        ok: false,
        stage: "health",
        attempts: 0,
        cause: "base-url-mismatch",
        retryable: false,
        message: "Persisted bridge base URL does not match the requested provider runtime base URL.",
      },
    };
  }
  if (args.current.workerBuildId !== args.workerBuildId) {
    return {
      reuse: false,
      reason: "worker build changed",
      replacedExisting: true,
      probeAt,
      logPath: args.logPath,
      probe: {
        ok: false,
        stage: "health",
        attempts: 0,
        cause: "worker-build-stale",
        retryable: false,
        message: "Persisted bridge worker build is stale.",
      },
    };
  }

  const health = await probeBridgeEndpoint({
    host: args.current.host,
    port: args.current.port,
    stage: "health",
  });
  appendBridgeLifecycleLog(args.logPath, `probe stage=health attempts=${String(health.attempts)} ok=${String(health.ok)}${health.ok ? "" : ` retryable=${String(health.retryable)} cause=${health.cause}`}`);
  if (!health.ok) {
    return {
      reuse: false,
      reason: `health probe failed: ${health.message}`,
      replacedExisting: true,
      probeAt,
      logPath: args.logPath,
      probe: health,
    };
  }

  const auth = await probeBridgeEndpoint({
    host: args.current.host,
    port: args.current.port,
    stage: "auth",
    apiKey: args.expectedApiKey,
  });
  appendBridgeLifecycleLog(args.logPath, `probe stage=auth attempts=${String(auth.attempts)} ok=${String(auth.ok)}${auth.ok ? "" : ` retryable=${String(auth.retryable)} cause=${auth.cause}`}`);
  if (!auth.ok) {
    return {
      reuse: false,
      reason: `auth probe failed: ${auth.message}`,
      replacedExisting: true,
      probeAt,
      logPath: args.logPath,
      probe: auth,
    };
  }

  return {
    reuse: true,
    health,
    auth,
    probeAt,
    logPath: args.logPath,
  };
}

async function probeBridgeEndpoint(args: {
  host: string;
  port: number;
  stage: "health" | "auth";
  apiKey?: string;
}): Promise<BridgeProbeResult> {
  for (let attempt = 1; attempt <= BRIDGE_REUSE_ATTEMPTS; attempt += 1) {
    const result = await requestBridgeProbe(args);
    if (result.ok) {
      return {
        ok: true,
        stage: args.stage,
        attempts: attempt,
      };
    }
    if (!result.retryable || attempt === BRIDGE_REUSE_ATTEMPTS) {
      return {
        ...result,
        stage: args.stage,
        attempts: attempt,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, BRIDGE_REUSE_DELAY_MS));
  }
  return {
    ok: false,
    stage: args.stage,
    attempts: BRIDGE_REUSE_ATTEMPTS,
    cause: "transport-timeout",
    retryable: true,
    message: "Bridge probe timed out.",
  };
}

async function requestBridgeProbe(args: {
  host: string;
  port: number;
  stage: "health" | "auth";
  apiKey?: string;
}): Promise<Omit<Extract<BridgeProbeResult, { ok: false }>, "stage" | "attempts"> | { ok: true }> {
  return new Promise((resolve) => {
    const request = http.request(
      {
        host: args.host,
        port: args.port,
        method: "GET",
        path: args.stage === "health" ? "/healthz" : "/v1/models",
        timeout: BRIDGE_REUSE_TIMEOUT_MS,
        headers:
          args.stage === "auth"
            ? {
                authorization: `Bearer ${args.apiKey ?? ""}`,
              }
            : undefined,
      },
      (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve({ ok: true });
          return;
        }
        if (args.stage === "auth" && (response.statusCode === 401 || response.statusCode === 403)) {
          resolve({
            ok: false,
            cause: "auth-rejected",
            retryable: false,
            statusCode: response.statusCode,
            message: `Authorization probe returned status ${String(response.statusCode)}.`,
          });
          return;
        }
        resolve({
          ok: false,
          cause: args.stage === "health" ? "health-non-200" : "transport-error",
          retryable: false,
          statusCode: response.statusCode,
          message:
            args.stage === "health"
              ? `Health endpoint returned status ${String(response.statusCode ?? 0)}.`
              : `Authorization probe returned status ${String(response.statusCode ?? 0)}.`,
        });
      }
    );
    request.on("error", (error) => {
      const classified = classifyProbeTransportError(error);
      resolve({
        ok: false,
        cause: classified.cause,
        retryable: classified.retryable,
        message: error.message,
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(args.stage === "health" ? "Health endpoint timed out." : "Authorization probe timed out."));
    });
    request.end();
  });
}

function classifyProbeTransportError(error: Error): { cause: "transport-timeout" | "transport-error"; retryable: boolean } {
  const message = error.message.toLowerCase();
  if (
    message.includes("timed out") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("epipe")
  ) {
    return {
      cause: message.includes("timed out") ? "transport-timeout" : "transport-error",
      retryable: true,
    };
  }
  return {
    cause: "transport-error",
    retryable: false,
  };
}

function ensureBridgeLogFile(logPath: string): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "", "utf8");
  }
}

function openBridgeLogFd(logPath: string): number {
  ensureBridgeLogFile(logPath);
  return fs.openSync(logPath, "a");
}

function appendBridgeLifecycleLog(logPath: string, message: string): void {
  ensureBridgeLogFile(logPath);
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
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
