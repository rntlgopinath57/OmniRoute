# AI Team v0

This directory is intentionally isolated from the existing OmniRoute runtime.

## Current scope

Step 1 only: accept one task object and return a deterministic structured result.

```json
{"task":"Review Bharosa security","type":"analysis"}
```

becomes:

```json
{"status":"success","task":"Review Bharosa security","type":"analysis","result":"AI Team task received successfully"}
```

## Dependency rule

- Runtime: Node.js 22.22.2+, matching OmniRoute.
- External npm packages: none.
- Python packages: none.
- No OmniRoute imports.
- No model/API calls yet.
- No changes to existing alert, Bharosa, Fabric, or other workflows.

## Build order

1. Task intake and validation.
2. Task classifier.
3. Model/provider router.
4. Single executor.
5. Independent reviewer.
6. GitHub/manual execution entry point.
7. Repository tools with explicit write gates.
8. Planner -> Worker -> Reviewer orchestration.
9. OmniRoute adapter.
10. Project automations.

Each step must pass its isolated tests before the next step is added.

## Run locally

```bash
node ai-team/src/main.mjs '{"task":"Review Bharosa security","type":"analysis"}'
node --test ai-team/tests/*.test.mjs
```
