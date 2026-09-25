import asyncio
import base64
import io
import ipaddress
import json
import logging
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any

from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, cli, function_tool, text_transforms, tts
from livekit.plugins import google, groq, silero
from pypdf import PdfReader

logger = logging.getLogger("nandi-livekit")

GITHUB_REPOS = (
    "rntlgopinath57/safeqr",
    "rntlgopinath57/gopi_alerts",
    "rntlgopinath57/OmniRoute",
)

ALERT_WORKFLOWS = {
    "gold": "Gold Retail Shop Check",
    "stocks": "Gopi Alerts — NSE Watchlist",
    "stock": "Gopi Alerts — NSE Watchlist",
    "aravinda": "Aravinda Fabric Watch",
    "fabric": "Aravinda Fabric Watch",
    "repo scout": "GitHub Repo Scout",
    "github scout": "GitHub Repo Scout",
    "insta": "Insta Profile Check",
    "instagram": "Insta Profile Check",
    "briefing": "Daily Priority Briefing",
    "daily briefing": "Daily Priority Briefing",
}

MAX_WEB_BYTES = 4 * 1024 * 1024
MAX_REPORT_CHARS = 14000


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript", "svg"}:
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript", "svg"} and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip:
            text = " ".join(data.split())
            if text:
                self.parts.append(text)


