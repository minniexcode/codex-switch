import * as http from "node:http";
import * as https from "node:https";
import * as crypto from "node:crypto";
import {
  createTokenManager,
  createStaticTokenManager,
  getCopilotRequestHeaders,
  readGithubToken,
  TokenManager,
} from "./copilot-token";

let tokenManager: TokenManager | null = null;

function logWorkerEvent(message: string): void {
  process.stderr.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function main(): Promise<void> {
  const provider = process.env.CODEX_SWITCH_BRIDGE_PROVIDER ?? "copilot";
  const host = process.env.CODEX_SWITCH_BRIDGE_HOST ?? "127.0.0.1";
  const port = Number(process.env.CODEX_SWITCH_BRIDGE_PORT ?? "41415");
  const localApiKey = process.env.CODEX_SWITCH_BRIDGE_API_KEY ?? "";
  const toolHomeDir = process.env.CODEX_SWITCH_TOOL_HOME_DIR || undefined;
  const staticCopilotToken = process.env.CODEX_SWITCH_BRIDGE_COPILOT_TOKEN || undefined;

  logWorkerEvent(`worker startup provider=${provider} host=${host} port=${String(port)}`);

  if (staticCopilotToken) {
    tokenManager = createStaticTokenManager(staticCopilotToken);
    logWorkerEvent("copilot token acquired (static), api base: https://api.githubcopilot.com");
  } else {
    const githubPat = process.env.CODEX_SWITCH_GITHUB_TOKEN || readGithubToken(toolHomeDir);
    if (!githubPat) {
      throw new Error("No GitHub token found. Run `codexs login copilot` first.");
    }
    tokenManager = createTokenManager(githubPat);
    await tokenManager.getToken();
    logWorkerEvent(`copilot token acquired, api base: ${tokenManager.getApiBaseUrl()}`);
  }

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, localApiKey);
    } catch (error: unknown) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }));
      }
    }
  });

  const stopWorker = () => {
    logWorkerEvent(`worker shutdown provider=${provider}`);
    tokenManager?.stop();
    server.close();
    process.exit(0);
  };
  process.once("SIGINT", stopWorker);
  process.once("SIGTERM", stopWorker);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  logWorkerEvent(`worker ready provider=${provider} host=${host} port=${String(port)}`);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, localApiKey: string): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  if (method === "GET" && url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!isAuthorized(req, localApiKey)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Unauthorized" } }));
    return;
  }

  if (method === "GET" && url === "/v1/models") {
    await proxyGet("/models", res);
    return;
  }

  if (method === "POST" && url === "/v1/chat/completions") {
    await proxyPost("/chat/completions", req, res);
    return;
  }

  if (method === "POST" && url === "/v1/responses") {
    await proxyPost("/responses", req, res);
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message: "Not found" } }));
}

async function proxyGet(upstreamPath: string, res: http.ServerResponse): Promise<void> {
  const copilotToken = await tokenManager!.getToken();
  const apiBase = tokenManager!.getApiBaseUrl();
  const targetUrl = new URL(upstreamPath, apiBase);
  const headers = getCopilotRequestHeaders(copilotToken);

  const upstreamRes = await httpsRequest({
    method: "GET",
    url: targetUrl,
    headers,
  });

  res.writeHead(upstreamRes.statusCode, filterResponseHeaders(upstreamRes.headers));
  upstreamRes.pipe(res);
}

async function proxyPost(upstreamPath: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readRequestBody(req);
  const copilotToken = await tokenManager!.getToken();
  const apiBase = tokenManager!.getApiBaseUrl();
  const targetUrl = new URL(upstreamPath, apiBase);
  const requestId = crypto.randomUUID();
  const headers = getCopilotRequestHeaders(copilotToken, requestId);

  // Preserve content-length for the body
  headers["content-length"] = Buffer.byteLength(body).toString();

  const upstreamRes = await httpsRequest({
    method: "POST",
    url: targetUrl,
    headers,
    body,
  });

  // If upstream returned 401, try refreshing token once and retry
  if (upstreamRes.statusCode === 401) {
    upstreamRes.resume();
    logWorkerEvent("upstream 401, invalidating token and retrying");
    tokenManager!.invalidate();
    const freshToken = await tokenManager!.getToken();
    const retryHeaders = getCopilotRequestHeaders(freshToken, crypto.randomUUID());
    retryHeaders["content-length"] = Buffer.byteLength(body).toString();

    const retryRes = await httpsRequest({
      method: "POST",
      url: targetUrl,
      headers: retryHeaders,
      body,
    });

    res.writeHead(retryRes.statusCode, filterResponseHeaders(retryRes.headers));
    retryRes.pipe(res);
    return;
  }

  res.writeHead(upstreamRes.statusCode, filterResponseHeaders(upstreamRes.headers));
  upstreamRes.pipe(res);
}

type UpstreamResponse = http.IncomingMessage & { statusCode: number; headers: http.IncomingHttpHeaders };

function httpsRequest(args: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: args.url.hostname,
      port: args.url.port || 443,
      path: args.url.pathname + args.url.search,
      method: args.method,
      headers: args.headers,
    }, (res) => {
      resolve(res as UpstreamResponse);
    });
    req.on("error", reject);
    if (args.body) {
      req.write(args.body);
    }
    req.end();
  });
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function filterResponseHeaders(headers: http.IncomingHttpHeaders): Record<string, string | string[]> {
  const filtered: Record<string, string | string[]> = {};
  const passthrough = ["content-type", "transfer-encoding", "x-request-id"];
  for (const key of passthrough) {
    if (headers[key]) {
      filtered[key] = headers[key] as string;
    }
  }
  // Always allow cache-control for SSE
  if (headers["cache-control"]) {
    filtered["cache-control"] = headers["cache-control"] as string;
  }
  return filtered;
}

function isAuthorized(req: http.IncomingMessage, expectedApiKey: string): boolean {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return false;
  }
  return authorization.slice("Bearer ".length) === expectedApiKey;
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
    process.exit(1);
  });
}
