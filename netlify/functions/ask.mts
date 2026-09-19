import { envGet } from "../../relay-runtime/env.mts";

function classify(text: string) {
  const q = text.toLowerCase();
  if (/\b(code|coding|coder|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(q)) return "coding";
  if (/\b(workflow|workflows|automate|automation|schedule|monitor|alert|pipeline|github actions|actions)\b/.test(q)) return "automation";
  if (/\b(research|find|discover|latest|source|cite|news|security|privacy|market)\b/.test(q)) return "research";
  if (/\b(compare|comparison|versus|vs\.?|analyse|analyze|reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(q)) return "reasoning";
  if (/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(q)) return "design";
  return "general";
}

const FREE_MODELS = Object.freeze({
  coding: "deepseek/deepseek-v4-flash-0731:free",
  automation: "qwen/qwen3.8-27b:free",
  reasoning: "qwen/qwen3.8-27b:free",
  general: "deepseek/deepseek-v4-flash-0731:free",
  researchFallback: "nvidia/nemotron-3-ultra-550b-a55b:free",
  universalFallback: "openrouter/free",
});

function workerFor(taskType: string, question: string) {
  // Route by job, not by whichever credential happens to be available.
  // Gemini stays specialized for research/design instead of becoming the universal fallback.
  if (taskType === "coding") return FREE_MODELS.coding;
  if (taskType === "automation") return FREE_MODELS.automation;
  if (taskType === "reasoning") return FREE_MODELS.reasoning;
  if (taskType === "research" || taskType === "design") return "gemini-3.5-flash-lite";
  return FREE_MODELS.general;
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
    "openai/gpt-5.6-luna",
    "openai/gpt-5.6-sol",
    "claude-haiku-4-5",
    "anthropic/claude-haiku-4.5",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "deepseek/deepseek-v4-flash",
    "deepseek/deepseek-v4-flash-0731:free",
    "qwen/qwen3.8-flash",
    "qwen/qwen3.8-27b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openrouter/free",
    "x-ai/grok-4.6",
  ]).has(model);
}

function reviewerFor(worker: string) {
  const family = modelFamily(worker);
  if (family === "qwen") return FREE_MODELS.coding;
  if (family === "deepseek") return FREE_MODELS.automation;
  if (family === "gemini") return FREE_MODELS.coding;
  return FREE_MODELS.reasoning;
}

const OPENROUTER_ALIASES: Record<string, string> = {
  "gpt-5.6-luna": "openai/gpt-5.6-luna",
  "gpt-5.6-sol": "openai/gpt-5.6-sol",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
};

function providerForModel(model: string) {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.includes("/")) return "openrouter";
  return "openai";
}

function modelFamily(model: string) {
  const m = String(model || "").toLowerCase();
  if (m.includes("gemini") || m.includes("google")) return "gemini";
  if (m.includes("claude") || m.includes("anthropic")) return "claude";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("qwen") || m.includes("alibaba")) return "qwen";
  if (m.includes("grok") || m.includes("x-ai")) return "grok";
  if (m.includes("gpt") || m.includes("openai")) return "openai";
  return "other";
}

function modelConfigured(model: string) {
  const provider = providerForModel(model);
  if (provider === "anthropic") return Boolean(envGet("ANTHROPIC_API_KEY"));
  if (provider === "gemini") return Boolean(envGet("GEMINI_API_KEY"));
  if (provider === "openrouter") return Boolean(envGet("OPENROUTER_API_KEY"));
  return Boolean(envGet("OPENAI_API_KEY"));
}

function firstConfiguredModel(models: string[]) {
  return models.find((model) => modelConfigured(model)) || "";
}

function runtimeVariant(model: string) {
  if (modelConfigured(model)) return model;
  const openRouterAlias = OPENROUTER_ALIASES[model] || "";
  if (openRouterAlias && modelConfigured(openRouterAlias)) return openRouterAlias;
  return "";
}

function resolveWorkerModel(requested: string) {
  const requestedRuntime = runtimeVariant(requested);
  if (requestedRuntime) return requestedRuntime;
  return firstConfiguredModel([
    FREE_MODELS.general,
    FREE_MODELS.reasoning,
    FREE_MODELS.researchFallback,
    "gemini-3.5-flash-lite",
    FREE_MODELS.universalFallback,
  ]) || requested;
}

