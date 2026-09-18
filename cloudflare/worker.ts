import askHandler from "../netlify/functions/ask.mts";
import mediaHandler from "../netlify/functions/media.mts";
import healthHandler from "../netlify/functions/health.mts";

type Env = {
  ASSETS: Fetcher;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") {
      return askHandler(request);
    }

    if (url.pathname === "/api/media") {
      return mediaHandler(request);
    }

    if (url.pathname === "/api/health") {
      return healthHandler();
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
