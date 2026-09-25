import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, cli, function_tool
from livekit.plugins import groq, silero

logger = logging.getLogger("nandi-livekit")

GITHUB_REPOS = (
    "rntlgopinath57/safeqr",
    "rntlgopinath57/gopi_alerts",
    "rntlgopinath57/OmniRoute",
)


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
                "You are Nandi, Gopi's concise voice agent. "
                "This is a proof of a real conversational agent, not a general chatbot. "
                "For any request about Gopi Alerts, including likely speech-to-text variants such as "
                "Gopy, Goopy, or Gobi Alerts, always call check_gopi_alerts before answering. "
                "For requests to show, check, list, or review workflows or GitHub Actions, always call "
                "show_workflows before answering. Never invent repository or workflow status. "
                "After tools return, speak only the useful conclusion in one or two short sentences. "
                "Do not read commit hashes, raw JSON, internal tool names, or long workflow lists aloud. "
                "For unrelated questions, answer briefly. If speech is unclear or fragmentary, ask the user "
                "to repeat instead of guessing."
            ),
        )

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
            "repository": repo,
            "default_branch": branch,
            "latest_commit_sha": sha,
            "commit_time": commit_time,
            "spoken_summary": "Gopi Alerts is verified and the latest main update is confirmed.",
        }

    @function_tool()
    async def show_workflows(self, context: RunContext) -> dict[str, Any]:
        """Check recent GitHub Actions runs across the active Bharosa, Gopi Alerts, and OmniRoute repositories."""
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
            return {"repository": repo, "runs": runs}

        repos = await asyncio.gather(*(repo_runs(repo) for repo in GITHUB_REPOS))
        run_count = sum(len(item["runs"]) for item in repos)
        failures = sum(
            1
            for item in repos
            for run in item["runs"]
            if run["state"] in {"failure", "cancelled", "timed_out"}
        )
        logger.info("Workflow evidence verified: %s runs, %s recent failures", run_count, failures)
        return {
            "status": "PASS",
            "run_count": run_count,
            "recent_failure_count": failures,
            "repositories": repos,
            "spoken_summary": (
                f"I checked {run_count} recent workflow runs and found {failures} recent failures. "
                "The detailed evidence is available in the tool result."
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
            model="llama-3.3-70b-versatile",
            temperature=0.1,
        ),
        tts=groq.TTS(
            model="playai-tts",
            voice="Arista-PlayAI",
        ),
    )
    await session.start(agent=Nandi(), room=ctx.room)
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
