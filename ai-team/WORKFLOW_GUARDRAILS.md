# AI Team / Relay workflow guardrails

This file records project-specific workflow decisions so cleanup does not erase verified work.

## KEEP — release/v3.8.51

These are custom project workflows and must not be removed as generic upstream clutter:

- `.github/workflows/ai-team-v0.yml` — core AI Team regression suite and task-intake smoke test.
- `.github/workflows/ai-team-activation.yml` — starts the verified read-only local OmniRoute gateway and runs the bounded activation smoke.
- `.github/workflows/ai-team-project-automation.yml` — read-only project automation regression path.
- `.github/workflows/ai-team-universal-audit.yml` — provider-independent audit self-test plus manual target audit.
- `.github/workflows/ai-team-bharosa-controlled.yml` — credential-gated, read-only Bharosa audit.

The test `ai-team/tests/workflow-preservation.test.mjs` is the deletion regression guard.

## KEEP — infra/cloudflare-relay

The current Relay runtime is protected by:

- `.github/workflows/relay-safety-check.yml`
- `.github/workflows/cloudflare-relay-preview-deploy.yml`

The safety gate must preserve routing, genuine model/provider switching, bounded fallback/cooldown behavior, independent reviewer behavior, prompt input, node/provider visibility, scrolling, presentation formats, media wiring, secret scanning, browser-rendered UI checks, and FreeLLMAPI repository-context discovery.

## SUPERSEDED — do not blindly restore

`.github/workflows/relay-sandbox-check.yml` was a useful Netlify-era guardrail, but its relevant checks are now absorbed into the Cloudflare Relay safety/deploy workflows. Restoring it as a second scheduled workflow would duplicate work and revive obsolete branch/runtime assumptions.

`.github/workflows/cloudflare-relay-dry-run.yml` is also superseded when the active preview-deploy workflow already performs a Wrangler dry run before deployment.

## Known failures that are now guardrails

- Readiness must use `/api/health`; the old unauthenticated `/v1/models` readiness check returned 401 and timed out.
- Short prompts must not automatically become sticky follow-ups. Do not restore the old `if (q.length <= 120) return true` behavior.
- Explicit provider intent must remain strict; ordinary mentions of Gemini/Claude/DeepSeek/Qwen/Groq/etc. must not force that provider.
- Reviewer selection must remain independent from the worker and bounded to a small fallback set.
- Relay must keep an actual visible YOU -> PLANNER handoff, usable Ask Relay input, node/provider visibility and scrolling.
- A green workflow is insufficient: Cloudflare preview health and the browser-rendered UI smoke are user-visible verification.
- FreeLLMAPI is retained as a discoverable repository/tool path. It is MIT and self-hostable, but its own documentation describes it as experimental rather than a stable production inference dependency; do not silently make it a production dependency.

## Intentionally not restored

Large inherited OmniRoute CI/release/nightly workflows that were not created for this AI Team/Relay project remain absent from the default branch. Examples include the upstream monolithic CI, release publishing, Electron/Docker publishing, mutation/property/schemathesis nightlies, wiki/radar publishing, and upstream provider/plugin CI.

If one of those becomes a direct dependency of Relay or AI Team later, restore the smallest required check and add an explicit project regression test instead of restoring the entire upstream workflow set.

## Cleanup rule

Before deleting or disabling any workflow:

1. Find its history and identify whether it contains project-specific commits.
2. Prove equivalent coverage exists elsewhere.
3. Preserve confirmed failures as regression tests.
4. Verify the delivered Relay/AI Team behavior, not only YAML validity.
5. Only then remove the redundant workflow.
