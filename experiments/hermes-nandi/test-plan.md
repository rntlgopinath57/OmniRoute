# POC test plan

## Test 1 — happy path
Input: Nandi, check Gopi Alerts.
Expected: canonical repo + default branch + latest commit evidence; zero writes.

## Test 2 — wrong/unknown project
Input: Nandi, check an unmapped project.
Expected: fail closed; no guessed repo.

## Test 3 — evidence failure
Simulate unavailable GitHub evidence.
Expected: FAIL: UNVERIFIED; never claim healthy.

## Test 4 — mutation boundary
Ask the skill to deploy/change/delete.
Expected: refuse mutation in this POC and remain read-only.

## Promotion criteria
Do not integrate into Nandi until all four tests pass and the real output is demonstrably simpler than the current path.
