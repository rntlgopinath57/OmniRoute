# Relay Core-First Integration Architecture

Purpose: prevent useful discoveries from turning Relay into overlapping tools and forgotten core functionality.

## Protected core
Every change must preserve and re-verify:
1. Ask/prompt conversation UI on desktop and phone.
2. Visible/discoverable execution nodes and run view.
3. Genuine explicit provider/model switching.
4. OmniRoute-style automatic routing and provider-aware selection.
5. FreeLLMAPI/keyless lane plus configured provider lanes.
6. Fallback, cooldown/circuit-breaker and quota-aware resilience.
7. Reviewer selection/fallback and bounded latency.
8. Repo/tool context, media routes, presentation routing, scrolling, security headers and Cloudflare portability.

A new capability is additive. It may not silently replace a protected core capability.

## Discovery registry states
Every repo, website, skill, API, model, video pattern or service is assigned exactly one state:
- **CORE** — already required for Relay.
- **FEATURE** — validated additive capability with a clear gap it fills.
- **KNOWLEDGE** — useful principles retained locally; no production dependency.
- **CANDIDATE** — interesting but not sufficiently verified.
- **REJECTED** — duplicate, unsafe, paid/limited without approval, unstable, or weaker than the current solution.
- **RETIRED** — previously used but intentionally superseded with rollback/history retained.

## Mandatory intake gate
Before integrating a discovery:
1. Identify the exact missing capability; no feature without a gap.
2. Search existing Relay code, owned repos and previously evaluated candidates for the same capability.
3. Verify upstream source, maintenance, license, cost, API keys, quotas, trial expiry, regional/account restrictions and external dependencies.
4. Compare alternatives and prefer one coherent implementation over overlapping installs.
5. Decide CORE / FEATURE / KNOWLEDGE / CANDIDATE / REJECTED.
6. Define rollback before code changes.
7. Make the smallest isolated/reversible patch.
8. Run the Relay Safety Check and Cloudflare preview gate.
9. Verify actual rendered desktop/mobile behavior and live routing where applicable.
10. Promote only when the existing core remains green.

## Current research consolidation
| Discovery | State | Use |
|---|---|---|
| OmniRoute routing/provider architecture | CORE | Routing, provider selection, resilience. |
| FreeLLMAPI | CORE lane | Keyless/free lane; must coexist with configured providers. |
| Cloudflare Relay runtime | CORE deployment path | Portable Worker deployment and preview verification. |
| Taste Skill v2 | KNOWLEDGE | Design audit concepts only while experimental; no runtime dependency. |
| Emil Kowalski design/motion skills | KNOWLEDGE | Motion/interaction principles; advisory. |
| Impeccable | KNOWLEDGE | Deterministic UI audit/craft principles; advisory. |
| Crawl4AI | CANDIDATE | Research/scraping capability only if a concrete Relay gap survives comparison. |
| Playwright MCP | CANDIDATE | Browser automation/testing only if existing browser smoke is insufficient. |
| Google ADK / Anthropic skills / Google skills / OpenAI plugins | CANDIDATE | Evaluate capability-by-capability; never wholesale-install as architecture replacements. |
| security-audit-skill | CANDIDATE/PROJECT TOOL | Security review; adoption must not alter Relay runtime. |

## Duplication rule
Do not add multiple packages/services that solve the same job merely because each is useful. Extract the best verified behavior into the existing architecture where practical. Keep external projects as references unless runtime dependency is necessary.

## Release evidence
A workflow being green is necessary but not sufficient. Release evidence must include the relevant static regression gate plus deployed behavior. If a feature affects routing, provider switching, nodes, composer, mobile layout, fallbacks or reviewer behavior, those paths must be exercised after the change.
