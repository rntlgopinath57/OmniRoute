export class RepositoryToolError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "RepositoryToolError";
  }
}

const OPERATIONS = Object.freeze({
  readFile: Object.freeze({ access: "read", method: "readFile" }),
  listFiles: Object.freeze({ access: "read", method: "listFiles" }),
  searchFiles: Object.freeze({ access: "read", method: "searchFiles" }),
  createFile: Object.freeze({ access: "write", method: "createFile" }),
  updateFile: Object.freeze({ access: "write", method: "updateFile" }),
  deleteFile: Object.freeze({ access: "write", method: "deleteFile" }),
});

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function normalizePayload(payload) {
  if (payload == null) {
    return {};
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("repository tool payload must be an object");
  }

  return payload;
}

export function createRepositoryToolGate({ repository, branch, adapter, writeApproved = false }) {
  const repositoryName = requireNonEmptyString(repository, "repository");
  const branchName = requireNonEmptyString(branch, "branch");

  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("adapter must be an object");
  }

  const canWrite = writeApproved === true;

  return Object.freeze({
    repository: repositoryName,
    branch: branchName,
    writeApproved: canWrite,

    async run(operation, payload = {}) {
      const operationName = requireNonEmptyString(operation, "operation");
      const config = OPERATIONS[operationName];

      if (!config) {
        throw new RepositoryToolError(`Unsupported repository operation: ${operationName}`);
      }

      if (config.access === "write" && !canWrite) {
        throw new RepositoryToolError(
          `Repository write operation ${operationName} requires explicit write approval`,
        );
      }

      const method = adapter[config.method];
      if (typeof method !== "function") {
        throw new RepositoryToolError(`Repository adapter does not support ${operationName}`);
      }

      const input = normalizePayload(payload);
      const result = await method({
        ...input,
        repository: repositoryName,
        branch: branchName,
      });

      return {
        status: "success",
        operation: operationName,
        access: config.access,
        result,
      };
    },
  });
}
