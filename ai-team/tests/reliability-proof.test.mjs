import test from "node:test";
import assert from "node:assert/strict";
import { assessOutput, retainVerifiedMemory, repairOnce } from "../reliability/proof.mjs";

test("Unlazy-style acceptance gate preserves structural failure", () => {
  assert.deepEqual(assessOutput("A plausible but unstructured Relay answer."), {
    ok: false, reason: "output_too_short"
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
