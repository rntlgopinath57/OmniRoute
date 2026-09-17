import { normalizeTask } from "./task.mjs";
import { selectModelRoute } from "./router.mjs";
import { executeWithPrimaryProvider } from "./executor.mjs";
import { reviewExecution } from "./reviewer.mjs";

export async function runTask({ input, providerClients, reviewerClients }) {
  const task = normalizeTask(input);
  const route = selectModelRoute(task.type);

  const execution = await executeWithPrimaryProvider({
    task: task.task,
    route,
    providerClients,
  });

  const reviewerProvider = route.fallbackProvider;
  const verdict = await reviewExecution({
    task: task.task,
    execution,
    reviewerProvider,
    reviewerClient: reviewerClients?.[reviewerProvider],
  });

  return {
    status: verdict === "PASS" ? "success" : "review_failed",
    task: task.task,
    type: task.type,
    route,
    execution,
    review: {
      provider: reviewerProvider,
      verdict,
    },
  };
}
