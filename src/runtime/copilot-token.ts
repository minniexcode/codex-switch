import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { resolveCodexSwitchHome } from "../storage/codex-paths";
import { cliError } from "../domain/errors";

const GITHUB_OAUTH_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";

const EDITOR_VERSION = "vscode/1.100.0";
const COPILOT_CHAT_VERSION = "copilot-chat/0.30.0";
const USER_AGENT = "GitHubCopilotChat/0.30.0";

type ExchangeImpl = (githubPat: string) => Promise<CopilotToken>;
let exchangeImplementation: ExchangeImpl | null = null;

export function setCopilotTokenExchangeImplementation(impl: ExchangeImpl): void {
  exchangeImplementation = impl;
}

export function resetCopilotTokenExchangeImplementation(): void {
  exchangeImplementation = null;
}

export type CopilotToken = {
  token: string;
  expiresAt: number;
  apiBaseUrl: string;
  refreshIn: number;
};

export type DeviceFlowResult = {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
};

export type TokenManager = {
  getToken(): Promise<string>;
  getApiBaseUrl(): string;
  invalidate(): void;
  stop(): void;
};

const SESSION_ID = crypto.randomUUID();
const MACHINE_ID = crypto.randomBytes(32).toString("hex");

export function getCopilotRequestHeaders(copilotToken: string, requestId?: string): Record<string, string> {
  return {
    "authorization": `Bearer ${copilotToken}`,
    "content-type": "application/json",
    "copilot-integration-id": "vscode-chat",
    "editor-version": EDITOR_VERSION,
    "editor-plugin-version": COPILOT_CHAT_VERSION,
    "user-agent": USER_AGENT,
    "openai-intent": "conversation-panel",
    "x-interaction-type": "conversation-panel",
    "x-github-api-version": "2026-01-09",
    "x-request-id": requestId ?? crypto.randomUUID(),
    "vscode-sessionid": SESSION_ID,
    "vscode-machineid": MACHINE_ID,
  };
}

export function getGithubTokenPath(toolHomeDir?: string): string {
  const home = resolveCodexSwitchHome(toolHomeDir);
  return path.join(home, "github-token");
}

export function readGithubToken(toolHomeDir?: string): string | null {
  const tokenPath = getGithubTokenPath(toolHomeDir);
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  return fs.readFileSync(tokenPath, "utf8").trim();
}

export function writeGithubToken(token: string, toolHomeDir?: string): void {
  const tokenPath = getGithubTokenPath(toolHomeDir);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, token, "utf8");
}

export async function startDeviceFlow(): Promise<DeviceFlowResult> {
  const body = `client_id=${GITHUB_OAUTH_CLIENT_ID}&scope=read:user`;
  const response = await httpsPost(GITHUB_DEVICE_CODE_URL, body, {
    "content-type": "application/x-www-form-urlencoded",
    "accept": "application/json",
  });

  if (!response.ok) {
    throw cliError("GITHUB_DEVICE_FLOW_FAILED", `GitHub device flow initiation failed: ${response.status}`, {
      status: response.status,
      body: response.body,
    });
  }

  const data = JSON.parse(response.body) as Record<string, unknown>;
  return {
    userCode: String(data.user_code ?? ""),
    verificationUri: String(data.verification_uri ?? "https://github.com/login/device"),
    deviceCode: String(data.device_code ?? ""),
    interval: Number(data.interval ?? 5),
    expiresIn: Number(data.expires_in ?? 900),
  };
}

