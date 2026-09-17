import test from "node:test";
import assert from "node:assert/strict";

import { getProjectAutomation, listProjectAutomations } from "../src/automation-catalog.mjs";
import { evaluateAutomationEvidence, runReadOnlyAutomation } from "../src/automation-runner.mjs";

test("catalog exposes the read-only project automations", () => {
  assert.deepEqual(listProjectAutomations(), ["omniroute-readiness", "bharosa-readonly-baseline"]);

  const omniroute = getProjectAutomation("omniroute-readiness");
  assert.equal(omniroute.job.allowWrites, false);
  assert.equal(omniroute.job.repository, "rntlgopinath57/OmniRoute");
  assert.equal(omniroute.files.length, 3);

  const bharosa = getProjectAutomation("bharosa-readonly-baseline");
  assert.equal(bharosa.job.allowWrites, false);
  assert.equal(bharosa.job.repository, "rntlgopinath57/safeqr");
  assert.equal(bharosa.job.branch, "main");
  assert.equal(bharosa.files.length, 3);
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

test("Bharosa evidence evaluator requires reliability and privacy invariants", () => {
  const automation = getProjectAutomation("bharosa-readonly-baseline");
  const report = evaluateAutomationEvidence(automation, {
    "app.py":
      'from bharosa_loader import load_namespace\nfrom bharosa_route_patches import install_route_patches\napp = bharosa_runtime["app"]',
    "bharosa_route_patches.py":
      '@admin_required\nsecrets.token_urlsafe(32)\nruntime["commit_with_firestore"]()',
    "tests/test_bharosa_reliability.py":
      "test_firestore_write_failure_never_commits_sqlite_cache\n" +
      "test_liveness_stays_up_while_readiness_fails_closed\n" +
      "test_public_opaque_profile_works_but_numeric_profile_stays_private\n" +
      "test_regenerating_parent_access_deletes_old_firestore_record",
  });

  assert.equal(report.status, "pass");
  assert.ok(report.checks.every((check) => check.status === "pass"));
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
