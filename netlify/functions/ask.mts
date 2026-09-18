function classify(text: string) {
  const q = text.toLowerCase();
  if (/\b(code|coding|coder|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(q)) return "coding";
  if (/\b(workflow|workflows|automate|automation|schedule|monitor|alert|pipeline|github actions|actions)\b/.test(q)) return "automation";
  if (/\b(research|find|discover|latest|source|cite|news|security|privacy|market)\b/.test(q)) return "research";
  if (/\b(compare|comparison|versus|vs\.?|analyse|analyze|reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(q)) return "reasoning";
  if (/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(q)) return "design";
  return "general";
}

function workerFor(taskType: string, question: string) {
  const q = question.toLowerCase();
  const lightReasoning =
    taskType === "reasoning" &&
    question.length <= 360 &&
    !/\b(code|coding|bug|debug|refactor|architecture|security|production|deploy)\b/.test(q);

  if (lightReasoning) return "gpt-5.6-luna";
  if (taskType === "coding" || taskType === "reasoning") return "gpt-5.6-sol";
  if (taskType === "research") return "perplexity/sonar-pro-search";
  if (taskType === "automation") return "gpt-5.6-sol";
  if (taskType === "design") return "qwen/qwen3.5-397b-a17b";
  return "gpt-5.6-luna";
}

function reviewerFor(worker: string) {
  return worker.startsWith("deepseek/") ? "gpt-5.6-luna" : "deepseek/deepseek-v4-flash";
}

function useFastPath(question: string, taskType: string) {
  const q = question.toLowerCase();
  const highRiskOrFresh = /\b(latest|today|current|source|cite|security|privacy|medical|health|legal|tax|investment|stock|market|price|breaking|news|verify|fact[- ]?check)\b/.test(q);
  const explicitlyComplex = /\b(deep research|comprehensive audit|production deploy|security review|threat model)\b/.test(q);
  if (highRiskOrFresh || explicitlyComplex) return false;
  if (question.length > 700) return false;
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ChatMessage = { role: string; content: string };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(model: string, messages: ChatMessage[], maxTokens: number, timeoutMs: number) {
  const baseUrl = Netlify.env.get("OPENAI_BASE_URL");
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!baseUrl || !apiKey) throw new Error("OpenAI gateway is unavailable.");

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: maxTokens,
      }),
    },
    timeoutMs,
  );

  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text.slice(0, 220)}`);
  const json = JSON.parse(text);
  const answer = json?.choices?.[0]?.message?.content;
  if (!answer || typeof answer !== "string") throw new Error(`${model} returned an empty response`);
  return answer.trim();
}

async function callAnthropic(model: string, messages: ChatMessage[], maxTokens: number, timeoutMs: number) {
  const baseUrl = Netlify.env.get("ANTHROPIC_BASE_URL");
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!baseUrl || !apiKey) throw new Error("Anthropic gateway is unavailable.");

  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const anthropicMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, "")}/v1/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: anthropicMessages,
      }),
    },
    timeoutMs,
  );

  const text = await response.text();
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${text.slice(0, 220)}`);
  const json = JSON.parse(text);
  const answer = (json?.content || [])
    .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
    .map((part: any) => part.text)
    .join("\n");
  if (!answer) throw new Error(`${model} returned an empty response`);
  return answer.trim();
}

async function callGemini(model: string, messages: ChatMessage[], maxTokens: number, timeoutMs: number) {
  const baseUrl = Netlify.env.get("GOOGLE_GEMINI_BASE_URL");
  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!baseUrl || !apiKey) throw new Error("Gemini gateway is unavailable.");

  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    },
    timeoutMs,
  );

  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${text.slice(0, 220)}`);
  const json = JSON.parse(text);
  const answer = (json?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part?.text || "")
    .join("");
  if (!answer) throw new Error(`${model} returned an empty response`);
  return answer.trim();
}

async function callOpenRouter(model: string, messages: ChatMessage[], maxTokens: number, timeoutMs: number) {
  const baseUrl = Netlify.env.get("OPENROUTER_BASE_URL");
  const apiKey = Netlify.env.get("OPENROUTER_API_KEY");
  if (!baseUrl || !apiKey) throw new Error("OpenRouter gateway is unavailable.");

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
      }),
    },
    timeoutMs,
  );

  const text = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 220)}`);
  const json = JSON.parse(text);
  const answer = json?.choices?.[0]?.message?.content;
  if (!answer || typeof answer !== "string") throw new Error(`${model} returned an empty response`);
  return answer.trim();
}

async function callModel(
  model: string,
  messages: ChatMessage[],
  maxTokens = 1700,
  timeoutMs = 12000,
) {
  if (model.startsWith("claude-")) {
    return callAnthropic(model, messages, maxTokens, timeoutMs);
  }
  if (model.startsWith("gemini-")) {
    return callGemini(model, messages, maxTokens, timeoutMs);
  }
  if (model.includes("/")) {
    return callOpenRouter(model, messages, maxTokens, timeoutMs);
  }
  return callOpenAI(model, messages, maxTokens, timeoutMs);
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
        const workerModel = workerFor(taskType, question);
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
          const primaryModel = actualWorkerModel;
          const pool = Array.from(new Set([
            primaryModel,
            "gpt-5.6-luna",
            "qwen/qwen3.5-397b-a17b",
            "deepseek/deepseek-v4-flash",
          ]));

          const attempts = pool.map((model, index) => (async () => {
            if (index > 0) {
              await sleep(index === 1 ? 2200 : index === 2 ? 3800 : 5200);
              emit({ type: "hedge", model });
            }
            const value = await callModel(
              model,
              workerMessages,
              model.startsWith("gpt-") ? 1400 : 1200,
              model === primaryModel ? 10000 : 8500,
            );
            return { answer: value, model };
          })());

          const winner = await Promise.any(attempts);
          answer = winner.answer;
          actualWorkerModel = winner.model;
          emit({ type: "worker_selected", model: actualWorkerModel });
        } catch (workerError) {
          throw new Error("Relay could not get a response from any available AI provider. Please retry in a moment.");
        }

        const actualReviewerModel = reviewerFor(actualWorkerModel);

        let review = "";
        let reviewStatus: "PASS" | "FAIL" | "SKIPPED" | "FAST_PATH" = "SKIPPED";

        if (useFastPath(question, taskType)) {
          reviewStatus = "FAST_PATH";
          emit({ type: "fast_path", reason: "simple_or_low_risk" });
        } else {
          emit({ type: "reviewer", model: actualReviewerModel });
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
