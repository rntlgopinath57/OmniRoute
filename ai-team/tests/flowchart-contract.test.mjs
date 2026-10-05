import test from "node:test";
import assert from "node:assert/strict";

import {
  containsRawFlowchartSyntax,
  extractFlowchartStages,
  flowchartLooksStructured,
  normalizeFlowchartAnswer,
} from "../../relay-runtime/flowchart-contract.mjs";

test("accepts a concise three-node flowchart", () => {
  const answer = "1. Validate\n2. Deploy\n3. Verify";
  assert.equal(flowchartLooksStructured(answer), true);
  assert.deepEqual(extractFlowchartStages(answer).map((x) => x.label), [
    "Validate",
    "Deploy",
    "Verify",
  ]);
});

test("normalizes one-line numbered flowchart output", () => {
  const answer = "1. Validate → 2. Deploy → 3. Verify";
  assert.equal(
    normalizeFlowchartAnswer(answer),
    "1. Validate\n2. Deploy\n3. Verify",
  );
  assert.equal(flowchartLooksStructured(answer), true);
});

test("rejects Mermaid and raw graph syntax", () => {
  assert.equal(containsRawFlowchartSyntax("flowchart TD\nA-->B"), true);
  assert.equal(flowchartLooksStructured("flowchart TD\nA-->B\nB-->C"), false);
});

test("rejects incomplete flowcharts", () => {
  assert.equal(flowchartLooksStructured("1. Validate\n2. Deploy"), false);
});
