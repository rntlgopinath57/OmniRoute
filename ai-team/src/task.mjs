export function normalizeTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Task input must be a JSON object");
  }

  const task = typeof input.task === "string" ? input.task.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim().toLowerCase() : "general";

  if (!task) {
    throw new TypeError("Task input requires a non-empty task string");
  }

  return {
    task,
    type: type || "general",
  };
}

export function executeTask(input) {
  const task = normalizeTask(input);

  return {
    status: "success",
    task: task.task,
    type: task.type,
    result: "AI Team task received successfully",
  };
}
