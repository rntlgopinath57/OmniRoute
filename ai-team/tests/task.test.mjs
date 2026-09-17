import test from "node:test";
import assert from "node:assert/strict";

import { classifyTask, executeTask, normalizeTask } from "../src/task.mjs";

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

test("returns a classified and routed structured result", () => {
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
});
