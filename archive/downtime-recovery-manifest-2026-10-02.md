# Relay / AI Team Downtime Recovery Manifest — 2026-10-02

Production branch: `release/v3.8.51`

## Recovery anchors
- All original branch names and SHAs: `archive/branch-recovery-map-2026-10-02.json`
- Critical deleted Relay/AI-Team snapshots: `archive/downtime-critical-relay-snapshots-2026-10-02.json`
- Completed Hermes workflow text: `archive/removed-workflows/hermes-nandi-poc.yml.txt`
- Current AI Team guardrails: `ai-team/WORKFLOW_GUARDRAILS.md`
- Current production safety gate: `.github/workflows/relay-safety-check.yml`
- Current production deploy/acceptance gate: `.github/workflows/cloudflare-relay-preview-deploy.yml`

## Active branches intentionally retained
- `release/v3.8.51` — production Relay / AI Team
- `nandi-immersive-v1` — preserved immersive Nandi implementation
- `nandi-livekit-proof` — preserved LiveKit voice-agent proof with successful runs
- `infra/cloudflare-relay` — temporary only until production-branch Relay Safety Check is verified, then retire

## Downtime behavior that must not regress
1. Real model/provider switching must remain genuine, not cosmetic.
2. Explicit provider/model intent must stay strict and visible; no silent provider substitution.
3. Free/public routing and trusted/secure routing remain separate lanes with bounded fallbacks.
4. Reviewer failures must remain visible; reviewer fallback is bounded and independent from executor where required.
5. Ask Relay input, provider nodes, scrolling, mobile execution lane, and View Run controls must remain usable.
6. Provider roster must reflect real availability, not assumed availability.
7. Prompt/data-flow animations must represent real stages: YOU -> PLANNER -> ROUTER -> MODEL -> REVIEWER.
8. Repository access and controlled project audits remain read-only unless explicitly approved.
9. Fresh/high-risk/date questions must either use verified grounding or safely refuse; never guess a known-bad date.
10. Cloudflare deployment success is not enough: live routing, fallback, desktop UI, mobile UI, provider roster, rendering, media and safety checks must pass.
11. Nandi immersive and LiveKit work stay isolated from Relay production until independently verified for promotion.
12. Confirmed failures remain regression contracts, including stale CSS/UI assertions, reviewer timeouts, strict provider intent, routing affinity, mobile visibility and date-grounding failures.

## Important deleted branch knowledge
- `architecture/core-first-integration-20260920` — core-first integration model.
- `design/relay-guardrails-20260920` — Relay UI design guardrails.
- `feature/ai-team-control-plane`, `feat/ai-team-runtime-v1` — AI Team control-plane/runtime evolution.
- `feature/ai-team-ui-v2` — UI evolution reference.
- `feature/cbm-impact-guard-20260922`, `lab/cbm-routing-truth-20260922` — codebase-memory routing impact work.
- `fix/reviewer-live-timeout`, `fix/reviewer-timeout` — bounded reviewer timeout/fallback behavior.
- `fix/strict-explicit-provider` — strict explicit-provider contract.
- `hotfix/named-agent-routing` — named-agent affinity/routing fix.
- `improve/relay-stability-hardening` — stability hardening.
- `probe/freellmapi-relay-20260919` — keyless/public free lane investigation.
- `recovery/ai-team-workflow-guardrails-20260919` — workflow-preservation rules.
- `safety/symphony-relay-20260919` — safety/guardrail investigation.
- `spike/hermes-nandi-poc-20260925` — completed Hermes POC, archived rather than kept active.
- Deleted Nandi functional/voice/animation spikes remain recoverable by SHA; current immersive and LiveKit branches are retained as the working Nandi lines.

## Restore rule
Never revive a deleted branch straight into production. Recreate from its recorded SHA only for inspection, compare against current production, extract only missing proven behavior, add/retain a regression test, then verify real routing and rendered output before integration.
