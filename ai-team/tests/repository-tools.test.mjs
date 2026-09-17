import test from "node:test";
import assert from "node:assert/strict";

import { RepositoryToolError, createRepositoryToolGate } from "../src/repository-tools.mjs";

test("allows read operations without write approval and pins repository scope", async () => {
  const calls = [];
  const gate = createRepositoryToolGate({
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    adapter: {
      async readFile(input) {
        calls.push(input);
        return { content: "ok" };
      },
    },
  });

  const result = await gate.run("readFile", {
    path: "README.md",
    repository: "other/repo",
    branch: "main",
  });

  assert.deepEqual(calls, [
    {
      path: "README.md",
      repository: "rntlgopinath57/OmniRoute",
      branch: "feature/ai-team-control-plane",
    },
  ]);
  assert.deepEqual(result, {
    status: "success",
    operation: "readFile",
    access: "read",
    result: { content: "ok" },
  });
});

test("blocks writes unless explicitly approved", async () => {
  let called = false;
  const gate = createRepositoryToolGate({
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    adapter: {
      async createFile() {
        called = true;
      },
    },
  });

  await assert.rejects(
    gate.run("createFile", { path: "ai-team/example.txt", content: "x" }),
    (error) =>
      error instanceof RepositoryToolError &&
      /requires explicit write approval/.test(error.message),
  );
  assert.equal(called, false);
});

test("allows an approved write while preserving repository and branch scope", async () => {
  const calls = [];
  const gate = createRepositoryToolGate({
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    writeApproved: true,
    adapter: {
      async updateFile(input) {
        calls.push(input);
        return { commitSha: "abc123" };
      },
    },
  });

  const result = await gate.run("updateFile", {
    path: "ai-team/src/task.mjs",
    content: "updated",
    repository: "other/repo",
    branch: "main",
  });

  assert.deepEqual(calls, [
    {
      path: "ai-team/src/task.mjs",
      content: "updated",
      repository: "rntlgopinath57/OmniRoute",
      branch: "feature/ai-team-control-plane",
    },
  ]);
  assert.deepEqual(result, {
    status: "success",
    operation: "updateFile",
    access: "write",
    result: { commitSha: "abc123" },
  });
});

test("rejects unsupported repository operations", async () => {
  const gate = createRepositoryToolGate({
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    adapter: {},
  });

  await assert.rejects(
    gate.run("forcePush", {}),
    (error) =>
      error instanceof RepositoryToolError &&
      /Unsupported repository operation/.test(error.message),
  );
});

test("rejects operations missing from the repository adapter", async () => {
  const gate = createRepositoryToolGate({
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    adapter: {},
  });

  await assert.rejects(
    gate.run("readFile", { path: "README.md" }),
    (error) =>
      error instanceof RepositoryToolError &&
      /does not support readFile/.test(error.message),
  );
});