function resolveReviewerModel(worker: string) {
  const workerFamily = modelFamily(worker);
  const candidates = [
    runtimeVariant(reviewerFor(worker)),
    FREE_MODELS.reasoning,
    FREE_MODELS.coding,
    FREE_MODELS.researchFallback,
    "gemini-3.5-flash-lite",
    FREE_MODELS.universalFallback,
  ].filter(Boolean);
  return candidates.find((model) =>
    modelConfigured(model) && modelFamily(model) !== workerFamily
  ) || "";
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

const ACTIVE_WORKFLOW_REPOS = [
  "rntlgopinath57/safeqr",
  "rntlgopinath57/gopi_alerts",
  "rntlgopinath57/OmniRoute",
];

function workflowInventoryIntent(text: string) {
  const q = String(text || "").toLowerCase();
  return (
    /\b(list|show|check|review|summari[sz]e|what(?:'s| is| are)?)\b[\s\S]{0,60}\b(workflows?|github actions?|automations?)\b/.test(q)
    || /\b(my|all)\b[\s\S]{0,35}\b(workflows?|github actions?)\b/.test(q)
    || /\b(workflows?|github actions?)\b[\s\S]{0,35}\b(my|all)\b/.test(q)
  );
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
  if (workflowInventoryIntent(text)) {
    for (const repo of ACTIVE_WORKFLOW_REPOS) found.add(repo);
  }
  const explicit = text.match(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/g) || [];
  for (const repo of explicit) found.add(repo);
  for (const [pattern, repo] of REPO_ALIASES) {
    if (pattern.test(text)) found.add(repo);
  }
  return [...found].slice(0, 6);
}

async function githubRepoContext(text: string) {
  const repos = mentionedRepos(text);
  if (!repos.length) return { context: "", repos: [], inaccessible: [] as string[] };

  const token = envGet("RELAY_GITHUB_TOKEN") || envGet("GITHUB_TOKEN") || "";
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

      let workflowFiles = "";
      if (workflowInventoryIntent(text)) {
        try {
          const workflowResponse = await fetchWithTimeout(
            `https://api.github.com/repos/${repo}/contents/.github/workflows?ref=${encodeURIComponent(meta?.default_branch || "main")}`,
            { headers },
            5000,
          );
          if (workflowResponse.ok) {
            const items = await workflowResponse.json();
            if (Array.isArray(items)) {
              workflowFiles = items
                .filter((item: any) => item?.type === "file")
                .map((item: any) => item?.name || "")
                .filter(Boolean)
                .sort()
                .join(", ");
            }
          }
        } catch {}
      }

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
        workflowInventoryIntent(text)
          ? (workflowFiles ? `GitHub workflows: ${workflowFiles}` : "GitHub workflows: none found or workflow directory unavailable")
          : "",
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


type PresentationIntent = {
  format: string;
  visual: boolean;
  explicit: boolean;
  label: string;
};

const PRESENTATION_PATTERNS: Array<{
  format: string;
  label: string;
  visual: boolean;
  patterns: RegExp[];
}> = [
  { format: "handwritten", label: "HANDWRITTEN", visual: true, patterns: [/\/handwritten\b/i,/\bhand[- ]?written\b/i,/\bnotebook[- ]style\b/i] },
  { format: "cheatsheet", label: "CHEATSHEET", visual: true, patterns: [/\/cheatsheet\b/i,/\bcheat\s*sheet\b/i] },
  { format: "blueprint", label: "BLUEPRINT", visual: true, patterns: [/\/blueprint\b/i,/\bblueprint\b/i] },
  { format: "flashcards", label: "FLASHCARDS", visual: true, patterns: [/\/flashcards?\b/i,/\bflash\s*cards?\b/i] },
  { format: "mindmap", label: "MIND MAP", visual: true, patterns: [/\/mindmap\b/i,/\bmind\s*map\b/i] },
  { format: "exploded", label: "EXPLODED VIEW", visual: true, patterns: [/\/exploded\b/i,/\bexploded\s+view\b/i] },
  { format: "flowchart", label: "FLOWCHART", visual: true, patterns: [/\/flowchart\b/i,/\bflow\s*chart\b/i] },
  { format: "timeline", label: "TIMELINE", visual: true, patterns: [/\/timeline\b/i,/\btimeline\b/i] },
  { format: "roadmap", label: "ROADMAP", visual: true, patterns: [/\/roadmap\b/i,/\broad\s*map\b/i] },
  { format: "framework", label: "FRAMEWORK", visual: true, patterns: [/\/framework\b/i,/\bframework\b/i] },
  { format: "comparison", label: "COMPARISON", visual: true, patterns: [/\/comparison\b/i,/\bcomparison\b/i,/\bcompare\b/i,/\bversus\b/i,/\bvs\.?\b/i] },
  { format: "before_after", label: "BEFORE / AFTER", visual: true, patterns: [/\/before[-_ ]?after\b/i,/\bbefore\s*(?:\/|and|&|vs)\s*after\b/i] },
  { format: "hierarchy", label: "PYRAMID / HIERARCHY", visual: true, patterns: [/\/pyramid\b/i,/\/hierarchy\b/i,/\bpyramid\b/i,/\bhierarchy\b/i] },
  { format: "matrix", label: "MATRIX", visual: true, patterns: [/\/matrix\b/i,/\bmatrix\b/i] },
  { format: "cycle", label: "CYCLE", visual: true, patterns: [/\/cycle\b/i,/\bcycle\b/i] },
  { format: "sticky", label: "STICKY NOTES", visual: true, patterns: [/\/sticky(?:[-_ ]?notes?)?\b/i,/\bsticky\s+notes?\b/i] },
  { format: "infographic", label: "INFOGRAPHIC", visual: true, patterns: [/\/infographic\b/i,/\binfographic\b/i] },
  { format: "whiteboard", label: "WHITEBOARD", visual: true, patterns: [/\/whiteboard\b/i,/\bwhite\s*board\b/i] },
  { format: "sketchnote", label: "SKETCHNOTE", visual: true, patterns: [/\/sketchnote\b/i,/\bsketch\s*note\b/i] },
  { format: "notion", label: "NOTION", visual: true, patterns: [/\/notion\b/i,/\bnotion[- ]style\b/i] },
  { format: "goodnotes", label: "GOODNOTES", visual: true, patterns: [/\/goodnotes\b/i,/\bgood\s*notes\b/i,/\bgoodnotes[- ]style\b/i] },
];

function detectPresentationIntent(text: string): PresentationIntent {
  const q = text.trim();
  for (const item of PRESENTATION_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(q))) {
      return { format: item.format, visual: item.visual, explicit: true, label: item.label };
    }
  }

  const lower = q.toLowerCase();
  if (/\b(study|revision|learning)\b.*\bnotes?\b|\bnotes?\b.*\bweek(?:ly)?\b/.test(lower)) {
    return { format: "goodnotes", visual: true, explicit: false, label: "GOODNOTES" };
  }
  if (/\barchitecture|system design|components?|layers?|topology\b/.test(lower)) {
    return { format: "blueprint", visual: true, explicit: false, label: "BLUEPRINT" };
  }
  const workflowInventory = /\b(list|show|find|count|inventory|files?)\b.*\b(?:github\s+)?workflows?\b|\b(?:github\s+)?workflows?\b.*\b(list|show|find|count|inventory|files?)\b/.test(lower);
  if (!workflowInventory && /\bprocess|workflow|how .* works|steps?\b/.test(lower)) {
    return { format: "flowchart", visual: true, explicit: false, label: "FLOWCHART" };
  }
  if (/\bweek[- ]by[- ]week|month[- ]by[- ]month|milestones?|implementation plan\b/.test(lower)) {
    return { format: "roadmap", visual: true, explicit: false, label: "ROADMAP" };
  }

  return { format: "default", visual: false, explicit: false, label: "STANDARD" };
}

function presentationInstruction(presentation: PresentationIntent) {
  if (!presentation || presentation.format === "default") return "";

  const shared =
    " PRESENTATION CONTRACT: The requested presentation format is " + presentation.label +
    ". Treat this as a mandatory deliverable requirement, not a suggestion. " +
    "Write concise, structured content that Relay can render visually. Do not replace a requested visual format with ASCII art, generic prose, or a code block.";

  const specific: Record<string,string> = {
    handwritten: " Use a clear notebook title, then short handwritten-note sections. If the request is week-by-week, create a distinct WEEK heading for every week with compact goals, concepts, practice, and checkboxes.",
    goodnotes: " Structure this like polished study notes with clear headings, callouts, concise bullets, and revision-friendly chunks.",
    sketchnote: " Use short labels, arrows/relationships described in compact phrases, and memorable callouts.",
    cheatsheet: " Be dense and scan-friendly: headings, short definitions, commands/formulas, do/don't points, and quick examples.",
    blueprint: " Organize into layers/components, responsibilities, interfaces, data flow, dependencies, and risks.",
    flashcards: " Produce repeated QUESTION / ANSWER pairs, one concept per card.",
    mindmap: " Start with one central topic, then branches and sub-branches using concise labels.",
    exploded: " Break the subject into parts, what each part does, inputs/outputs, and how parts connect.",
    flowchart: " Use ordered steps with clear decisions and transitions. Keep each step short enough to render as a node. Do not output Mermaid/Graphviz source, node IDs such as A/B/C, arrows such as A --> B, or code fences; Relay renders the flow visually itself.",
    timeline: " Use dated or ordered milestones with a short event/outcome for each.",
    roadmap: " Use phases or time periods, with objective, actions, and exit criteria for each.",
    framework: " Use named pillars/components with purpose, inputs, outputs, and relationships.",
    comparison: " Use the same criteria on both sides. Prefer a compact comparison matrix followed by a concise conclusion.",
    before_after: " Separate BEFORE and AFTER clearly, then list the changes and impact.",
    hierarchy: " Organize from top-level to lower levels with concise parent/child labels.",
    matrix: " Define axes/criteria clearly and place each option consistently against them.",
    cycle: " Use numbered repeating stages and state what feeds the next stage.",
    sticky: " Use several short, self-contained idea blocks; one idea/action per note.",
    infographic: " Use a strong title, 3-7 visual sections, key numbers/callouts, and minimal prose.",
    whiteboard: " Use short boxes, arrows/relationships, decisions, and action notes rather than long paragraphs.",
    notion: " Use clean document sections, toggles/checklists style content, and concise callouts."
  };

  return shared + (specific[presentation.format] || "");
}


function presentationLooksStructured(answer: string, presentation: PresentationIntent, question: string) {
  if (!presentation || presentation.format === "default") return true;
  const text = String(answer || "").trim();
  if (text.length < 220) return false;

  const q = question.toLowerCase();
  const lower = text.toLowerCase();

  if (presentation.format === "handwritten" || presentation.format === "goodnotes") {
    if (/\bweek(?:ly)?\b/.test(q)) {
      return /\bweek\s*1\b/.test(lower) && (/\bweek\s*2\b/.test(lower) || text.length > 700);
    }
    return /\n/.test(text);
  }
  if (presentation.format === "comparison" || presentation.format === "matrix") {
    return /\b(vs\.?|versus|compare|comparison|criteria)\b/i.test(text) || /\|/.test(text);
  }
  if (presentation.format === "flowchart" || presentation.format === "roadmap" || presentation.format === "timeline") {
    if (presentation.format === "flowchart" && /(?:^|\n)\s*(?:flowchart|graph)\s+(?:TD|LR|TB|RL)\b|\b[A-Za-z0-9_]+--?>[A-Za-z0-9_]+|\b[A-Za-z0-9_]+\s*\[["'][^\n]+|[│▼▲├└┬┴┼─]{2,}|[-=]{2,}>/i.test(text)) {
      return false;
    }
    const numberedStages = text.match(/(?:^|\n)\s*\d+[.)]\s+/gm) || [];
    return /\b(step|phase|week|stage|milestone|then|next)\b/i.test(text)
      || numberedStages.length >= 3
      || (/\bdecision\s*:/i.test(text) && numberedStages.length >= 2);
  }
  return true;
}

function isLongFormPresentation(question: string, presentation: PresentationIntent) {
  const q = question.toLowerCase();
  return Boolean(
    presentation?.visual ||
    /\b(week[- ]?by[- ]?week|weekly plan|study plan|roadmap|timeline|comprehensive|detailed|deep)\b/.test(q)
  );
}

function useFastPath(question: string, taskType: string, presentation: PresentationIntent) {
  const q = question.toLowerCase();
  if (presentation?.explicit && presentation.format !== "default") return false;
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
  const baseUrl = envGet("OPENAI_BASE_URL") || "https://api.openai.com";
  const apiKey = envGet("OPENAI_API_KEY");
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
  const baseUrl = envGet("ANTHROPIC_BASE_URL") || "https://api.anthropic.com";
  const apiKey = envGet("ANTHROPIC_API_KEY");
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
  const baseUrl = envGet("GOOGLE_GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com";
  const apiKey = envGet("GEMINI_API_KEY");
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
  const baseUrl = envGet("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1";
  const apiKey = envGet("OPENROUTER_API_KEY");
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
  let previousPresentation = "";
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    preferredModel = typeof body?.preferredModel === "string" ? body.preferredModel.trim() : "";
    previousTaskType = typeof body?.previousTaskType === "string" ? body.previousTaskType.trim() : "";
    previousPresentation = typeof body?.previousPresentation === "string" ? body.previousPresentation.trim() : "";
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

      const callModelWithProgress = async (
        model: string,
        messages: ChatMessage[],
        maxTokens: number,
        timeoutMs: number,
        phase = "generating",
      ) => {
        const started = Date.now();
        const heartbeat = setInterval(() => {
          emit({
            type: "progress",
            phase,
            model,
            elapsedMs: Date.now() - started,
          });
        }, 4000);
        try {
          return await callModel(model, messages, maxTokens, timeoutMs);
        } finally {
          clearInterval(heartbeat);
        }
      };

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
        let presentation = detectPresentationIntent(question);
        if (followUp && presentation.format === "default" && previousPresentation) {
          const stickyPresentation = PRESENTATION_PATTERNS.find((item) => item.format === previousPresentation);
          if (stickyPresentation) {
            presentation = {
              format: stickyPresentation.format,
              visual: stickyPresentation.visual,
              explicit: false,
              label: stickyPresentation.label,
            };
          }
        }
        const stickyModel = followUp && allowedStickyModel(preferredModel)
          ? preferredModel
          : "";
        const routedWorkerModel = workerFor(taskType, contextualQuestion);
        const requestedWorkerModel = stickyModel || routedWorkerModel;
        const workerModel = resolveWorkerModel(requestedWorkerModel);

        emit({ type: "planner", taskType, presentation });
        await new Promise((resolve) => setTimeout(resolve, 180));
        if (presentation.format !== "default") {
          emit({ type: "presentation", presentation });
        }
        emit({ type: "worker", taskType, model: workerModel, presentation });

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
              + presentationInstruction(presentation)
              + (repoLookup.context
                ? " LIVE GITHUB EVIDENCE follows. Use it as current repository evidence and do not claim you cannot access these repositories. If the user asks for workflows, list the workflow files from this evidence directly and group them by repository:\n\n" + repoLookup.context
                : repoLookup.inaccessible.length
                  ? " NOTE: The requested repository appears private or unavailable to Relay's live GitHub reader. Say that clearly; do not pretend it was inspected."
                  : ""),
          },
          ...history,
          { role: "user", content: question },
        ];

        let answer = "";
        const longForm = isLongFormPresentation(question, presentation);
        const primaryModel = actualWorkerModel;
        const candidates = longForm
          ? Array.from(new Set([
              primaryModel,
              FREE_MODELS.researchFallback,
              FREE_MODELS.coding,
              FREE_MODELS.reasoning,
              "gemini-3.5-flash-lite",
              FREE_MODELS.universalFallback,
            ]))
          : Array.from(new Set([
              primaryModel,
              FREE_MODELS.coding,
              FREE_MODELS.reasoning,
              FREE_MODELS.researchFallback,
              "gemini-3.5-flash-lite",
              FREE_MODELS.universalFallback,
            ]));
        const configuredCandidates = candidates.filter((model) => modelConfigured(model));
        let pool = (configuredCandidates.length ? configuredCandidates : candidates)
          .filter((model, index) => index === 0 || providerAvailable(model));
        if (!pool.length) pool = configuredCandidates.length ? configuredCandidates : candidates;

        const failures: string[] = [];
        let rateLimited = 0;
        let creditLimited = 0;
        let timedOut = 0;

        for (let index = 0; index < pool.length; index++) {
          const model = pool[index];
          if (index > 0) emit({ type: "fallback", model });

          const maxTokens = longForm
            ? (model.startsWith("gpt-") ? 2000 : 1700)
            : (model.startsWith("gpt-") ? 1200 : 1000);
          const timeoutMs = longForm
            ? (index === 0 ? 16000 : index === 1 ? 12000 : 8000)
            : (index === 0 ? 10000 : 7000);

          try {
            answer = await callModelWithProgress(
              model,
              workerMessages,
              maxTokens,
              timeoutMs,
              "drafting",
            );
            actualWorkerModel = model;
            markProviderHealthy(model);
            emit({ type: "worker_selected", model: actualWorkerModel });
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${model}: ${message}`);
            console.warn("Relay provider attempt failed", { model, error: message });

            if (/abort|timeout|timed out/i.test(message)) {
              timedOut += 1;
              coolDownProvider(model, 20000);
              continue;
            }
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

        if (!answer && longForm && timedOut > 0) {
          const rescueModel = firstConfiguredModel([
            FREE_MODELS.coding,
            FREE_MODELS.reasoning,
            FREE_MODELS.researchFallback,
            "gemini-3.5-flash-lite",
            FREE_MODELS.universalFallback,
          ]);
          if (rescueModel) emit({ type: "fallback", model: rescueModel, reason: "compact_rescue" });
          try {
            if (!rescueModel) throw new Error("No configured rescue provider.");
            const rescueMessages = [
              {
                role: "system",
                content:
                  "Return a compact but complete version now. Preserve every requested section and presentation structure. Use short bullets and headings so the answer fits quickly.",
              },
              ...workerMessages,
            ];
            answer = await callModelWithProgress(rescueModel, rescueMessages, 900, 8000, "rescue");
            actualWorkerModel = rescueModel;
            markProviderHealthy(rescueModel);
            emit({ type: "worker_selected", model: actualWorkerModel });
          } catch (rescueError) {
            const message = rescueError instanceof Error ? rescueError.message : String(rescueError);
            failures.push(`${rescueModel} rescue: ${message}`);
          }
        }

        if (!answer) {
          console.error("All Relay providers failed", { failures });
          if (rateLimited > 0 && rateLimited + timedOut >= pool.length) {
            throw new Error("Relay's AI gateway is temporarily saturated. It will recover shortly; retry this prompt in about a minute.");
          }
          if (creditLimited > 0 && creditLimited + timedOut >= pool.length) {
            throw new Error("Relay's configured AI provider credits or quota are unavailable. Check the active provider account.");
          }
          if (timedOut > 0) {
            throw new Error("Relay's providers timed out while generating this longer response. Retry once; Relay will use the compact rescue path.");
          }
          throw new Error("Relay could not reach an available AI provider. Please retry in a moment.");
        }

        const actualReviewerModel = resolveReviewerModel(actualWorkerModel);

        if (presentation.visual) {
          emit({ type: "render", presentation });
          await sleep(220);
        }

        let review = "";
        let reviewStatus: "PASS" | "FAIL" | "SKIPPED" | "FAST_PATH" = "SKIPPED";

        if (presentation.format !== "default") {
          emit({ type: "reviewer", model: "local-format-validator" });
          const formatValid = presentationLooksStructured(answer, presentation, question);
          reviewStatus = formatValid ? "PASS" : "FAIL";
          if (!formatValid) {
            review = "FAIL\nReturn the requested visual format as concise structured content. Do not emit Mermaid/Graphviz source or raw diagram code.";
            emit({ type: "review_failed", reason: "format_structure_incomplete" });
          }
        } else if (useFastPath(question, taskType, presentation)) {
          reviewStatus = "FAST_PATH";
          emit({ type: "fast_path", reason: "simple_or_low_risk" });
        } else if (!actualReviewerModel) {
          reviewStatus = "SKIPPED";
          emit({ type: "review_skipped", reason: "no_independent_provider" });
        } else {
          emit({ type: "reviewer", model: actualReviewerModel });
          try {
          review = await callModel(
            actualReviewerModel,
            [
              {
                role: "system",
                content:
                  "You are an independent reviewer. Evaluate relevance, correctness, completeness, unsupported claims, and presentation-format compliance. The required presentation format is " + presentation.label + ". A requested visual format must not be replaced by ASCII art, generic prose, or a code block. First line must be PASS or FAIL. If FAIL, add one concise correction instruction on the next line.",
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
                    "Revise the answer using the review feedback. Preserve prior conversation context. Return only the improved final answer. Keep it direct and useful."
                    + presentationInstruction(presentation)
                    + (presentation.format === "flowchart"
                      ? " Do not use ASCII diagram characters, box drawing, Mermaid, Graphviz, node IDs, or arrow syntax. Use numbered steps and short decision bullets only."
                      : ""),
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

          if (presentation.format !== "default" && reviewStatus !== "SKIPPED") {
            reviewStatus = presentationLooksStructured(answer, presentation, question) ? "PASS" : "FAIL";
          }
        }

        emit({
          type: "done",
          answer,
          review: reviewStatus,
          model: actualWorkerModel,
          reviewer: actualReviewerModel,
          taskType,
          presentation,
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
