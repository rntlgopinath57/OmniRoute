# Relay / AI Team — Symphony-derived guardrails

Reference: openai/symphony (Apache-2.0), used as an architecture reference only.

Relay does **not** depend on the Symphony runtime or Codex app-server. These invariants adapt the useful orchestration ideas without changing Relay's provider architecture.

## Invariants

1. **One authoritative route per run.** Planner emits intent; the runtime records the model that actually answered. UI must display the actual selected model, not merely the requested model.
2. **Explicit provider intent wins.** If a prompt names exactly one supported provider/model family, route to that family when configured. If unavailable, fallback must be surfaced as a fallback rather than visually pretending the requested provider ran.
3. **Independent review.** Reviewer must use a different provider family from the worker when possible. If unavailable, report review as skipped; never fake validation.
4. **Bounded fallback.** Provider failures use a finite candidate list and cooldowns. Do not blindly retry a provider already confirmed rate-limited, quota-limited, or timed out.
5. **Preserve user-visible state.** Prompt input, conversation scrolling, node visibility, presentation formats, and run trace are regression surfaces for every routing change.
6. **Evidence before completion.** A successful deploy/workflow is insufficient. Verify the delivered UI/API behavior.
7. **Reversible changes.** Routing experiments are made on an isolated branch first. Preserve the known-good Cloudflare Relay branch and revert if regression checks fail.
8. **Dependency gate.** New runtime dependencies must be checked for license, self-hostability, quotas, required paid services, maintenance, and fallback before adoption.

## Required regression scenarios

- Prompt explicitly mentioning Gemini -> requested Gemini family; actual provider shown truthfully.
- Prompt explicitly mentioning DeepSeek -> requested DeepSeek/OpenRouter family; actual provider shown truthfully.
- Routine prompt -> task router may choose Groq, but UI must show Groq only if Groq actually answered.
- Groq unavailable/quota failure -> finite fallback; failed Groq attempt must not be shown as successful.
- Worker/reviewer provider families differ when an independent reviewer is available.
- No reviewer provider -> answer remains available and review is explicitly SKIPPED.
- Ask Relay prompt bar visible and usable before and after a run.
- Conversation panel scrolls to newest message and remains manually scrollable.
- Provider/agent nodes remain visible and active state follows emitted runtime events.
- Handwritten and other presentation modes remain bounded/scrollable and do not hide the follow-up input.

## Symphony adoption boundary

Symphony remains a reference pattern. Do not install its Elixir runtime or require Codex authentication in Relay unless a later dependency review explicitly approves it.
