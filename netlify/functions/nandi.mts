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

export default async function nandiHandler(request: Request) {
  if (request.method !== "POST") return ndjson([{ type: "error", message: "Method not allowed" }], 405);
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return ndjson([{ type: "error", message: "Invalid JSON body" }], 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return ndjson([{ type: "error", message: "Question is required" }], 400);

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
