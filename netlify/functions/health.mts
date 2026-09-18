import { envGet } from "../../relay-runtime/env.mts";

export default async () => {
  const providers = {
    openai: Boolean(envGet("OPENAI_API_KEY")),
    anthropic: Boolean(envGet("ANTHROPIC_API_KEY")),
    gemini: Boolean(envGet("GEMINI_API_KEY")),
    openrouter: Boolean(envGet("OPENROUTER_API_KEY")),
  };

  return Response.json({
    ok: true,
    service: "OmniRoute AI Team",
    aiGateway: Object.values(providers).some(Boolean),
    providers,
  });
};

export const config = {
  path: "/api/health",
};
