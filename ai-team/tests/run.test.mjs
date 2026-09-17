import test from "node:test";
import assert from "node:assert/strict";

import { runTask } from "../src/run.mjs";

test("runs the classified task through executor and independent reviewer", async () => {
  const providerCalls = [];
  const reviewCalls = [];

  const result = await runTask({
    input: { task: "Find useful GitHub repositories" },
    providerClients: {
      openai: {
        async generate(input) {
          providerCalls.push(input);
          return { output: "Found three useful repositories" };
        },
      },
    },
    reviewerClients: {
      google: {
        async review(input) {
          reviewCalls.push(input);
          return { verdict: "PASS" };
        },
      },
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.type, "research");
  assert.equal(result.execution.provider, "openai");
  assert.equal(result.review.provider, "google");
  assert.equal(result.review.verdict, "PASS");
  assert.equal(providerCalls.length, 1);
  assert.equal(reviewCalls.length, 1);
});

test("returns review_failed without retrying when reviewer returns FAIL", async () => {
  let executorCalls = 0;

  const result = await runTask({
    input: { task: "Create a workflow every morning" },
    providerClients: {
      openai: {
        async generate() {
          executorCalls += 1;
          return { output: "Workflow draft" };
        },
      },
    },
    reviewerClients: {
      anthropic: {
        async review() {
          return { verdict: "FAIL" };
        },
      },
    },
  });

  assert.equal(result.status, "review_failed");
  assert.equal(result.review.verdict, "FAIL");
  assert.equal(executorCalls, 1);
});
