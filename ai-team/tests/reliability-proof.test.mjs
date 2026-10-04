import test from "node:test";
import assert from "node:assert/strict";
import { assessOutput, retainVerifiedMemory, repairOnce, createHindsightAdapter } from "../reliability/proof.mjs";

test("Unlazy-style acceptance gate preserves structural failure", () => {
  assert.deepEqual(assessOutput("A plausible but unstructured Relay answer."), {
    ok: false, reason: "format_structure_incomplete"
  });
});

test("Hindsight-style memory retains verified facts only", () => {
  const good = retainVerifiedMemory({}, { key: "route", value: "keyless", verified: true });
  assert.equal(good.retained, true);
  const bad = retainVerifiedMemory(good.store, { key: "route", value: "broken", verified: false });
  assert.equal(bad.retained, false);
  assert.equal(bad.store.route, "keyless");
});

test("Foreman-style repair gets one bounded attempt and must re-pass acceptance", () => {
  const result = repairOnce({
    output: "broken",
    repair: () => "# Result\nRelay routing is preserved and verified.\n## Evidence\nReviewer and fallback checks passed."
  });
  assert.equal(result.before.ok, false);
  assert.equal(result.repaired, true);
  assert.equal(result.after.ok, true);
});

test("failed repair remains failed rather than looping", () => {
  const result = repairOnce({ output: "broken", repair: () => "still broken" });
  assert.equal(result.repaired, false);
  assert.equal(result.after.ok, false);
});


test("real Relay structural failure repairs once, validates, then retains only verified result", () => {
  const baseline = "Relay produced a plausible answer with enough detail to look complete, but it omitted the required structured evidence sections.";
  const before = assessOutput(baseline);
  assert.equal(before.ok, false);
  assert.equal(before.reason, "format_structure_incomplete");

  const repaired = repairOnce({
    output: baseline,
    repair: (_output, reason) => {
      assert.equal(reason, "format_structure_incomplete");
      return "# Result\nRelay route completed with the required structure.\n## Evidence\nReviewer and fallback checks passed.";
    }
  });
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.after.ok, true);

  const retained = retainVerifiedMemory({}, {
    key: "relay-structured-result",
    value: repaired.output,
    verified: repaired.after.ok,
  });
  assert.equal(retained.retained, true);
  assert.equal(retained.store["relay-structured-result"], repaired.output);
});

test("real Relay failed repair is not retained and is not retried", () => {
  let attempts = 0;
  const baseline = "Relay produced a plausible answer with enough detail to look complete, but it omitted the required structured evidence sections.";
  const repaired = repairOnce({
    output: baseline,
    repair: () => {
      attempts += 1;
      return "still invalid";
    }
  });
  assert.equal(attempts, 1);
  assert.equal(repaired.repaired, false);
  const retained = retainVerifiedMemory({}, {
    key: "relay-structured-result",
    value: repaired.output,
    verified: repaired.after.ok,
  });
  assert.equal(retained.retained, false);
  assert.deepEqual(retained.store, {});
});


test("Hindsight adapter retains only verified Relay output and recalls it from isolated bank", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const isRecall = url.endsWith("/memories/recall");
    return { ok: true, json: async () => isRecall ? { results: [{ text: "Relay verified route: keyless" }] } : { operation_id: "test-retain" } };
  };
  const memory = createHindsightAdapter({ baseUrl: "http://hindsight.test", bankId: "omniroute-experiment", fetchImpl });
  const rejected = await memory.retainVerified({ content: "bad unverified answer", verified: false });
  assert.equal(rejected.retained, false);
  assert.equal(calls.length, 0);

  const accepted = await memory.retainVerified({ content: "Relay verified route: keyless", verified: true });
  assert.equal(accepted.retained, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /omniroute-experiment\/memories$/);

  const recalled = await memory.recall("What Relay route was verified?");
  assert.equal(calls.length, 2);
  assert.equal(recalled.results[0].text, "Relay verified route: keyless");
});

test("Hindsight transport failure fails closed instead of pretending memory was retained", async () => {
  const memory = createHindsightAdapter({
    baseUrl: "http://hindsight.test", bankId: "omniroute-experiment",
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  await assert.rejects(() => memory.retainVerified({ content: "verified result", verified: true }), /hindsight_http_503/);
});
