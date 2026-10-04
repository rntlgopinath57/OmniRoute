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
