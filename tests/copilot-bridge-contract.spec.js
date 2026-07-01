"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");

const { startCopilotBridgeServer } = require("../dist/runtime/copilot-bridge.js");

async function run() {
  await testChatCompletionTimeoutForwardingAndErrorMapping();
  await testResponsesTimeoutForwarding();
  await testResponsesStreamingRuntimeEvents();
  await testChatStreamingIgnoresRuntimeEvents();
}

async function testChatCompletionTimeoutForwardingAndErrorMapping() {
  const port = await getFreePort();
  const seenOptions = [];
  const server = await startCopilotBridgeServer({
    host: "127.0.0.1",
    port,
    apiKey: "bridge-secret",
    executeChatCompletion: async (_payload, options) => {
      seenOptions.push(options ?? {});
      if ((options?.timeoutMs ?? 0) === 23) {
        const error = new Error("upstream timeout");
        error.code = "BRIDGE_UPSTREAM_TIMEOUT";
        throw error;
      }
      if ((options?.timeoutMs ?? 0) === 24) {
        throw new Error("unexpected worker failure");
      }
      return {
        id: "chat-timeout-test",
        object: "chat.completion",
        created: 1,
        model: "gpt-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      };
    },
  });

  try {
    const ok = await requestJson({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/chat/completions",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        timeout_ms: 1234,
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(seenOptions[0].timeoutMs, 1234);

    const unsupportedTimeout = await requestJson({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/chat/completions",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        timeout_ms: "bad",
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.equal(unsupportedTimeout.statusCode, 400);

    const unauthorized = await requestJson({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/chat/completions",
      headers: {
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.equal(unauthorized.statusCode, 401);

    const upstreamTimeout = await requestJson({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/chat/completions",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        timeout_ms: 23,
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.equal(upstreamTimeout.statusCode, 504);

    const runtimeFailure = await requestJson({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/chat/completions",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        timeout_ms: 24,
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.equal(runtimeFailure.statusCode, 500);
  } finally {
    await closeServer(server);
  }
}

async function testResponsesTimeoutForwarding() {
  const port = await getFreePort();
  const seenOptions = [];
  const server = await startCopilotBridgeServer({
    host: "127.0.0.1",
    port,
    apiKey: "bridge-secret",
    executeChatCompletion: async (_payload, options) => {
      seenOptions.push(options ?? {});
      return {
        id: "responses-timeout-test",
        object: "chat.completion",
        created: 2,
        model: "gpt-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      };
    },
  });

  try {
    const completion = await requestJson({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/responses",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        timeoutMs: 4321,
        input: "hello",
      },
    });
    assert.equal(completion.statusCode, 200);
    assert.equal(seenOptions[0].timeoutMs, 4321);
  } finally {
    await closeServer(server);
  }
}

async function testResponsesStreamingRuntimeEvents() {
  const port = await getFreePort();
  const server = await startCopilotBridgeServer({
    host: "127.0.0.1",
    port,
    apiKey: "bridge-secret",
    executeChatCompletion: async (_payload, options) => {
      options.onRuntimeEvent({ type: "assistant.intent", text: "Inspecting workspace" });
      options.onRuntimeEvent({ type: "tool.execution_start", name: "shell", requestId: "req-1", summary: "Get-ChildItem" });
      options.onRuntimeEvent({ type: "assistant.reasoning_delta", text: "Need a quick file check." });
      options.onRuntimeEvent({ type: "permission.requested", kind: "shell", requestId: "perm-1", summary: "auto approval" });
      options.onRuntimeEvent({ type: "user_input.requested", requestId: "input-1", summary: "Need clarification" });
      options.onRuntimeEvent({ type: "exit_plan_mode.requested", requestId: "plan-1", summary: "Ready to implement" });
      options.onRuntimeEvent({ type: "session.unknown", sdkType: "future.event", summary: "ignored" });
      options.onRuntimeEvent({ type: "tool.execution_partial_result", name: "shell", requestId: "req-1", summary: "x".repeat(900) });
      options.onTextDelta("final ");
      options.onTextDelta("answer");
      return {
        id: "responses-streaming-runtime-test",
        object: "chat.completion",
        created: 3,
        model: "gpt-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "final answer" },
            finish_reason: "stop",
          },
        ],
      };
    },
  });

  try {
    const stream = await requestRaw({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/responses",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        stream: true,
        input: "hello",
      },
    });
    assert.equal(stream.statusCode, 200);
    const events = parseSse(stream.body);
    assert.deepEqual(events.slice(0, 2).map((event) => event.event), ["response.created", "response.in_progress"]);
    assert.ok(events.some((event) => event.event === "response.output_text.delta" && event.data.delta === "final "));
    assert.ok(events.some((event) => event.event === "response.output_text.delta" && event.data.delta === "answer"));
    assert.ok(events.some((event) => event.event === "response.completed"));

    const commentary = events.filter((event) => event.event === "response.output_item.done" && event.data.item?.phase === "commentary");
    assert.ok(commentary.some((event) => event.data.item.content[0].text.includes("Inspecting workspace")));
    assert.ok(commentary.some((event) => event.data.item.content[0].text.includes("Copilot started tool shell")));
    assert.ok(commentary.some((event) => event.data.item.content[0].text.includes("Copilot requested permission")));
    assert.ok(commentary.some((event) => event.data.item.content[0].text.includes("Copilot requested user input")));
    assert.ok(commentary.some((event) => event.data.item.content[0].text.includes("Copilot requested to exit plan mode")));
    assert.ok(commentary.some((event) => event.data.item.content[0].text.includes("[truncated]")));
    assert.equal(commentary.some((event) => event.data.item.content[0].text.includes("future.event")), false);

    assert.ok(events.some((event) => event.event === "response.reasoning_summary_part.added"));
    assert.ok(events.some((event) => event.event === "response.reasoning_summary_text.delta" && event.data.delta.includes("Need a quick file check")));
  } finally {
    await closeServer(server);
  }
}

async function testChatStreamingIgnoresRuntimeEvents() {
  const port = await getFreePort();
  const server = await startCopilotBridgeServer({
    host: "127.0.0.1",
    port,
    apiKey: "bridge-secret",
    executeChatCompletion: async (_payload, options) => {
      options.onRuntimeEvent?.({ type: "assistant.intent", text: "hidden from chat" });
      options.onTextDelta?.("chat text");
      return {
        id: "chat-streaming-runtime-test",
        object: "chat.completion",
        created: 4,
        model: "gpt-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "chat text" },
            finish_reason: "stop",
          },
        ],
      };
    },
  });

  try {
    const stream = await requestRaw({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/v1/chat/completions",
      headers: {
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      },
      body: {
        model: "gpt-5",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.body, /chat text/);
    assert.doesNotMatch(stream.body, /hidden from chat/);
    assert.doesNotMatch(stream.body, /response\.output_item\.done/);
  } finally {
    await closeServer(server);
  }
}
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function requestJson(options) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: options.host,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: response.statusCode,
            body: raw.trim() === "" ? null : JSON.parse(raw),
          });
        });
      }
    );
    request.on("error", reject);
    if (options.body !== undefined) {
      request.write(JSON.stringify(options.body));
    }
    request.end();
  });
}

function requestRaw(options) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: options.host,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    request.on("error", reject);
    if (options.body !== undefined) {
      request.write(JSON.stringify(options.body));
    }
    request.end();
  });
}

function parseSse(raw) {
  return raw
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0 && !frame.startsWith(":"))
    .map((frame) => {
      const lines = frame.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event: eventLine ? eventLine.slice("event: ".length) : "message",
        data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : null,
      };
    });
}
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

module.exports = { run };
