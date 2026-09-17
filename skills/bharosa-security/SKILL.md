---
name: bharosa-security
description: Use for any Bharosa QR, public-profile, Firestore, parent-contact, privacy, abuse-prevention, authentication, admin, deployment-hardening, or security task.
---

# Bharosa Security Skill

Treat Bharosa as a child-safety system under active abuse pressure. Optimize for reunification while minimizing what an attacker learns from possession of the QR.

## Non-negotiable threat model

Assume a malicious person can photograph, copy, repeatedly scan, automate scans against, or share the child's QR. A public scan must not automatically reveal parent phone numbers, home address, private medical notes, internal profile IDs, admin-only data, or unrelated profiles.

## Required design rules

1. Prefer opaque, non-enumerable identifiers/tokens over sequential IDs.
2. Public pages disclose only the minimum information required to help return the child safely.
3. Parent contact should be mediated or relay-based where practical instead of directly publishing phone/address data.
4. Firestore is the persistent source of truth; local SQLite/cache state must never silently override authoritative data.
5. Admin and public routes are separate trust boundaries. Test IDOR/BOLA and direct-link access explicitly.
6. Rate-limit scan/contact flows and detect repeated abuse patterns without blocking legitimate emergency use.
7. Parent alerts and scan events must be idempotent, retry-safe, and should not leak sensitive data into logs.
8. Parent links/tokens must support rotation/revocation.
9. Fail closed on authorization/privacy uncertainty; fail gracefully on availability errors.
10. Never modify live child data during security testing unless explicitly authorized.

## Verification gates

Before calling a security change complete, test at minimum:

- valid public QR flow,
- copied/replayed QR behavior,
- malformed/expired/unknown token,
- direct profile URL guessing,
- unrelated profile access,
- unauthenticated admin access,
- public-page PII leakage,
- Firestore/backend transient failure,
- repeated scan/contact attempts,
- parent-alert retry/duplication behavior.

Use deterministic browser automation where possible. Prefer Playwright CLI for short coding-agent checks and Playwright MCP for persistent exploratory sessions.

## Output expectation

For every finding or proposed change state: threat, evidence, impact, exact remediation, regression test, and whether production data/state would be touched.
