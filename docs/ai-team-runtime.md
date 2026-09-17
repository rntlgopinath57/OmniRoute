# AI Team Runtime v1

This layer turns OmniRoute from a model/provider router into a safer task-execution control plane without replacing its existing MCP/A2A routing.

## Design

```text
Task
  -> OmniRoute task/model router
  -> Skill resolver
  -> Policy gate
  -> Executor / workflow runtime
  -> Independent verifier
  -> Retry / repair when needed
  -> Result or preconfigured owner-only alert
```

### Components

| Component | Role | Current mode |
| --- | --- | --- |
| OmniRoute | Primary routing, provider fallback, MCP/A2A entry point | Existing |
| Google Skills | Firebase, Firestore, IAM, security, monitoring and Google-specific expertise | On-demand |
| Anthropic Skills | Skill patterns, MCP and workflow expertise | On-demand reference |
| OpenAI Plugins | Agent/developer workflow and verification patterns | On-demand reference |
| Google ADK | Nested graph workflow engine for multi-agent/retry/HITL jobs | Sandbox evaluation |
| Crawl4AI | Read-only web research and structured extraction | Sandbox-ready |
| Playwright MCP | Stateful browser verification and exploratory test loops | Sandbox-ready |
| Custom skills | Project-specific operating knowledge and verification contracts | Active in repo |

The external skill libraries are references and on-demand sources. They are not copied wholesale into model context.

## Why ADK is not replacing OmniRoute

OmniRoute already owns model/provider routing, fallback, MCP/A2A and API compatibility. ADK is introduced only where a task benefits from a deterministic graph with retries, state, fan-out/fan-in, or human gates. This avoids a risky rewrite and preserves the existing router.

## Capability routing

`config/ai-team/capability-registry.json` maps task classes to the preferred execution layer.

Initial lanes:

- **Research / repo discovery:** Crawl4AI -> verification-before-notify.
- **Persistent browser verification:** Playwright MCP -> verification-before-notify.
- **Complex multi-agent workflow:** OmniRoute -> ADK sandbox workflow -> verifier.
- **Google/Firebase work:** load the smallest relevant Google Skill on demand.
- **Bharosa security:** synthetic-only Playwright checks + Google/Firebase skills + Bharosa security skill.
- **Daily GitHub scout:** trusted-source discovery + license/cost check + independent verification.

## Safety gate

`config/ai-team/tool-policy.json` makes read-only the default.

Allowed without an additional gate includes authorized reads, static analysis, public research, synthetic tests, non-production branches/PRs, and owner-only alerts without sensitive data.

Production deploys, release merges, live database writes, secret/identity changes, persistent deletion, and third-party messaging require an explicit gate.

## Bharosa invariants

Bharosa is handled as a high-sensitivity project:

- automated testing uses synthetic data only;
- a public QR scan must not reveal parent phone, home address, medical notes, or unrelated profile data;
- public tokens must be opaque/non-enumerable;
- contact should be mediated through Bharosa;
- scan alerts need abuse controls/deduplication;
- uncertain backend/auth state fails closed;
- no PII in logs/test artifacts;
- no live Firestore mutation without an explicit gate.

These invariants are enforced by the config validator and the `bharosa-security-audit` skill.

## Verification-first automation

The custom `verification-before-notify` skill exists because a green workflow is not the same as a correct result. Scheduled jobs must verify schedule trigger, expected output, freshness, and delivery conditions before reporting success.

This directly targets failure modes such as:

- a scraper run succeeds but returns an empty YouTube section;
- a workflow completes but the expected Telegram alert is missing;
- stale/cached data is reported as current;
- a browser health check sees HTTP 200 while the actual page is broken.

## CI enforcement

`.github/workflows/ai-team-config.yml` runs `scripts/check/validate-ai-team-config.mjs` whenever this control layer changes. The validator checks:

- unique skill/capability IDs;
- on-demand loading for external skill libraries;
- read-only/sandbox/synthetic execution modes only;
- mandatory verification for every capability;
- explicit production/live-write gates;
- Bharosa synthetic-only and mediated-contact rules;
- required prohibitions on public PII disclosure;
- accidental secret-like keys in these configs.

## Next activation stages

1. **Now:** merge the policy/registry/custom skills only after CI is green.
2. **Sandbox:** add a minimal Crawl4AI research worker and Playwright verifier behind these policies.
3. **Evaluation:** run one ADK graph for repo research -> verification -> report and compare it with native OmniRoute orchestration.
4. **Bharosa lab:** execute only synthetic public/admin/QR abuse tests; keep live Firestore and production deployment untouched.
5. **Promote selectively:** only components that measurably improve reliability, cost, or quality become default.

## Component rule

Do not add a framework because it is interesting. A component earns a permanent place only when it:

1. solves a concrete existing task;
2. is free/self-hostable or has an explicitly accepted cost;
3. passes security/license review;
4. improves a measurable outcome;
5. can be removed without breaking unrelated workflows.
