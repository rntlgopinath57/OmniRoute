import test from "node:test";
import assert from "node:assert/strict";

import { getProjectAutomation, listProjectAutomations } from "../src/automation-catalog.mjs";
import { evaluateAutomationEvidence, runReadOnlyAutomation } from "../src/automation-runner.mjs";

test("catalog exposes the OmniRoute readiness automation", () => {
  assert.deepEqual(listProjectAutomations(), ["omniroute-readiness"]);
  const automation = getProjectAutomation("omniroute-readiness");
  assert.equal(automation.job.allowWrites, false);
  assert.equal(automation.job.repository, "rntlgopinath57/OmniRoute");
  assert.equal(automation.files.length, 3);
});

test("unknown automation ids are rejected", () => {
  assert.throws(() => getProjectAutomation("missing-job"), /Unknown project automation/);
});

test("evidence evaluator reports missing invariants", () => {
  const automation = getProjectAutomation("omniroute-readiness");
  const report = evaluateAutomationEvidence(automation, {
    "ai-team/README.md": "## Build order\n10. Project automations",
    ".github/workflows/ai-team-v0.yml": "permissions:\n  contents: read",
    ".github/workflows/ai-team-activation.yml": "contents: read\n/api/health",
  });

  assert.equal(report.status, "fail");
  assert.equal(report.checks[1].status, "fail");
  assert.deepEqual(report.checks[1].missing, ["node --test ai-team/tests/*.test.mjs"]);
  assert.deepEqual(report.checks[2].missing, ["Run bounded read-only project job"]);
});

test("read-only automation runs through planner, router, executor and reviewer", async () => {
  const automation = getProjectAutomation("omniroute-readiness", { branch: "test-branch" });
  const contents = {
    "ai-team/README.md": "## Build order\n10. Project automations",
    ".github/workflows/ai-team-v0.yml":
      "permissions:\n  contents: read\nrun: node --test ai-team/tests/*.test.mjs",
    ".github/workflows/ai-team-activation.yml":
      "permissions:\n  contents: read\nhttp://127.0.0.1:20128/api/health\n- name: Run bounded read-only project job",
  };

  const result = await runReadOnlyAutomation({
    automation,
    repositoryAdapter: {
      async readFile({ path, repository, branch }) {
        assert.equal(repository, "rntlgopinath57/OmniRoute");
        assert.equal(branch, "test-branch");
        return { path, content: contents[path] };
      },
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.writeApproved, false);
  assert.equal(result.report.status, "pass");
  assert.equal(result.route.primaryProvider, "openai");
  assert.equal(result.route.fallbackProvider, "anthropic");
  assert.deepEqual(result.reviewer, { provider: "anthropic", verdict: "PASS" });
});
