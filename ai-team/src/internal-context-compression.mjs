import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HELPER = resolve(HERE, "../tools/headroom-compress.py");
const DEFAULT_MIN_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function flagEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function structuredJson(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

function passthrough(content, reason, extra = {}) {
  const bytes = byteLength(content);
  return {
    content,
    compressed: false,
    reason,
    originalBytes: bytes,
    outputBytes: bytes,
    ...extra,
  };
}

function runBridge({
  content,
  query,
  pythonBin,
  helperPath,
  timeoutMs,
  spawnImpl,
}) {
  return new Promise((resolveResult, rejectResult) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };

    const child = spawnImpl(pythonBin, ["-I", helperPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      finish(rejectResult, new Error("Headroom bridge timed out"));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (byteLength(stdout) > MAX_STDOUT_BYTES) {
        child.kill();
        clearTimeout(timer);
        finish(rejectResult, new Error("Headroom bridge output exceeded limit"));
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish(rejectResult, error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(
          rejectResult,
          new Error(`Headroom bridge exited ${code}: ${stderr.trim().slice(0, 300)}`),
        );
        return;
      }

      try {
        finish(resolveResult, JSON.parse(stdout));
      } catch {
        finish(rejectResult, new Error("Headroom bridge returned invalid JSON"));
      }
    });

    child.stdin.end(JSON.stringify({ content, query }));
  });
}

export function headroomReviewEnabled(env = process.env) {
  return flagEnabled(env.AI_TEAM_HEADROOM_REVIEW);
}

export async function compressInternalReviewContext({
  content,
  query = "",
  env = process.env,
  minBytes,
  timeoutMs,
  pythonBin,
  helperPath = DEFAULT_HELPER,
  spawnImpl = spawn,
} = {}) {
  if (typeof content !== "string" || !content) {
    throw new TypeError("content must be a non-empty string");
  }
  if (typeof query !== "string") {
    throw new TypeError("query must be a string");
  }

  if (!headroomReviewEnabled(env)) {
    return passthrough(content, "disabled");
  }

  const threshold = positiveInteger(
    minBytes ?? env.AI_TEAM_HEADROOM_MIN_BYTES,
    DEFAULT_MIN_BYTES,
  );
  const originalBytes = byteLength(content);

  if (originalBytes < threshold) {
    return passthrough(content, "below_threshold");
  }

  if (!structuredJson(content)) {
    return passthrough(content, "non_json");
  }

  const bridgeTimeout = positiveInteger(
    timeoutMs ?? env.AI_TEAM_HEADROOM_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const runtimePython = String(
    pythonBin ?? env.AI_TEAM_PYTHON_BIN ?? "python",
  ).trim() || "python";

  try {
    const result = await runBridge({
      content,
      query,
      pythonBin: runtimePython,
      helperPath,
      timeoutMs: bridgeTimeout,
      spawnImpl,
    });

    if (!result || typeof result.content !== "string" || !result.content) {
      return passthrough(content, "invalid_bridge_result");
    }

    const outputBytes = byteLength(result.content);
    if (!result.modified || outputBytes >= originalBytes) {
      return passthrough(content, "no_gain", {
        strategy: typeof result.strategy === "string" ? result.strategy : null,
      });
    }

    return {
      content: result.content,
      compressed: true,
      reason: "compressed",
      originalBytes,
      outputBytes,
      strategy: typeof result.strategy === "string" ? result.strategy : null,
    };
  } catch (error) {
    return passthrough(content, "bridge_error", {
      error: error instanceof Error ? error.message : "Unknown Headroom bridge error",
    });
  }
}
