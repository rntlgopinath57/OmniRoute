import test from "node:test";
import assert from "node:assert/strict";

import { classifyTask, enforceTaskResult, executeTask, normalizeTask, validateTaskResult } from "../src/task.mjs";

test("normalizes a valid task with explicit type", () => {
  assert.deepEqual(normalizeTask({ task: "  Review Bharosa security  ", type: "ANALYSIS" }), {
    task: "Review Bharosa security",
    type: "analysis",
  });
});

test("classifies coding tasks", () => {
  assert.equal(classifyTask("Fix this Python bug"), "coding");
});

test("classifies research tasks", () => {
  assert.equal(classifyTask("Find useful GitHub repositories"), "research");
});

test("classifies automation tasks", () => {
  assert.equal(classifyTask("Create a workflow every morning"), "automation");
});

test("classifies design tasks", () => {
  assert.equal(classifyTask("Improve this website layout"), "design");
});

test("falls back to general", () => {
  assert.equal(classifyTask("Think about this idea"), "general");
});

test("uses classifier when type is missing", () => {
  assert.deepEqual(normalizeTask({ task: "Find useful repositories" }), {
    task: "Find useful repositories",
    type: "research",
  });
});

test("rejects an empty task", () => {
  assert.throws(() => normalizeTask({ task: "   " }), /non-empty task string/);
});

test("returns the legacy structured result when rollback switch is explicit", () => {
  const previous = process.env.OMNI_RELIABILITY_V1;
  process.env.OMNI_RELIABILITY_V1 = "0";
  assert.deepEqual(executeTask({ task: "Create a workflow every morning" }), {
    status: "success",
    task: "Create a workflow every morning",
    type: "automation",
    route: {
      primaryProvider: "openai",
      fallbackProvider: "anthropic",
      modelProfile: "automation-efficient",
    },
    result: "AI Team task received successfully",
  });
  if (previous === undefined) delete process.env.OMNI_RELIABILITY_V1;
  else process.env.OMNI_RELIABILITY_V1 = previous;
});


test("reliability gate is active by default with explicit rollback switch", () => {
  assert.deepEqual(validateTaskResult({ status: "success", route: { primaryProvider: "openai" } }, {}).mode, "reliability-v1");
  assert.deepEqual(validateTaskResult({ status: "broken" }, { OMNI_RELIABILITY_V1: "0" }), { ok: true, mode: "legacy" });
});

test("reliability gate validates routed result when feature flag is on", () => {
  const good = validateTaskResult({ status: "success", route: { primaryProvider: "openai" } }, { OMNI_RELIABILITY_V1: "1" });
  assert.deepEqual(good, { ok: true, mode: "reliability-v1", reason: "pass" });
  const bad = validateTaskResult({ status: "success", route: null }, { OMNI_RELIABILITY_V1: "1" });
  assert.deepEqual(bad, { ok: false, mode: "reliability-v1", reason: "route_or_status_invalid" });
});


test("reliability enforcement rejects a bad result instead of returning false metadata", () => {
  assert.throws(
    () => enforceTaskResult({ status: "success", route: null }, { OMNI_RELIABILITY_V1: "1" }),
    /Reliability gate rejected task result: route_or_status_invalid/,
  );
});

test("rollback switch preserves legacy bad-result pass-through", () => {
  const result = { status: "success", route: null };
  assert.equal(enforceTaskResult(result, { OMNI_RELIABILITY_V1: "0" }), result);
});
