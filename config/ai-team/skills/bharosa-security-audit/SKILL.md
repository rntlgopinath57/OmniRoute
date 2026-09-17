---
name: bharosa-security-audit
description: Audit Bharosa QR child-safety flows for privacy, abuse resistance, authorization, Firestore security, and reliability. Use this skill whenever work touches Bharosa public QR scans, child profiles, parent contact, admin access, Firestore rules, scan alerts, profile links, rate limiting, abuse prevention, or release hardening. Treat a malicious person who photographs or repeatedly scans a child's QR as a primary threat.
---

# Bharosa Security Audit

Protect the child and family first. A public QR scan is an untrusted event, not proof of good intent.

## Non-negotiable rules

- Use synthetic profiles for automated testing. Do not enumerate, crawl, or mutate real child profiles.
- Never expose a parent's phone number, home address, medical notes, private photo metadata, or other family PII merely because a QR was scanned.
- Prefer opaque, high-entropy public tokens over sequential or guessable identifiers.
- Prefer mediated contact: the scanner sends a message/location to the parent through Bharosa without receiving the parent's private contact details.
- Fail closed when authentication, authorization, Firestore, or backend state is uncertain.
- Do not place PII or secrets in logs, screenshots, test artifacts, URLs, or error pages.
- Do not change production secrets, Firestore data, permissions, or deployment state without an explicit production gate.

## Audit sequence

1. **Public disclosure**
   - Scan the synthetic QR as an unauthenticated stranger.
   - Record exactly what data is returned before any trust step.
   - Fail the audit if parent contact, home address, medical notes, unrelated profile data, or internal IDs are disclosed.

2. **Token and IDOR/BOLA resistance**
   - Verify public identifiers are opaque and impractical to enumerate.
   - Try only synthetic neighboring/malformed tokens; never enumerate production.
   - Verify an authenticated parent/admin cannot access another profile solely by changing an identifier.

3. **Mediated contact**
   - Verify the scanner can request help without learning private parent contact information.
   - Verify messages/locations are attributable enough for abuse handling without collecting unnecessary scanner data.
   - Verify parent alerts are throttled/deduplicated so repeated scans cannot become harassment.

4. **Authorization**
   - Separate public, parent, and admin capabilities.
   - Verify parent/admin actions require server-side authorization, not hidden UI controls.
   - Verify preview/debug parameters do not bypass authorization.

5. **Firestore and persistence**
   - Use the relevant Google/Firebase/Firestore skill when available.
   - Verify Firestore is the source of truth and any local cache is disposable.
   - Review rules and server access paths for least privilege.
   - Verify transient failures do not fall back to stale or broader data disclosure.

6. **Reliability and recovery**
   - Test malformed requests, cold start, backend timeout, missing profile, revoked link, repeated scan, and dependency failure with synthetic data.
   - Confirm errors reveal no PII and produce a safe recovery path.

7. **Evidence**
   - For every finding capture: severity, exact behavior, evidence, impact, reproduction using synthetic data, and remediation.
   - Mark anything not exercised as **Not Verified**. Do not convert assumptions into pass results.

## Required release verdict

A Bharosa security check is not successful until an independent verification step confirms:

- public QR scans disclose only the explicitly approved minimal data;
- unrelated profiles cannot be discovered;
- parent/admin boundaries hold;
- repeated scans cannot trivially spam or expose the family;
- failure paths remain private and fail closed.

Do not send a "passed" or "safe" notification when any required control is unverified.
