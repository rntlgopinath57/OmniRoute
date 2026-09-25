# Hermes → Nandi isolated proof of concept

Purpose: test whether a Hermes-style skill harness can simplify Nandi without changing Relay/Nandi production.

## Safety
- Branch-only experiment.
- Read-only first capability.
- No deploy, merge, secrets, workflow dispatch, messaging, or production mutation.
- Existing nandi-immersive-v1 remains the rollback baseline.

## First acceptance flow
User intent: "Nandi, check Gopi Alerts."

Expected:
1. Resolve the existing gopi_alerts repository.
2. Inspect current repository/default-branch metadata.
3. Return evidence (repo, branch, pushed_at, commit SHA).
4. Do not mutate anything.
5. Fail closed if repository/evidence cannot be verified.

## Pass gate
A pass requires real GitHub evidence, not a model-only answer.
