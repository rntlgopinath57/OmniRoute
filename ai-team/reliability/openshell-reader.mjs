import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const REPO = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const SANDBOX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

// Opt-in, read-only Github metadata probe. Execution MUST occur within
// an already provisioned OpenShell sandbox governed by ops/openshell policy.
export function createOpenShellGitHubReader({
  enabled = false, sandboxName, execFileImpl = runFile,
} = {}) {
  return {
    async readRepository(repository) {
      if (!enabled) return { ok: false, reason: "disabled" };
      if (!SANDBOX.test(String(sandboxName || ""))) {
        return { ok: false, reason: "invalid_sandbox" };
      }
      if (!REPO.test(String(repository || ""))) {
        return { ok: false, reason: "invalid_repo" };
      }
      if (!new Set(["nvidia/openshell", "rntlgopinath57/omniroute"])
        .has(repository.toLowerCase())) {
        return { ok: false, reason: "repo_not_allowlisted" };
      }
      const [owner, name] = repository.split("/");
      const url = "https://api.github.com/repos/" +
        encodeURIComponent(owner) + "/" + encodeURIComponent(name);
      try {
        const result = await execFileImpl("openshell", [
          "sandbox", "exec", "-n", sandboxName, "--no-login-shell", "--",
          "/usr/bin/curl", "--fail", "--silent", "--show-error", url,
        ], { timeout: 10000, maxBuffer: 131072 });
        const payload = JSON.parse(result.stdout);
        if (payload.full_name?.toLowerCase() !== repository.toLowerCase()) {
          return { ok: false, reason: "wrong_repo_or_response" };
        }
        return {
          ok: true, repository: payload.full_name,
          defaultBranch: payload.default_branch, archived: payload.archived === true,
        };
      } catch {
        // Missing CLI, missing sandbox, policy denied, timeout or malformed output:
        // never claim successful execution and never silently use host shell.
        return { ok: false, reason: "sandbox_execution_unverified" };
      }
    },
  };
}
