import askHandler from "../netlify/functions/ask.mts";
import transcribeHandler from "../netlify/functions/transcribe.mts";
import mediaHandler from "../netlify/functions/media.mts";
import healthHandler from "../netlify/functions/health.mts";
import { setRuntimeEnv } from "../relay-runtime/env.mts";

type Env = {
  ASSETS: Fetcher;
  AI?: { run: (...args: any[]) => Promise<any> };
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GEMINI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  RELAY_GITHUB_TOKEN?: string;
  GITHUB_TOKEN?: string;
};

async function kokoroModelProxy(request: Request, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const prefix = "/api/hf/";
  const relative = decodeURIComponent(url.pathname.slice(prefix.length));
  const allowedPrefix = "onnx-community/Kokoro-82M-v1.0-ONNX/resolve/";
  if (!relative.startsWith(allowedPrefix) || relative.includes("..")) {
    return Response.json({ error: "Model path not allowed" }, { status: 403 });
  }

  const upstreamUrl = new URL("https://huggingface.co/" + relative);
  upstreamUrl.search = url.search;

  const headers = new Headers();
  for (const key of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }

  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers,
    redirect: "follow",
  });

  const out = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  out.set("Cache-Control", "public, max-age=86400");
  out.set("Access-Control-Allow-Origin", "*");
  out.set("Cross-Origin-Resource-Policy", "cross-origin");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

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

    if (url.pathname.startsWith("/api/hf/")) return secure(await kokoroModelProxy(request, url));
    if (url.pathname === "/api/ask") return secure(await askHandler(request));
    if (url.pathname === "/api/transcribe") return secure(await transcribeHandler(request));
    if (url.pathname === "/api/media") return secure(await mediaHandler(request));
    if (url.pathname === "/api/health") return secure(await healthHandler());

    if (url.pathname.startsWith("/api/")) {
      return secure(Response.json({ error: "Not found" }, { status: 404 }));
    }

    return secure(await env.ASSETS.fetch(request));
  },
};
