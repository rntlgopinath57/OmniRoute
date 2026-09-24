import { envGet } from "../../relay-runtime/env.mts";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const buckets = new Map<string, { started: number; count: number }>();

function clientKey(request: Request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function allowRequest(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = buckets.get(key);
  if (!current || now - current.started >= WINDOW_MS) {
    buckets.set(key, { started: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > MAX_PER_WINDOW) return false;
  }
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      if (now - v.started >= WINDOW_MS) buckets.delete(k);
    }
  }
  return true;
}

function safeMime(type: string) {
  const value = String(type || "").toLowerCase().split(";")[0].trim();
  return new Set([
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/mpga",
    "audio/m4a",
    "audio/ogg",
    "audio/wav",
    "audio/flac",
  ]).has(value);
}

function extension(type: string) {
  const value = String(type || "").toLowerCase();
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("wav")) return "wav";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("flac")) return "flac";
  return "webm";
}

export default async function transcribeHandler(request: Request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== requestUrl.origin) {
    return Response.json({ error: "Cross-origin voice requests are not allowed" }, { status: 403 });
  }
  if (request.headers.get("X-Nandi-Voice") !== "1") {
    return Response.json({ error: "Missing Nandi voice header" }, { status: 403 });
  }
  if (!allowRequest(request)) {
    return Response.json({ error: "Voice rate limit reached. Try again shortly." }, { status: 429 });
  }

  const key = envGet("GROQ_API_KEY");
  if (!key) {
    return Response.json({ error: "Speech recognition is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid audio upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Audio file is required" }, { status: 400 });
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Audio file must be between 1 byte and 10 MB" }, { status: 413 });
  }
  if (!safeMime(file.type)) {
    return Response.json({ error: "Unsupported audio format" }, { status: 415 });
  }

  const outgoing = new FormData();
  outgoing.append(
    "file",
    new File([await file.arrayBuffer()], `nandi-voice.${extension(file.type)}`, { type: file.type }),
  );
  outgoing.append("model", "whisper-large-v3-turbo");
  outgoing.append("response_format", "json");
  outgoing.append("temperature", "0");

  const language = String(form.get("language") || "").trim().toLowerCase();
  if (/^[a-z]{2}$/.test(language)) outgoing.append("language", language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: outgoing,
      signal: controller.signal,
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      return Response.json(
        { error: upstream.status === 429 ? "Speech recognition is busy. Try again shortly." : "Speech recognition failed", status: upstream.status },
        { status: upstream.status === 429 ? 429 : 502 },
      );
    }
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}
    const text = String(parsed?.text || "").trim();
    return Response.json({
      ok: true,
      text,
      provider: "groq-whisper",
      model: "whisper-large-v3-turbo",
    });
  } catch (error: any) {
    const timedOut = error?.name === "AbortError";
    return Response.json(
      { error: timedOut ? "Speech recognition timed out" : "Speech recognition failed" },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
