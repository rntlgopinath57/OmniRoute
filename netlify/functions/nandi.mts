import askHandler from "./ask.mts";
import { envGet } from "../../relay-runtime/env.mts";

type Body = { question?: unknown; history?: unknown };

function ndjson(events: unknown[], status = 200) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    status,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Nandi-Runtime": "verified-skill-bridge-v1",
    },
  });
}

async function githubJson(url: string, token: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "nandi-runtime",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return await r.json() as any;
}

async function checkGopiAlerts() {
  const repo = "rntlgopinath57/gopi_alerts";
  const token = envGet("RELAY_GITHUB_TOKEN") || envGet("GITHUB_TOKEN");
  const meta = await githubJson(`https://api.github.com/repos/${repo}`, token);
  const branch = String(meta?.default_branch || "");
  if (!branch) throw new Error("default branch missing");
  const commit = await githubJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, token);
  const sha = String(commit?.sha || "");
  const time = String(commit?.commit?.committer?.date || "");
  if (!sha || !time) throw new Error("latest commit evidence incomplete");
  return { repository: repo, default_branch: branch, latest_commit: sha, commit_time: time, status: "PASS" as const };
}

const ACTIVE_WORKFLOW_REPOS = [
  "rntlgopinath57/safeqr",
  "rntlgopinath57/gopi_alerts",
  "rntlgopinath57/OmniRoute",
];