export async function pollDeviceFlowToken(deviceCode: string, interval: number, expiresIn: number): Promise<string> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval;

  while (Date.now() < deadline) {
    await sleep(pollInterval * 1000);

    const body = `client_id=${GITHUB_OAUTH_CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
    const response = await httpsPost(GITHUB_ACCESS_TOKEN_URL, body, {
      "content-type": "application/x-www-form-urlencoded",
      "accept": "application/json",
    });

    if (!response.ok) {
      continue;
    }

    const data = JSON.parse(response.body) as Record<string, unknown>;
    if (data.access_token && typeof data.access_token === "string") {
      return data.access_token;
    }

    const error = String(data.error ?? "");
    if (error === "authorization_pending") {
      continue;
    }
    if (error === "slow_down") {
      pollInterval += 5;
      continue;
    }
    if (error === "expired_token" || error === "access_denied") {
      throw cliError("GITHUB_DEVICE_FLOW_FAILED", `GitHub device flow failed: ${error}`, { error });
    }
  }

  throw cliError("GITHUB_DEVICE_FLOW_FAILED", "GitHub device flow timed out waiting for user authorization.", {});
}

export async function exchangeForCopilotToken(githubPat: string): Promise<CopilotToken> {
  if (exchangeImplementation) {
    return exchangeImplementation(githubPat);
  }

  const response = await httpsGet(COPILOT_TOKEN_URL, {
    "authorization": `token ${githubPat}`,
    "content-type": "application/json",
    "accept": "application/json",
    "editor-version": EDITOR_VERSION,
    "editor-plugin-version": COPILOT_CHAT_VERSION,
    "user-agent": USER_AGENT,
    "x-github-api-version": "2026-01-09",
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw cliError("COPILOT_AUTH_REQUIRED", "GitHub token is invalid or expired. Run `codexs login copilot` to re-authenticate.", {
        status: response.status,
      });
    }
    throw cliError("COPILOT_TOKEN_EXCHANGE_FAILED", `Failed to exchange GitHub token for Copilot token: HTTP ${response.status}`, {
      status: response.status,
      body: response.body,
    });
  }

  const data = JSON.parse(response.body) as Record<string, unknown>;
  const token = String(data.token ?? "");
  if (!token) {
    throw cliError("COPILOT_TOKEN_EXCHANGE_FAILED", "Copilot token exchange returned empty token.", { data });
  }

  const endpoints = data.endpoints as Record<string, unknown> | undefined;
  const apiBaseUrl = String(endpoints?.api ?? "https://api.githubcopilot.com");

  return {
    token,
    expiresAt: Number(data.expires_at ?? Date.now() / 1000 + 1800),
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    refreshIn: Number(data.refresh_in ?? 1500),
  };
}

export function createTokenManager(githubPat: string): TokenManager {
  let currentToken: CopilotToken | null = null;
  let refreshTimer: NodeJS.Timeout | null = null;
  let refreshing: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    currentToken = await exchangeForCopilotToken(githubPat);
    scheduleRefresh();
  }

  function scheduleRefresh(): void {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    const delayMs = Math.max((currentToken!.refreshIn - 60) * 1000, 30000);
    refreshTimer = setTimeout(() => {
      refreshing = refresh().catch(() => {
        // retry after 30s on failure
        refreshTimer = setTimeout(() => { refreshing = refresh(); }, 30000);
      });
    }, delayMs);
    refreshTimer.unref();
  }

  return {
    async getToken(): Promise<string> {
      if (!currentToken || Date.now() / 1000 >= currentToken.expiresAt - 60) {
        if (!refreshing) {
          refreshing = refresh();
        }
        await refreshing;
        refreshing = null;
      }
      return currentToken!.token;
    },
    getApiBaseUrl(): string {
      return currentToken?.apiBaseUrl ?? "https://api.githubcopilot.com";
    },
    invalidate(): void {
      currentToken = null;
    },
    stop(): void {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    },
  };
}

export function createStaticTokenManager(token: string): TokenManager {
  return {
    async getToken(): Promise<string> {
      return token;
    },
    getApiBaseUrl(): string {
      return "https://api.githubcopilot.com";
    },
    invalidate(): void {},
    stop(): void {},
  };
}

type HttpResponse = { ok: boolean; status: number; body: string };

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body: responseBody });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string>): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body: responseBody });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
