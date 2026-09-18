import askHandler from "../netlify/functions/ask.mts";
import mediaHandler from "../netlify/functions/media.mts";
import healthHandler from "../netlify/functions/health.mts";
import { setRuntimeEnv } from "../relay-runtime/env.mts";

type Env = {
  ASSETS: Fetcher;
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GEMINI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_API_KEY?: string;
  RELAY_GITHUB_TOKEN?: string;
  GITHUB_TOKEN?: string;
};

function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    setRuntimeEnv(env as unknown as Record<string, unknown>);
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") return secure(await askHandler(request));
    if (url.pathname === "/api/media") return secure(await mediaHandler(request));
    if (url.pathname === "/api/health") return secure(await healthHandler());

    if (url.pathname.startsWith("/api/")) {
      return secure(Response.json({ error: "Not found" }, { status: 404 }));
    }

    return secure(await env.ASSETS.fetch(request));
  },
};