function normalizeCommand(text: string) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let prev = rows[0];
    rows[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const old = rows[i];
      rows[i] = Math.min(rows[i] + 1, rows[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return rows[a.length];
}

function commandQuality(text: string) {
  const normalized = normalizeCommand(text);
  if (!normalized) return { valid: false, reason: "no_meaningful_text" };
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 && !/^(stop|cancel|yes|no)$/.test(normalized)) {
    return { valid: false, reason: "too_little_information" };
  }
  return { valid: true, reason: "" };
}

function gopiAlertsIntent(text: string) {
  const tokens = normalizeCommand(text).split(/\s+/).filter(Boolean);
  const hasAlerts = tokens.some((token) => token === "alert" || token === "alerts");
  const hasGopiLike = tokens.some((token) => editDistance(token, "gopi") <= 2);
  return hasAlerts && hasGopiLike;
}

function workflowIntent(text: string) {
  const q = normalizeCommand(text).replace(/\bwork\s+flows?\b/g, "workflows");
  return /\b(workflows?|github actions?|automations?)\b/.test(q)
    && /\b(show|list|check|status|statuses|review|find|count|inventory|all|my)\b/.test(q);
}

function doneEvent(displayResponse: string, spokenResponse: string, extra: Record<string, unknown> = {}) {
  return {
    type: "done",
    display_response: String(displayResponse || "").trim(),
    spoken_response: String(spokenResponse || "").trim().slice(0, 300),
    ...extra,
  };
}

function conciseSpoken(text: string) {
  const plain = String(text || "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[*_#>|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "I have the result on screen.";
  const firstSentence = plain.match(/^.{1,240}?[.!?](?:\s|$)/)?.[0]?.trim();
  return (firstSentence || plain.slice(0, 240)).trim();
}

async function workflowRepoEvidence(repo: string, token: string) {
  const meta = await githubJson(`https://api.github.com/repos/${repo}`, token);
  const branch = String(meta?.default_branch || "main");
  const [filesResult, runsResult] = await Promise.allSettled([
    githubJson(`https://api.github.com/repos/${repo}/contents/.github/workflows?ref=${encodeURIComponent(branch)}`, token),
    githubJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=5`, token),
  ]);
  const workflowFiles = filesResult.status === "fulfilled" && Array.isArray(filesResult.value)
    ? filesResult.value.filter((item: any) => item?.type === "file").map((item: any) => String(item?.name || "")).filter(Boolean).sort()
    : [];
  const runsRaw = runsResult.status === "fulfilled" && Array.isArray(runsResult.value?.workflow_runs)
    ? runsResult.value.workflow_runs.slice(0, 5)
    : [];
  const runs = runsRaw.map((run: any) => ({
    name: String(run?.name || "workflow"),
    state: String(run?.status === "completed" ? (run?.conclusion || "completed") : (run?.status || "unknown")),
    updated_at: String(run?.updated_at || ""),
  }));
  return { repository: repo, default_branch: branch, workflow_files: workflowFiles, runs };
}

async function checkActiveWorkflows() {
  const token = envGet("RELAY_GITHUB_TOKEN") || envGet("GITHUB_TOKEN");
  const settled = await Promise.allSettled(ACTIVE_WORKFLOW_REPOS.map((repo) => workflowRepoEvidence(repo, token)));
  const repos = settled.filter((item): item is PromiseFulfilledResult<any> => item.status === "fulfilled").map((item) => item.value);
  const failed = settled.flatMap((item, index) => item.status === "rejected" ? [ACTIVE_WORKFLOW_REPOS[index]] : []);
  const runCount = repos.reduce((sum, repo) => sum + repo.runs.length, 0);
  if (!repos.length) throw new Error("workflow evidence unavailable");
  return { repos, failed, runCount };
}

async function relayWithContract(request: Request, question: string, history: unknown[]) {
  const relayRequest = new Request(new URL("/api/ask", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  const relayResponse = await askHandler(relayRequest);
  const raw = await relayResponse.text();
  const events = raw.split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const errorEvent = events.find((event: any) => event?.type === "error");
  if (errorEvent) {
    return ndjson([...events.filter((event: any) => event?.type !== "done" && event?.type !== "error"), errorEvent], relayResponse.status || 502);
  }
  const finalEvent = [...events].reverse().find((event: any) => event?.type === "done");
  const display = String(finalEvent?.answer || "").trim();
  if (!display) {
    return ndjson([{ type: "error", message: "Nandi did not receive a usable answer." }], 502);
  }
  const passthrough = events.filter((event: any) => event?.type !== "done" && event?.type !== "error");
  return ndjson([
    ...passthrough,
    doneEvent(display, conciseSpoken(display), {
      review: finalEvent?.review || "SKIPPED",
      taskType: finalEvent?.taskType || "general",
      model: finalEvent?.model || "",
    }),
  ]);
}

export default async function nandiHandler(request: Request) {
  if (request.method !== "POST") return ndjson([{ type: "error", message: "Method not allowed" }], 405);
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return ndjson([{ type: "error", message: "Invalid JSON body" }], 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return ndjson([{ type: "error", message: "Question is required" }], 400);
  const quality = commandQuality(question);
  if (!quality.valid) {
    return ndjson([{ type: "ignored", reason: quality.reason }]);
  }

  if (gopiAlertsIntent(question)) {
    try {
      const evidence = await checkGopiAlerts();
      const answer =
        `Gopi Alerts is verified. Repository: ${evidence.repository}. Default branch: ${evidence.default_branch}. ` +
        `Latest commit SHA: ${evidence.latest_commit}. Commit time: ${evidence.commit_time}. Status: PASS.`;
      return ndjson([
        { type: "agent", agent: "nandi", runtime: "verified-skill-bridge-v1" },
        { type: "tool", tool: "nandi-repo-check", status: "complete", evidence: "github-live", ...evidence },
        doneEvent(answer, "Gopi Alerts is verified. Status pass.", { review: "PASS", taskType: "repo_check" }),
      ]);
    } catch (error: any) {
      return ndjson([
        { type: "tool", tool: "nandi-repo-check", status: "failed", evidence: "github-live" },
        { type: "error", message: `FAIL: UNVERIFIED — ${String(error?.message || error)}` },
      ], 502);
    }
  }

  if (workflowIntent(question)) {
    try {
      const evidence = await checkActiveWorkflows();
      const lines = evidence.repos.map((repo: any) => {
        const recent = repo.runs.length
          ? repo.runs.map((run: any) => `${run.name}: ${run.state}`).join("; ")
          : "no recent runs";
        return `${repo.repository} — ${recent}.`;
      });
      const answer = `Live workflow status. ${lines.join(" ")}`;
      return ndjson([
        { type: "agent", agent: "nandi", runtime: "fast-workflow-bridge-v1" },
        { type: "tool", tool: "github", status: "complete", evidence: "github-live", liveWorkflowRuns: evidence.runCount > 0, runCount: evidence.runCount, repos: evidence.repos, failed: evidence.failed },
        doneEvent(
          answer,
          evidence.runCount
            ? `I checked ${evidence.runCount} recent workflow runs. Full details are on screen.`
            : "I checked the workflows. Full details are on screen.",
          { review: "PASS", taskType: "workflow_inventory", fastPath: true },
        ),
      ]);
    } catch (error: any) {
      return ndjson([
        { type: "tool", tool: "github", status: "failed", evidence: "github-live" },
        { type: "error", message: `FAIL: UNVERIFIED — ${String(error?.message || error)}` },
      ], 502);
    }
  }

  return relayWithContract(request, question, Array.isArray(body.history) ? body.history : []);
}
