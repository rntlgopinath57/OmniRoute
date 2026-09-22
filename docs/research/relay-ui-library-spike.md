# UI library spike — Kokonut / Bklit / Anime.js

## Purpose
Evaluate the reel candidates without changing Relay production behavior.

## Baseline verified
- React 19.2.8
- Tailwind 4.3.0
- @xyflow/react 12.11.5 already powers shared flow canvases
- recharts 3.8.1 already provides charting
- Relay AI Team playground already has real provider-node state, handoff animation, scrolling, prompt input, reviewer flow, and provider switching UI

## Adoption gate
1. **Kokonut UI:** copy/adapt only a component that improves an existing interaction. Do not add a framework-wide dependency or replace Relay controls.
2. **Bklit UI:** do not install yet. First prove a required visualization cannot be implemented safely with the existing Recharts dependency.
3. **Anime.js:** do not install yet. Existing CSS/JS handoff animation is functional; only add Anime.js for an effect with a measurable UX benefit that cannot be achieved with the current stack.
4. **Manus:** reference only; no runtime dependency.

## Regression guardrails
Any accepted UI change must preserve and re-test:
- prompt input and follow-up input
- genuine provider/model switching
- router and fallback behavior
- provider/node visibility
- handoff visibility
- scrolling
- GitHub/repo access
- independent reviewer behavior
- image/video tools already present
- mobile layout

## Spike result
The smallest safe trial is **zero new runtime dependencies**. The current stack already covers the capabilities shown by Bklit and Anime.js. Kokonut remains a component-pattern source, to be selectively adapted rather than installed wholesale.

This branch intentionally contains documentation only. Production code and lockfiles are untouched.
