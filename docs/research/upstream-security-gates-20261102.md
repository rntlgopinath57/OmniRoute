# Upstream security gate — 2026-11-02

Read-only inspection of exact upstream repository files. No installs, paid calls, hosted runs, credentials or live sends.

## DeepSeek Harness — HOLD
- deepseek-ai/deepseek-harness SAFETY.md blob 2b76f00e0619ee69553afdc507df361080f4d3ac states explicitly: experimental developer preview, **no security audit**, may execute model-generated code/commands, load plugins and access network, processes, files and credentials. Sandboxing/approvals do not guarantee isolation.
- Conclusion: only disposable, no-secret, no-network test environment; never attach Gopi Alerts or Bharosa production credentials.

## REA — LIMITED TRIAL CANDIDATE
- morluto/rea docs/installation.md blob 137866534015407d02ce756d415c279e55746905: setup previews changes and requires approval; installs MCP registration and bundled skill by default; native engine installation is optional. Do not run automatic setup on production agents. Trial read-only static JS CLI against owned synthetic fixture; pin exact version and inspect install script first.

## Mercury — SECURITY DOCS NEED RECONCILIATION
- cosmicstack-labs/mercury-agent SECURITY.md blob 84334ab5fb1cca5d9ec818bdc9209e29493eb07f describes 1.3.x as latest supported security line while package.json declares version 1.4.2. This is a documentation/version inconsistency, NOT proof of vulnerability. Confirm supported 1.4.x policy before persistent agent deployment.
- SECURITY.md says Ask Me approval lane runs approved shell commands with daemon environment. Approval is not isolation; never expose production secrets or unattended Allow All mode during trial.

## Runtime proof
- Local Node v22.16.0. npm registry query fails EAI_AGAIN, github.com DNS unavailable. Actual package integration tests blocked; no production changes.
- Existing Python safety-contract fixture: 8/8 pass, but NOT a test of upstream implementations.

## Release decision
No upstream tool qualifies for production adoption today. First read-only REA trial in isolated compatible environment, then Mercury permission tests, then Harness plugin tests. Keep existing router and schedules unchanged. Require recorded evidence and regression before integration.
