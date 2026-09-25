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

function workflowIntent(text: string) {
  const q = String(text || "").toLowerCase().replace(/\bwork\s+flows?\b/g, "workflows");
  return /\b(workflows?|github actions?|automations?)\b/.test(q)
    && /\b(show|list|check|status|statuses|review|find|count|inventory|all|my)\b/.test(q);
}

async function workflowRepoEvidence(repo: string, token: string) {
  const meta = await githubJson(`https://api.github.com/repos/${repo}`, token);
  const branch = String(meta?.default_branch || "main");
  const [filesResult, runsResult] = await Promise.allSettled([
    githubJson(`https://api.github.com/repos/${repo}/contents/.github/workflows?ref=${encodeURIComponent(branch)}`, token),
    githubJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=8`, token),
  ]);
  const workflowFiles = filesResult.status === "fulfilled" && Array.isArray(filesResult.value)
    ? filesResult.value.filter((item: any) => item?.type === "file").map((item: any) => String(item?.name || "")).filter(Boolean).sort()
    : [];
  const runsRaw = runsResult.status === "fulfilled" && Array.isArray(runsResult.value?.workflow_runs)
    ? runsResult.value.workflow_runs.slice(0, 8)
    : [];
  const runs = runsRaw.map((run: any) => ({
    name: String(run?.name || "workflow"),
    state: String(run?.status === "completed" ? (run?.conclusion || "completed") : (run?.status || "unknown")),
    branch: String(run?.head_branch || ""),
    event: String(run?.event || ""),
    updated_at: String(run?.updated_at || ""),
    run_id: Number(run?.id || 0),
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

export default async function nandiHandler(request: Request) {
  if (request.method !== "POST") return ndjson([{ type: "error", message: "Method not allowed" }], 405);
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return ndjson([{ type: "error", message: "Invalid JSON body" }], 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return ndjson([{ type: "error", message: "Question is required" }], 400);

  if (workflowIntent(question)) {
    try {
      const evidence = await checkActiveWorkflows();
      const lines = evidence.repos.map((repo: any) => {
        const files = repo.workflow_files.length ? repo.workflow_files.join(", ") : "no workflow files found";
        const runs = repo.runs.length
          ? repo.runs.map((run: any) => `${run.name}: ${run.state}`).join("; ")
          : "no recent runs";
        return `${repo.repository} — files: ${files}. Recent: ${runs}.`;
      });
      const answer = `Live workflow status across ${evidence.repos.length} repositories. ${lines.join(" ")}`;
      return ndjson([
        { type: "agent", agent: "nandi", runtime: "fast-workflow-bridge-v1" },
        { type: "tool", tool: "github", status: "complete", evidence: "github-live", liveWorkflowRuns: evidence.runCount > 0, runCount: evidence.runCount, repos: evidence.repos, failed: evidence.failed },
        { type: "done", answer, review: "PASS", taskType: "workflow_inventory", model: "", fastPath: true },
      ]);
    } catch (error: any) {
      return ndjson([
        { type: "tool", tool: "github", status: "failed", evidence: "github-live" },
        { type: "error", message: `FAIL: UNVERIFIED — ${String(error?.message || error)}` },
      ], 502);
    }
  }

  if (/\bgopi\s+alerts\b/i.test(question)) {
    try {
      const evidence = await checkGopiAlerts();
      const answer =
        `Gopi Alerts is verified. Repository: ${evidence.repository}. Default branch: ${evidence.default_branch}. ` +
        `Latest commit SHA: ${evidence.latest_commit}. Commit time: ${evidence.commit_time}. Status: PASS.`;
      return ndjson([
        { type: "agent", agent: "nandi", runtime: "verified-skill-bridge-v1" },
        { type: "tool", tool: "nandi-repo-check", status: "complete", evidence: "github-live", ...evidence },
        { type: "done", answer, review: "PASS", taskType: "repo_check" },
      ]);
    } catch (error: any) {
      return ndjson([
        { type: "tool", tool: "nandi-repo-check", status: "failed", evidence: "github-live" },
        { type: "error", message: `FAIL: UNVERIFIED — ${String(error?.message || error)}` },
      ], 502);
    }
  }

  const relayRequest = new Request(new URL("/api/ask", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: Array.isArray(body.history) ? body.history : [] }),
  });
  return askHandler(relayRequest);
}
