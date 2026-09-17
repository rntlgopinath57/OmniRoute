import test from "node:test";
import assert from "node:assert/strict";

import { executeTask, normalizeTask } from "../src/task.mjs";

test("normalizes a valid task", () => {
  assert.deepEqual(normalizeTask({ task: "  Review Bharosa security  ", type: "ANALYSIS" }), {
    task: "Review Bharosa security",
    type: "analysis",
  });
});

test("defaults missing type to general", () => {
  assert.deepEqual(normalizeTask({ task: "Find useful repositories" }), {
    task: "Find useful repositories",
    type: "general",
  });
});

test("rejects an empty task", () => {
  assert.throws(() => normalizeTask({ task: "   " }), /non-empty task string/);
});

test("returns the Step 1 structured result", () => {
  assert.deepEqual(executeTask({ task: "Review Bharosa security", type: "analysis" }), {
    status: "success",
    task: "Review Bharosa security",
    type: "analysis",
    result: "AI Team task received successfully",
  });
});
