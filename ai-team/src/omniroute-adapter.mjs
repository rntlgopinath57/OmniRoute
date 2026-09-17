export class OmniRouteAdapterError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "OmniRouteAdapterError";
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function extractMessageContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  return requireNonEmptyString(content, "OmniRoute response content");
}

export function createOmniRouteClient({
  baseUrl = "http://localhost:20128",
  models,
  apiKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  const origin = requireNonEmptyString(baseUrl, "baseUrl").replace(/\/+$/, "");

  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  async function chat({ model, messages }) {
    const modelId = requireNonEmptyString(model, "model");
    const headers = { "Content-Type": "application/json" };
    if (typeof apiKey === "string" && apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    let response;
    try {
      response = await fetchImpl(`${origin}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelId, messages, stream: false }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error";
      throw new OmniRouteAdapterError(`OmniRoute request failed: ${message}`, { cause: error });
    }

    if (!response?.ok) {
      throw new OmniRouteAdapterError(`OmniRoute returned HTTP ${response?.status ?? "unknown"}`);
    }

    const payload = await response.json();
    return extractMessageContent(payload);
  }

  return {
    async generate({ task, modelProfile }) {
      const taskText = requireNonEmptyString(task, "task");
      const profile = requireNonEmptyString(modelProfile, "modelProfile");
      const model = models?.[profile];
      if (!model) {
        throw new OmniRouteAdapterError(`No OmniRoute model mapped for profile ${profile}`);
      }

      const output = await chat({
        model,
        messages: [{ role: "user", content: taskText }],
      });
      return { output };
    },

    async review({ task, output, executorProvider, executorModelProfile }) {
      const taskText = requireNonEmptyString(task, "task");
      const executionOutput = requireNonEmptyString(output, "output");
      const reviewModel = models?.review;
      if (!reviewModel) {
        throw new OmniRouteAdapterError("No OmniRoute review model mapped");
      }

      const verdict = await chat({
        model: reviewModel,
        messages: [
          { role: "system", content: "Review the result independently. Return only PASS or FAIL." },
          {
            role: "user",
            content: JSON.stringify({
              task: taskText,
              output: executionOutput,
              executorProvider: executorProvider ?? null,
              executorModelProfile: executorModelProfile ?? null,
            }),
          },
        ],
      });

      return { verdict: verdict.trim().toUpperCase() };
    },
  };
}
