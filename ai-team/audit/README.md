# Universal Audit Mode

Universal Audit is the evidence-first path for any repository or checked-out project that needs scanning, review, or architecture evaluation.

## Contract

1. **Inventory first** — walk the target read-only and identify frameworks, persistence layers, CI, tests, manifests, and large modules.
2. **Deterministic specialists** — security, reliability, architecture/data, testing/quality, deployment, and supply-chain checks run without an AI provider.
3. **Evidence packs** — every finding carries a rule, severity, path, line when available, redacted evidence, and a recommended action.
4. **Model review is secondary** — AI synthesis can interpret the evidence later, but an unavailable model must never erase or invalidate the scan.
5. **No target execution** — the generic audit never runs code from an unknown target repository.
6. **Read-only by default** — checkout credentials are used only to read the selected repository/ref.
7. **Project overlays are optional** — Bharosa or any other project can add extra invariants without replacing the universal scanner.

## Run locally

```bash
AUDIT_ROOT=/path/to/project \
AUDIT_PROFILE=full \
AUDIT_FOCUS="privacy and persistence" \
AUDIT_OUTPUT_DIR=audit-output \
node ai-team/audit/universal-audit.mjs
```

Profiles: `full`, `security`, `reliability`, `architecture`, `quality`.

Outputs:

- `audit-report.json` — machine-readable report.
- `audit-report.md` — human-readable priority report.
- `specialist-*.json` — category-specific evidence packs for later AI reviewers.

## GitHub Actions

Use **AI Team Universal Audit** and provide:

- target repository
- branch/tag/commit
- audit profile
- optional focus
- severity gate

Public repositories and the current repository work with the normal GitHub token. Cross-repository private audits use `AUDIT_READ_TOKEN`; the existing `BHAROSA_READ_TOKEN` remains a fallback for Bharosa during migration.

## Design rule

Chat is for interaction. Audit Mode is for evidence-heavy work.

A long architecture/security audit must not depend on conversational memory, a single model request, or one reviewer. The scan produces a durable evidence artifact first; specialist/model interpretation is layered on top of that artifact and can be retried independently.
