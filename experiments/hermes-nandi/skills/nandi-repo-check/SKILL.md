---
name: nandi-repo-check
description: Read-only repository health/current-state check for an existing Gopi project.
---

# Nandi Repository Check

## Procedure
1. Map the user's named existing project to its canonical repository. For the first POC only: Gopi Alerts -> rntlgopinath57/gopi_alerts.
2. Fetch repository metadata from GitHub.
3. Identify the default branch.
4. Fetch the latest commit on that branch.
5. Report repository, default branch, latest commit SHA, pushed/commit time, and whether evidence was successfully retrieved.

## Guardrails
- READ ONLY.
- Never create/update/delete files, refs, issues, PRs, workflow runs, secrets, deployments, or messages.
- Never infer success from an LLM response.
- If GitHub evidence is unavailable, return FAIL: UNVERIFIED.
- Do not silently substitute another repository.

## Regression checks
- Wrong repo must fail closed.
- Missing GitHub evidence must not be called healthy.
- A successful tool call without user-visible evidence is not a pass.

## Verification
PASS only when repository metadata and latest default-branch commit are both retrieved from GitHub.
