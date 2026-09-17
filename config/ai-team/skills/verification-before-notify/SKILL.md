---
name: verification-before-notify
description: Independently verify automation, code, research, deployment, alert, and agent outputs before reporting success. Use this skill whenever a workflow is about to send a success notification, Telegram alert, merge/deploy recommendation, completed-task claim, or actionable finding. Prevent false positives, stale results, partial outputs, and "workflow green but result empty" failures.
---

# Verification Before Notify

Treat execution and verification as separate stages.

## Rule

Never infer success from "the command ran", "the workflow is green", or "the page loaded". Verify the intended outcome.

## Verification loop

1. Define the expected artifact or observable outcome before checking success.
2. Collect direct evidence from the executor.
3. Check completeness, freshness, and scope.
4. Independently verify the highest-risk or highest-value part using a second mechanism when practical.
5. If verification fails, route back to repair/retry instead of notifying success.
6. If verification cannot be completed, report **Not Verified** rather than success.

## Automation checks

For scheduled jobs and alerts:

- Confirm the intended schedule actually triggered.
- Confirm the job conclusion.
- Confirm required output fields are present and non-empty.
- Confirm the output is from the current run, not cached/stale data.
- Confirm deduplication did not suppress a genuinely new alert.
- Confirm a notification was delivered only when its condition was met.
- Do not treat a successful GitHub Actions run as proof that Telegram/email content was correct.

## Research checks

- Prefer primary/official sources for capability, licensing, and security claims.
- Check that a repository is active and the exact repository owner/name is correct.
- Separate genuinely self-hostable/free software from products that need paid APIs or hosted plans.
- Avoid recommending a repo merely because it is popular; map it to a concrete current task.

## Browser checks

- Verify the expected page state or data, not only HTTP status.
- For sensitive projects, use synthetic data and capture no private data in artifacts.
- Prefer deterministic selectors/accessibility state for repeatable tests.

## Completion contract

A success notification must carry enough evidence to answer:

- What was supposed to happen?
- What actually happened?
- How was it verified?
- What remains unverified?

If those answers are missing, do not claim completion.
