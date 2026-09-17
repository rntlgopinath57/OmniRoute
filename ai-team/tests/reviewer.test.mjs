import test from "node:test";
import assert from "node:assert/strict";

import { ReviewerError, reviewExecution } from "../src/reviewer.mjs";

const execution = {
  status: "success",
  provider: "openai",
  modelProfile: "research-strong",
  output: "Research complete",
};

test("returns PASS from an independent reviewer", async () => {
  const calls = [];
  const verdict = await reviewExecution({
    task: "Find useful GitHub repositories",
    execution,
    reviewerProvider: "google",
    reviewerClient: {
      async review(input) {
        calls.push(input);
        return { verdict: "pass" };
      },
    },
  });

  assert.equal(verdict, "PASS");
  assert.deepEqual(calls, [
    {
      task: "Find useful GitHub repositories",
      output: "Research complete",
      executorProvider: "openai",
      executorModelProfile: "research-strong",
    },
  ]);
});

test("returns FAIL from an independent reviewer", async () => {
  const verdict = await reviewExecution({
    task: "Find useful GitHub repositories",
    execution,
    reviewerProvider: "google",
    reviewerClient: {
      async review() {
        return { verdict: "FAIL" };
      },
    },
  });

  assert.equal(verdict, "FAIL");
});

test("rejects a reviewer using the executor provider", async () => {
  await assert.rejects(
    reviewExecution({
      task: "Find useful GitHub repositories",
      execution,
      reviewerProvider: "openai",
      reviewerClient: {
        async review() {
          return { verdict: "PASS" };
        },
      },
    }),
    (error) => error instanceof ReviewerError && /must be independent/.test(error.message),
  );
});

test("rejects unsupported reviewer verdicts", async () => {
  await assert.rejects(
    reviewExecution({
      task: "Find useful GitHub repositories",
      execution,
      reviewerProvider: "google",
      reviewerClient: {
        async review() {
          return { verdict: "MAYBE" };
        },
      },
    }),
    (error) => error instanceof ReviewerError && /must be PASS or FAIL/.test(error.message),
  );
});

test("wraps reviewer client failures with reviewer context", async () => {
  await assert.rejects(
    reviewExecution({
      task: "Find useful GitHub repositories",
      execution,
      reviewerProvider: "google",
      reviewerClient: {
        async review() {
          throw new Error("temporary failure");
        },
      },
    }),
    (error) => error instanceof ReviewerError && /Reviewer google failed: temporary failure/.test(error.message),
  );
});