def _safe_public_url(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        raise ValueError("A website URL is required")
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only public HTTP or HTTPS websites are supported")
    if not parsed.hostname:
        raise ValueError("Website host is missing")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("Local addresses are not allowed")
    infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError("Private or local network addresses are not allowed")
    return urllib.parse.urlunparse(parsed)


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _safe_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_public_report(url: str) -> dict[str, Any]:
    safe_url = _safe_public_url(url)
    opener = urllib.request.build_opener(_SafeRedirect())
    req = urllib.request.Request(
        safe_url,
        headers={
            "User-Agent": "Mozilla/5.0 Nandi/1.0",
            "Accept": "text/html,application/pdf,application/json,text/plain;q=0.9,*/*;q=0.7",
        },
    )
    with opener.open(req, timeout=18) as response:
        final_url = _safe_public_url(response.geturl())
        content_type = str(response.headers.get("Content-Type") or "").lower()
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_WEB_BYTES:
            raise ValueError("The report is too large to fetch safely")
        data = response.read(MAX_WEB_BYTES + 1)
        if len(data) > MAX_WEB_BYTES:
            raise ValueError("The report is too large to fetch safely")

    if "application/pdf" in content_type or final_url.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        chunks = []
        for page in reader.pages[:12]:
            chunks.append(page.extract_text() or "")
        text = "\n".join(chunks)
        kind = "PDF report"
    elif "application/json" in content_type:
        payload = json.loads(data.decode("utf-8", errors="replace"))
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        kind = "JSON report"
    else:
        decoded = data.decode("utf-8", errors="replace")
        if "html" in content_type or "<html" in decoded[:500].lower():
            parser = _TextExtractor()
            parser.feed(decoded)
            text = "\n".join(parser.parts)
            kind = "web page"
        else:
            text = decoded
            kind = "text report"

    clean = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    return {
        "source": final_url,
        "content_type": kind,
        "content": clean[:MAX_REPORT_CHARS],
        "truncated": len(clean) > MAX_REPORT_CHARS,
    }


def _decode_github_content(payload: dict[str, Any]) -> Any:
    raw = str(payload.get("content") or "").replace("\n", "")
    if payload.get("encoding") != "base64" or not raw:
        raise RuntimeError("GitHub state file content is unavailable")
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _money(value: Any) -> str:
    try:
        return f"₹{int(round(float(value))):,}"
    except Exception:
        return "unavailable"


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
    "Never read tool output verbatim. Synthesize it into a human response. "
    "For ordinary reasoning or knowledge questions, answer directly. For live external facts, reports, alerts, "
    "or account/project state, use the available tools rather than pretending to remember current data."
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
                "For updates on Gold, stocks, Aravinda, fabric, repo scout, Instagram checks, or the daily briefing, "
                "always call alert_update so the answer comes from the latest persisted run evidence. "
                "If the user gives a public website or report URL and asks you to visit, fetch, read, inspect, or summarize it, "
                "call fetch_public_report. If no URL is provided, ask for the exact website or report link rather than inventing one. "
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
    async def alert_update(self, context: RunContext, topic: str) -> dict[str, Any]:
        """Get the latest persisted update for a known Gopi Alerts topic such as gold, stocks, Aravinda, repo scout, Instagram, or briefing."""
        q = str(topic or "").lower().strip()
        matched_key = next((key for key in ALERT_WORKFLOWS if key in q), "")
        if not matched_key:
            return {
                "status": "NEEDS_CLARIFICATION",
                "supported_topics": ["gold", "stocks", "Aravinda fabric", "repo scout", "Instagram", "daily briefing"],
                "instruction": "Ask which alert or monitoring flow the user means.",
            }

        workflow_name = ALERT_WORKFLOWS[matched_key]
        runs_data = await github_json("https://api.github.com/repos/rntlgopinath57/gopi_alerts/actions/runs?per_page=40")
        matches = [run for run in runs_data.get("workflow_runs", []) if str(run.get("name") or "") == workflow_name]
        latest = matches[0] if matches else {}
        latest_success = next((run for run in matches if run.get("conclusion") == "success"), {})

        result: dict[str, Any] = {
            "status": "PASS",
            "topic": matched_key,
            "workflow": workflow_name,
            "latest_run": {
                "status": latest.get("status") or "unknown",
                "conclusion": latest.get("conclusion") or "unknown",
                "updated_at": latest.get("updated_at") or "",
            },
            "latest_success": {
                "updated_at": latest_success.get("updated_at") or "",
            },
        }

        if matched_key == "gold":
            state_payload = await github_json(
                "https://api.github.com/repos/rntlgopinath57/gopi_alerts/contents/.gold-retail-state.json"
            )
            state = _decode_github_content(state_payload)
            prices = state.get("prices") or {}
            verification = state.get("verification") or {}
            coverage = verification.get("coverage") or {}
            verified_retailers = list((verification.get("retailers") or {}).keys())

            retailer_22k = {
                name: prices.get(f"22k:{name}")
                for name in verified_retailers
                if prices.get(f"22k:{name}") is not None
            }
            retailer_24k = {
                name: prices.get(f"24k:{name}")
                for name in verified_retailers
                if prices.get(f"24k:{name}") is not None
            }
            cmr_10g = float(prices["cmr:22k_g"]) * 10 if prices.get("cmr:22k_g") is not None else None
            cheapest_22k = min(retailer_22k.values()) if retailer_22k else None
            cheapest_22k_names = sorted(name for name, value in retailer_22k.items() if value == cheapest_22k)
            cheapest_24k = min(retailer_24k.values()) if retailer_24k else None
            cheapest_24k_names = sorted(name for name, value in retailer_24k.items() if value == cheapest_24k)

            result["gold"] = {
                "checked_at": state.get("checked_at") or "",
                "coverage": {
                    "verified_retailers": coverage.get("verified_retailers"),
                    "total_retailers": coverage.get("total_retailers"),
                    "level": coverage.get("level"),
                    "can_rank_best": coverage.get("can_rank_best"),
                    "unavailable_retailers": verification.get("unavailable_retailers") or [],
                },
                "22k_10g": {name: _money(value) for name, value in retailer_22k.items()},
                "24k_10g": {name: _money(value) for name, value in retailer_24k.items()},
                "cmr_22k_10g": _money(cmr_10g) if cmr_10g is not None else "unavailable",
                "ibja_999_10g": _money(prices.get("ibja:999_10g")),
                "lowest_verified_22k_retailers": cheapest_22k_names,
                "lowest_verified_22k_price": _money(cheapest_22k) if cheapest_22k is not None else "unavailable",
                "lowest_verified_24k_retailers": cheapest_24k_names,
                "lowest_verified_24k_price": _money(cheapest_24k) if cheapest_24k is not None else "unavailable",
            }
            result["instruction"] = (
                "Explain the latest successful persisted Gold snapshot and separately mention if newer runs are failing. "
                "Use the exact prices from the state. CMR is a separate reference/scheme input, not one of the five retailer rankings. "
                "If can_rank_best is false, do not declare a final best retailer; explain that coverage is partial."
            )
        else:
            result["instruction"] = (
                "Explain whether the latest run is healthy and when the latest successful run completed. "
                "Do not invent alert contents that are not present in this evidence."
            )

        logger.info("Alert update verified: %s latest=%s", workflow_name, result["latest_run"]["conclusion"])
        return result

    @function_tool()
    async def fetch_public_report(self, context: RunContext, url: str) -> dict[str, Any]:
        """Fetch and read a public HTTP/HTTPS webpage, JSON report, text report, or PDF from a user-supplied URL."""
        try:
            report = await asyncio.to_thread(_fetch_public_report, url)
        except Exception as exc:
            return {
                "status": "FAILED",
                "error": str(exc),
                "instruction": "Explain that the site/report could not be fetched and ask for another public link if appropriate.",
            }
        logger.info("Public report fetched: %s", report["content_type"])
        return {
            "status": "PASS",
            **report,
            "instruction": (
                "Summarize the report in human language. Cite the website name conversationally if useful, "
                "but do not read the raw URL aloud. If content is truncated, say you reviewed the available portion."
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
        tts=tts.FallbackAdapter(
            [
                groq.TTS(
                    model="canopylabs/orpheus-v1-english",
                    voice="daniel",
                ),
                google.beta.GeminiTTS(
                    model="gemini-3.1-flash-tts-preview",
                    voice_name="Zephyr",
                    instructions="Speak naturally, warmly, and concisely like a capable personal assistant.",
                    api_key=os.environ.get("GEMINI_API_KEY"),
                ),
            ],
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
