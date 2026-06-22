import { startCopilotBridgeServer } from "./copilot-bridge";
import {
  createCopilotRuntimeClient,
  sendCopilotChatCompletion,
  startCopilotRuntimeClient,
  stopCopilotRuntimeClient,
} from "./copilot-adapter";

type QueueTask<T> = () => Promise<T>;

let requestQueue: Promise<unknown> = Promise.resolve();

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
  const runtimeClient = await createCopilotRuntimeClient(runtimesDir);
  await startCopilotRuntimeClient(runtimeClient);

  const stopRuntime = () => {
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
            } else {
              options?.onTextDone?.(event.text);
            }
          },
        })
      ),
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
