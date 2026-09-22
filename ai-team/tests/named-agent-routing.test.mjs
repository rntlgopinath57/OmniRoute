import test from "node:test";
import assert from "node:assert/strict";
import { detectNamedAgentRoute } from "../../relay-runtime/named-agent-routing.mjs";

const affinityCases = [
  ["What is DeepSeek famous for?", "deepseek"],
  ["What is Gemini good at?", "gemini"],
  ["Tell me about Claude's strengths", "claude"],
  ["What is ChatGPT known for?", "openai"],
  ["What does Qwen do well?", "qwen"],
  ["What is Groq famous for?", "groq"],
  ["Explain Cloudflare Workers AI", "cloudflare"],
  ["What is Grok used for?", "grok"],
];

for (const [prompt, family] of affinityCases) {
  test(`named-agent affinity: ${family}`, () => {
    assert.deepEqual(detectNamedAgentRoute(prompt), {
      family,
      affinity: true,
      strict: false,
      comparison: false,
    });
  });
}

test("strict named-agent routing stays strict", () => {
  assert.deepEqual(detectNamedAgentRoute("Use DeepSeek only: answer this question."), {
    family: "deepseek",
    affinity: false,
    strict: true,
    comparison: false,
  });
  assert.deepEqual(detectNamedAgentRoute("Ask Gemini to answer this."), {
    family: "gemini",
    affinity: false,
    strict: true,
    comparison: false,
  });
});

test("multiple named agents become a neutral comparison", () => {
  assert.deepEqual(detectNamedAgentRoute("Compare DeepSeek and Gemini"), {
    family: "",
    affinity: false,
    strict: false,
    comparison: true,
  });
});

test("generic prompts do not acquire an agent affinity", () => {
  assert.deepEqual(detectNamedAgentRoute("Find me a monitor under 10000 rupees"), {
    family: "",
    affinity: false,
    strict: false,
    comparison: false,
  });
});
