import { compressInternalReviewContext } from "./internal-context-compression.mjs";

export class ReviewerError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ReviewerError";
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

export async function reviewExecution({
  task,
  execution,
  reviewerProvider,
  reviewerClient,
  contextCompressor = compressInternalReviewContext,
}) {
  const taskText = requireNonEmptyString(task, "task");
  const output = requireNonEmptyString(execution?.output, "execution.output");
  const executorProvider = requireNonEmptyString(execution?.provider, "execution.provider");
  const reviewer = requireNonEmptyString(reviewerProvider, "reviewerProvider");

  if (reviewer === executorProvider) {
    throw new ReviewerError("Reviewer provider must be independent from executor provider");
  }

  if (!reviewerClient || typeof reviewerClient.review !== "function") {
    throw new ReviewerError(`No reviewer client configured for ${reviewer}`);
  }

  if (typeof contextCompressor !== "function") {
    throw new TypeError("contextCompressor must be a function");
  }

  // Headroom is reviewer-context-only. The original executor output remains
  // untouched in the task result. Any compression failure fails open.
  let reviewerOutput = output;
  try {
    const prepared = await contextCompressor({
      content: output,
      query: taskText,
    });
    if (typeof prepared?.content === "string" && prepared.content.trim()) {
      reviewerOutput = prepared.content;
    }
  } catch {
    reviewerOutput = output;
  }

  try {
    const response = await reviewerClient.review({
      task: taskText,
      output: reviewerOutput,
      executorProvider,
      executorModelProfile: execution?.modelProfile ?? null,
    });

    const verdict = requireNonEmptyString(response?.verdict, "reviewer verdict").toUpperCase();

    if (verdict !== "PASS" && verdict !== "FAIL") {
      throw new ReviewerError(`Reviewer verdict must be PASS or FAIL, received ${verdict}`);
    }

    return verdict;
  } catch (error) {
    if (error instanceof ReviewerError || error instanceof TypeError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown reviewer error";
    throw new ReviewerError(`Reviewer ${reviewer} failed: ${message}`, { cause: error });
  }
}
