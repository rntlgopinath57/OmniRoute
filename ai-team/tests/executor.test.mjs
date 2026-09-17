import test from "node:test";
import assert from "node:assert/strict";

import { ExecutorError, executeWithPrimaryProvider } from "../src/executor.mjs";

test("executes one task through the selected primary provider", async () => {
  const calls = [];
  const providerClients = {
    openai: {
      async generate(input) {
        calls.push(input);
        return { output: "Research complete" };
      },
    },
  };

  const result = await executeWithPrimaryProvider({
    task: "Find useful GitHub repositories",
    route: {
      primaryProvider: "openai",
      fallbackProvider: "google",
      modelProfile: "research-strong",
    },
    providerClients,
  });

  assert.deepEqual(calls, [
    {
      task: "Find useful GitHub repositories",
      modelProfile: "research-strong",
    },
  ]);
  assert.deepEqual(result, {
    status: "success",
    provider: "openai",
    modelProfile: "research-strong",
    output: "Research complete",
  });
});

test("does not silently use fallback when the primary client is missing", async () => {
  await assert.rejects(
    executeWithPrimaryProvider({
      task: "Find useful GitHub repositories",
      route: {
        primaryProvider: "openai",
        fallbackProvider: "google",
        modelProfile: "research-strong",
      },
      providerClients: {
        google: {
          async generate() {
            return { output: "Should not run yet" };
          },
        },
      },
    }),
    (error) => error instanceof ExecutorError && /No provider client configured for openai/.test(error.message),
  );
});

test("fails when the provider returns an empty output", async () => {
  await assert.rejects(
    executeWithPrimaryProvider({
      task: "Fix this Python bug",
      route: {
        primaryProvider: "anthropic",
        fallbackProvider: "openai",
        modelProfile: "coding-strong",
      },
      providerClients: {
        anthropic: {
          async generate() {
            return { output: "   " };
          },
        },
      },
    }),
    /provider response output must be a non-empty string/,
  );
});

test("wraps provider failures with executor context", async () => {
  await assert.rejects(
    executeWithPrimaryProvider({
      task: "Create a workflow every morning",
      route: {
        primaryProvider: "openai",
        fallbackProvider: "anthropic",
        modelProfile: "automation-efficient",
      },
      providerClients: {
        openai: {
          async generate() {
            throw new Error("temporary failure");
          },
        },
      },
    }),
    (error) => error instanceof ExecutorError && /Primary provider openai failed: temporary failure/.test(error.message),
  );
});
