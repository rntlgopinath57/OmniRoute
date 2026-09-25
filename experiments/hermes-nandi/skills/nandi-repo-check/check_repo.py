#!/usr/bin/env python3
import json, os, sys, urllib.request

PROJECTS = {"Gopi Alerts": "rntlgopinath57/gopi_alerts"}

def fail(msg):
    print(f"FAIL: UNVERIFIED — {msg}")
    sys.exit(2)

name = " ".join(sys.argv[1:]).strip()
repo = PROJECTS.get(name)
if not repo:
    fail("unknown project; no repository substituted")

token = os.environ.get("RELAY_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")
headers = {"Accept": "application/vnd.github+json", "User-Agent": "nandi-repo-check"}
if token:
    headers["Authorization"] = f"Bearer {token}"

def get(url):
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except Exception as e:
        fail(f"GitHub evidence unavailable: {type(e).__name__}")

meta = get(f"https://api.github.com/repos/{repo}")
branch = meta.get("default_branch")
if not branch:
    fail("default branch missing")
commit = get(f"https://api.github.com/repos/{repo}/commits/{branch}")
sha = commit.get("sha")
date = ((commit.get("commit") or {}).get("committer") or {}).get("date")
if not sha or not date:
    fail("latest commit evidence incomplete")

print(json.dumps({"status":"PASS","repository":repo,"default_branch":branch,"latest_commit":sha,"commit_time":date}, separators=(",",":")))
