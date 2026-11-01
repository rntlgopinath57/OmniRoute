# Offline trial evidence — 2026-11-02

## Result
8/8 dependency-free Python mock-contract tests passed in the isolated analysis container. No hosted Actions, paid API calls, credentials, external sends, or production changes.

The tests are NOT upstream DeepSeek Harness, REA, or Mercury runtime tests. They exercise a small local Guard and classify_evidence reference implementation:
- permission-denied actions consume no budget
- hard budget exhaustion
- no sent marker before recipient receipt
- dedupe after receipt
- replay ledger persistence
- synthetic source-evidence classification
- missing-source not verified
- timeout not a delivery receipt

## Blocker proof
- Installed Node: v22.16.0
- Upstream minimums: Harness >=24.9.0; REA ^22.23.4 or ^24.22.1 or >=26.12.1; OmniRoute >=22.22.2 <23 or >=24 <27; Mercury >=22.
- DNS to registry.npmjs.org and github.com unavailable from container. No upstream packages or lockfiles acquired.
- Therefore no runtime test, transitive dependency audit, performance benchmark, or production integration can be claimed.

## Next execution gate
In a network-enabled, isolated Node 24.22.1+ environment with pinned upstream revisions, perform REA synthetic JS module graph test, Mercury permission/restart/mock-send tests, then Harness fake MCP plugin error/cancellation tests. Capture stdout/stderr, version hashes, permissions, elapsed time, resource usage, and regressions. No live messaging or merges until 8/8 production proof.

## Scope
This evidence record changes no production scripts, schedules, UI, secrets, or routing.
