import test from "node:test";
import assert from "node:assert/strict";

import {
  compressInternalReviewContext,
  headroomReviewEnabled,
} from "../src/internal-context-compression.mjs";

const largeJson = JSON.stringify(
  Array.from({ length: 200 }, (_, id) => ({
    id,
    status: "ok",
    message: "routine relay execution ".repeat(8),
  })),
);

test("Headroom review compression is opt-in", async () => {
  assert.equal(headroomReviewEnabled({}), false);
  assert.equal(headroomReviewEnabled({ AI_TEAM_HEADROOM_REVIEW: "1" }), true);

  const result = await compressInternalReviewContext({
    content: largeJson,
    query: "review routing",
    env: {},
    minBytes: 1,
  });

  assert.equal(result.compressed, false);
  assert.equal(result.reason, "disabled");
  assert.equal(result.content, largeJson);
});

test("small reviewer context bypasses compression", async () => {
  const content = JSON.stringify([{ status: "error", message: "keep me" }]);
  const result = await compressInternalReviewContext({
    content,
    query: "review routing",
    env: { AI_TEAM_HEADROOM_REVIEW: "1" },
    minBytes: 10_000,
  });

  assert.equal(result.compressed, false);
  assert.equal(result.reason, "below_threshold");
  assert.equal(result.content, content);
});

test("non-JSON reviewer context bypasses compression", async () => {
  const content = "plain reviewer output ".repeat(1000);
  const result = await compressInternalReviewContext({
    content,
    query: "review routing",
    env: { AI_TEAM_HEADROOM_REVIEW: "1" },
    minBytes: 1,
  });

  assert.equal(result.compressed, false);
  assert.equal(result.reason, "non_json");
  assert.equal(result.content, content);
});

test("missing Headroom runtime fails open to original context", async () => {
  const result = await compressInternalReviewContext({
    content: largeJson,
    query: "review routing",
    env: { AI_TEAM_HEADROOM_REVIEW: "1" },
    minBytes: 1,
    pythonBin: "__missing_headroom_python__",
    timeoutMs: 500,
  });

  assert.equal(result.compressed, false);
  assert.equal(result.reason, "bridge_error");
  assert.equal(result.content, largeJson);
  assert.match(result.error, /ENOENT|spawn/i);
});
