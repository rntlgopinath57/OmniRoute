import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectAutomation, listProjectAutomations } from "../src/automation-catalog.mjs";
import { runReadOnlyAutomation } from "../src/automation-runner.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET_ROOT = process.env.AI_TEAM_TARGET_ROOT
  ? resolve(ROOT, process.env.AI_TEAM_TARGET_ROOT)
  : ROOT;
const targetRootRelative = relative(ROOT, TARGET_ROOT);

if (targetRootRelative.startsWith("..") || isAbsolute(targetRootRelative)) {
  throw new Error("AI_TEAM_TARGET_ROOT must stay inside the checked-out workspace");
}

function resolveRepositoryPath(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw new TypeError("path must be a non-empty string");
  }

  const absolutePath = resolve(TARGET_ROOT, path.trim());
  const relativePath = relative(TARGET_ROOT, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("repository path must stay inside the selected target repository");
  }

  return absolutePath;
}

const automationId = process.argv[2] || "omniroute-readiness";
const branch = process.env.AI_TEAM_TARGET_BRANCH || process.env.GITHUB_REF_NAME;
const automation = getProjectAutomation(automationId, { branch });

const repositoryAdapter = Object.freeze({
  async readFile({ path }) {
    return {
      path,
      content: await readFile(resolveRepositoryPath(path), "utf8"),
    };
  },
});

const result = await runReadOnlyAutomation({ automation, repositoryAdapter });

console.log(
  JSON.stringify(
    {
      ...result,
      targetRoot: relative(ROOT, TARGET_ROOT) || ".",
      availableAutomations: listProjectAutomations(),
    },
    null,
    2,
  ),
);

if (result.status !== "success" || result.writeApproved !== false || result.report?.status !== "pass") {
  process.exitCode = 1;
}
