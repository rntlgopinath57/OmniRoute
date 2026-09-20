# Relay UI Design Guardrails

These are local design rules distilled from external design-skill research. Relay does **not** depend on those projects at runtime.

## Functional invariants — never trade these for polish
- Prompt input remains visible, editable, and usable on phone and desktop.
- Model/provider nodes remain discoverable on narrow screens.
- Vertical and horizontal scrolling must remain usable; no decorative layer may trap touch/pointer input.
- Explicit model/provider selection must remain genuine. Do not make routing merely look switched.
- Automatic routing, fallbacks, reviewer behavior, repo access, health/media routes, and Cloudflare portability must remain intact.
- A green build is insufficient: verify the deployed, user-visible result.

## Visual hierarchy
- Make the primary action obvious without adding competing decoration.
- Prefer fewer, clearer surfaces over nested cards and generic dashboard chrome.
- Use consistent spacing, typography, radius, borders, and component states.
- Keep secondary metadata subordinate to the prompt, response, and routing state.
- Remove visual elements that do not communicate state, affordance, hierarchy, or feedback.

## Motion
- Motion must communicate state, causality, or spatial relationship; never animate merely to look impressive.
- Prefer CSS transitions/animations for simple UI feedback.
- Prefer transform and opacity for animated properties when practical.
- Respect `prefers-reduced-motion`.
- Hover-only affordances must not be required on touch devices.
- Avoid repeated/high-frequency motion on prompt entry, scrolling, streaming output, or model switching.
- Keep interaction feedback short and interruptible.

## Change protocol
1. Audit before redesigning.
2. Make the smallest reversible patch.
3. Do not introduce a hosted design service, API key, token quota, or experimental runtime dependency for styling.
4. Run Relay Safety Check and existing regression coverage.
5. Verify prompt input, nodes, scrolling, routing/model switching, fallbacks, reviewer behavior, and repo access.
6. Verify phone and desktop behavior against the deployed preview.
7. Release only after the project 8/8 gate is GREEN.

## External research status
- Taste Skill: useful design/audit concepts; experimental v2 stays out of Relay production/runtime.
- Emil Kowalski skills: useful restrained-motion and interaction-review principles; advisory only.
- Impeccable: useful deterministic design-audit concepts; advisory/tooling only.
