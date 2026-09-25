import { envGet } from "../../relay-runtime/env.mts";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function transcriptGate(text: string, durationMs = 0) {
  const raw = String(text || "").trim();
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return { valid: false, reason: "no_meaningful_text" };
  if (durationMs > 0 && durationMs < 350) return { valid: false, reason: "clip_too_short" };
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const singleWordAllowed = /^(stop|cancel|yes|no)$/i.test(normalized);
  if (tokens.length < 2 && !singleWordAllowed) return { valid: false, reason: "too_little_information" };
  const usefulChars = (raw.match(/[a-z0-9]/gi) || []).length;
  if (usefulChars / Math.max(1, raw.length) < 0.5) return { valid: false, reason: "mostly_noise" };
  return { valid: true, reason: "" };
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const apiKey = envGet("GROQ_API_KEY");
  if (!apiKey) {
    return Response.json({ error: "Speech recognition gateway is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart audio upload" }, { status: 400 });
  }

  const value = form.get("file");
  const durationMs = Math.max(0, Number(form.get("duration_ms") || 0) || 0);
  if (!(value instanceof File)) {
    return Response.json({ error: "Audio file is required" }, { status: 400 });
  }
  if (!value.size) return Response.json({ error: "Audio file is empty" }, { status: 400 });
  if (value.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio clip is too large" }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", value, value.name || "nandi-audio.webm");
  upstream.append("model", "whisper-large-v3-turbo");
  upstream.append("response_format", "json");
  upstream.append("temperature", "0");
  upstream.append("language", "en");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      return Response.json({ error: "Speech recognition failed", upstreamStatus: response.status, detail: raw.slice(0, 500) }, { status: 502 });
    }
    let data: any = {};
    try { data = JSON.parse(raw); } catch {}
    const text = String(data?.text || "").trim();
    const gate = transcriptGate(text, durationMs);
    return Response.json({
      text,
      valid: gate.valid,
      reason: gate.reason,
      model: "whisper-large-v3-turbo",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const timedOut = error?.name === "AbortError";
    return Response.json({ error: timedOut ? "Speech recognition timed out" : "Speech recognition request failed" }, { status: timedOut ? 504 : 502 });
  } finally {
    clearTimeout(timer);
  }
};
