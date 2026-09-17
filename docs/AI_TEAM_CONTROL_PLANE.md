# AI Team Control Plane

This layer turns OmniRoute from only a model/provider gateway into the routing backbone for a reusable AI team.

## Design

```text
Task
  -> Task classifier
  -> Specialist route
  -> Skill source(s)
  -> Tool choice
  -> Execution
  -> Verification gates
  -> Result / alert / retry
```

## Principles

- Prefer official or battle-tested free/self-hosted tooling.
- Load specialist skills only when relevant; do not stuff all skills into every prompt.
- Prefer Playwright CLI for coding-agent browser work; use Playwright MCP for persistent exploratory browser sessions.
- Prefer Crawl4AI for structured research and deep crawling.
- Use Google ADK patterns for graph workflows, retries, delegation, state, and human approval.
- Treat Bharosa security/privacy mutations as high-risk and require approval before mutation.
- Every route has an explicit verification stage. A task is not complete because the first tool call succeeded.

## Current source registry

See `config/ai-team/skill-sources.json`.

The registry tracks:

- Google Skills
- Anthropic Skills
- OpenAI Plugins
- Google ADK
- Crawl4AI
- Microsoft Playwright MCP
- Microsoft Playwright CLI

## Current routes

See `config/ai-team/task-routing.json`.

Initial routes are:

1. `bharosa-security`
2. `web-research`
3. `coding`
4. `multi-agent`
5. `monitoring-alerts`

## Verification

Run:

```bash
node scripts/ai-team/doctor.mjs
```

The doctor fails if a route points to an unknown source and warns when high-risk tasks have weak safety or verification controls.

CI runs the same check on every relevant pull request/push.

## Integration order

### Phase 1 - Control plane (this change)

Registry, routing policy, safety gates, CI validation.

### Phase 2 - Research worker

Use Crawl4AI behind a narrow adapter for repo scouting, public-web research, Fabric Watch discovery, and structured extraction. Keep site-specific automation isolated from the router.

### Phase 3 - Browser verification worker

Use Playwright CLI for short deterministic coding-agent checks and Playwright MCP only for stateful exploratory loops. First production use case: Bharosa Reliability Lab and public/admin privacy regression tests.

### Phase 4 - Multi-agent orchestration

Prototype a Google ADK worker as a sidecar/service instead of embedding Python into OmniRoute's Node runtime. OmniRoute remains the gateway and model router; ADK manages workflow graphs/delegation.

### Phase 5 - Custom project skills

Create reusable project-specific skills such as:

- `bharosa-security`
- `bharosa-release-check`
- `fabric-watch-recovery`
- `github-repo-evaluator`
- `alert-delivery-verifier`

These should encode the lessons and failure modes already learned in each project.

## Why sidecars instead of one giant application

OmniRoute is already a large Node/TypeScript gateway. Crawl4AI and Google ADK are Python-first, while Playwright can run independently. Keeping workers behind narrow interfaces avoids dependency collisions and lets each component be upgraded, restarted, sandboxed, or removed without destabilizing the gateway.

## Production rule

No new agent/tool is trusted merely because it is popular or official. It must pass:

1. license/cost review,
2. least-privilege configuration,
3. failure-path testing,
4. data/privacy review,
5. task-specific verification.
