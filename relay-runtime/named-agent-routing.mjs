const NAMED_AGENT_PATTERNS = Object.freeze([
  { family: "gemini", pattern: /\b(?:google\s+)?gemini\b/i },
  { family: "claude", pattern: /\bclaude\b|\banthropic\b/i },
  { family: "openai", pattern: /\bopenai\b|\bchatgpt\b|\bgpt[-\s]?5(?:\.6)?\b/i },
  { family: "deepseek", pattern: /\bdeepseek\b/i },
  { family: "qwen", pattern: /\bqwen\b/i },
  { family: "groq", pattern: /\bgroq\b/i },
  { family: "cloudflare", pattern: /\bcloudflare(?:\s+workers?\s+ai)?\b/i },
  { family: "grok", pattern: /\bgrok\b|\bxai\b|\bx-ai\b/i },
]);

const STRICT_AGENT_INTENT =
  /\b(?:use|using|with|via|route\s+(?:this\s+)?to|ask)\s+(?:google\s+)?(?:gemini|claude|anthropic|openai|chatgpt|gpt[-\s]?5(?:\.6)?|deepseek|qwen|groq|cloudflare(?:\s+workers?\s+ai)?|grok|xai|x-ai)\b|\b(?:gemini|claude|anthropic|openai|chatgpt|gpt[-\s]?5(?:\.6)?|deepseek|qwen|groq|cloudflare(?:\s+workers?\s+ai)?|grok|xai|x-ai)\s+only\b/i;

export function detectNamedAgentRoute(question = "") {
  const text = String(question || "");
  const families = [...new Set(
    NAMED_AGENT_PATTERNS
      .filter((item) => item.pattern.test(text))
      .map((item) => item.family)
  )];

  if (families.length !== 1) {
    return {
      family: "",
      affinity: false,
      strict: false,
      comparison: families.length > 1,
    };
  }

  const strict = STRICT_AGENT_INTENT.test(text);
  return {
    family: families[0],
    affinity: !strict,
    strict,
    comparison: false,
  };
}

export { NAMED_AGENT_PATTERNS };
