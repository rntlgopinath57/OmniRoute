---
name: nandi-repo-check
description: Read-only repository health/current-state check for an existing Gopi project.
---

# Nandi Repository Check

Use this skill when the user asks Nandi to check an existing project repository.

## Procedure
1. Map the user's named project only through the allowlist in `check_repo.py`.
2. Run:
   `python ~/.hermes/skills/nandi-repo-check/check_repo.py "Gopi Alerts"`
3. Treat the script output as the evidence. Report repository, default branch, latest commit SHA, commit time, and PASS/FAIL.
4. Do not invent or substitute repository names.

## Guardrails
- READ ONLY.
- Never create/update/delete files, refs, issues, PRs, workflow runs, secrets, deployments, or messages.
- Never infer success from an LLM response.
- If GitHub evidence is unavailable, return `FAIL: UNVERIFIED`.
- Unknown projects must return `FAIL: UNVERIFIED`.
- Mutation requests are outside this skill and must not be executed.

## Verification
PASS only when repository metadata and latest default-branch commit are both retrieved from GitHub by `check_repo.py`.
