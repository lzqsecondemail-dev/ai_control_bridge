"use strict";

/**
 * M3-A.0 Project Status Automated Regression Test
 *
 * Tests the core project status / git status logic without requiring
 * the VS Code Extension Development Host. Mocks the vscode module
 * via Module._load so the real source files can be required and tested.
 *
 * Usage: node test/test-project-status.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");
const Module = require("module");

// ---------------------------------------------------------------------------
// vscode mock — must be installed BEFORE any source file is required
// ---------------------------------------------------------------------------
const mockVscode = {
  extensions: {
    _gitExt: null,
    getExtension: function (id) {
      if (id === "vscode.git" && this._gitExt) {
        return this._gitExt;
      }
      return undefined;
    }
  },
  workspace: {
    workspaceFolders: undefined
  },
  Uri: {
    file: function (p) {
      return { fsPath: p, path: p, scheme: "file" };
    }
  }
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return mockVscode;
  }
  return origLoad.apply(this, arguments);
};

// ---------------------------------------------------------------------------
// Now safe to require source modules — they get the mock vscode
// ---------------------------------------------------------------------------
const gitStatus = require("../src/gitStatus.js");
const projectStatus = require("../src/projectStatus.js");

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function record(ok, name, detail) {
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ name: name, detail: detail });
    console.error("  FAIL:", name, detail ? "— " + detail : "");
  }
}

function assert(cond, name, detail) {
  record(cond, name, detail);
}

function assertEqual(actual, expected, name) {
  const ok = actual === expected;
  if (!ok) {
    record(false, name, "expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
  } else {
    record(true, name, "");
  }
}

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "acb-test-"));
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // best-effort
  }
}

function isGitAvailable() {
  try {
    execSync("git --version", { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch (_e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function createCleanGitRepo() {
  const dir = createTempDir();
  const opts = { cwd: dir, encoding: "utf8", stdio: "pipe", windowsHide: true };
  execSync("git init", opts);
  fs.writeFileSync(path.join(dir, "README.md"), "# Test Repo\n\nFor ACB automated regression.\n", "utf8");
  execSync("git add README.md", opts);
  execSync('git commit -m "initial commit"', opts);
  try {
    execSync("git branch -m master", opts);
  } catch (_e) {
    // may already be master
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Tests: normalizeWorkspacePath
// ---------------------------------------------------------------------------
function testNormalizePath() {
  console.log("\n=== normalizeWorkspacePath ===");

  if (process.platform === "win32") {
    // Missing drive letter, URI path has it
    const folder1 = {
      name: "acb-status-test",
      uri: {
        fsPath: "\\data\\GameDev\\acb-status-test",
        path: "/D:/data/GameDev/acb-status-test"
      }
    };
    const r1 = projectStatus.normalizeWorkspacePath(folder1);
    assert(/^[a-zA-Z]:\\/.test(r1),
      "Win: missing drive letter reconstructed",
      "got: " + r1);
    assert(r1.indexOf("acb-status-test") !== -1,
      "Win: path contains folder name",
      "got: " + r1);
    assert(r1.indexOf("::") === -1,
      "Win: no double colon after reconstruction",
      "got: " + r1);

    // Drive letter already present
    const folder2 = {
      name: "acb-status-test",
      uri: {
        fsPath: "D:\\data\\GameDev\\acb-status-test",
        path: "/D:/data/GameDev/acb-status-test"
      }
    };
    const r2 = projectStatus.normalizeWorkspacePath(folder2);
    assert(/^[a-zA-Z]:\\/.test(r2),
      "Win: drive letter preserved",
      "got: " + r2);
    assert(r2.indexOf("::") === -1,
      "Win: no double colon (drive letter case)",
      "got: " + r2);

    // Forward slashes normalized
    const folder3 = {
      name: "test",
      uri: {
        fsPath: "D:/data/GameDev/acb-status-test",
        path: "/D:/data/GameDev/acb-status-test"
      }
    };
    const r3 = projectStatus.normalizeWorkspacePath(folder3);
    assert(r3.indexOf("/") === -1,
      "Win: forward slashes normalized to backslashes",
      "got: " + r3);
    assert(r3.indexOf("::") === -1,
      "Win: no double colon (forward slash case)",
      "got: " + r3);
  } else {
    const folder4 = {
      name: "test",
      uri: {
        fsPath: "/home/user/project",
        path: "/home/user/project"
      }
    };
    const r4 = projectStatus.normalizeWorkspacePath(folder4);
    assertEqual(r4, "/home/user/project", "Unix: path unchanged");
  }
}

// ---------------------------------------------------------------------------
// Tests: getGitStatusCli (clean repo)
// ---------------------------------------------------------------------------
function testGitCliClean() {
  console.log("\n=== getGitStatusCli (clean repo) ===");

  if (!isGitAvailable()) {
    console.log("  SKIP: git not available on PATH");
    return;
  }

  const repoDir = createCleanGitRepo();
  try {
    const st = gitStatus.getGitStatusCli(repoDir);

    assertEqual(st.available, true, "git available");
    assert(st.repoRoot !== null, "repoRoot not null");
    if (st.repoRoot) {
      assert(path.normalize(st.repoRoot) === path.normalize(repoDir),
        "repoRoot matches temp dir",
        "expected " + repoDir + " got " + st.repoRoot);
    }
    assertEqual(st.branch, "master", "branch is master");
    assert(st.commitHash !== null, "commitHash not null");
    if (st.commitHash) {
      assert(st.commitHash.length >= 7,
        "commitHash length >= 7",
        "len=" + st.commitHash.length + " val=" + st.commitHash);
    }
    assert(st.commitSummary !== null, "commitSummary not null");
    assertEqual(st.clean, true, "working tree clean");
    assertEqual(st.changes, 0, "changes = 0");
    assertEqual(st.indexChanges, 0, "indexChanges = 0");
    assertEqual(st.untracked, 0, "untracked = 0");
    assert(Array.isArray(st.changedFiles), "changedFiles is array");
    assertEqual(st.changedFiles.length, 0, "changedFiles empty");
    assertEqual(st.error, null, "error is null");
  } finally {
    removeTempDir(repoDir);
  }
}

// ---------------------------------------------------------------------------
// Tests: getGitStatusCli (dirty repo)
// ---------------------------------------------------------------------------
function testGitCliDirty() {
  console.log("\n=== getGitStatusCli (dirty repo) ===");

  if (!isGitAvailable()) {
    console.log("  SKIP: git not available on PATH");
    return;
  }

  const repoDir = createCleanGitRepo();
  try {
    fs.appendFileSync(path.join(repoDir, "README.md"), "\nDirty change.\n", "utf8");

    const st = gitStatus.getGitStatusCli(repoDir);

    assertEqual(st.available, true, "git available");
    assertEqual(st.clean, false, "working tree dirty");
    assert(st.changes > 0, "changes > 0", "got: " + st.changes);
    assert(st.changedFiles.length > 0,
      "changedFiles has entries",
      "got: " + st.changedFiles.length);
  } finally {
    removeTempDir(repoDir);
  }
}

// ---------------------------------------------------------------------------
// Tests: getGitStatusCli (non-git directory)
// ---------------------------------------------------------------------------
function testGitCliNonGit() {
  console.log("\n=== getGitStatusCli (non-git directory) ===");

  if (!isGitAvailable()) {
    console.log("  SKIP: git not available on PATH");
    return;
  }

  const plainDir = createTempDir();
  try {
    const st = gitStatus.getGitStatusCli(plainDir);

    assertEqual(st.available, false, "git not available");
    assert(st.error.indexOf("No Git repository detected") !== -1,
      "error says no repo detected",
      "got: " + st.error);
    assertEqual(st.repoRoot, null, "repoRoot is null");
  } finally {
    removeTempDir(plainDir);
  }
}

// ---------------------------------------------------------------------------
// Tests: getGitStatus integration (CLI fallback with mock vscode)
// ---------------------------------------------------------------------------
async function testGetGitStatusIntegration() {
  console.log("\n=== getGitStatus integration (CLI fallback) ===");

  if (!isGitAvailable()) {
    console.log("  SKIP: git not available on PATH");
    return;
  }

  const repoDir = createCleanGitRepo();
  try {
    // mockVscode has no git extension → falls through to CLI
    const st = await gitStatus.getGitStatus(repoDir);

    assertEqual(st.available, true, "git available via CLI fallback");
    assert(st.repoRoot !== null, "repoRoot detected");
    assertEqual(st.branch, "master", "branch is master");
    assert(st.commitHash !== null && st.commitHash.length >= 7,
      "commitHash detected",
      "got: " + st.commitHash);
    assertEqual(st.clean, true, "clean repo");
    assertEqual(st.changes, 0, "changes = 0");
  } finally {
    removeTempDir(repoDir);
  }
}

// ---------------------------------------------------------------------------
// Tests: getGitStatus with API returning incomplete HEAD data
// ---------------------------------------------------------------------------
async function testGetGitStatusApiIncomplete() {
  console.log("\n=== getGitStatus integration (API incomplete → CLI fallback) ===");

  if (!isGitAvailable()) {
    console.log("  SKIP: git not available on PATH");
    return;
  }

  const repoDir = createCleanGitRepo();
  try {
    // Mock git extension that returns a repo with no HEAD data
    mockVscode.extensions._gitExt = {
      isActive: true,
      exports: {
        getAPI: function () {
          return {
            repositories: [
              {
                rootUri: { fsPath: repoDir, path: repoDir },
                state: {
                  HEAD: undefined,
                  workingTreeChanges: [],
                  indexChanges: [],
                  untrackedChanges: []
                }
              }
            ]
          };
        }
      }
    };

    const st = await gitStatus.getGitStatus(repoDir);

    // Should fall through to CLI because API data is incomplete
    assertEqual(st.available, true, "git available via CLI fallback");
    assert(st.repoRoot !== null, "repoRoot detected via CLI");
    assertEqual(st.branch, "master", "branch detected via CLI");
    assert(st.commitHash !== null && st.commitHash.length >= 7,
      "commitHash detected via CLI",
      "got: " + st.commitHash);
  } finally {
    mockVscode.extensions._gitExt = null;
    removeTempDir(repoDir);
  }
}

// ---------------------------------------------------------------------------
// Tests: getGitStatus with null workspace (no workspace fallback)
// ---------------------------------------------------------------------------
async function testGetGitStatusNoWorkspace() {
  console.log("\n=== getGitStatus (no workspace) ===");

  const st = await gitStatus.getGitStatus(null);

  assertEqual(st.available, false, "git not available");
  assert(st.error.indexOf("No Git repository detected") !== -1,
    "error says no repo detected",
    "got: " + st.error);
  assertEqual(st.repoRoot, null, "repoRoot is null");
  assertEqual(st.branch, null, "branch is null");
}

// ---------------------------------------------------------------------------
// Tests: formatStatusSummary
// ---------------------------------------------------------------------------
function testFormatSummary() {
  console.log("\n=== formatStatusSummary ===");

  const mockStatus = {
    workspacePath: "D:\\data\\GameDev\\acb-status-test",
    workspaceName: "acb-status-test",
    hasWorkspace: true,
    git: {
      available: true,
      error: null,
      repoRoot: "D:\\data\\GameDev\\acb-status-test",
      branch: "master",
      commitHash: "a15d321",
      commitSummary: "a15d321 initial commit",
      changes: 0,
      indexChanges: 0,
      untracked: 0,
      clean: true,
      changedFiles: []
    },
    generatedAt: "2026-05-30T00:00:00.000Z"
  };

  const s = projectStatus.formatStatusSummary(mockStatus);

  assert(s.indexOf("Project Path: D:\\data\\GameDev\\acb-status-test") !== -1, "summary: Project Path");
  assert(s.indexOf("Workspace Name: acb-status-test") !== -1, "summary: Workspace Name");
  assert(s.indexOf("Git Root: D:\\data\\GameDev\\acb-status-test") !== -1, "summary: Git Root");
  assert(s.indexOf("Git Available: Yes") !== -1, "summary: Git Available Yes");
  assert(s.indexOf("Branch: master") !== -1, "summary: Branch");
  assert(s.indexOf("Current Commit: a15d321") !== -1, "summary: Current Commit");
  assert(s.indexOf("Working Tree: clean") !== -1, "summary: Working Tree clean");
  assert(s.indexOf("Changed Files: 0 (staged: 0, untracked: 0)") !== -1, "summary: Changed Files");

  // No-workspace fallback
  const noWs = {
    workspacePath: null,
    workspaceName: null,
    hasWorkspace: false,
    git: {
      available: false,
      error: "No Git repository detected",
      repoRoot: null,
      branch: null,
      commitHash: null,
      commitSummary: null,
      changes: 0,
      indexChanges: 0,
      untracked: 0,
      clean: true,
      changedFiles: []
    },
    generatedAt: "2026-05-30T00:00:00.000Z"
  };

  const ns = projectStatus.formatStatusSummary(noWs);
  assert(ns.indexOf("Project Path: No workspace opened") !== -1, "no-ws: No workspace opened");
  assert(ns.indexOf("Git Available: No") !== -1, "no-ws: Git Available No");
}

// ---------------------------------------------------------------------------
// Tests: getProjectStatus integration
// ---------------------------------------------------------------------------
async function testGetProjectStatusIntegration() {
  console.log("\n=== getProjectStatus integration ===");

  if (!isGitAvailable()) {
    console.log("  SKIP: git not available on PATH");
    return;
  }

  const repoDir = createCleanGitRepo();

  // Configure mock vscode with workspace
  const uriPath = process.platform === "win32"
    ? "/" + repoDir.replace(/\\/g, "/")
    : repoDir;
  mockVscode.workspace.workspaceFolders = [
    {
      name: "acb-status-test",
      uri: {
        fsPath: repoDir,
        path: uriPath,
        scheme: "file"
      },
      index: 0
    }
  ];

  try {
    const st = await projectStatus.getProjectStatus();

    assertEqual(st.hasWorkspace, true, "hasWorkspace true");

    if (process.platform === "win32") {
      assert(/^[a-zA-Z]:/.test(st.workspacePath || ""),
        "workspacePath has drive letter",
        "got: " + st.workspacePath);
    }
    assert(st.workspacePath !== null, "workspacePath not null");
    assertEqual(st.workspaceName, "acb-status-test", "workspaceName correct");
    assertEqual(st.git.available, true, "git available via CLI fallback");
    assert(st.git.repoRoot !== null, "repoRoot detected");
    assertEqual(st.git.branch, "master", "branch is master");
    assertEqual(st.git.clean, true, "clean repo");
    assertEqual(st.git.changes, 0, "changes = 0");
    assert(st.generatedAt !== undefined, "generatedAt present");

    // No-workspace fallback
    mockVscode.workspace.workspaceFolders = undefined;
    const noWs = await projectStatus.getProjectStatus();

    assertEqual(noWs.hasWorkspace, false, "hasWorkspace false (no ws)");
    assertEqual(noWs.workspacePath, null, "workspacePath null (no ws)");
    assertEqual(noWs.git.available, false, "git not available (no ws)");
  } finally {
    mockVscode.workspace.workspaceFolders = undefined;
    removeTempDir(repoDir);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("ACB M3-A.0 Project Status Automated Regression Test");
  console.log("Platform: " + process.platform);
  console.log("Node: " + process.version);
  console.log("Git: " + (isGitAvailable() ? "available" : "NOT AVAILABLE"));

  // Sync tests
  testNormalizePath();
  testGitCliClean();
  testGitCliDirty();
  testGitCliNonGit();
  testFormatSummary();

  // Async tests
  await testGetGitStatusIntegration();
  await testGetGitStatusApiIncomplete();
  await testGetGitStatusNoWorkspace();
  await testGetProjectStatusIntegration();

  // Results
  const total = passed + failed;
  console.log("\n========================================");
  console.log("RESULTS: " + passed + " passed, " + failed + " failed, " + total + " total");
  if (failures.length > 0) {
    console.log("\nFAILURES:");
    failures.forEach(function (f) {
      console.log("  - " + f.name + (f.detail ? " (" + f.detail + ")" : ""));
    });
  }
  console.log("========================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

// Restore Module._load on process exit so any subsequent requires work normally
process.on("exit", function () {
  Module._load = origLoad;
});

main().catch(function (err) {
  console.error("FATAL:", err.message || String(err));
  Module._load = origLoad;
  process.exit(1);
});
