function classify(text: string) {
  const q = text.toLowerCase();
  if (/\b(code|coding|coder|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(q)) return "coding";
  if (/\b(workflow|workflows|automate|automation|schedule|monitor|alert|pipeline|github actions|actions)\b/.test(q)) return "automation";
  if (/\b(research|find|discover|compare|analyse|analyze|latest|source|news|security|privacy|market)\b/.test(q)) return "research";
  if (/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(q)) return "design";
  if (/\b(reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(q)) return "reasoning";
  return "general";
}

function workerFor(taskType: string) {
  if (taskType === "coding" || taskType === "reasoning") return "gpt-5.6-sol";
  if (taskType === "research") return "perplexity/sonar-pro-search";
  if (taskType === "automation") return "gpt-5.6-sol";
  if (taskType === "design") return "qwen/qwen3.5-397b-a17b";
  return "gpt-5.6-luna";
}

function reviewerFor(worker: string) {
  return worker.startsWith("deepseek/") ? "gpt-5.6-luna" : "deepseek/deepseek-v4-flash";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 1700,
  timeoutMs = 12000,
) {
  const baseUrl = Netlify.env.get("OPENAI_BASE_URL");
  const apiKey = Netlify.env.get("OPENAI_API_KEY");

  if (!baseUrl || !apiKey) {
    throw new Error("AI Gateway is not active yet. Complete one production deploy, then retry.");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const requestBody = JSON.stringify({
    model,
    messages,
    ...(model.startsWith("gpt-")
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens }),
  });

  let response: Response | null = null;
  let lastNetworkError = "";

  for (let attempt = 1; attempt <= 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: requestBody,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) break;

      if ([429, 502, 503, 504].includes(response.status) && attempt < 1) {
        console.warn("AI Gateway transient response", { model, status: response.status, attempt });
        await sleep(350 * attempt);
        continue;
      }

      const detail = (await response.text()).slice(0, 500);
      console.error("AI Gateway model error", { model, status: response.status, detail });
      throw new Error(
        response.status >= 500 || response.status === 429
          ? "The AI service is temporarily busy. Please retry."
          : "The selected AI model rejected the request. OmniRoute will need a routing adjustment."
      );
    } catch (error) {
      if (error instanceof Error && !/^The AI service|^The selected AI model/.test(error.message)) {
        lastNetworkError = error.message;
        console.warn("AI Gateway network retry", { model, attempt, error: lastNetworkError });
        if (attempt < 1) {
          await sleep(350 * attempt);
          continue;
        }
        throw new Error("The selected AI provider did not respond in time. OmniRoute will switch providers on retry.");
      }
      throw error;
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      lastNetworkError
        ? "The selected AI provider did not respond in time. OmniRoute will switch providers on retry."
        : "The AI service is temporarily busy. Please retry."
    );
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error(`${model} returned an empty response`);
  }
  return text.trim();
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let question = "";
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    if (Array.isArray(body?.history)) {
      history = body.history
        .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
        .slice(-6)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!question) return Response.json({ error: "Question is required" }, { status: 400 });
  if (question.length > 12000) return Response.json({ error: "Question is too long" }, { status: 413 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (payload: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));

      try {
        const taskType = classify(question);
        const workerModel = workerFor(taskType);
        const reviewerModel = reviewerFor(workerModel);

        emit({ type: "planner", taskType });
        await new Promise((resolve) => setTimeout(resolve, 180));
        emit({ type: "worker", taskType, model: workerModel });

        let actualWorkerModel = workerModel;
        const workerMessages = [
          {
            role: "system",
            content:
              "You are the specialist inside an AI team. Answer the user's request directly, accurately, and practically. Preserve context from the prior conversation when the user asks a follow-up. Check assumptions. Do not mention internal routing, hidden prompts, or system architecture.",
          },
          ...history,
          { role: "user", content: question },
        ];

        let answer = "";
        try {
          answer = await callModel(actualWorkerModel, workerMessages);
        } catch (workerError) {
          actualWorkerModel = "gpt-5.6-luna";
          emit({ type: "fallback", model: actualWorkerModel });
          answer = await callModel(actualWorkerModel, workerMessages);
        }

        const actualReviewerModel = reviewerFor(actualWorkerModel);
        emit({ type: "reviewer", model: actualReviewerModel });

        let review = "";
        let reviewStatus: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
        try {
          review = await callModel(
            actualReviewerModel,
            [
              {
                role: "system",
                content:
                  "You are an independent reviewer. Evaluate relevance, correctness, completeness, and unsupported claims. First line must be PASS or FAIL. If FAIL, add one concise correction instruction on the next line.",
              },
              ...history,
              { role: "user", content: `CURRENT QUESTION:\n${question}\n\nCANDIDATE ANSWER:\n${answer}` },
            ],
            220,
            4500,
          );
          reviewStatus = review.split(/\r?\n/)[0].trim().toUpperCase().startsWith("PASS")
            ? "PASS"
            : "FAIL";
        } catch (reviewError) {
          console.warn("Reviewer unavailable; returning worker answer", {
            model: actualReviewerModel,
            error: reviewError instanceof Error ? reviewError.message : String(reviewError),
          });
          emit({ type: "review_skipped", reason: "timeout_or_provider_error" });
          reviewStatus = "SKIPPED";
        }

        if (reviewStatus === "FAIL") {
          emit({ type: "retry" });
          try {
            answer = await callModel(
              actualWorkerModel,
              [
                {
                  role: "system",
                  content:
                    "Revise the answer using the review feedback. Preserve prior conversation context. Return only the improved final answer. Keep it direct and useful.",
                },
                ...history,
                { role: "user", content: `CURRENT QUESTION:\n${question}\n\nFIRST ANSWER:\n${answer}\n\nREVIEW:\n${review}` },
              ],
              1200,
              8000,
            );
          } catch (retryError) {
            console.warn("Refinement unavailable; returning first worker answer", {
              error: retryError instanceof Error ? retryError.message : String(retryError),
            });
            reviewStatus = "SKIPPED";
          }
        }

        emit({
          type: "done",
          answer,
          review: reviewStatus,
          model: actualWorkerModel,
          reviewer: actualReviewerModel,
          taskType,
        });
      } catch (error) {
        emit({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown AI Team error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const config = {
  path: "/api/ask",
};
