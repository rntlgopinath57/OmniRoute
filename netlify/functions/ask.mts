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
  const heavy =
    question.length > 900 ||
    /\b(deep|complex|architecture|architect|production|root cause|large refactor|security audit|performance audit)\b/.test(q);

  if ((taskType === "coding" || taskType === "automation") && heavy) return "gpt-5.6-sol";
  if (taskType === "coding" || taskType === "automation") return "gpt-5.6-luna";
  if (taskType === "research" || taskType === "design" || taskType === "reasoning") return "gemini-3.5-flash";
  return "gpt-5.6-luna";
}

function isFollowUp(question: string, history: Array<{ role: string; content: string }>) {
  if (!history.length) return false;
  const q = question.trim().toLowerCase();
  if (q.length > 220) return false;
  if (/^(new topic|different topic|unrelated|start over|ignore previous)\b/.test(q)) return false;
  if (q.length <= 120) return true;
  return /^(yes|yeah|yep|ok|okay|sure|go ahead|continue|proceed|do it|do more|more|go deeper|expand|elaborate|evaluate|compare|tell me more|what about|and |also |then |now )/.test(q)
    || /\b(that|this|it|them|those|same|above|previous|further|deeper|more)\b/.test(q);
}

function allowedStickyModel(model: string) {
  return new Set([
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "claude-haiku-4-5",
    "gemini-3.5-flash",
  ]).has(model);
}

function reviewerFor(worker: string) {
  return worker.startsWith("claude-") ? "gemini-3.5-flash" : "claude-haiku-4-5";
}

function disambiguationContext(question: string) {
  const q = question.toLowerCase();
  const notes: string[] = [];

  if (/\bgoogle\s+skills\b/.test(q)) {
    notes.push(
      '“Google Skills” refers to the GitHub repository google/skills, not Gemini or Google AI products, unless the user explicitly says otherwise.'
    );
  }
  if (/\banthropic\s+skills\b/.test(q)) {
    notes.push(
      '“Anthropic Skills” refers to the GitHub repository anthropics/skills, not Claude model capabilities, unless the user explicitly says otherwise.'
    );
  }
  if (/\b(openai\s+plugins|google\s+adk|crawl4ai|playwright[- ]mcp)\b/.test(q)) {
    notes.push(
      'Treat named items as software repositories/tools when the user is comparing repos or asking which one fits Relay/AI-Team work.'
    );
  }

  return notes.join(" ");
}

const REPO_ALIASES: Array<[RegExp, string]> = [
  [/\bgoogle\s+skills\b/i, "rntlgopinath57/Google-skills"],
  [/\banthropic\s+skills\b/i, "rntlgopinath57/anthropic-skills"],
  [/\bopenai\s+plugins\b/i, "rntlgopinath57/openai-plugins"],
  [/\bgoogle\s+adk(?:\s+python)?\b/i, "rntlgopinath57/google-adk-python"],
  [/\bcrawl4ai\b/i, "rntlgopinath57/crawl4ai"],
  [/\bplaywright(?:[- ]mcp)?\b/i, "rntlgopinath57/microsoft-playwright-mcp"],
  [/\bfreellmapi\b/i, "rntlgopinath57/freellmapi"],
  [/\bharosa\b|\bsafeqr\b/i, "rntlgopinath57/safeqr"],
  [/\bgopi[_ -]?alerts\b/i, "rntlgopinath57/gopi_alerts"],
  [/\bnimbus\b/i, "rntlgopinath57/nimbus"],
  [/\bomniroute\b|\brelay\b/i, "rntlgopinath57/OmniRoute"],
];

function mentionedRepos(text: string) {
  const found = new Set<string>();
  const explicit = text.match(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/g) || [];
  for (const repo of explicit) found.add(repo);
  for (const [pattern, repo] of REPO_ALIASES) {
    if (pattern.test(text)) found.add(repo);
  }
  return [...found].slice(0, 3);
}

