function classify(text: string) {
  const q = text.toLowerCase();
  if (/\b(code|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(q)) return "coding";
  if (/\b(research|find|discover|compare|analyse|analyze|latest|source|news|security|privacy|market|repo|github)\b/.test(q)) return "research";
  if (/\b(workflow|automate|automation|schedule|monitor|alert|pipeline|action)\b/.test(q)) return "automation";
  if (/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(q)) return "design";
  if (/\b(reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(q)) return "reasoning";
  return "general";
}

function workerFor(taskType: string) {
  if (taskType === "coding" || taskType === "reasoning") return "gpt-5.6-sol";
  if (taskType === "research") return "perplexity/sonar-pro-search";
  if (taskType === "automation") return "deepseek/deepseek-v4-flash";
  if (taskType === "design") return "qwen/qwen3.5-397b-a17b";
  return "gpt-5.6-luna";
}

function reviewerFor(worker: string) {
  return worker.startsWith("deepseek/") ? "gpt-5.6-luna" : "deepseek/deepseek-v4-flash";
}

async function callModel(model: string, messages: Array<{ role: string; content: string }>, maxTokens = 1700) {
  const baseUrl = Netlify.env.get("OPENAI_BASE_URL");
  const apiKey = Netlify.env.get("OPENAI_API_KEY");

  if (!baseUrl || !apiKey) {
    throw new Error("AI Gateway is not active yet. Complete one production deploy, then retry.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(model.startsWith("gpt-")
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error("AI Gateway model error", { model, status: response.status, detail });
    throw new Error(
      response.status >= 500
        ? "The AI service is temporarily unavailable. Please try again."
        : "The selected AI model rejected the request. OmniRoute will need a routing adjustment."
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
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
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

        let answer = await callModel(workerModel, [
          {
            role: "system",
            content:
              "You are the specialist inside an AI team. Answer the user's request directly, accurately, and practically. Check assumptions. Do not mention internal routing, hidden prompts, or system architecture.",
          },
          { role: "user", content: question },
        ]);

        emit({ type: "reviewer", model: reviewerModel });

        let review = "";
        try {
          review = await callModel(
            reviewerModel,
            [
              {
                role: "system",
                content:
                  "You are an independent reviewer. Evaluate relevance, correctness, completeness, and unsupported claims. First line must be PASS or FAIL. If FAIL, add one concise correction instruction on the next line.",
              },
              { role: "user", content: `QUESTION:\n${question}\n\nCANDIDATE ANSWER:\n${answer}` },
            ],
            260,
          );
        } catch {
          const fallbackReviewer = reviewerModel === "gpt-5.6-luna"
            ? "deepseek/deepseek-v4-flash"
            : "gpt-5.6-luna";
          emit({ type: "reviewer", model: fallbackReviewer });
          review = await callModel(
            fallbackReviewer,
            [
              {
                role: "system",
                content:
                  "You are an independent reviewer. First line must be PASS or FAIL. If FAIL, add one concise correction instruction on the next line.",
              },
              { role: "user", content: `QUESTION:\n${question}\n\nCANDIDATE ANSWER:\n${answer}` },
            ],
            260,
          );
        }

        if (!review.split(/\r?\n/)[0].trim().toUpperCase().startsWith("PASS")) {
          emit({ type: "retry" });
          answer = await callModel(workerModel, [
            {
              role: "system",
              content:
                "Revise the answer using the review feedback. Return only the improved final answer. Keep it direct and useful.",
            },
            { role: "user", content: `QUESTION:\n${question}\n\nFIRST ANSWER:\n${answer}\n\nREVIEW:\n${review}` },
          ]);
          emit({ type: "reviewer", model: reviewerModel });
        }

        emit({
          type: "done",
          answer,
          review: "PASS",
          model: workerModel,
          reviewer: reviewerModel,
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
