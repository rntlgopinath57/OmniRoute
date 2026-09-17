import test from "node:test";
import assert from "node:assert/strict";

import { OmniRouteAdapterError, createOmniRouteClient } from "../src/omniroute-adapter.mjs";

function okJson(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  };
}

test("uses OmniRoute chat completions for executor generation", async () => {
  const calls = [];
  const client = createOmniRouteClient({
    baseUrl: "http://localhost:20128/",
    models: { "coding-strong": "anthropic/claude-code", review: "openai/reviewer" },
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return okJson({ choices: [{ message: { content: "Fixed code" } }] });
    },
  });

  const result = await client.generate({ task: "Fix this Python bug", modelProfile: "coding-strong" });

  assert.deepEqual(result, { output: "Fixed code" });
  assert.equal(calls[0].url, "http://localhost:20128/v1/chat/completions");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: "anthropic/claude-code",
    messages: [{ role: "user", content: "Fix this Python bug" }],
    stream: false,
  });
});

test("implements the reviewer client contract through OmniRoute", async () => {
  const client = createOmniRouteClient({
    models: { review: "openai/reviewer" },
    async fetchImpl() {
      return okJson({ choices: [{ message: { content: "pass" } }] });
    },
  });

  const result = await client.review({
    task: "Fix this Python bug",
    output: "Fixed code",
    executorProvider: "anthropic",
    executorModelProfile: "coding-strong",
  });

  assert.deepEqual(result, { verdict: "PASS" });
});

test("requires explicit profile-to-model mapping", async () => {
  const client = createOmniRouteClient({
    models: {},
    async fetchImpl() {
      throw new Error("should not be called");
    },
  });

  await assert.rejects(
    client.generate({ task: "Research this", modelProfile: "research-strong" }),
    (error) => error instanceof OmniRouteAdapterError && /No OmniRoute model mapped/.test(error.message),
  );
});

test("surfaces OmniRoute HTTP failures", async () => {
  const client = createOmniRouteClient({
    models: { "general-balanced": "auto" },
    async fetchImpl() {
      return { ok: false, status: 503 };
    },
  });

  await assert.rejects(
    client.generate({ task: "Think about this", modelProfile: "general-balanced" }),
    (error) => error instanceof OmniRouteAdapterError && /HTTP 503/.test(error.message),
  );
});
