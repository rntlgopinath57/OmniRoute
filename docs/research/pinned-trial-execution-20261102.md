# Pinned isolated agent trials — 2026-11-02

## Upstream commits (verified via GitHub commit API)
- REA: morluto/rea @ 0354145a2ad9844f87b602bd457ae3df9982e0d3
- Mercury: cosmicstack-labs/mercury-agent @ a61d6276fbfc634f5efb5dc1ee7027a9501c0e80
- DeepSeek Harness: deepseek-ai/deepseek-harness @ ce7073d51254c26cd63b22a60835b8f948deb447
- OmniRoute existing release baseline: 723c5d31ac64b9304dc4e1f60175c6b0dad4fc39

## Run gate
Do not run hosted Actions or install to production. Requires disposable network-enabled environment with Node 24.22.1+ and exact pinned source plus lockfiles; zero credentials, zero paid APIs, no Telegram, no persistent daemon. Use read-only/synthetic fixtures. No unattended shell approvals.

## Acceptance sequence
1. Clone exact pinned revisions; record checksums and license/transitive dependency audit. Reject unexpected install scripts.
2. REA: synthetic JavaScript/Electron package with known imports, seeded defect and expected module graph. Compare result with baseline parser; capture accuracy, false positives and resource use.
3. Mercury: mock local channel, deny write outside temp scope, deny private network, exhaust daily token cap, restart and ensure dedupe/receipt state survives. Confirm supported security patch line (SECURITY.md currently calls 1.3.x latest while package manifest says 1.4.2).
4. Harness: disposable isolated plugin with fake MCP success, error, timeout, cancellation, and network-denial cases. Official SAFETY.md warns no audit or guaranteed sandbox isolation.
5. Compare to existing OmniRoute; only propose one reversible improvement if measurable gain and no regression.

## Evidence achieved now
- Existing local Python contract test suite: 8 tests pass; these are NOT upstream runtime tests.
- Local Node v22.16.0; github.com and registry.npmjs.org DNS unavailable. No genuine package runtime test possible in current container.
- No user project changes or deployment. The branch is a research artifact only.

## Stop conditions
Stop on incompatible runtime, missing lockfile, unverified license, install script requiring privilege, paid/credential requirement, outbound production access, or incomplete evidence. Never interpret a mock pass as upstream integration proof.
