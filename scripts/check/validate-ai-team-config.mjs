import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label}: duplicate id "${value}"`);
    seen.add(value);
  }
}

function walkForSecrets(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForSecrets(item, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;

  const secretKey = /(api.?key|access.?token|refresh.?token|password|secret|private.?key|credential)/i;
  for (const [key, child] of Object.entries(value)) {
    assert(!secretKey.test(key), `secret-like key is forbidden in config: ${[...trail, key].join(".")}`);
    walkForSecrets(child, [...trail, key]);
  }
}

const skillSources = readJson("config/ai-team/skill-sources.json");
const registry = readJson("config/ai-team/capability-registry.json");
const policy = readJson("config/ai-team/tool-policy.json");

assert(skillSources.version === 1, "skill-sources.json: unsupported version");
assert(registry.version === 1, "capability-registry.json: unsupported version");
assert(policy.version === 1, "tool-policy.json: unsupported version");

assert(Array.isArray(skillSources.sources) && skillSources.sources.length > 0, "skill-sources.json: sources must be non-empty");
unique(skillSources.sources.map((source) => source.id), "skill-sources.json");

for (const source of skillSources.sources) {
  assert(source.trust === "official" || source.trust === "project", `${source.id}: trust must be official or project`);
  assert(source.load === "on_demand", `${source.id}: external skill libraries must load on demand`);
  assert(Array.isArray(source.domains) && source.domains.length > 0, `${source.id}: domains must be non-empty`);
  if (source.type === "external_skill_library") {
    assert(/^https:\/\/github\.com\//.test(source.upstream), `${source.id}: upstream must be a GitHub HTTPS URL`);
    assert(/^https:\/\/github\.com\/rntlgopinath57\//.test(source.mirror), `${source.id}: mirror must be under the authorized user account`);
  }
}

assert(Array.isArray(registry.capabilities) && registry.capabilities.length > 0, "capability-registry.json: capabilities must be non-empty");
unique(registry.capabilities.map((capability) => capability.id), "capability-registry.json");

const validModes = new Set(["read_only", "sandbox_only", "synthetic_only"]);
const validStatuses = new Set(["evaluation", "ready_for_sandbox", "ready"]);

for (const capability of registry.capabilities) {
  assert(validModes.has(capability.mode), `${capability.id}: invalid mode "${capability.mode}"`);
  assert(validStatuses.has(capability.status), `${capability.id}: invalid status "${capability.status}"`);
  assert(Array.isArray(capability.taskClasses) && capability.taskClasses.length > 0, `${capability.id}: taskClasses must be non-empty`);
  assert(capability.verification?.required === true, `${capability.id}: verification is mandatory`);
  assert(typeof capability.verification?.strategy === "string" && capability.verification.strategy.length > 0, `${capability.id}: verification strategy is required`);
}

const bharosa = registry.capabilities.find((capability) => capability.id === "bharosa.security-audit");
assert(bharosa, "bharosa.security-audit capability is required");
assert(bharosa.mode === "synthetic_only", "bharosa.security-audit must remain synthetic_only");

assert(policy.defaultMode === "read_only", "tool-policy.json: defaultMode must be read_only");
assert(Array.isArray(policy.requireExplicitGate) && policy.requireExplicitGate.includes("production_deploy"), "tool-policy.json: production_deploy must require an explicit gate");
assert(policy.requireExplicitGate.includes("live_database_write"), "tool-policy.json: live_database_write must require an explicit gate");

const bharosaPolicy = policy.projects?.bharosa;
assert(bharosaPolicy?.automationDataPolicy === "synthetic_only", "Bharosa automated tests must use synthetic data");
assert(bharosaPolicy?.mediatedContactRequired === true, "Bharosa must require mediated contact");
for (const forbidden of [
  "parent_phone_disclosure_on_public_scan",
  "home_address_disclosure_on_public_scan",
  "medical_notes_disclosure_on_public_scan",
  "real_child_data_in_automated_tests",
]) {
  assert(bharosaPolicy.forbid?.includes(forbidden), `Bharosa policy missing required prohibition: ${forbidden}`);
}

walkForSecrets(skillSources);
walkForSecrets(registry);
walkForSecrets(policy);

console.log("AI Team config guard: PASS");
console.log(`  skill sources: ${skillSources.sources.length}`);
console.log(`  capabilities: ${registry.capabilities.length}`);
console.log("  Bharosa: synthetic-only security testing + mediated contact enforced");
