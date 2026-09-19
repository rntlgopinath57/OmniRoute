import { envGet } from "../../relay-runtime/env.mts";

export default async () => {
  const providers = {
    openai: Boolean(envGet("OPENAI_API_KEY")),
    anthropic: Boolean(envGet("ANTHROPIC_API_KEY")),
    gemini: Boolean(envGet("GEMINI_API_KEY")),
    openrouter: Boolean(envGet("OPENROUTER_API_KEY")),
  };

  const models = {
    gemini: providers.gemini,
    openai: providers.openai || providers.openrouter,
    claude: providers.anthropic || providers.openrouter,
    deepseek: providers.openrouter,
    qwen: providers.openrouter,
    grok: providers.openrouter,
  };

  return Response.json({
    ok: true,
    service: "OmniRoute AI Team",
    aiGateway: Object.values(models).some(Boolean),
    providers,
    models,
  });
};

export const config = {
  path: "/api/health",
};
