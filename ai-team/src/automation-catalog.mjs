import { defineProjectJob } from "./project-jobs.mjs";

const AUTOMATIONS = Object.freeze({
  "omniroute-readiness": Object.freeze({
    job: Object.freeze({
      id: "omniroute-readiness",
      project: "AI Team / OmniRoute",
      repository: "rntlgopinath57/OmniRoute",
      branch: "feature/ai-team-control-plane",
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
