import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PLAN_STEPS, OrchestratorError, orchestrateTask } from "../src/orchestrator.mjs";

function buildClients({ failTask = null } = {}) {
  const workerCalls = [];
  const reviewCalls = [];

  const providerClients = Object.fromEntries(
    ["openai", "anthropic", "google"].map((provider) => [
      provider,
      {
        async generate({ task, modelProfile }) {
          workerCalls.push({ provider, task, modelProfile });
          return { output: `output:${task}` };
        },
      },
    ]),
  );

  const reviewerClients = Object.fromEntries(
    ["openai", "anthropic", "google"].map((provider) => [
      provider,
      {
        async review({ task, output, executorProvider }) {
          reviewCalls.push({ provider, task, output, executorProvider });
          return { verdict: task === failTask ? "FAIL" : "PASS" };
        },
      },
    ]),
  );

  return { providerClients, reviewerClients, workerCalls, reviewCalls };
}

test("executes a bounded plan sequentially through worker and reviewer", async () => {
  const plannerCalls = [];
  const plannerClient = {
    async plan(input) {
      plannerCalls.push(input);
      return {
        steps: [
          { task: "Find useful repositories", type: "research" },
          { task: "Fix this Python bug", type: "coding" },
        ],
      };
    },
  };
  const { providerClients, reviewerClients, workerCalls, reviewCalls } = buildClients();

  const result = await orchestrateTask({
    input: { task: "Improve the project" },
    plannerClient,
    providerClients,
    reviewerClients,
  });

  assert.deepEqual(plannerCalls, [{ task: "Improve the project", maxSteps: MAX_PLAN_STEPS }]);
  assert.equal(result.status, "success");
  assert.equal(result.plannedSteps, 2);
  assert.equal(result.completedSteps, 2);
  assert.equal(result.failedStep, null);
  assert.deepEqual(workerCalls.map(({ provider, task }) => ({ provider, task })), [
    { provider: "openai", task: "Find useful repositories" },
    { provider: "anthropic", task: "Fix this Python bug" },
  ]);
  assert.deepEqual(reviewCalls.map(({ provider, task }) => ({ provider, task })), [
    { provider: "google", task: "Find useful repositories" },
    { provider: "openai", task: "Fix this Python bug" },
  ]);
});

test("stops immediately when a reviewer fails a step", async () => {
  const plannerClient = {
    async plan() {
      return {
        steps: [
          { task: "First step", type: "research" },
          { task: "Fail second step", type: "research" },
          { task: "Third step must not run", type: "research" },
        ],
      };
    },
  };
  const { providerClients, reviewerClients, workerCalls } = buildClients({ failTask: "Fail second step" });

  const result = await orchestrateTask({
    input: { task: "Run bounded plan" },
    plannerClient,
    providerClients,
    reviewerClients,
  });

  assert.equal(result.status, "review_failed");
  assert.equal(result.plannedSteps, 3);
  assert.equal(result.completedSteps, 1);
  assert.equal(result.failedStep, 2);
  assert.equal(workerCalls.length, 2);
  assert.equal(workerCalls.some(({ task }) => task === "Third step must not run"), false);
});

test("rejects plans larger than the hard step limit", async () => {
  const plannerClient = {
    async plan() {
      return {
        steps: [
          { task: "1" },
          { task: "2" },
          { task: "3" },
          { task: "4" },
        ],
      };
    },
  };

  await assert.rejects(
    orchestrateTask({ input: { task: "Too much work" }, plannerClient }),
    (error) => error instanceof OrchestratorError && /maximum of 3 steps/.test(error.message),
  );
});

test("rejects an empty plan", async () => {
  const plannerClient = { async plan() { return { steps: [] }; } };

  await assert.rejects(
    orchestrateTask({ input: { task: "Nothing" }, plannerClient }),
    (error) => error instanceof OrchestratorError && /at least one step/.test(error.message),
  );
});
