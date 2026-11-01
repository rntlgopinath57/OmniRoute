# Agent tool evaluation (2026-11-01)

RESEARCH ONLY — no production install, runs, schedules, secrets, or live sends.

| Upstream | Version | Node engines | License | Trial |
|---|---|---|---|---|
| deepseek-ai/deepseek-harness | 0.2.2-alpha.2 | >=24.9.0 | MIT | plugin isolation, retries, fallback |
| morluto/rea | 6.8.0 | ^22.23.4 or ^24.22.1 or >=26.12.1 | MIT | evidence-backed static JS diagnosis |
| cosmicstack-labs/mercury-agent | 1.4.2 | >=22 | MIT | permissions, budget, state recovery |
| OmniRoute baseline | 3.8.51 | >=22.22.2 <23 or >=24 <27 | MIT | existing routing and fallback |

## Decision
Do not replace existing routing, alerts or schedulers. Isolate tools, pin exact upstream revisions, test with synthetic fixtures, adopt one demonstrated improvement at a time. No unpinned npx or remote-shell installation in production.

## Test matrix before adoption
1. Verify transitive licenses, advisories, maintenance, pinned commit and lockfile.
2. Use isolated Node 24.22.1+ runtime; never upgrade OmniRoute globally for a trial.
3. Test deny-by-default file, network, shell, secrets and send permissions; no side effects on denial.
4. Compare each tool with the existing implementation on identical synthetic fixtures and measure correctness, latency, resource use and false positives.
5. Simulate timeout, malformed result, provider 429, cancellation, crash/restart and network loss.
6. Verify strict budget, bounded retries, dedupe and recipient receipt before sent/seen state.
7. Confirm rollback and no regression to OmniRoute UI/model switching/fallback or Gopi Alerts schedules.
8. Require 8/8 evidence (decision, freshness, coverage, sources, dedupe, fallback, delivery where relevant, no cost/function regression).

## Trials
- Harness: fake MCP plugin returns success, denial, timeout and malformed responses; test isolation, tool selection and bounded retries.
- REA: owned synthetic JS package with known dependency graph and seeded bug; compare evidence quality to ordinary source inspection. No unauthorized third-party reversing.
- Mercury: mock channel and temp directory; attempt forbidden writes/requests, exhaust daily budget, restart agent and check duplicate sends.

## Verified environment limitations
Analysis container Node 22.16.0 is below every manifest's minimum; github.com DNS resolution fails. Full source checkout, real runtime tests, dependency audit, benchmarks and recipient proof NOT performed. Upstream README claims are not verified performance or free-tier entitlements.
