import test from "node:test";
import assert from "node:assert/strict";

import { selectModelRoute } from "../src/router.mjs";

test("routes coding tasks to Anthropic with OpenAI fallback", () => {
  assert.deepEqual(selectModelRoute("coding"), {
    primaryProvider: "anthropic",
    fallbackProvider: "openai",
    modelProfile: "coding-strong",
  });
});

test("routes research tasks to OpenAI with Google fallback", () => {
  assert.deepEqual(selectModelRoute("research"), {
    primaryProvider: "openai",
    fallbackProvider: "google",
    modelProfile: "research-strong",
  });
});

test("routes automation tasks to OpenAI with Anthropic fallback", () => {
  assert.deepEqual(selectModelRoute("automation"), {
    primaryProvider: "openai",
    fallbackProvider: "anthropic",
    modelProfile: "automation-efficient",
  });
});

test("routes design tasks to Google with OpenAI fallback", () => {
  assert.deepEqual(selectModelRoute("design"), {
    primaryProvider: "google",
    fallbackProvider: "openai",
    modelProfile: "design-multimodal",
  });
});

test("falls back safely for unknown task types", () => {
  assert.deepEqual(selectModelRoute("analysis"), {
    primaryProvider: "openai",
    fallbackProvider: "google",
    modelProfile: "general-balanced",
  });
});
