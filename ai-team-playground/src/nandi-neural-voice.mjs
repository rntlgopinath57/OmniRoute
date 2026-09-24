// NANDI_NEURAL_VOICE_V1
// NANDI_AUDIO_UNLOCK_V1
// Browser-local neural TTS. Kokoro is bundled at build time; model weights load
// from the Apache-2.0 ONNX model once and are cached by the browser.
import { KokoroTTS } from "kokoro-js";
import { env as transformersEnv } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "bm_george";
const NANDI_HF_ORIGIN = "https://huggingface.co/";
const NANDI_HF_MODEL_PREFIX = "onnx-community/Kokoro-82M-v1.0-ONNX/resolve/";
const NANDI_HF_PROXY_PREFIX = "/api/hf/";
const SILENT_WAV =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const nativeFetch = globalThis.fetch.bind(globalThis);
function proxiedFetch(input, init) {
  const raw = typeof input === "string" ? input : input?.url;
  if (typeof raw === "string" && raw.startsWith(NANDI_HF_ORIGIN + NANDI_HF_MODEL_PREFIX)) {
    const relative = raw.slice(NANDI_HF_ORIGIN.length);
    return nativeFetch(NANDI_HF_PROXY_PREFIX + relative, init);
  }
  return nativeFetch(input, init);
}
transformersEnv.fetch = proxiedFetch;
globalThis.fetch = proxiedFetch;

let model = null;
let loading = null;
let unavailable = false;
let lastError = "";
let player = null;
let currentUrl = "";
let generation = 0;
let progress = 0;
let device = "unknown";
let speakingText = "";
let unlocked = false;

function emit(type, detail = {}) {
  window.dispatchEvent(new CustomEvent("nandi-voice", { detail: { type, ...detail } }));
}

function ensurePlayer() {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
  }
  return player;
}

function autoplayBlocked(err) {
  const name = String(err?.name || "");
  const message = String(err?.message || err || "");
  return name === "NotAllowedError" || /user didn.?t interact|notallowed|play\(\).*failed|autoplay/i.test(message);
}

async function unlock() {
  if (unlocked) return true;
  const audio = ensurePlayer();
  const previousSrc = audio.src;
  const previousVolume = audio.volume;
  const previousMuted = audio.muted;
  try {
    audio.pause();
    audio.src = SILENT_WAV;
    audio.volume = 1;
    audio.muted = false;
    await audio.play();
    audio.pause();
    try { audio.currentTime = 0; } catch {}
    unlocked = true;
    lastError = "";
    emit("unlocked");
    return true;
  } catch (err) {
    lastError = String(err?.message || err);
    emit("blocked", { error: lastError, engine: "kokoro" });
    return false;
  } finally {
    audio.pause();
    audio.volume = previousVolume;
    audio.muted = previousMuted;
    if (currentUrl) {
      audio.src = currentUrl;
    } else if (previousSrc && previousSrc !== SILENT_WAV) {
      audio.src = previousSrc;
    } else {
      audio.removeAttribute("src");
      try { audio.load(); } catch {}
    }
  }
}

async function load() {
  if (model) return model;
  if (unavailable) return null;
  if (loading) return loading;

  const token = ++generation;
  loading = (async () => {
    try {
      device = "wasm";
      emit("loading", { progress: 0, device });
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device,
        progress_callback: (p) => {
          const pct = typeof p?.progress === "number" ? p.progress / 100 : progress;
          progress = Math.max(progress, Math.min(1, pct || 0));
          emit("loading", { progress, device });
        },
      });
      if (token !== generation) return null;
      model = tts;
      progress = 1;
      emit("ready", { device, voice: DEFAULT_VOICE });
      return model;
    } catch (err) {
      lastError = String(err?.message || err);
      unavailable = true;
      emit("error", { error: lastError, device });
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function stopAudio() {
  const audio = ensurePlayer();
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
  } catch {}
  if (currentUrl) {
    try { URL.revokeObjectURL(currentUrl); } catch {}
    currentUrl = "";
  }
  speakingText = "";
}

function cancel() {
  generation++;
  stopAudio();
  emit("cancelled");
}

async function speak(text, opts = {}) {
  text = String(text || "").trim();
  if (!text) return false;
  const tts = await load();
  if (!tts) return false;

  const token = generation;
  try {
    const generated = await tts.generate(text, {
      voice: opts.voice || DEFAULT_VOICE,
      speed: typeof opts.speed === "number" ? opts.speed : 0.96,
    });
    if (token !== generation) return false;

    if (currentUrl) {
      try { URL.revokeObjectURL(currentUrl); } catch {}
      currentUrl = "";
    }
    const blob = generated.toBlob();
    currentUrl = URL.createObjectURL(blob);
    const audio = ensurePlayer();
    audio.src = currentUrl;
    audio.preload = "auto";
    audio.volume = typeof opts.volume === "number" ? opts.volume : 0.96;
    audio.muted = false;
    speakingText = text;

    return await new Promise((resolve) => {
      const done = (ok) => {
        audio.onended = null;
        audio.onerror = null;
        audio.onplay = null;
        stopAudio();
        resolve(ok);
      };
      audio.onplay = () => {
        unlocked = true;
        lastError = "";
        emit("start", { text, engine: "kokoro", voice: opts.voice || DEFAULT_VOICE });
      };
      audio.onended = () => done(true);
      audio.onerror = () => {
        lastError = "audio playback failed";
        emit("error", { error: lastError, engine: "kokoro" });
        done(false);
      };
      audio.play().catch((err) => {
        lastError = String(err?.message || err);
        if (autoplayBlocked(err)) {
          unlocked = false;
          emit("blocked", { error: lastError, engine: "kokoro" });
        } else {
          emit("error", { error: lastError, engine: "kokoro" });
        }
        done(false);
      });
    });
  } catch (err) {
    lastError = String(err?.message || err);
    emit("error", { error: lastError, engine: "kokoro" });
    return false;
  }
}

async function probe(text = "Nandi is ready.") {
  const tts = await load();
  if (!tts) return { ok: false, bytes: 0, error: lastError };
  try {
    const audio = await tts.generate(String(text || "Nandi is ready."), {
      voice: DEFAULT_VOICE,
      speed: 0.96,
    });
    const blob = audio.toBlob();
    return { ok: blob.size > 1000, bytes: blob.size, type: blob.type || "audio/wav", device, voice: DEFAULT_VOICE };
  } catch (err) {
    lastError = String(err?.message || err);
    return { ok: false, bytes: 0, error: lastError, device, voice: DEFAULT_VOICE };
  }
}

function status() {
  return {
    ready: Boolean(model),
    loading: Boolean(loading),
    unavailable,
    progress,
    device,
    voice: DEFAULT_VOICE,
    unlocked,
    speaking: Boolean(player && !player.paused && speakingText),
    speakingText,
    lastError,
  };
}

window.NandiNeuralVoiceVersion = "NANDI_NEURAL_VOICE_V1";
window.NandiNeuralVoice = { load, unlock, speak, cancel, probe, status };
