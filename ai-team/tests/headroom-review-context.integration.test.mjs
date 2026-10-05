import test from "node:test";
import assert from "node:assert/strict";

import { compressInternalReviewContext } from "../src/internal-context-compression.mjs";
import { reviewExecution } from "../src/reviewer.mjs";

function buildPayload() {
  const rows = Array.from({ length: 600 }, (_, id) => ({
    id,
    status: "ok",
    latency_ms: 100 + (id % 5),
    message: "routine relay execution healthy ".repeat(8),
  }));

  rows[313] = {
    id: 313,
    status: "error",
    latency_ms: 9999,
    message: "CRITICAL_REVIEW_FAILURE provider fallback evidence must survive",
  };

  return JSON.stringify(rows);
}

const runHeadroomIntegration = process.env.AI_TEAM_HEADROOM_INTEGRATION === "1";

const enabledEnv = {
  ...process.env,
  AI_TEAM_HEADROOM_REVIEW: "1",
  AI_TEAM_HEADROOM_MIN_BYTES: "1",
  AI_TEAM_HEADROOM_TIMEOUT_MS: "10000",
};

test(
  "Headroom compresses large structured reviewer context and preserves critical evidence",
  { skip: !runHeadroomIntegration },
  async () => {
  const source = buildPayload();
  const result = await compressInternalReviewContext({
    content: source,
    query: "find the critical provider fallback failure",
    env: enabledEnv,
  });

  assert.equal(result.compressed, true, JSON.stringify(result));
  assert.equal(result.reason, "compressed");
  assert.match(result.content, /CRITICAL_REVIEW_FAILURE/);
  console.log("HEADROOM_RATIO", result.outputBytes, result.originalBytes, result.outputBytes / result.originalBytes);
  assert.ok(result.outputBytes < result.originalBytes * 0.5, JSON.stringify(result));
  },
);

test(
  "reviewer sees compressed context while final executor output stays original",
  { skip: !runHeadroomIntegration },
  async () => {
  const originalOutput = buildPayload();
  const execution = {
    status: "success",
    provider: "openai",
    modelProfile: "research-strong",
    output: originalOutput,
  };
  let reviewedOutput = "";

  const verdict = await reviewExecution({
    task: "Review provider fallback evidence",
    execution,
    reviewerProvider: "google",
    contextCompressor: ({ content, query }) =>
      compressInternalReviewContext({
        content,
        query,
        env: enabledEnv,
      }),
    reviewerClient: {
      async review(input) {
        reviewedOutput = input.output;
        return {
          verdict: input.output.includes("CRITICAL_REVIEW_FAILURE") ? "PASS" : "FAIL",
        };
      },
    },
  });

  assert.equal(verdict, "PASS");
  assert.match(reviewedOutput, /CRITICAL_REVIEW_FAILURE/);
  const reviewerRatio = Buffer.byteLength(reviewedOutput) / Buffer.byteLength(originalOutput);
  console.log("HEADROOM_REVIEWER_RATIO", reviewerRatio);
  assert.ok(reviewerRatio < 0.5);
  assert.equal(execution.output, originalOutput);
  },
);
