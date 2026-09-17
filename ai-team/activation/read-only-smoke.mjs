import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createOmniRouteClient } from "../src/omniroute-adapter.mjs";
import { runProjectJob } from "../src/project-jobs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPOSITORY = process.env.GITHUB_REPOSITORY || "rntlgopinath57/OmniRoute";
const BRANCH = process.env.GITHUB_REF_NAME || "feature/ai-team-control-plane";

const MODELS = Object.freeze({
  "coding-strong": "auto",
  "research-strong": "auto",
  "automation-efficient": "auto",
  "design-multimodal": "auto",
  "general-balanced": "auto",
  review: "auto",
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

const omniRouteClient = createOmniRouteClient({
  baseUrl: process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128",
  apiKey: process.env.OMNIROUTE_API_KEY,
  models: MODELS,
});

const providerClients = Object.freeze({
  openai: omniRouteClient,
  anthropic: omniRouteClient,
  google: omniRouteClient,
});

const reviewerClients = providerClients;

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
