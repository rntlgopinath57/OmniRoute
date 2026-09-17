import test from "node:test";
import assert from "node:assert/strict";

import { ProjectJobError, defineProjectJob, runProjectJob } from "../src/project-jobs.mjs";

function createOrchestrateStub() {
  return async ({ input, plannerClient }) => {
    const plan = await plannerClient.plan({ task: input.task, maxSteps: 3 });
    return {
      status: "success",
      task: input.task,
      plannedSteps: plan.steps.length,
      completedSteps: plan.steps.length,
      failedStep: null,
      results: [],
    };
  };
}

test("runs a named project job read-only with scoped repository tools", async () => {
  const repositoryCalls = [];
  const job = defineProjectJob({
    id: "security-review",
    project: "bharosa",
    repository: "rntlgopinath57/safeqr",
    branch: "main",
    task: "Review public QR exposure risks",
  });

  const result = await runProjectJob({
    job,
    plannerClient: {
      async plan(context) {
        assert.equal(context.jobId, "security-review");
        assert.equal(context.project, "bharosa");
        assert.deepEqual(context.repository, {
          name: "rntlgopinath57/safeqr",
          branch: "main",
        });
        assert.equal(context.repositoryTools.writeApproved, false);

        const readResult = await context.repositoryTools.run("readFile", {
          path: "README.md",
        });
        assert.equal(readResult.access, "read");

        return { steps: [{ task: "Inspect public profile flow" }] };
      },
    },
    repositoryAdapter: {
      async readFile(input) {
        repositoryCalls.push(input);
        return { content: "ok" };
      },
    },
    orchestrate: createOrchestrateStub(),
  });

  assert.deepEqual(repositoryCalls, [
    {
      path: "README.md",
      repository: "rntlgopinath57/safeqr",
      branch: "main",
    },
  ]);
  assert.equal(result.status, "success");
  assert.equal(result.jobId, "security-review");
  assert.equal(result.writeApproved, false);
});

test("read-only project jobs cannot be escalated at runtime", async () => {
  await assert.rejects(
    runProjectJob({
      job: {
        id: "repo-audit",
        project: "omniroute",
        repository: "rntlgopinath57/OmniRoute",
        branch: "feature/ai-team-control-plane",
        task: "Audit the AI Team files",
        allowWrites: false,
      },
      plannerClient: { async plan() { return { steps: [{ task: "Audit" }] }; } },
      repositoryAdapter: {},
      writeApproved: true,
      orchestrate: createOrchestrateStub(),
    }),
    (error) => error instanceof ProjectJobError && /does not allow writes/.test(error.message),
  );
});

test("write-enabled jobs still require explicit approval for each run", async () => {
  const job = defineProjectJob({
    id: "controlled-update",
    project: "omniroute",
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    task: "Apply one approved project change",
    allowWrites: true,
  });

  await runProjectJob({
    job,
    plannerClient: {
      async plan(context) {
        assert.equal(context.repositoryTools.writeApproved, false);
        await assert.rejects(
          context.repositoryTools.run("updateFile", {
            path: "ai-team/README.md",
            content: "blocked",
          }),
          /requires explicit write approval/,
        );
        return { steps: [{ task: "Prepare the change only" }] };
      },
    },
    repositoryAdapter: {
      async updateFile() {
        throw new Error("must not execute without approval");
      },
    },
    orchestrate: createOrchestrateStub(),
  });
});

test("write-enabled jobs can use the scoped gate only when explicitly approved", async () => {
  const writes = [];
  const job = defineProjectJob({
    id: "controlled-update",
    project: "omniroute",
    repository: "rntlgopinath57/OmniRoute",
    branch: "feature/ai-team-control-plane",
    task: "Apply one approved project change",
    allowWrites: true,
  });

  const result = await runProjectJob({
    job,
    writeApproved: true,
    plannerClient: {
      async plan(context) {
        assert.equal(context.repositoryTools.writeApproved, true);
        const writeResult = await context.repositoryTools.run("updateFile", {
          path: "ai-team/README.md",
          content: "approved",
        });
        assert.equal(writeResult.access, "write");
        return { steps: [{ task: "Verify the approved change" }] };
      },
    },
    repositoryAdapter: {
      async updateFile(input) {
        writes.push(input);
        return { sha: "abc123" };
      },
    },
    orchestrate: createOrchestrateStub(),
  });

  assert.deepEqual(writes, [
    {
      path: "ai-team/README.md",
      content: "approved",
      repository: "rntlgopinath57/OmniRoute",
      branch: "feature/ai-team-control-plane",
    },
  ]);
  assert.equal(result.writeApproved, true);
});
