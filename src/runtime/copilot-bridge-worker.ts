import { startCopilotBridgeServer } from "./copilot-bridge";
import {
  createCopilotRuntimeClient,
  sendCopilotChatCompletion,
  startCopilotRuntimeClient,
  stopCopilotRuntimeClient,
} from "./copilot-adapter";

type QueueTask<T> = () => Promise<T>;

let requestQueue: Promise<unknown> = Promise.resolve();

/**
 * Writes one worker lifecycle entry to stderr so the detached parent log capture persists it.
 */
function logWorkerEvent(message: string): void {
  process.stderr.write(`[${new Date().toISOString()}] ${message}\n`);
}

function enqueueRequest<T>(task: QueueTask<T>): Promise<T> {
  const run = requestQueue.then(task, task);
  requestQueue = run.catch(() => undefined);
  return run;
}

async function main(): Promise<void> {
  const provider = process.env.CODEX_SWITCH_BRIDGE_PROVIDER ?? "copilot";
  const host = process.env.CODEX_SWITCH_BRIDGE_HOST ?? "127.0.0.1";
  const port = Number(process.env.CODEX_SWITCH_BRIDGE_PORT ?? "41415");
  const apiKey = process.env.CODEX_SWITCH_BRIDGE_API_KEY ?? "";
  const runtimesDir = process.env.CODEX_SWITCH_RUNTIMES_DIR || undefined;
  logWorkerEvent(`worker startup provider=${provider} host=${host} port=${String(port)}`);
  const runtimeClient = await createCopilotRuntimeClient(runtimesDir);
  await startCopilotRuntimeClient(runtimeClient);

  const stopRuntime = () => {
    logWorkerEvent(`worker shutdown provider=${provider}`);
    void stopCopilotRuntimeClient(runtimeClient).finally(() => process.exit(0));
  };
  process.once("SIGINT", stopRuntime);
  process.once("SIGTERM", stopRuntime);

  await startCopilotBridgeServer({
    host,
    port,
    apiKey,
    executeChatCompletion: async (payload, options) =>
      enqueueRequest(() =>
        sendCopilotChatCompletion({
          provider,
          payload,
          runtimesDir,
          runtimeClient,
          timeoutMs: options?.timeoutMs,
          onStreamEvent: (event) => {
            if (event.type === "delta") {
              options?.onTextDelta?.(event.delta);
            } else if (event.type === "runtime") {
              options?.onRuntimeEvent?.(event.event);
            } else {
              options?.onTextDone?.(event.text);
            }
          },
        })
      ),
  });
  logWorkerEvent(`worker ready provider=${provider} host=${host} port=${String(port)}`);
}

if (require.main === module) {
  process.on("uncaughtException", (error: Error) => {
    logWorkerEvent(`worker uncaught exception: ${error.message}`);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    logWorkerEvent(`worker unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
  void main().catch((error: unknown) => {
    logWorkerEvent(`worker startup failure: ${error instanceof Error ? error.message : String(error)}`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
