import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, cli, function_tool, text_transforms
from livekit.plugins import groq, silero

logger = logging.getLogger("nandi-livekit")

GITHUB_REPOS = (
    "rntlgopinath57/safeqr",
    "rntlgopinath57/gopi_alerts",
    "rntlgopinath57/OmniRoute",
)


HUMAN_RESPONSE_POLICY = (
    "Speak like a capable personal assistant, not a terminal, dashboard, or raw API. "
    "Always translate technical evidence into plain human meaning before answering. "
    "Lead with the conclusion, then give only the context that helps Gopinath decide or act. "
    "Do not recite GitHub owner paths, slash-separated repository identifiers, commit hashes, URLs, "
    "JSON, IDs, branch names, workflow filenames, file extensions, markdown syntax, or raw tool payloads "
    "unless the user explicitly asks for that exact technical detail. "
    "When discussing repositories, use friendly project names and explain what each is for. "
    "When discussing workflows, use friendly workflow names and explain health or purpose, not YAML filenames. "
    "When discussing alerts or checks, say what is healthy, failing, changed, or needs attention. "
    "Default to one to three natural sentences. Use lists only when the user asks for a list. "
    "Never read tool output verbatim. Synthesize it into a human response."
)


def friendly_workflow_name(filename: str) -> str:
    stem = str(filename or "")
    if stem.endswith(".yaml"):
        stem = stem[:-5]
    elif stem.endswith(".yml"):
        stem = stem[:-4]
    stem = stem.replace("_", " ").replace("-", " ")
    words = [part for part in stem.split() if part]
    special = {
        "nandi": "Nandi",
        "livekit": "LiveKit",
        "gopi": "Gopi",
        "github": "GitHub",
        "nse": "NSE",
        "ai": "AI",
        "cbm": "CBM",
        "qr": "QR",
    }
    return " ".join(special.get(word.lower(), word.capitalize()) for word in words)


def _github_json(url: str) -> Any:
    token = os.environ.get("RELAY_GITHUB_TOKEN", "").strip()
    if not token:
        raise RuntimeError("RELAY_GITHUB_TOKEN is not configured")
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "nandi-livekit-proof",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"GitHub returned HTTP {exc.code}") from exc


async def github_json(url: str) -> Any:
    return await asyncio.to_thread(_github_json, url)


