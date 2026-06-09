"use strict";

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const gitStatus = require("./gitStatus.js");

/**
 * @typedef {Object} ProjectStatus
 * @property {string|null} workspacePath - Current workspace path
 * @property {string|null} workspaceName - Workspace folder name
 * @property {boolean} hasWorkspace - Whether a workspace is opened
 * @property {Object} git - Git status from gitStatus module
 * @property {string} generatedAt - ISO timestamp
 */

/**
 * Normalize a workspace folder path, ensuring the drive letter
 * is preserved on Windows (defends against VS Code edge cases
 * where fsPath may lose the drive letter).
 *
 * @param {vscode.WorkspaceFolder} folder
 * @returns {string}
 */
function normalizeWorkspacePath(folder) {
  let fsPath = folder.uri.fsPath;

  if (process.platform === "win32") {
    // Ensure drive letter is present
    if (!/^[a-zA-Z]:/.test(fsPath)) {
      // Reconstruct Windows drive paths from URI path form.
      const uriPath = folder.uri.path;
      const match = uriPath.match(/^\/([a-zA-Z]):/);
      if (match) {
        fsPath = match[1].toUpperCase() + ":" + uriPath.substring(3).replace(/\//g, "\\");
      }
    }
  }

  return path.normalize(fsPath);
}

/**
 * Collect read-only project status for the current workspace.
 * Never modifies files, never executes commands directly.
 *
 * @returns {Promise<ProjectStatus>}
 */
async function getProjectStatus() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  const hasWorkspace = Boolean(workspaceFolders && workspaceFolders.length > 0);

  // Build workspace runtime diagnostics
  const diag = {
    diagnosticsEnabled: true,
    processPlatform: String(process.platform),
    processCwd: String(process.cwd()),
    workspaceFoldersLength: String(workspaceFolders ? workspaceFolders.length : 0),
    folderName: "N/A",
    folderIndexUsed: "N/A",
    folderUriToString: "N/A",
    folderUriScheme: "N/A",
    folderUriAuthority: "N/A",
    folderUriPath: "N/A",
    folderUriFsPath: "N/A",
    rawWorkspacePathBeforeNormalize: "N/A",
    normalizedWorkspacePath: "N/A",
    normalizedWorkspacePathExists: "N/A",
    normalizedWorkspacePathIsDirectory: "N/A"
  };

  let workspacePath = null;
  let workspaceName = null;

  if (hasWorkspace) {
    const folder = workspaceFolders[0];

    // Capture raw URI values before normalization
    diag.folderName = folder.name || "N/A";
    diag.folderIndexUsed = String(folder.index !== undefined ? folder.index : 0);
    try { diag.folderUriToString = String(folder.uri); } catch (_e) { diag.folderUriToString = "N/A"; }
    diag.folderUriScheme = (folder.uri && folder.uri.scheme) ? folder.uri.scheme : "N/A";
    diag.folderUriAuthority = (folder.uri && folder.uri.authority !== undefined) ? String(folder.uri.authority) : "N/A";
    diag.folderUriPath = (folder.uri && folder.uri.path) ? folder.uri.path : "N/A";
    diag.folderUriFsPath = (folder.uri && folder.uri.fsPath) ? folder.uri.fsPath : "N/A";
    diag.rawWorkspacePathBeforeNormalize = diag.folderUriFsPath;

    workspacePath = normalizeWorkspacePath(folder);
    workspaceName = folder.name;

    diag.normalizedWorkspacePath = workspacePath;
    try {
      diag.normalizedWorkspacePathExists = String(fs.existsSync(workspacePath));
      if (fs.existsSync(workspacePath)) {
        try {
          diag.normalizedWorkspacePathIsDirectory = String(fs.statSync(workspacePath).isDirectory());
        } catch (_e) {
          diag.normalizedWorkspacePathIsDirectory = "N/A";
        }
      }
    } catch (_e) {
      diag.normalizedWorkspacePathExists = "N/A";
      diag.normalizedWorkspacePathIsDirectory = "N/A";
    }
  }

  const git = await gitStatus.getGitStatus(workspacePath);

  // Merge git diagnostics into workspace diagnostics
  if (git.diagnostics) {
    diag.gitApiExtensionFound = git.diagnostics.gitApiExtensionFound;
    diag.gitApiActivated = git.diagnostics.gitApiActivated;
    diag.gitApiRepositoryCount = git.diagnostics.gitApiRepositoryCount;
    diag.gitApiFirstRepoRootFsPath = git.diagnostics.gitApiFirstRepoRootFsPath;
    diag.gitApiFirstRepoHeadName = git.diagnostics.gitApiFirstRepoHeadName;
    diag.gitApiFirstRepoHeadCommit = git.diagnostics.gitApiFirstRepoHeadCommit;
    diag.cliFallbackAttempted = git.diagnostics.cliFallbackAttempted;
    diag.cliFallbackCwd = git.diagnostics.cliFallbackCwd;
    diag.cliFallbackCwdExists = git.diagnostics.cliFallbackCwdExists;
    diag.cliFallbackRevParseSuccess = git.diagnostics.cliFallbackRevParseSuccess;
    diag.cliFallbackErrorMessage = git.diagnostics.cliFallbackErrorMessage;
  }

  return {
    workspacePath: workspacePath,
    workspaceName: workspaceName,
    hasWorkspace: hasWorkspace,
    git: git,
    diagnostics: diag,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Format project status as plain text for clipboard copy.
 * @param {ProjectStatus} status
 * @returns {string}
 */
function formatStatusSummary(status) {
  const lines = [
    "ACB Project Status",
    "Project Path: " + (status.workspacePath || "No workspace opened"),
    "Workspace Name: " + (status.workspaceName || "N/A"),
    "Git Root: " + (status.git.repoRoot || "N/A"),
    "Git Available: " + (status.git.available ? "Yes" : "No" + (status.git.error ? " — " + status.git.error : "")),
    "Branch: " + (status.git.branch || "N/A"),
    "Current Commit: " + (status.git.commitHash || "N/A"),
    "Latest Commit: " + (status.git.commitSummary || "N/A"),
    "Working Tree: " + (status.git.available ? (status.git.clean ? "clean" : "dirty") : "unknown"),
    "Changed Files: " + String(status.git.changes) + " (staged: " + String(status.git.indexChanges) + ", untracked: " + String(status.git.untracked) + ")",
    "GeneratedAt: " + status.generatedAt
  ];

  if (status.git.available && status.git.changedFiles.length > 0) {
    lines.push("");
    lines.push("Changed Files:");
    const maxShow = 20;
    for (let i = 0; i < status.git.changedFiles.length && i < maxShow; i++) {
      lines.push("  - " + status.git.changedFiles[i]);
    }
    if (status.git.changedFiles.length > maxShow) {
      lines.push("  ... and " + String(status.git.changedFiles.length - maxShow) + " more");
    }
  }

  // Runtime Diagnostics section
  if (status.diagnostics) {
    const d = status.diagnostics;
    lines.push("");
    lines.push("---");
    lines.push("Runtime Diagnostics");
    lines.push("diagnosticsEnabled: " + d.diagnosticsEnabled);
    lines.push("processPlatform: " + d.processPlatform);
    lines.push("processCwd: " + d.processCwd);
    lines.push("workspaceFoldersLength: " + d.workspaceFoldersLength);
    lines.push("folderName: " + d.folderName);
    lines.push("folderIndexUsed: " + d.folderIndexUsed);
    lines.push("folderUriToString: " + d.folderUriToString);
    lines.push("folderUriScheme: " + d.folderUriScheme);
    lines.push("folderUriAuthority: " + d.folderUriAuthority);
    lines.push("folderUriPath: " + d.folderUriPath);
    lines.push("folderUriFsPath: " + d.folderUriFsPath);
    lines.push("rawWorkspacePathBeforeNormalize: " + d.rawWorkspacePathBeforeNormalize);
    lines.push("normalizedWorkspacePath: " + d.normalizedWorkspacePath);
    lines.push("normalizedWorkspacePathExists: " + d.normalizedWorkspacePathExists);
    lines.push("normalizedWorkspacePathIsDirectory: " + d.normalizedWorkspacePathIsDirectory);
    lines.push("gitApiExtensionFound: " + d.gitApiExtensionFound);
    lines.push("gitApiActivated: " + d.gitApiActivated);
    lines.push("gitApiRepositoryCount: " + d.gitApiRepositoryCount);
    lines.push("gitApiFirstRepoRootFsPath: " + d.gitApiFirstRepoRootFsPath);
    lines.push("gitApiFirstRepoHeadName: " + d.gitApiFirstRepoHeadName);
    lines.push("gitApiFirstRepoHeadCommit: " + d.gitApiFirstRepoHeadCommit);
    lines.push("cliFallbackAttempted: " + d.cliFallbackAttempted);
    lines.push("cliFallbackCwd: " + d.cliFallbackCwd);
    lines.push("cliFallbackCwdExists: " + d.cliFallbackCwdExists);
    lines.push("cliFallbackRevParseSuccess: " + d.cliFallbackRevParseSuccess);
    lines.push("cliFallbackErrorMessage: " + d.cliFallbackErrorMessage);
    lines.push("---");
  }

  return lines.join("\n");
}

module.exports = { getProjectStatus, formatStatusSummary, normalizeWorkspacePath };
