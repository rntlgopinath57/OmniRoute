import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTarget } from "../audit/universal-audit.mjs";

test("universal audit is provider-independent and redacts secrets", async () => {
  const root=await mkdtemp(join(tmpdir(),"relay-audit-"));
  await mkdir(join(root,".github","workflows"),{recursive:true});
  await writeFile(join(root,"app.py"),"import requests\nAPI_KEY='super-secret-live-key-12345'\nrequests.get('https://example.com')\n");
  await writeFile(join(root,".github","workflows","ci.yml"),"steps:\n - uses: actions/checkout@v4\n");
  const report=await scanTarget({root,profile:"full"});
  assert.ok(report.findings.some(f=>f.rule==="hardcoded-secret"));
  assert.ok(report.findings.some(f=>f.rule==="http-no-timeout"));
  assert.ok(report.findings.some(f=>f.rule==="action-unpinned"));
  assert.ok(report.findings.every(f=>!f.evidence.includes("super-secret-live-key-12345")));
});

test("universal audit detects architecture state risks", async () => {
  const root=await mkdtemp(join(tmpdir(),"relay-audit-"));
  await writeFile(join(root,"app.py"),"import sqlite3\nfrom firebase_admin import firestore\n");
  const report=await scanTarget({root,profile:"architecture"});
  assert.deepEqual(new Set(report.stack.dataStores),new Set(["Firestore","SQLite"]));
  assert.ok(report.findings.some(f=>f.rule==="multiple-stores"));
});
