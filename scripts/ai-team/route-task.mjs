import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const registry = readJson("config/ai-team/capability-registry.json");
const policy = readJson("config/ai-team/tool-policy.json");

const statusRank = new Map([
  ["ready", 0],
  ["ready_for_sandbox", 1],
  ["evaluation", 2],
]);

export function resolveTask(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("task input must be an object");
  }

  const { taskClass, requestedAction = "static_analysis", project = null } = input;
  if (!taskClass || typeof taskClass !== "string") {
    throw new TypeError("taskClass is required");
  }

  const matches = registry.capabilities
    .filter((capability) => capability.taskClasses.includes(taskClass))
    .sort((a, b) => (statusRank.get(a.status) ?? 99) - (statusRank.get(b.status) ?? 99));

  if (matches.length === 0) {
    throw new Error(`no registered capability for taskClass "${taskClass}"`);
  }

  const capability = matches[0];
  let actionDecision = "DENY_UNKNOWN_ACTION";

  if (policy.requireExplicitGate.includes(requestedAction)) {
    actionDecision = "REQUIRES_EXPLICIT_GATE";
  } else if (policy.allowedWithoutExtraGate.includes(requestedAction)) {
    actionDecision = "ALLOW";
  }

  if (project === "bharosa") {
    const bharosa = policy.projects?.bharosa;
    if (!bharosa) throw new Error("Bharosa policy is missing");

    if (capability.id === "bharosa.security-audit" && capability.mode !== "synthetic_only") {
      throw new Error("Bharosa security capability escaped synthetic_only mode");
    }

    if (
      requestedAction === "synthetic_browser_test" &&
      capability.id !== "bharosa.security-audit"
    ) {
      throw new Error("Bharosa synthetic browser tests must use bharosa.security-audit");
    }
  }

  return {
    taskClass,
    project,
    requestedAction,
    actionDecision,
    capability: {
      id: capability.id,
      executor: capability.executor,
      mode: capability.mode,
      status: capability.status,
      skills: capability.skills,
      verification: capability.verification,
    },
    mustVerify: capability.verification?.required === true,
    canExecuteWithoutExtraGate: actionDecision === "ALLOW",
  };
}

function parseCliInput(argv) {
  const raw = argv[2];
  if (!raw) {
    throw new Error(
      'usage: node scripts/ai-team/route-task.mjs \'{"taskClass":"repo_discovery","requestedAction":"public_web_research"}\'',
    );
  }
  return JSON.parse(raw);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCli) {
  try {
    const result = resolveTask(parseCliInput(process.argv));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.canExecuteWithoutExtraGate) process.exitCode = 2;
  } catch (error) {
    console.error(`AI Team route error: ${error.message}`);
    process.exitCode = 1;
  }
}
