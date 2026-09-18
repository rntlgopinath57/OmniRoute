export default async () => {
  return Response.json({
    ok: true,
    service: "OmniRoute AI Team",
    aiGateway: Boolean(
      Netlify.env.get("OPENAI_BASE_URL") && Netlify.env.get("OPENAI_API_KEY"),
    ),
  });
};

export const config = {
  path: "/api/health",
};