class Nandi(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Nandi, Gopinath's natural personal voice agent. "
                + HUMAN_RESPONSE_POLICY
                + " For any request about Gopi Alerts, including likely speech-to-text variants such as "
                "Gopy, Goopy, or Gobi Alerts, always call check_gopi_alerts before answering. "
                "For requests about the user's repositories, repos, projects, or what each repository is for, "
                "always call repo_overview before answering. "
                "For requests to list, count, enumerate, or name workflows, always call list_workflows. "
                "For requests about workflow status, health, failures, or recent GitHub Actions runs, always call "
                "workflow_health. Never substitute recent run names for the workflow inventory. "
                "If speech is unclear or fragmentary, ask the user to repeat instead of guessing."
            ),
        )

    @function_tool()
    async def repo_overview(self, context: RunContext) -> dict[str, Any]:
        """Return a verified, human-friendly overview of the user's main repositories and what each one is for."""
        friendly = {
            "rntlgopinath57/safeqr": {
                "name": "SafeQR",
                "purpose": "the Bharosa child-safety QR project, including reliability, privacy, and alerting",
            },
            "rntlgopinath57/gopi_alerts": {
                "name": "Gopi Alerts",
                "purpose": "the automation hub for monitoring, scheduled checks, alerts, and delivery workflows",
            },
            "rntlgopinath57/OmniRoute": {
                "name": "OmniRoute",
                "purpose": "the routing and agent workspace for model switching, Relay, and Nandi voice-agent flows",
            },
        }

        async def verify(repo: str) -> dict[str, Any]:
            data = await github_json(f"https://api.github.com/repos/{repo}")
            info = friendly[repo]
            return {
                "name": info["name"],
                "purpose": info["purpose"],
                "verified": bool(data.get("full_name")),
            }

        repositories = await asyncio.gather(*(verify(repo) for repo in GITHUB_REPOS))
        if not all(item["verified"] for item in repositories):
            raise RuntimeError("Repository overview verification is incomplete")

        logger.info("Repository overview verified: %s repositories", len(repositories))
        return {
            "status": "PASS",
            "repository_count": len(repositories),
            "repositories": repositories,
            "spoken_summary": (
                "You have three main repositories. SafeQR supports Bharosa, "
                "Gopi Alerts runs your monitoring and automations, "
                "and OmniRoute handles routing, Relay, and Nandi agent flows."
            ),
            "instruction": "Use friendly names and purposes only. Never speak raw GitHub paths or owner names.",
        }

    @function_tool()
    async def check_gopi_alerts(self, context: RunContext) -> dict[str, Any]:
        """Check the live Gopi Alerts GitHub repository and return current verified evidence."""
        repo = "rntlgopinath57/gopi_alerts"
        meta = await github_json(f"https://api.github.com/repos/{repo}")
        branch = str(meta.get("default_branch") or "main")
        commit = await github_json(f"https://api.github.com/repos/{repo}/commits/{branch}")
        sha = str(commit.get("sha") or "")
        commit_time = str(((commit.get("commit") or {}).get("committer") or {}).get("date") or "")
        if not sha or not commit_time:
            raise RuntimeError("Gopi Alerts evidence is incomplete")
        logger.info("Gopi Alerts live evidence verified")
        return {
            "status": "PASS",
            "name": "Gopi Alerts",
            "latest_update_time": commit_time,
            "spoken_summary": "Gopi Alerts is verified and its latest update is confirmed.",
            "instruction": "Explain the health and relevance. Do not speak the commit hash, branch name, or repository path.",
        }

    @function_tool()
    async def list_workflows(self, context: RunContext) -> dict[str, Any]:
        """List and count every GitHub Actions workflow file configured across the active repositories."""
        async def repo_inventory(repo: str) -> dict[str, Any]:
            data = await github_json(f"https://api.github.com/repos/{repo}/contents/.github/workflows")
            workflow_files = sorted(
                str(item.get("name") or "")
                for item in data
                if isinstance(item, dict)
                and item.get("type") == "file"
                and str(item.get("name") or "").endswith((".yml", ".yaml"))
            )
            return {
                "repository_name": {
                    "rntlgopinath57/safeqr": "SafeQR",
                    "rntlgopinath57/gopi_alerts": "Gopi Alerts",
                    "rntlgopinath57/OmniRoute": "OmniRoute",
                }[repo],
                "workflow_count": len(workflow_files),
                "workflows": [friendly_workflow_name(name) for name in workflow_files],
            }

        repositories = await asyncio.gather(*(repo_inventory(repo) for repo in GITHUB_REPOS))
        workflow_count = sum(item["workflow_count"] for item in repositories)
        logger.info("Workflow inventory verified: %s files", workflow_count)
        return {
            "status": "PASS",
            "source": ".github/workflows",
            "workflow_count": workflow_count,
            "repositories": repositories,
            "instruction": (
                "Use workflow_count exactly as returned. The repositories array is the complete inventory. "
                "Speak the friendly workflow names, not filenames or extensions. "
                "Do not use recent run names or infer a different count."
            ),
        }

    @function_tool()
    async def workflow_health(self, context: RunContext) -> dict[str, Any]:
        """Check recent GitHub Actions run health across the active repositories."""
        async def repo_runs(repo: str) -> dict[str, Any]:
            data = await github_json(f"https://api.github.com/repos/{repo}/actions/runs?per_page=5")
            runs = []
            for run in (data.get("workflow_runs") or [])[:5]:
                state = run.get("conclusion") if run.get("status") == "completed" else run.get("status")
                runs.append({
                    "name": str(run.get("name") or "workflow"),
                    "state": str(state or "unknown"),
                    "updated_at": str(run.get("updated_at") or ""),
                })
            return {
                "repository_name": {
                    "rntlgopinath57/safeqr": "SafeQR",
                    "rntlgopinath57/gopi_alerts": "Gopi Alerts",
                    "rntlgopinath57/OmniRoute": "OmniRoute",
                }[repo],
                "runs": runs,
            }

        repositories = await asyncio.gather(*(repo_runs(repo) for repo in GITHUB_REPOS))
        run_count = sum(len(item["runs"]) for item in repositories)
        failures = sum(
            1
            for item in repositories
            for run in item["runs"]
            if run["state"] in {"failure", "cancelled", "timed_out"}
        )
        logger.info("Workflow health verified: %s runs, %s recent failures", run_count, failures)
        return {
            "status": "PASS",
            "recent_run_count": run_count,
            "recent_failure_count": failures,
            "repositories": repositories,
            "spoken_summary": (
                f"I checked {run_count} recent workflow runs and found {failures} recent failures."
            ),
        }


server = AgentServer()


@server.rtc_session(agent_name="nandi-livekit-proof")
async def nandi_session(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    session = AgentSession(
        vad=silero.VAD.load(
            activation_threshold=0.6,
            min_speech_duration=0.15,
            min_silence_duration=0.7,
        ),
        stt=groq.STT(
            model="whisper-large-v3-turbo",
            language="en",
        ),
        llm=groq.LLM(
            model="openai/gpt-oss-120b",
            parallel_tool_calls=False,
        ),
        tts=groq.TTS(
            model="canopylabs/orpheus-v1-english",
            voice="daniel",
        ),
        tts_text_transforms=[
            "filter_emoji",
            "filter_markdown",
            text_transforms.replace({
                "rntlgopinath57/safeqr": "SafeQR",
                "rntlgopinath57/gopi_alerts": "Gopi Alerts",
                "rntlgopinath57/OmniRoute": "OmniRoute",
                "gopi_alerts": "Gopi Alerts",
                "safeqr": "SafeQR",
                ".yml": "",
                ".yaml": "",
            }),
        ],
    )
    await session.start(agent=Nandi(), room=ctx.room)
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
