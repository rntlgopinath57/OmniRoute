import { createOpenShellGitHubReader } from "../reliability/openshell-reader.mjs";
import { readFileSync } from "node:fs";

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


const delivered = { reviewed: true, delivery: { status: "delivered", receiptId: "relay-proof-123" } };

test("Hindsight remains disabled without explicit opt-in", async () => {
  let called = 0;
  const adapter = createHindsightAdapter({
    fetchImpl: async () => { called++; throw new Error("should not call"); },
  });
  assert.equal((await adapter.retainVerified({ content: "any", verified: true })).retained, false);
  assert.equal((await adapter.recall("query")).degraded, true);
  assert.equal(called, 0);
});

test("Hindsight rejects undelivered, unreviewed and invalid facts without network calls", async () => {
  let called = 0;
  const adapter = createHindsightAdapter({
    enabled: true, baseUrl: "http://localhost:8888", bankId: "omniroute-experiment",
    fetchImpl: async () => { called++; throw new Error("should not call"); },
  });
  for (const candidate of [
    { content: "fact", verified: false, evidence: delivered },
    { content: "fact", verified: true },
    { content: "fact", verified: true, evidence: { ...delivered, reviewed: false } },
    { content: "fact", verified: true, evidence: { reviewed: true, delivery: { status: "queued", receiptId: "r1" } } },
    { content: "", verified: true, evidence: delivered },
  ]) assert.equal((await adapter.retainVerified(candidate)).retained, false);
  assert.equal(called, 0);
});

test("Hindsight requires synchronous successful extraction and isolates the project bank", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    const recall = url.endsWith("/memories/recall");
    return { ok: true, json: async () => recall
      ? { results: [{ text: "Verified Relay decision" }] }
      : { success: true, items_count: 1, async: false } };
  };
  const adapter = createHindsightAdapter({
    enabled: true, baseUrl: "https://hindsight.test", bankId: "omniroute-experiment",
    apiKey: "test-only", fetchImpl,
  });
  const retained = await adapter.retainVerified({
    content: "Verified Relay decision", verified: true, evidence: delivered,
  });
  assert.equal(retained.retained, true);
  assert.equal(calls[0].headers.authorization, "Bearer test-only");
  assert.equal(calls[0].body.async, false);
  assert.equal(calls[0].body.items[0].document_id, "relay-proof-123");
  assert.match(calls[0].url, /omniroute-experiment\/memories$/);
  const recalled = await adapter.recall("Which decision was verified?");
  assert.equal(calls.length, 2);
  assert.equal(recalled.results[0].text, "Verified Relay decision");
});

test("Hindsight must not claim retained on HTTP success without server confirmation", async () => {
  const adapter = createHindsightAdapter({
    enabled: true, baseUrl: "http://localhost:8888", bankId: "omniroute-experiment",
    fetchImpl: async () => ({ ok: true, json: async () => ({ operation_id: "queued" }) }),
  });
  const result = await adapter.retainVerified({ content: "decision", verified: true, evidence: delivered });
  assert.deepEqual(result, { retained: false, reason: "server_unconfirmed" });
});

test("Hindsight HTTP failure fails closed instead of pretending memory was retained", async () => {
  const adapter = createHindsightAdapter({
    enabled: true, baseUrl: "http://localhost:8888", bankId: "omniroute-experiment",
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  await assert.rejects(
    () => adapter.retainVerified({ content: "decision", verified: true, evidence: delivered }),
    /hindsight_http_503/,
  );
});

test("Hindsight refuses remote plaintext URLs so credentials cannot leak", () => {
  assert.throws(() => createHindsightAdapter({
    enabled: true, baseUrl: "http://other-host:8888", bankId: "omniroute-experiment", apiKey: "secret",
  }), /hindsight_insecure_remote_url/);
});

test("OpenShell reader does not run unless explicitly enabled", async () => {
  let attempts = 0;
  const reader = createOpenShellGitHubReader({
    execFileImpl: async () => { attempts++; throw Error("unexpected execution"); },
  });
  assert.deepEqual(await reader.readRepository("NVIDIA/OpenShell"),
    { ok: false, reason: "disabled" });
  assert.equal(attempts, 0);
});

test("OpenShell blocks malformed repo and sandbox arguments before execution", async () => {
  let attempts = 0;
  const execFileImpl = async () => { attempts++; throw Error("unexpected execution"); };
  const badSandbox = createOpenShellGitHubReader({
    enabled: true, sandboxName: "demo; rm -rf /", execFileImpl,
  });
  const badRepo = createOpenShellGitHubReader({
    enabled: true, sandboxName: "demo", execFileImpl,
  });
  assert.equal((await badSandbox.readRepository("NVIDIA/OpenShell")).ok, false);
  assert.equal((await badRepo.readRepository("NVIDIA/OpenShell;bad")).ok, false);
  assert.equal(attempts, 0);
});

test("OpenShell reader delegates fixed GitHub GET to isolated CLI and verifies real repo identity", async () => {
  let captured;
  const reader = createOpenShellGitHubReader({
    enabled: true, sandboxName: "gopi-proof",
    execFileImpl: async (...args) => {
      captured = args;
      return { stdout: JSON.stringify({
        full_name: "NVIDIA/OpenShell", default_branch: "main", archived: false,
      }) };
    },
  });
  const result = await reader.readRepository("NVIDIA/OpenShell");
  assert.deepEqual(result, {
    ok: true, repository: "NVIDIA/OpenShell", defaultBranch: "main", archived: false,
  });
  assert.equal(captured[0], "openshell");
  assert.deepEqual(captured[1].slice(0, 7),
    ["sandbox", "exec", "-n", "gopi-proof", "--no-login-shell", "--", "/usr/bin/curl"]);
  assert.equal(captured[1].at(-1), "https://api.github.com/repos/NVIDIA/OpenShell");
  assert.equal(captured[2].timeout, 10000);
});

test("OpenShell missing runtime or wrong result never returns success", async () => {
  const offline = createOpenShellGitHubReader({
    enabled: true, sandboxName: "gopi-proof",
    execFileImpl: async () => { throw Error("CLI not installed"); },
  });
  assert.equal((await offline.readRepository("NVIDIA/OpenShell")).ok, false);
  const wrong = createOpenShellGitHubReader({
    enabled: true, sandboxName: "gopi-proof",
    execFileImpl: async () => ({ stdout: '{"full_name":"someone/else"}' }),
  });
  assert.deepEqual(await wrong.readRepository("NVIDIA/OpenShell"),
    { ok: false, reason: "wrong_repo_or_response" });
});

test("OpenShell static policy is restrictive and requires enforced read-only GitHub", () => {
  const policy = readFileSync(new URL("../../ops/openshell/github-readonly-policy.yaml",
    import.meta.url), "utf8");
  assert.match(policy, /^version: 1$/m);
  assert.match(policy, /include_workdir: false/);
  assert.match(policy, /compatibility: hard_requirement/);
  assert.match(policy, /host: api\.github\.com/);
  assert.match(policy, /protocol: rest/);
  assert.match(policy, /enforcement: enforce/);
  assert.match(policy, /path: \/repos\/NVIDIA\/OpenShell/);
  assert.match(policy, /path: \/repos\/rntlgopinath57\/OmniRoute/);
  assert.match(policy, /method: GET/);
  assert.doesNotMatch(policy, /access: full/);
  assert.doesNotMatch(policy, /access: (full|read-write)/);
  assert.doesNotMatch(policy, /host: \*/);
});
