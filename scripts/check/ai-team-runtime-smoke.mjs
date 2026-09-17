import assert from "node:assert/strict";
import { resolveTask } from "../ai-team/route-task.mjs";

const repoResearch = resolveTask({
  taskClass: "repo_discovery",
  requestedAction: "public_web_research",
});
assert.equal(repoResearch.capability.id, "research.web");
assert.equal(repoResearch.capability.executor, "crawl4ai");
assert.equal(repoResearch.actionDecision, "ALLOW");
assert.equal(repoResearch.mustVerify, true);

const firestore = resolveTask({
  taskClass: "firestore",
  requestedAction: "static_analysis",
});
assert.equal(firestore.capability.id, "skills.resolve.google");
assert.equal(firestore.capability.skills.includes("google-skills"), true);
assert.equal(firestore.actionDecision, "ALLOW");

const bharosaSynthetic = resolveTask({
  taskClass: "bharosa",
  project: "bharosa",
  requestedAction: "synthetic_browser_test",
});
assert.equal(bharosaSynthetic.capability.id, "bharosa.security-audit");
assert.equal(bharosaSynthetic.capability.mode, "synthetic_only");
assert.equal(bharosaSynthetic.actionDecision, "ALLOW");

const bharosaLiveWrite = resolveTask({
  taskClass: "bharosa",
  project: "bharosa",
  requestedAction: "live_database_write",
});
assert.equal(bharosaLiveWrite.actionDecision, "REQUIRES_EXPLICIT_GATE");
assert.equal(bharosaLiveWrite.canExecuteWithoutExtraGate, false);

const multiAgent = resolveTask({
  taskClass: "multi_agent",
  requestedAction: "static_analysis",
});
assert.equal(multiAgent.capability.id, "agent.orchestrate");
assert.equal(multiAgent.capability.mode, "sandbox_only");

const unknownAction = resolveTask({
  taskClass: "research",
  requestedAction: "invented_mutation",
});
assert.equal(unknownAction.actionDecision, "DENY_UNKNOWN_ACTION");
assert.equal(unknownAction.canExecuteWithoutExtraGate, false);

assert.throws(
  () => resolveTask({ taskClass: "not_registered", requestedAction: "static_analysis" }),
  /no registered capability/,
);

console.log("AI Team runtime smoke: PASS");
console.log("  repo discovery -> Crawl4AI + verification");
console.log("  Firestore -> Google skill resolver");
console.log("  Bharosa -> synthetic-only Playwright security lane");
console.log("  live database write -> explicit gate");
console.log("  multi-agent -> ADK sandbox");
