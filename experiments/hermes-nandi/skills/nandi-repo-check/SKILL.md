---
name: nandi-repo-check
description: Read-only repository health/current-state check for an existing Gopi project.
---

# Nandi Repository Check

This skill is deliberately deterministic for the Nandi POC. The evidence command runs
when the skill is loaded, before the model answers, so provider-specific tool-call
round trips are not part of this read-only check.

## Live evidence
!`python ${HERMES_SKILL_DIR}/check_repo.py "Gopi Alerts"`

## Response contract
1. Use only the live evidence printed above.
2. Return repository, default branch, exact latest commit SHA, commit time, and PASS/FAIL.
3. Do not invent, substitute, or infer repository evidence.

## Guardrails
- READ ONLY.
- Never create/update/delete files, refs, issues, PRs, workflow runs, secrets, deployments, or messages.
- If the evidence command reports an error, return `FAIL: UNVERIFIED`.
- Mutation requests are outside this skill and must not be executed.
