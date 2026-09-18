import { envGet } from "../../relay-runtime/env.mts";

export default async () => {
  return Response.json({
    ok: true,
    service: "OmniRoute AI Team",
    aiGateway: Boolean(
      envGet("OPENAI_BASE_URL") && envGet("OPENAI_API_KEY"),
    ),
  });
};

export const config = {
  path: "/api/health",
};
