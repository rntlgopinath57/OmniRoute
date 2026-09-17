import { runTask } from "./run.mjs";

export const MAX_PLAN_STEPS = 3;

export class OrchestratorError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "OrchestratorError";
  }
}

function requireTaskInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be a task object");
  }

  const task = typeof input.task === "string" ? input.task.trim() : "";
  if (!task) {
    throw new TypeError("input.task must be a non-empty string");
  }

  return task;
}

function normalizeStep(step, index) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new OrchestratorError(`Plan step ${index + 1} must be an object`);
  }

  const task = typeof step.task === "string" ? step.task.trim() : "";
  if (!task) {
    throw new OrchestratorError(`Plan step ${index + 1} requires a non-empty task`);
  }

  const type = typeof step.type === "string" ? step.type.trim().toLowerCase() : "";
  return type ? { task, type } : { task };
}

export async function orchestrateTask({ input, plannerClient, providerClients, reviewerClients }) {
  const task = requireTaskInput(input);

  if (!plannerClient || typeof plannerClient.plan !== "function") {
    throw new OrchestratorError("Planner client must provide plan()");
  }

  let response;
  try {
    response = await plannerClient.plan({ task, maxSteps: MAX_PLAN_STEPS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown planner error";
    throw new OrchestratorError(`Planner failed: ${message}`, { cause: error });
  }

  if (!Array.isArray(response?.steps) || response.steps.length === 0) {
    throw new OrchestratorError("Planner must return at least one step");
  }

  if (response.steps.length > MAX_PLAN_STEPS) {
    throw new OrchestratorError(`Planner exceeded maximum of ${MAX_PLAN_STEPS} steps`);
  }

  const plan = response.steps.map(normalizeStep);
  const results = [];

  for (let index = 0; index < plan.length; index += 1) {
    const result = await runTask({
      input: plan[index],
      providerClients,
      reviewerClients,
    });

    results.push(result);

    if (result.status !== "success") {
      return {
        status: "review_failed",
        task,
        plannedSteps: plan.length,
        completedSteps: index,
        failedStep: index + 1,
        results,
      };
    }
  }

  return {
    status: "success",
    task,
    plannedSteps: plan.length,
    completedSteps: plan.length,
    failedStep: null,
    results,
  };
}
