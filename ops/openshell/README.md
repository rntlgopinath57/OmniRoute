# OpenShell read-only GitHub sandbox (isolated proof)

This optional proof is **not a production integration**. Do not merge/enable
until the target Linux or supported Docker/Podman host, sandbox policy, cost,
license and end-to-end delivery have been verified. Nothing is installed,
executed, or routed into Nandi/Relay by default.

Upstream: https://github.com/NVIDIA/OpenShell (Apache-2.0).
Prerequisite: provision a supported OpenShell gateway + sandbox out-of-band
and verify OpenShell CLI matches the gateway release. No payment or provider
credentials are required for **public repository metadata only**. The runtime
still consumes host compute/storage. Do not introduce a hosted paid runtime.

Apply the reviewed \`github-readonly-policy.yaml\` **at sandbox creation**.
OpenShell static filesystem settings cannot be retroactively applied to an
existing sandbox. Use a fresh sandbox instead of weakening one.

Example only (on a provisioned host after reviewing the base policy):

\`\`\`sh
openshell sandbox create --name gopi-github-proof --policy ops/openshell/github-readonly-policy.yaml
openshell policy get gopi-github-proof --full
# Confirm the active policy matches the intended restricted rules.
openshell sandbox exec -n gopi-github-proof --no-login-shell -- \
  /usr/bin/curl -fsS https://api.github.com/repos/NVIDIA/OpenShell
\`\`\`

## Release gates

1. CLI/gateway and version installed on a supported host; no unapproved cost.
2. Effective policy matches reviewed policy, with **enforcement: enforce**.
3. Real GitHub GET succeeds inside sandbox, response repository identity matches.
4. Explicit POST test to a harmless/non-mutating endpoint produces an
   OpenShell **policy_denied** response (not merely GitHub 403/404).
5. Unsupported hosts, missing CLI, timeout, denied access and malformed
   results all fail closed. No host-shell fallback.
6. Existing routing, fallback, mobile/voice, and alert delivery unchanged.
7. No production key, private repo, user data, or unrestricted agent process
   is exposed. No real output claim until observed.

Rollback: do not enable the optional reader, and destroy only the isolated
sandbox if one has been created. Do not touch other services/flows.

## Integration API

\`createOpenShellGitHubReader({ enabled: true, sandboxName })\` from
\`ai-team/reliability/openshell-reader.mjs\` is an opt-in metadata probe.
It invokes the OpenShell CLI (not an unrestricted shell) with fixed arguments.
A real safe agent-execution workflow requires separate review and runtime proof.
