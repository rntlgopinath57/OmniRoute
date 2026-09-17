export class ExecutorError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ExecutorError";
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

export async function executeWithPrimaryProvider({ task, route, providerClients }) {
  const taskText = requireNonEmptyString(task, "task");
  const provider = requireNonEmptyString(route?.primaryProvider, "route.primaryProvider");
  const modelProfile = requireNonEmptyString(route?.modelProfile, "route.modelProfile");
  const client = providerClients?.[provider];

  if (!client || typeof client.generate !== "function") {
    throw new ExecutorError(`No provider client configured for ${provider}`);
  }

  try {
    const response = await client.generate({
      task: taskText,
      modelProfile,
    });

    const output = requireNonEmptyString(response?.output, "provider response output");

    return {
      status: "success",
      provider,
      modelProfile,
      output,
    };
  } catch (error) {
    if (error instanceof ExecutorError || error instanceof TypeError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown provider error";
    throw new ExecutorError(`Primary provider ${provider} failed: ${message}`, { cause: error });
  }
}
