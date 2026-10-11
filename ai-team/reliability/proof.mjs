import assert from "node:assert/strict";

export function assessOutput(output) {
  const text = String(output ?? "").trim();
  const sections = text.split(/\n(?=##?\s)/).filter(Boolean);
  return {
    ok: text.length >= 40 && sections.length >= 2,
    reason: text.length < 40 ? "output_too_short" : sections.length < 2 ? "format_structure_incomplete" : "pass",
  };
}

export function retainVerifiedMemory(store, { key, value, verified }) {
  if (!verified) return { retained: false, store };
  return { retained: true, store: { ...store, [key]: value } };
}

export function repairOnce({ output, repair }) {
  const before = assessOutput(output);
  if (before.ok) return { output, repaired: false, before, after: before };
  const candidate = repair(output, before.reason);
  const after = assessOutput(candidate);
  return { output: candidate, repaired: after.ok, before, after };
}

export function selfTest() {
  const bad = "Relay answer without structure.";
  assert.equal(assessOutput(bad).reason, "output_too_short");
  const memory = retainVerifiedMemory({}, { key: "relay-baseline", value: "green", verified: true });
  assert.equal(memory.store["relay-baseline"], "green");
  assert.equal(retainVerifiedMemory(memory.store, { key: "bad", value: "red", verified: false }).retained, false);
  const fixed = repairOnce({ output: bad, repair: () => "# Result\nRelay route verified.\n## Evidence\nIndependent reviewer passed." });
  assert.equal(fixed.repaired, true);
  return true;
}


export function createHindsightAdapter({
  baseUrl, bankId, apiKey, enabled = false, timeoutMs = 8000, fetchImpl = fetch,
}) {
  // Explicit opt-in only. Do not add this to the live Relay request path by default.
  if (!enabled) return {
    retainVerified: async () => ({ retained: false, reason: "disabled" }),
    recall: async () => ({ results: [], degraded: true, reason: "disabled" }),
  };
  const url = new URL(String(baseUrl || ""));
  if (url.username || url.password || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol)) throw new Error("hindsight_invalid_url");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("hindsight_insecure_remote_url");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(String(bankId || ""))) {
    throw new Error("hindsight_invalid_bank");
  }
  const endpoint = url.href.replace(/\/$/, "");
  const bank = encodeURIComponent(bankId);
  async function request(path, body) {
    const headers = { "content-type": "application/json" };
    if (apiKey) headers.authorization = "Bearer " + apiKey;
    const response = await fetchImpl(endpoint + path, {
      method: "POST", headers, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("hindsight_http_" + response.status);
    return response.json();
  }
  return {
    retainVerified: async ({ content, verified, evidence, documentId }) => {
      if (verified !== true || evidence?.reviewed !== true ||
          evidence?.delivery?.status !== "delivered" ||
          !evidence?.delivery?.receiptId) {
        return { retained: false, reason: "missing_review_or_delivery_proof" };
      }
      const text = String(content || "").trim();
      if (!text || text.length > 2048) {
        return { retained: false, reason: "invalid_content" };
      }
      const id = String(documentId || evidence.delivery.receiptId);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) {
        return { retained: false, reason: "invalid_document_id" };
      }
      // Synchronous extraction: HTTP 200 alone is never retention proof.
      const result = await request("/v1/default/banks/" + bank + "/memories", {
        async: false, items: [{ content: text, document_id: id }],
      });
      if (result?.success !== true || result?.items_count !== 1 || result?.async === true) {
        return { retained: false, reason: "server_unconfirmed" };
      }
      return { retained: true, result };
    },
    recall: async (query) => {
      if (!String(query || "").trim()) return { results: [], degraded: true, reason: "empty_query" };
      const result = await request("/v1/default/banks/" + bank + "/memories/recall", {
        query: String(query).slice(0, 512), max_tokens: 512,
      });
      if (!Array.isArray(result?.results)) throw new Error("hindsight_invalid_recall");
      return result;
    },
  };
}
