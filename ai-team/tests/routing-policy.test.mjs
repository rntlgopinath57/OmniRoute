import test from "node:test";
import assert from "node:assert/strict";

import { PUBLIC_FREE_MODEL, assessRoutingLane } from "../../relay-runtime/routing-policy.mjs";

test("simple public questions use the keyless FreeLLMAPI lane", () => {
  const route = assessRoutingLane({
    question: "Explain what an API is in two sentences",
    contextualQuestion: "Explain what an API is in two sentences",
    taskType: "general",
    history: [],
  });
  assert.equal(route.lane, "public_free");
  assert.equal(route.publicFreeAllowed, true);
  assert.match(PUBLIC_FREE_MODEL, /^freellmapi:kilo\//);
});

test("hard reasoning stays on the trusted OmniRoute lane", () => {
  const route = assessRoutingLane({
    question: "Analyze this architecture and compare the failure modes",
    contextualQuestion: "Analyze this architecture and compare the failure modes",
    taskType: "reasoning",
    history: [],
  });
  assert.equal(route.lane, "trusted");
  assert.equal(route.publicFreeAllowed, true);
});

test("Bharosa and secret-bearing prompts can never use the keyless lane", () => {
  for (const question of [
    "Review Bharosa parent details and QR security",
    "Check this API key and tell me why it fails",
    "My phone number is 9876543210; use it in the request",
  ]) {
    const route = assessRoutingLane({
      question,
      contextualQuestion: question,
      taskType: "general",
      history: [],
    });
    assert.equal(route.lane, "trusted");
    assert.equal(route.publicFreeAllowed, false);
  }
});

test("sensitive conversation history keeps a simple follow-up trusted", () => {
  const route = assessRoutingLane({
    question: "summarize that",
    contextualQuestion: "summarize that",
    taskType: "general",
    history: [{ role: "user", content: "My private repository contains an API key." }],
  });
  assert.equal(route.lane, "trusted");
  assert.equal(route.publicFreeAllowed, false);
});

test("fresh or high-stakes questions never use the keyless lane", () => {
  for (const question of [
    "What is the latest stock price today?",
    "Verify this medical advice",
    "Cite current security news",
  ]) {
    const route = assessRoutingLane({
      question,
      contextualQuestion: question,
      taskType: "general",
      history: [],
    });
    assert.equal(route.lane, "trusted");
    assert.equal(route.publicFreeAllowed, false);
  }
});
