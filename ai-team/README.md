# AI Team control plane

The AI Team is intentionally isolated from the existing OmniRoute runtime and from the user's live project workflows. Its default operating mode is read-only and deterministic so control-plane health is not coupled to third-party model availability.

## Current status

AI Team v0 is complete through the documented 10-step build order. The first v1 operational slice is also active: a named read-only project automation called `omniroute-readiness`.

The control plane now supports:

- validated task intake and deterministic task classification;
- model/provider routing with primary and fallback providers;
- a single executor plus an independent reviewer;
- manual and GitHub Actions execution entry points;
- repository tools protected by explicit write gates;
- Planner -> Worker -> Reviewer orchestration;
- an OmniRoute adapter for optional live inference;
- named project automations with structured pass/fail output.

No AI Team workflow modifies Bharosa, Gopi Alerts, Fabric Watch, Gold alerts, or other live project repositories. Cross-repository private-project access is not enabled yet.

## Safety model

- GitHub Actions permissions remain `contents: read` for the active validation and project-automation workflows.
- Project jobs are read-only unless both the job definition permits writes and the individual run receives explicit write approval.
- CI uses deterministic provider clients so upstream free-model outages do not incorrectly mark the control plane as broken.
- Live model inference is opt-in and should be treated as an integration check rather than the core CI gate.
- Repository paths are scoped and validated before local reads.

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

All ten components have isolated test coverage before being used by the operational workflow.

## Project automations

Current catalog:

- `omniroute-readiness` — read-only audit of the AI Team build-order documentation, core CI workflow, and activation workflow. It validates required invariants through the same project-job gate and returns a structured report reviewed by an independent deterministic reviewer.

Run it locally:

```bash
node ai-team/automation/run.mjs omniroute-readiness
```

Run the isolated suite:

```bash
node --test ai-team/tests/*.test.mjs
```

Run basic task intake:

```bash
node ai-team/src/main.mjs '{"task":"Review Bharosa security","type":"analysis"}'
```

## GitHub Actions

- `AI Team v0 Core` — isolated unit/integration tests plus task-intake smoke test.
- `AI Team Read-only Activation` — starts OmniRoute locally, verifies `/api/health`, then exercises a bounded read-only project job.
- `AI Team Project Automation` — runs a selected named read-only project automation; the first supported job is `omniroute-readiness`.

## Next milestones

1. Add a reusable GitHub repository adapter that can read a separately authorized private repository without granting write access.
2. Add Bharosa as a second catalog job only after that cross-repository read path is isolated and tested.
3. Use the Bharosa job first for security/reliability audits with no production writes.
4. Add scheduling only after the cross-repository job is consistently green.
5. Keep write-capable project jobs behind explicit per-run approval rather than enabling general autonomous writes.
