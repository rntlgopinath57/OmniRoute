import { defineProjectJob } from "./project-jobs.mjs";

const AUTOMATIONS = Object.freeze({
  "omniroute-readiness": Object.freeze({
    job: Object.freeze({
      id: "omniroute-readiness",
      project: "AI Team / OmniRoute",
      repository: "rntlgopinath57/OmniRoute",
      branch: "release/v3.8.51",
      task: "Audit the AI Team control-plane readiness using repository evidence only.",
      allowWrites: false,
    }),
    files: Object.freeze([
      Object.freeze({
        path: "ai-team/README.md",
        requiredSnippets: Object.freeze(["## Build order", "10. Project automations"]),
      }),
      Object.freeze({
        path: ".github/workflows/ai-team-v0.yml",
        requiredSnippets: Object.freeze([
          "permissions:",
          "contents: read",
          "node --test ai-team/tests/*.test.mjs",
        ]),
      }),
      Object.freeze({
        path: ".github/workflows/ai-team-activation.yml",
        requiredSnippets: Object.freeze([
          "contents: read",
          "/api/health",
          "Run bounded read-only project job",
        ]),
      }),
    ]),
  }),
  "bharosa-readonly-baseline": Object.freeze({
    job: Object.freeze({
      id: "bharosa-readonly-baseline",
      project: "Bharosa",
      repository: "rntlgopinath57/safeqr",
      branch: "main",
      task: "Audit the Bharosa reliability and privacy baseline using repository evidence only.",
      allowWrites: false,
    }),
    files: Object.freeze([
      Object.freeze({
        path: "app.py",
        requiredSnippets: Object.freeze([
          "from bharosa_loader import load_namespace",
          "from bharosa_route_patches import install_route_patches",
          "app = bharosa_runtime[\"app\"]",
        ]),
      }),
      Object.freeze({
        path: "bharosa_route_patches.py",
        requiredSnippets: Object.freeze([
          "@admin_required",
          "secrets.token_urlsafe(32)",
          "runtime[\"commit_with_firestore\"]()",
        ]),
      }),
      Object.freeze({
        path: "tests/test_bharosa_reliability.py",
        requiredSnippets: Object.freeze([
          "test_firestore_write_failure_never_commits_sqlite_cache",
          "test_liveness_stays_up_while_readiness_fails_closed",
          "test_public_opaque_profile_works_but_numeric_profile_stays_private",
          "test_regenerating_parent_access_deletes_old_firestore_record",
        ]),
      }),
    ]),
  }),
});

function requireAutomationId(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("automation id must be a non-empty string");
  }
  return value.trim();
}

export function listProjectAutomations() {
  return Object.keys(AUTOMATIONS);
}

export function getProjectAutomation(id, { branch } = {}) {
  const automationId = requireAutomationId(id);
  const config = AUTOMATIONS[automationId];

  if (!config) {
    throw new Error(
      `Unknown project automation ${automationId}. Available: ${listProjectAutomations().join(", ")}`,
    );
  }

  const job = defineProjectJob({
    ...config.job,
    branch: typeof branch === "string" && branch.trim() ? branch.trim() : config.job.branch,
  });

  return Object.freeze({
    id: automationId,
    job,
    files: config.files.map((file) => ({
      path: file.path,
      requiredSnippets: [...file.requiredSnippets],
    })),
  });
}
