"use strict";

const vscode = require("vscode");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * @typedef {Object} GitStatus
 * @property {boolean} available - Whether git extension is available
 * @property {string} error - Error message if unavailable
 * @property {string|null} repoRoot - Git repository root path
 * @property {string|null} branch - Current branch name
 * @property {string|null} commitHash - Short commit hash
 * @property {string|null} commitSummary - Latest commit summary
 * @property {number} changes - Working tree changes count
 * @property {number} indexChanges - Staged changes count
 * @property {number} untracked - Untracked files count
 * @property {boolean} clean - Whether working tree is clean
 * @property {string[]} changedFiles - List of changed file paths
 */

/**
 * Read git status from VS Code Git extension API (read-only).
 * Falls back to git CLI if the extension API is unavailable or returns no repositories.
 *
 * @param {string} [workspacePath] - Optional workspace path for CLI fallback
 * @returns {Promise<GitStatus>}
 */
async function getGitStatus(workspacePath) {
  // Runtime diagnostics — populated throughout the function
  var diag = {
    gitApiExtensionFound: "N/A",
    gitApiActivated: "N/A",
    gitApiRepositoryCount: "N/A",
    gitApiFirstRepoRootFsPath: "N/A",
    gitApiFirstRepoHeadName: "N/A",
    gitApiFirstRepoHeadCommit: "N/A",
    cliFallbackAttempted: "N/A",
    cliFallbackCwd: "N/A",
    cliFallbackCwdExists: "N/A",
    cliFallbackRevParseSuccess: "N/A",
    cliFallbackErrorMessage: "N/A"
  };

  var result = null;

  // Try VS Code Git extension API first
  try {
    var gitExt = vscode.extensions.getExtension("vscode.git");
    diag.gitApiExtensionFound = String(gitExt ? true : false);
    if (gitExt) {
      diag.gitApiActivated = String(gitExt.isActive ? true : false);
      if (!gitExt.isActive) {
        await gitExt.activate();
        diag.gitApiActivated = String(gitExt.isActive ? true : false);
      }
      var api = gitExt.exports.getAPI(1);
      if (api && api.repositories) {
        diag.gitApiRepositoryCount = String(api.repositories.length);
        if (api.repositories.length > 0) {
          var firstRepo = api.repositories[0];
          diag.gitApiFirstRepoRootFsPath = (firstRepo.rootUri && firstRepo.rootUri.fsPath) ? String(firstRepo.rootUri.fsPath) : "N/A";
          var apiHead = (firstRepo.state && firstRepo.state.HEAD) ? firstRepo.state.HEAD : null;
          diag.gitApiFirstRepoHeadName = (apiHead && apiHead.name) ? String(apiHead.name) : "N/A";
          diag.gitApiFirstRepoHeadCommit = (apiHead && apiHead.commit) ? String(apiHead.commit) : "N/A";

          var apiResult = buildStatusFromApi(firstRepo);
          if (apiResult.repoRoot && (apiResult.branch || apiResult.commitHash)) {
            result = apiResult;
          }
          // API returned repo with incomplete HEAD data — fall through to CLI
        }
      }
    }
  } catch (_e) {
    // API failed, fall through to CLI fallback
  }

  // CLI fallback for Extension Dev Host or when Git API has no repos
  if (!result && workspacePath) {
    diag.cliFallbackAttempted = "true";
    diag.cliFallbackCwd = workspacePath;
    try {
      diag.cliFallbackCwdExists = String(fs.existsSync(workspacePath));
    } catch (_e) {
      diag.cliFallbackCwdExists = "N/A";
    }
    try {
      result = getGitStatusCli(workspacePath);
      diag.cliFallbackRevParseSuccess = String(result.available);
      diag.cliFallbackErrorMessage = result.error || "N/A";
    } catch (e) {
      diag.cliFallbackRevParseSuccess = "false";
      diag.cliFallbackErrorMessage = e.message || String(e);
      result = errorResult("Git status read failed: " + (e.message || String(e)));
    }
  }

  if (!result) {
    diag.cliFallbackAttempted = diag.cliFallbackAttempted === "N/A" ? "false" : diag.cliFallbackAttempted;
    result = errorResult("No Git repository detected");
  }

  // Verify API commit against CLI git rev-parse HEAD.
  // The VS Code Git API state.HEAD.commit can be stale when commits
  // are made externally (e.g., terminal, another process). CLI is authoritative.
  if (result && result.available && workspacePath) {
    diag.cliVerifyAttempted = "true";
    diag.cliVerifyApiCommitHash = String(result.commitHash || "N/A");
    diag.commitSourceMismatch = "false";
    diag.cliVerifyHead = "N/A";
    diag.currentCommitSource = "git_api";
    try {
      var cliHead = execSync("git rev-parse --short HEAD", { cwd: workspacePath, encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
      diag.cliVerifyHead = cliHead;
      if (cliHead && cliHead.length >= 7 && result.commitHash !== cliHead) {
        var cliFullHead;
        try {
          cliFullHead = execSync("git rev-parse HEAD", { cwd: workspacePath, encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
        } catch (_) {
          cliFullHead = cliHead;
        }
        diag.commitSourceMismatch = "true";
        diag.currentCommitSource = "cli_override";
        result.commitHash = cliHead;
        result.commitSummary = cliFullHead || cliHead;
      }
    } catch (_e) {
      diag.cliVerifyHead = "error:" + (_e.message || String(_e));
    }
  }

  result.diagnostics = diag;
  return result;
}

/**
 * Build GitStatus from VS Code Git extension API repository.
 * @param {Object} repo
 * @returns {GitStatus}
 */
function buildStatusFromApi(repo) {
  const state = repo.state || {};

  const workingChangesRaw = Array.isArray(state.workingTreeChanges) ? state.workingTreeChanges : [];
  const stagedChanges = Array.isArray(state.indexChanges) ? state.indexChanges : [];
  const untrackedChangesRaw = Array.isArray(state.untrackedChanges) ? state.untrackedChanges : [];

  // Separate untracked files from working tree changes.
  // VS Code Git extension reports untracked files in workingTreeChanges
  // with status === 7 (Status.UNTRACKED) when git.untrackedChanges is "mixed".
  const workingChanges = [];
  const untrackedFromWorking = [];
  for (let w = 0; w < workingChangesRaw.length; w++) {
    const wc = workingChangesRaw[w];
    if (wc && wc.status === 7) {
      untrackedFromWorking.push(wc);
    } else {
      workingChanges.push(wc);
    }
  }

  // Merge untracked from both sources
  const allUntracked = untrackedChangesRaw.concat(untrackedFromWorking);

  const changedFiles = [];
  for (let w = 0; w < workingChanges.length; w++) {
    const wc = workingChanges[w];
    const wPath = (wc && wc.uri && wc.uri.fsPath) ? wc.uri.fsPath : null;
    if (wPath) {
      changedFiles.push(wPath);
    }
  }
  for (let s = 0; s < stagedChanges.length; s++) {
    const sc = stagedChanges[s];
    const sPath = (sc && sc.uri && sc.uri.fsPath) ? sc.uri.fsPath : null;
    if (sPath && changedFiles.indexOf(sPath) === -1) {
      changedFiles.push(sPath);
    }
  }
  for (let u = 0; u < allUntracked.length; u++) {
    const uc = allUntracked[u];
    const uPath = (uc && uc.uri && uc.uri.fsPath) ? uc.uri.fsPath : null;
    if (uPath && changedFiles.indexOf(uPath) === -1) {
      changedFiles.push(uPath);
    }
  }

  const head = state.HEAD || {};
  const branch = head.name || null;
  const commitHash = head.commit ? head.commit.substring(0, 7) : null;
  const commitSummary = head.commit || null;

  const clean = workingChanges.length === 0 && stagedChanges.length === 0 && allUntracked.length === 0;

  return {
    available: true,
    error: null,
    repoRoot: repo.rootUri ? repo.rootUri.fsPath : null,
    branch: branch,
    commitHash: commitHash,
    commitSummary: commitSummary,
    changes: workingChanges.length + stagedChanges.length,
    indexChanges: stagedChanges.length,
    untracked: allUntracked.length,
    clean: clean,
    changedFiles: changedFiles
  };
}

/**
 * Build GitStatus using read-only git CLI commands.
 * Only runs against the provided workspacePath; no arbitrary input.
 *
 * @param {string} workspacePath
 * @returns {GitStatus}
 */
function getGitStatusCli(workspacePath) {
  const opts = { cwd: workspacePath, encoding: "utf8", timeout: 10000, windowsHide: true };

  // 1. Find git repo root
  let repoRoot;
  try {
    repoRoot = execSync("git rev-parse --show-toplevel", opts).trim();
  } catch (_e) {
    return errorResult("No Git repository detected");
  }

  // 2. Get branch name
  let branch = null;
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", opts).trim();
  } catch (_e) {
    // keep null
  }

  // 3. Get commit hash (short)
  let commitHash = null;
  try {
    const fullHash = execSync("git rev-parse HEAD", opts).trim();
    commitHash = fullHash.substring(0, 7);
  } catch (_e) {
    // keep null
  }

  // 4. Get latest commit summary (oneline)
  let commitSummary = null;
  try {
    commitSummary = execSync("git log -1 --oneline", opts).trim();
  } catch (_e) {
    // keep null
  }

  // 5. Get working tree status (porcelain)
  let statusOutput = "";
  try {
    statusOutput = execSync("git status --porcelain", opts).trim();
  } catch (_e) {
    // keep empty
  }

  // Parse porcelain status
  const changedFiles = [];
  let indexChanges = 0;
  let workingChanges = 0;
  let untracked = 0;

  if (statusOutput) {
    const lines = statusOutput.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 3) {
        continue;
      }

      const statusCode = line.substring(0, 2);
      let filePart = line.substring(3).trim();

      // Handle renamed/copied: "R  old -> new"
      const arrowIdx = filePart.indexOf(" -> ");
      if (arrowIdx !== -1) {
        filePart = filePart.substring(arrowIdx + 4);
      }

      changedFiles.push(filePart);

      const indexChar = statusCode[0];
      const workChar = statusCode[1];

      if (indexChar !== " " && indexChar !== "?") {
        indexChanges++;
      }
      if (workChar !== " " && indexChar !== "?") {
        workingChanges++;
      }
      if (indexChar === "?" && workChar === "?") {
        untracked++;
      }
    }
  }

  const clean = indexChanges === 0 && workingChanges === 0 && untracked === 0;

  return {
    available: true,
    error: null,
    repoRoot: repoRoot,
    branch: branch,
    commitHash: commitHash,
    commitSummary: commitSummary,
    changes: indexChanges + workingChanges,
    indexChanges: indexChanges,
    untracked: untracked,
    clean: clean,
    changedFiles: changedFiles
  };
}

/**
 * Build an error/unavailable GitStatus result.
 * @param {string} errorMsg
 * @returns {GitStatus}
 */
function errorResult(errorMsg) {
  return {
    available: false,
    error: errorMsg,
    repoRoot: null,
    branch: null,
    commitHash: null,
    commitSummary: null,
    changes: 0,
    indexChanges: 0,
    untracked: 0,
    clean: true,
    changedFiles: []
  };
}

module.exports = { getGitStatus, getGitStatusCli };
