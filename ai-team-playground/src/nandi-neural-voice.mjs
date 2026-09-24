// NANDI_NEURAL_VOICE_V1
// Browser-local neural TTS. Kokoro is bundled at build time; model weights load
// from the Apache-2.0 ONNX model once and are cached by the browser.
import { KokoroTTS } from "kokoro-js";
import { env as transformersEnv } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "bm_george";
const NANDI_HF_ORIGIN = "https://huggingface.co/";
const NANDI_HF_MODEL_PREFIX = "onnx-community/Kokoro-82M-v1.0-ONNX/resolve/";
const NANDI_HF_PROXY_PREFIX = "/api/hf/";

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
let currentAudio = null;
let currentUrl = "";
let generation = 0;
let progress = 0;
let device = "unknown";
let speakingText = "";

function emit(type, detail = {}) {
  window.dispatchEvent(new CustomEvent("nandi-voice", { detail: { type, ...detail } }));
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
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = "";
      currentAudio.load();
    } catch {}
    currentAudio = null;
  }
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
    const audio = await tts.generate(text, {
      voice: opts.voice || DEFAULT_VOICE,
      speed: typeof opts.speed === "number" ? opts.speed : 0.96,
    });
    if (token !== generation) return false;

    const blob = audio.toBlob();
    currentUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentUrl);
    currentAudio.preload = "auto";
    currentAudio.volume = typeof opts.volume === "number" ? opts.volume : 0.96;
    speakingText = text;

    return await new Promise((resolve) => {
      const done = (ok) => {
        if (currentAudio) {
          currentAudio.onended = null;
          currentAudio.onerror = null;
          currentAudio.onplay = null;
        }
        stopAudio();
        resolve(ok);
      };
      currentAudio.onplay = () => emit("start", { text, engine: "kokoro", voice: opts.voice || DEFAULT_VOICE });
      currentAudio.onended = () => done(true);
      currentAudio.onerror = () => {
        lastError = "audio playback failed";
        emit("error", { error: lastError, engine: "kokoro" });
        done(false);
      };
      currentAudio.play().catch((err) => {
        lastError = String(err?.message || err);
        emit("error", { error: lastError, engine: "kokoro" });
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
    speaking: Boolean(currentAudio && !currentAudio.paused),
    speakingText,
    lastError,
  };
}

window.NandiNeuralVoiceVersion = "NANDI_NEURAL_VOICE_V1";
window.NandiNeuralVoice = { load, speak, cancel, probe, status };
