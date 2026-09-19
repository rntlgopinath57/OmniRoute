import { envGet } from "../../relay-runtime/env.mts";

async function openRouterLimitInfo() {
  const apiKey = envGet("OPENROUTER_API_KEY");
  if (!apiKey) return { configured: false, checked: false };

  const baseUrl = (envGet("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${baseUrl}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { configured: true, checked: true, reachable: false, status: response.status };
    }

    const payload: any = await response.json();
    const data = payload?.data || {};
    return {
      configured: true,
      checked: true,
      reachable: true,
      freeTier: Boolean(data.is_free_tier),
      keyLimitRemaining: typeof data.limit_remaining === "number" ? data.limit_remaining : null,
      keyLimitReset: typeof data.limit_reset === "string" ? data.limit_reset : null,
      expiresAt: typeof data.expires_at === "string" ? data.expires_at : null,
      freePolicy: data.is_free_tier
        ? { requestsPerDay: 50, requestsPerMinute: 20, sharedAcrossFreeModels: true }
        : null,
    };
  } catch {
    return { configured: true, checked: false, reachable: false };
  } finally {
    clearTimeout(timeout);
  }
}

export default async () => {
  const providers = {
    openai: Boolean(envGet("OPENAI_API_KEY")),
    anthropic: Boolean(envGet("ANTHROPIC_API_KEY")),
    gemini: Boolean(envGet("GEMINI_API_KEY")),
    openrouter: Boolean(envGet("OPENROUTER_API_KEY")),
  };

  const models = {
    // Only advertise families that can actually execute with configured credentials.
    gemini: providers.gemini,
    openai: providers.openai,
    claude: providers.anthropic,
    deepseek: providers.openrouter,
    qwen: providers.openrouter,
    grok: false,
  };

  const openrouter = await openRouterLimitInfo();

  return Response.json({
    ok: true,
    service: "OmniRoute AI Team",
    aiGateway: Object.values(models).some(Boolean),
    providers,
    models,
    limits: { openrouter },
  });
};

export const config = {
  path: "/api/health",
};
