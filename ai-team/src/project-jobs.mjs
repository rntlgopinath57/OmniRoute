import { orchestrateTask } from "./orchestrator.mjs";
import { createRepositoryToolGate } from "./repository-tools.mjs";

export class ProjectJobError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ProjectJobError";
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

export function defineProjectJob({ id, project, repository, branch, task, allowWrites = false }) {
  return Object.freeze({
    id: requireNonEmptyString(id, "job.id"),
    project: requireNonEmptyString(project, "job.project"),
    repository: requireNonEmptyString(repository, "job.repository"),
    branch: requireNonEmptyString(branch, "job.branch"),
    task: requireNonEmptyString(task, "job.task"),
    allowWrites: allowWrites === true,
  });
}

export async function runProjectJob({
  job,
  plannerClient,
  providerClients,
  reviewerClients,
  repositoryAdapter,
  writeApproved = false,
  orchestrate = orchestrateTask,
}) {
  const projectJob = defineProjectJob(job);

  if (!plannerClient || typeof plannerClient.plan !== "function") {
    throw new ProjectJobError("Planner client must provide plan()");
  }

  if (!repositoryAdapter || typeof repositoryAdapter !== "object") {
    throw new ProjectJobError("Repository adapter must be provided");
  }

  if (typeof orchestrate !== "function") {
    throw new ProjectJobError("orchestrate must be a function");
  }

  const requestedWrite = writeApproved === true;
  if (requestedWrite && !projectJob.allowWrites) {
    throw new ProjectJobError(`Project job ${projectJob.id} does not allow writes`);
  }

  const repositoryTools = createRepositoryToolGate({
    repository: projectJob.repository,
    branch: projectJob.branch,
    adapter: repositoryAdapter,
    writeApproved: projectJob.allowWrites && requestedWrite,
  });

  const scopedPlanner = {
    async plan(input) {
      return plannerClient.plan({
        ...input,
        jobId: projectJob.id,
        project: projectJob.project,
        repository: {
          name: projectJob.repository,
          branch: projectJob.branch,
        },
        repositoryTools,
      });
    },
  };

  const result = await orchestrate({
    input: { task: projectJob.task },
    plannerClient: scopedPlanner,
    providerClients,
    reviewerClients,
  });

  return {
    status: result.status,
    jobId: projectJob.id,
    project: projectJob.project,
    repository: projectJob.repository,
    branch: projectJob.branch,
    writeApproved: repositoryTools.writeApproved,
    result,
  };
}