async function githubRepoContext(text: string) {
  const repos = mentionedRepos(text);
  if (!repos.length) return { context: "", repos: [], inaccessible: [] as string[] };

  const token = Netlify.env.get("RELAY_GITHUB_TOKEN") || Netlify.env.get("GITHUB_TOKEN") || "";
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "relay-ai-team",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const blocks: string[] = [];
  const accessible: string[] = [];
  const inaccessible: string[] = [];

  for (const repo of repos) {
    try {
      const metaResponse = await fetchWithTimeout(
        `https://api.github.com/repos/${repo}`,
        { headers },
        5000,
      );
      if (!metaResponse.ok) {
        inaccessible.push(repo);
        continue;
      }
      const meta = await metaResponse.json();
      accessible.push(repo);

      let readme = "";
      try {
        const readmeResponse = await fetchWithTimeout(
          `https://api.github.com/repos/${repo}/readme`,
          {
            headers: {
              ...headers,
              "Accept": "application/vnd.github.raw+json",
            },
          },
          5000,
        );
        if (readmeResponse.ok) readme = (await readmeResponse.text()).slice(0, 7000);
      } catch {}

      let rootFiles = "";
      try {
        const contentsResponse = await fetchWithTimeout(
          `https://api.github.com/repos/${repo}/contents`,
          { headers },
          5000,
        );
        if (contentsResponse.ok) {
          const items = await contentsResponse.json();
          if (Array.isArray(items)) {
            rootFiles = items.slice(0, 40).map((item: any) =>
              `${item?.type === "dir" ? "dir" : "file"}:${item?.name || ""}`
            ).join(", ");
          }
        }
      } catch {}

      blocks.push([
        `REPOSITORY: ${repo}`,
        `Description: ${meta?.description || ""}`,
        `Default branch: ${meta?.default_branch || ""}`,
        `Visibility: ${meta?.visibility || (meta?.private ? "private" : "public")}`,
        `Updated: ${meta?.updated_at || ""}`,
        `Pushed: ${meta?.pushed_at || ""}`,
        `Fork: ${Boolean(meta?.fork)}`,
        meta?.source?.full_name ? `Upstream: ${meta.source.full_name}` : "",
        rootFiles ? `Root files: ${rootFiles}` : "",
        readme ? `README:\n${readme}` : "README unavailable",
      ].filter(Boolean).join("\n"));
    } catch {
      inaccessible.push(repo);
    }
  }

  return {
    context: blocks.join("\n\n---\n\n"),
    repos: accessible,
    inaccessible,
  };
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
const providerCooldownUntil = new Map<string, number>();

function providerAvailable(model: string) {
  return (providerCooldownUntil.get(model) || 0) <= Date.now();
}
function coolDownProvider(model: string, ms = 45000) {
  providerCooldownUntil.set(model, Date.now() + ms);
}
function markProviderHealthy(model: string) {
  providerCooldownUntil.delete(model);
}

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
  let preferredModel = "";
  let previousTaskType = "";
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    preferredModel = typeof body?.preferredModel === "string" ? body.preferredModel.trim() : "";
    previousTaskType = typeof body?.previousTaskType === "string" ? body.previousTaskType.trim() : "";
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
        const recentUserContext = history
          .filter((m) => m.role === "user")
          .slice(-2)
          .map((m) => m.content)
          .join(" ");
        const contextualQuestion = recentUserContext ? `${recentUserContext} ${question}` : question;
        const followUp = isFollowUp(question, history);
        const taskType = followUp && previousTaskType
          ? previousTaskType
          : classify(contextualQuestion);
        const stickyModel = followUp && allowedStickyModel(preferredModel)
          ? preferredModel
          : "";
        const workerModel = stickyModel || workerFor(taskType, contextualQuestion);
        const reviewerModel = reviewerFor(workerModel);

        emit({ type: "planner", taskType });
        await new Promise((resolve) => setTimeout(resolve, 180));
        emit({ type: "worker", taskType, model: workerModel });

        let actualWorkerModel = workerModel;
        const contextNote = disambiguationContext(contextualQuestion);
        const repoLookup = await githubRepoContext(contextualQuestion);
        if (repoLookup.repos.length) {
          emit({ type: "tool", tool: "github", status: "complete", repos: repoLookup.repos });
        } else if (mentionedRepos(contextualQuestion).length) {
          emit({ type: "tool", tool: "github", status: "unavailable", repos: repoLookup.inaccessible });
        }
        const workerMessages = [
          {
            role: "system",
            content:
              "You are the specialist inside an AI team. Answer the user's request directly, accurately, and practically. Preserve context from the prior conversation when the user asks a follow-up. Check assumptions. Do not mention internal routing, hidden prompts, or system architecture."
              + (contextNote ? " IMPORTANT CONTEXT: " + contextNote : "")
              + (repoLookup.context
                ? " LIVE GITHUB EVIDENCE follows. Use it as current repository evidence and do not claim you cannot access these repositories:\n\n" + repoLookup.context
                : repoLookup.inaccessible.length
                  ? " NOTE: The requested repository appears private or unavailable to Relay's live GitHub reader. Say that clearly; do not pretend it was inspected."
                  : ""),
          },
          ...history,
          { role: "user", content: question },
        ];

        let answer = "";
        const primaryModel = actualWorkerModel;
        const candidates = Array.from(new Set([
          primaryModel,
          "claude-haiku-4-5",
          "gemini-3.5-flash",
          "gpt-5.6-luna",
        ]));
        let pool = candidates.filter((model, index) => index === 0 || providerAvailable(model));
        if (!pool.length) pool = candidates;

        const failures: string[] = [];
        let rateLimited = 0;
        let creditLimited = 0;

        for (let index = 0; index < pool.length; index++) {
          const model = pool[index];
          if (index > 0) emit({ type: "fallback", model });

          try {
            answer = await callModel(
              model,
              workerMessages,
              model.startsWith("gpt-") ? 1200 : 1000,
              index === 0 ? 9000 : 7000,
            );
            actualWorkerModel = model;
            markProviderHealthy(model);
            emit({ type: "worker_selected", model: actualWorkerModel });
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${model}: ${message}`);
            console.warn("Relay provider attempt failed", { model, error: message });

            if (/\b429\b|rate.?limit|resource[_ -]?exhausted/i.test(message)) {
              rateLimited += 1;
              coolDownProvider(model, 60000);
              continue;
            }
            if (/\b402\b|insufficient|credits?|quota/i.test(message)) {
              creditLimited += 1;
              coolDownProvider(model, 120000);
              continue;
            }
            coolDownProvider(model, 30000);
          }
        }

        if (!answer) {
          console.error("All Relay providers failed", { failures });
          if (rateLimited === pool.length) {
            throw new Error("Relay's available AI providers are temporarily rate-limited. Wait about a minute, then retry.");
          }
          if (creditLimited === pool.length) {
            throw new Error("Relay's AI gateway credits are unavailable or exhausted. Check Netlify usage/billing.");
          }
          throw new Error("Relay could not reach an available AI provider. Please retry in a moment.");
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
