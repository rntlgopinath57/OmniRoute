import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createOmniRouteClient } from "../src/omniroute-adapter.mjs";
import { runProjectJob } from "../src/project-jobs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPOSITORY = process.env.GITHUB_REPOSITORY || "rntlgopinath57/OmniRoute";
const BRANCH = process.env.GITHUB_REF_NAME || "feature/ai-team-control-plane";
const LIVE_INFERENCE = process.env.AI_TEAM_LIVE_INFERENCE === "true";

const MODELS = Object.freeze({
  "coding-strong": "pollinations/openai",
  "research-strong": "pollinations/openai",
  "automation-efficient": "pollinations/openai-fast",
  "design-multimodal": "pollinations/openai",
  "general-balanced": "pollinations/openai",
  review: "pollinations/mistral",
});

function resolveRepositoryPath(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw new TypeError("path must be a non-empty string");
  }

  const absolutePath = resolve(ROOT, path.trim());
  const relativePath = relative(ROOT, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("repository path must stay inside the checked-out repository");
  }

  return absolutePath;
}

function inspectBuildOrder(text) {
  const numberedSteps = [...text.matchAll(/^\s*(\d+)\.\s+(.+)$/gm)];
  const sequential = numberedSteps.every((match, index) => Number(match[1]) === index + 1);
  const step10 = numberedSteps[9]?.[2]?.trim().replace(/\.$/, "") ?? "";

  return {
    count: numberedSteps.length,
    sequential,
    step10,
    valid: numberedSteps.length === 10 && sequential && step10 === "Project automations",
  };
}

const repositoryAdapter = Object.freeze({
  async readFile({ path }) {
    return {
      path,
      content: await readFile(resolveRepositoryPath(path), "utf8"),
    };
  },
});

const plannerClient = Object.freeze({
  async plan({ repositoryTools }) {
    const readResult = await repositoryTools.run("readFile", {
      path: "ai-team/README.md",
    });

    return {
      steps: [
        {
          type: "research",
          task:
            "Using only the repository context below, state whether the Build order contains exactly 10 numbered steps and whether step 10 is Project automations. Return one concise factual sentence.\n\n" +
            readResult.result.content,
        },
      ],
    };
  },
});

const deterministicExecutor = Object.freeze({
  async generate({ task }) {
    const check = inspectBuildOrder(task);
    return {
      output: check.valid
        ? "The Build order contains exactly 10 numbered steps, and step 10 is Project automations."
        : `Build order verification failed: count=${check.count}, sequential=${check.sequential}, step10=${JSON.stringify(check.step10)}.`,
    };
  },
});

const deterministicReviewer = Object.freeze({
  async review({ task, output }) {
    const check = inspectBuildOrder(task);
    const outputMatches =
      /exactly 10 numbered steps/i.test(output) && /step 10 is Project automations/i.test(output);
    return { verdict: check.valid && outputMatches ? "PASS" : "FAIL" };
  },
});

const omniRouteClient = createOmniRouteClient({
  baseUrl: process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128",
  apiKey: process.env.OMNIROUTE_API_KEY,
  models: MODELS,
});

const providerClients = LIVE_INFERENCE
  ? Object.freeze({ openai: omniRouteClient, anthropic: omniRouteClient, google: omniRouteClient })
  : Object.freeze({ openai: deterministicExecutor });

const reviewerClients = LIVE_INFERENCE
  ? providerClients
  : Object.freeze({ google: deterministicReviewer });

const result = await runProjectJob({
  job: {
    id: "omniroute-read-only-activation",
    project: "AI Team activation",
    repository: REPOSITORY,
    branch: BRANCH,
    task: "Read the AI Team README and verify the documented 10-step build order.",
    allowWrites: false,
  },
  plannerClient,
  providerClients,
  reviewerClients,
  repositoryAdapter,
  writeApproved: false,
});

if (result.status !== "success" || result.writeApproved !== false) {
  throw new Error(`Read-only activation failed with status ${result.status}`);
}

const firstStep = result.result.results?.[0];
console.log(
  JSON.stringify(
    {
      status: result.status,
      executionMode: LIVE_INFERENCE ? "live-inference" : "deterministic-ci",
      jobId: result.jobId,
      repository: result.repository,
      branch: result.branch,
      writeApproved: result.writeApproved,
      provider: firstStep?.execution?.provider ?? null,
      modelProfile: firstStep?.execution?.modelProfile ?? null,
      output: firstStep?.execution?.output ?? null,
      reviewer: firstStep?.review ?? null,
    },
    null,
    2,
  ),
);
