import { envGet } from "../../relay-runtime/env.mts";

const googleBase = "https://generativelanguage.googleapis.com";

function getKey(body: any) {
  const provided = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  return provided || envGet("GEMINI_API_KEY") || "";
}

async function googleJson(url: string, key: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      `Gemini API request failed (${response.status})`;
    throw new Error(message);
  }
  return json;
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: any = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = String(body?.action || "");
  const key = getKey(body);

  if (action === "capabilities") {
    return Response.json({
      ok: true,
      serverGeminiConfigured: Boolean(envGet("GEMINI_API_KEY")),
      imageGeneration: true,
      videoGeneration: true,
      imageModel: "gemini-3.1-flash-image",
      videoModel: "veo-3.1-generate-preview",
    });
  }

  if (!key) {
    return Response.json(
      { error: "Gemini API key required for image/video generation." },
      { status: 428 },
    );
  }

  try {
    if (action === "image") {
      const prompt = String(body?.prompt || "").trim();
      if (!prompt) return Response.json({ error: "Prompt is required" }, { status: 400 });

      const json = await googleJson(
        `${googleBase}/v1/models/gemini-3.1-flash-image:generateContent`,
        key,
        {
          method: "POST",
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt.slice(0, 12000) }] }],
          }),
        },
      );

      const parts = json?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((part: any) => part?.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        throw new Error("Gemini returned no generated image.");
      }
      return Response.json({
        ok: true,
        mimeType: imagePart.inlineData.mimeType || "image/png",
        data: imagePart.inlineData.data,
      });
    }

    if (action === "video-start") {
      const prompt = String(body?.prompt || "").trim();
      if (!prompt) return Response.json({ error: "Prompt is required" }, { status: 400 });

      const aspectRatio = body?.aspectRatio === "9:16" ? "9:16" : "16:9";
      const duration = ["4", "6", "8"].includes(String(body?.durationSeconds))
        ? String(body.durationSeconds)
        : "8";
      const resolution = ["720p", "1080p", "4k"].includes(String(body?.resolution))
        ? String(body.resolution)
        : "720p";

      const json = await googleJson(
        `${googleBase}/v1beta/models/veo-3.1-generate-preview:predictLongRunning`,
        key,
        {
          method: "POST",
          body: JSON.stringify({
            instances: [{ prompt: prompt.slice(0, 12000) }],
            parameters: {
              aspectRatio,
              durationSeconds: duration,
              resolution,
              numberOfVideos: 1,
            },
          }),
        },
      );
      if (!json?.name) throw new Error("Veo did not return a generation job.");
      return Response.json({ ok: true, operation: json.name });
    }

    if (action === "video-status") {
      const operation = String(body?.operation || "").replace(/^\//, "");
      if (!operation) return Response.json({ error: "Operation is required" }, { status: 400 });

      const json = await googleJson(`${googleBase}/v1beta/${operation}`, key);
      if (!json?.done) return Response.json({ ok: true, done: false });

      const error = json?.error?.message;
      if (error) return Response.json({ ok: false, done: true, error }, { status: 502 });

      const uri =
        json?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        json?.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) throw new Error("Veo finished but no video URL was returned.");
      return Response.json({ ok: true, done: true, uri });
    }

    if (action === "video-download") {
      const uri = String(body?.uri || "");
      if (!/^https:\/\//i.test(uri)) {
        return Response.json({ error: "Valid video URL is required" }, { status: 400 });
      }
      const upstream = await fetch(uri, {
        redirect: "follow",
        headers: { "x-goog-api-key": key },
      });
      if (!upstream.ok || !upstream.body) {
        throw new Error(`Video download failed (${upstream.status})`);
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "video/mp4",
          "Cache-Control": "no-store",
          "Content-Disposition": 'inline; filename="relay-generated.mp4"',
        },
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Media generation failed" },
      { status: 500 },
    );
  }
};

export const config = { path: "/api/media" };
