import { runProjectJob } from "./project-jobs.mjs";

function requireAutomation(automation) {
  if (!automation || typeof automation !== "object" || Array.isArray(automation)) {
    throw new TypeError("automation must be an object");
  }
  if (!automation.job || !Array.isArray(automation.files) || automation.files.length === 0) {
    throw new TypeError("automation requires a job and at least one evidence file");
  }
  return automation;
}

export function evaluateAutomationEvidence(automation, evidence) {
  const config = requireAutomation(automation);
  const checks = [];

  for (const file of config.files) {
    const content = evidence?.[file.path];
    const missing = [];

    if (typeof content !== "string") {
      missing.push("<file unavailable>");
    } else {
      for (const snippet of file.requiredSnippets) {
        if (!content.includes(snippet)) {
          missing.push(snippet);
        }
      }
    }

    checks.push({
      path: file.path,
      status: missing.length === 0 ? "pass" : "fail",
      missing,
    });
  }

  const passed = checks.every((check) => check.status === "pass");
  return {
    status: passed ? "pass" : "fail",
    automationId: config.id,
    checks,
  };
}

export async function runReadOnlyAutomation({ automation, repositoryAdapter }) {
  const config = requireAutomation(automation);
  let evidence = null;

  const plannerClient = Object.freeze({
    async plan({ repositoryTools }) {
      evidence = {};

      for (const file of config.files) {
        const readResult = await repositoryTools.run("readFile", { path: file.path });
        evidence[file.path] = readResult.result.content;
      }

      return {
        steps: [
          {
            type: "automation",
            task: `Evaluate the read-only repository evidence for automation ${config.id}.`,
          },
        ],
      };
    },
  });

  const deterministicExecutor = Object.freeze({
    async generate() {
      const report = evaluateAutomationEvidence(config, evidence);
      return { output: JSON.stringify(report) };
    },
  });

  const deterministicReviewer = Object.freeze({
    async review({ output }) {
      try {
        const report = JSON.parse(output);
        return { verdict: report.status === "pass" ? "PASS" : "FAIL" };
      } catch {
        return { verdict: "FAIL" };
      }
    },
  });

  const result = await runProjectJob({
    job: config.job,
    plannerClient,
    providerClients: { openai: deterministicExecutor },
    reviewerClients: { anthropic: deterministicReviewer },
    repositoryAdapter,
    writeApproved: false,
  });

  const firstStep = result.result.results?.[0] ?? null;
  let report = null;
  try {
    report = firstStep?.execution?.output ? JSON.parse(firstStep.execution.output) : null;
  } catch {
    report = null;
  }

  return {
    status: result.status,
    automationId: config.id,
    project: result.project,
    repository: result.repository,
    branch: result.branch,
    writeApproved: result.writeApproved,
    route: firstStep?.route ?? null,
    reviewer: firstStep?.review ?? null,
    report,
  };
}
