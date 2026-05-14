import { startCopilotBridgeServer } from "./copilot-bridge";
import { sendCopilotChatCompletion } from "./copilot-adapter";

async function main(): Promise<void> {
  const provider = process.env.CODEX_SWITCH_BRIDGE_PROVIDER ?? "copilot";
  const host = process.env.CODEX_SWITCH_BRIDGE_HOST ?? "127.0.0.1";
  const port = Number(process.env.CODEX_SWITCH_BRIDGE_PORT ?? "4141");
  const apiKey = process.env.CODEX_SWITCH_BRIDGE_API_KEY ?? "";

  await startCopilotBridgeServer({
    host,
    port,
    apiKey,
    executeChatCompletion: async (payload) =>
      sendCopilotChatCompletion({
        provider,
        payload,
      }),
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
