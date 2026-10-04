import test from "node:test";
import assert from "node:assert/strict";
import { assessOutput, retainVerifiedMemory, repairOnce } from "../reliability/proof.mjs";

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
