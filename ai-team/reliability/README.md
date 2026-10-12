# Optional reliability adapters — isolated proof only

These modules are not wired to live OmniRoute, Nandi or Gopi Alerts, and
remain OFF unless an existing agent explicitly imports and enables one.
No new packages, service installs, credentials, or paid services are added.

## Hindsight (MIT, self-host first)

- Source: https://github.com/vectorize-io/hindsight
- Existing adapter: \`createHindsightAdapter\` in \`proof.mjs\`.
- Must provide an explicit \`enabled: true\`, project-scoped \`bankId\`,
  local \`baseUrl\` (or HTTPS), and optional \`apiKey\`.
- Only retain up to 2048 characters of curated, non-sensitive project
  learning after independent reviewer approval and delivery receipt.
  Never send keys, personally identifiable data, raw prompts, or user data.
- Retention is synchronous and is only acknowledged when the API returns
  \`success=true\`, \`items_count=1\`; an HTTP 200 is not sufficient.
- Recall failure must surface as memory-degraded; do not fabricate context.
  The agent route and model fallback must continue unchanged when memory
  is disabled or degraded.
- Self-host requires a running service, storage and inference. Software
  is free; compute and LLM processing may not be free. No provider
  subscription or service should be provisioned without verifying cost.

**Not proven yet:** real service availability, recall of retained facts,
bank separation under live traffic, or user-visible output delivery.

## OpenShell (Apache-2.0, sandbox only)

- Source: https://github.com/NVIDIA/OpenShell
- Read-only sandbox example and release gates: \`ops/openshell/README.md\`.
- Existing reader: \`createOpenShellGitHubReader\` in
  \`openshell-reader.mjs\`. Default off.
- Without an installed CLI, active gateway, sandbox and enforced policy,
  the reader returns \`ok:false\`; it never runs commands on the host as
  a fallback.
- Policy grants GET only to explicit public repository metadata paths.
- A successful SDK/CLI call is not adequate proof of sandbox isolation.
  Verify an allowed GET and a policy-denied POST inside a real sandbox.

## Activation contract

1. Preserve baseline flows and existing fallback behavior.
2. Run deterministic tests for new proof gates.
3. Provision **only an isolated environment** on a supported host.
4. Verify real retained/recall result for Hindsight and permitted/denied
   OpenShell operations; compare against last verified baseline.
5. Review cost, license, source health, security and failure modes.
6. Obtain independent review before proposing a live route change.
7. Roll back by keeping adapters disabled. Do not merge before runtime proof.
