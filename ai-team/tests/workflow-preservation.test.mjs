import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const required = [
  ".github/workflows/ai-team-activation.yml",
  ".github/workflows/ai-team-bharosa-controlled.yml",
  ".github/workflows/ai-team-project-automation.yml",
  ".github/workflows/ai-team-universal-audit.yml",
  ".github/workflows/ai-team-v0.yml",
  ".github/workflows/ai-team-cbm-impact.yml",
];

function read(path) {
  return readFileSync(path, "utf8");
}

test("AI Team custom workflow files cannot disappear silently", () => {
  for (const path of required) {
    assert.equal(existsSync(path), true, `missing custom workflow: ${path}`);
  }
});

test("AI Team core keeps automatic regression triggers and manual fallback", () => {
  const text = read(".github/workflows/ai-team-v0.yml");
  assert.match(text, /pull_request:/);
  assert.match(text, /push:/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /node --test ai-team\/tests\/\*\.test\.mjs/);
});

test("read-only activation preserves the verified health readiness path", () => {
  const text = read(".github/workflows/ai-team-activation.yml");
  assert.match(text, /\/api\/health/);
  assert.doesNotMatch(text, /\/v1\/models/);
  assert.match(text, /REQUIRE_API_KEY: "false"/);
  assert.match(text, /omniroute@3\.8\.50/);
  assert.match(text, /persist-credentials: false/);
});

test("project automation remains read-only and path-scoped", () => {
  const text = read(".github/workflows/ai-team-project-automation.yml");
  assert.match(text, /omniroute-readiness/);
  assert.match(text, /ai-team\/automation\/\*\*/);
  assert.match(text, /contents: read/);
});

test("universal audit keeps both self-test and manual target audit", () => {
  const text = read(".github/workflows/ai-team-universal-audit.yml");
  assert.match(text, /audit-self-test:/);
  assert.match(text, /audit-target:/);
  assert.match(text, /github\.event_name == 'workflow_dispatch'/);
  assert.match(text, /universal-audit\.test\.mjs/);
  assert.match(text, /provider-independent evidence scan/);
});

test("Bharosa controlled audit remains credential-gated and read-only", () => {
  const text = read(".github/workflows/ai-team-bharosa-controlled.yml");
  assert.match(text, /BHAROSA_READ_TOKEN/);
  assert.match(text, /persist-credentials: false/);
  assert.match(text, /bharosa-readonly-baseline/);
});


test("CBM impact gate stays read-only, pinned, and routing-scoped", () => {
  const text = read(".github/workflows/ai-team-cbm-impact.yml");
  assert.match(text, /contents: read/);
  assert.match(text, /codebase-memory-mcp==0\.11\.0/);
  assert.match(text, /persist-credentials: false/);
  assert.match(text, /detectNamedAgentRoute/);
  assert.match(text, /resolveWorkerModel/);
  assert.match(text, /resolveReviewerModels/);
  assert.doesNotMatch(text, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_TOKEN/);
});
