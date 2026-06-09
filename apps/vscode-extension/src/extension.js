"use strict";

var vscode = require("vscode");
var http = require("http");
var projectStatus = require("./projectStatus.js");
var localBridgeServer = require("./localBridgeServer.js");

var executionTerminalBindings = {};
var lastExecutorTerminalLaunchState = null;

/**
 * Activate the ACB VS Code extension.
 * Registers read-only project status commands.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // --- Start local bridge server ---
  localBridgeServer.start().then(function (info) {
    console.log("[ACB] bridge server started on " + info.host + ":" + info.port);
    // Register terminal action handler for browser console targeted fill
    localBridgeServer.registerTerminalHandler(handleBridgeTerminalAction);
  }).catch(function (err) {
    console.error("[ACB] bridge server failed to start: " + (err.message || String(err)));
  });

  // --- Command: Show Project Status (Webview Panel) ---
  var showCmd = vscode.commands.registerCommand("acb.showProjectStatus", async function () {
    try {
      var status = await projectStatus.getProjectStatus();

      var panel = vscode.window.createWebviewPanel(
        "acbProjectStatus",
        "ACB Project Status",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = buildStatusHtml(status);

      // Handle copy request from webview
      panel.webview.onDidReceiveMessage(async function (msg) {
        if (msg.command === "copy") {
          var summary = projectStatus.formatStatusSummary(status);
          await vscode.env.clipboard.writeText(summary);
          vscode.window.showInformationMessage("ACB: Project status summary copied to clipboard.");
        } else if (msg.command === "refresh") {
          var refreshed = await projectStatus.getProjectStatus();
          panel.webview.html = buildStatusHtml(refreshed);
        } else if (msg.command === "openTaskCardReview") {
          await vscode.commands.executeCommand("acb.showTaskCardReview");
        } else if (msg.command === "openExecutionInbox") {
          await vscode.commands.executeCommand("acb.showExecutionInbox");
        }
      });
    } catch (err) {
      vscode.window.showErrorMessage("ACB: Failed to get project status — " + (err.message || String(err)));
    }
  });

  // --- Command: Copy Project Status Summary ---
  var copyCmd = vscode.commands.registerCommand("acb.copyProjectStatusSummary", async function () {
    try {
      var status = await projectStatus.getProjectStatus();
      var summary = projectStatus.formatStatusSummary(status);
      await vscode.env.clipboard.writeText(summary);
      vscode.window.showInformationMessage("ACB: Project status summary copied to clipboard.");
    } catch (err) {
      vscode.window.showErrorMessage("ACB: Failed to copy project status — " + (err.message || String(err)));
    }
  });

  // --- Command: Show Received Task Card Review (Webview Panel) ---
  var showReviewCmd = vscode.commands.registerCommand("acb.showTaskCardReview", async function () {
    try {
      var reviewResponse = await fetchBridgeTaskCardReviewLatest();
      var localStatus = await projectStatus.getProjectStatus();

      var panel = vscode.window.createWebviewPanel(
        "acbTaskCardReview",
        "ACB Task Card Review",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = buildTaskCardReviewHtml(reviewResponse, localStatus);

      panel.webview.onDidReceiveMessage(async function (msg) {
        if (!msg || !msg.command) {
          return;
        }
        if (msg.command === "refreshReview") {
          var refreshedReview = await fetchBridgeTaskCardReviewLatest();
          var refreshedStatus = await projectStatus.getProjectStatus();
          reviewResponse = refreshedReview;
          panel.webview.html = buildTaskCardReviewHtml(refreshedReview, refreshedStatus);
        } else if (msg.command === "copyExecutablePayload") {
          var payload = "";
          if (reviewResponse && reviewResponse.hasReview && reviewResponse.review && typeof reviewResponse.review.executablePayload === "string") {
            payload = reviewResponse.review.executablePayload;
          }
          if (!payload) {
            vscode.window.showWarningMessage("ACB: No executable payload available to copy.");
            return;
          }
          await vscode.env.clipboard.writeText(payload);
          vscode.window.showInformationMessage("ACB: Executable task card payload copied.");
        }
      });
    } catch (err) {
      vscode.window.showErrorMessage("ACB: Failed to open task card review — " + (err.message || String(err)));
    }
  });

  // --- Command: Show Execution Inbox (read-only Webview Panel) ---
  var showExecutionInboxCmd = vscode.commands.registerCommand("acb.showExecutionInbox", async function () {
    try {
      var inboxResponse = await fetchBridgeExecutionInboxLatest();
      var localStatus = await projectStatus.getProjectStatus();
      var terminalFillState = null;

      var panel = vscode.window.createWebviewPanel(
        "acbExecutionInbox",
        "ACB Execution Inbox",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);

      panel.webview.onDidReceiveMessage(async function (msg) {
        if (!msg || !msg.command) {
          return;
        }
        if (msg.command === "refreshExecutionInbox") {
          var refreshedInbox = await fetchBridgeExecutionInboxLatest();
          var refreshedStatus = await projectStatus.getProjectStatus();
          inboxResponse = refreshedInbox;
          localStatus = refreshedStatus;
          terminalFillState = null;
          panel.webview.html = buildExecutionInboxHtml(refreshedInbox, refreshedStatus, terminalFillState);
        } else if (msg.command === "copyPayload" || msg.command === "copyTaskCardText") {
          var taskCardText = "";
          if (inboxResponse && inboxResponse.hasInboxItem && inboxResponse.item && typeof inboxResponse.item.taskCardText === "string") {
            taskCardText = inboxResponse.item.taskCardText;
          }
          if (!taskCardText) {
            vscode.window.showWarningMessage("ACB: 当前没有可复制的 Execution Inbox Payload。");
            return;
          }
          await vscode.env.clipboard.writeText(taskCardText);
          vscode.window.showInformationMessage("ACB: 已复制 Payload，请手动粘贴到目标执行端。");
        } else if (msg.command === "startExecutorTerminal") {
          var startItem = inboxResponse && inboxResponse.hasInboxItem && inboxResponse.item ? inboxResponse.item : null;
          var startExecutorId = normalizeExecutorId(startItem && startItem.target);
          var startResult = createOrShowExecutorTerminal(startExecutorId, startItem);
          lastExecutorTerminalLaunchState = startResult.launchState;
          if (startResult.status === "launch_command_not_configured") {
            vscode.window.showWarningMessage("ACB: 该执行端启动命令未配置。请在 VS Code 设置中配置后再启动。");
          } else if (startResult.status === "ambiguous_terminal") {
            vscode.window.showWarningMessage("ACB: 目标终端名称重复，请关闭重复终端或修改配置。");
          } else if (startResult.status === "unsupported_executor") {
            vscode.window.showWarningMessage("ACB: 当前任务 target 暂不支持 executor profile。");
          } else if (startResult.status === "terminal_shown") {
            vscode.window.showInformationMessage("ACB: 已显示 " + getExecutorDisplayName(startExecutorId) + " 终端，未填入任务 Payload。");
          } else {
            vscode.window.showInformationMessage("ACB: 已启动 " + getExecutorDisplayName(startExecutorId) + " 终端，仅发送启动命令，未填入任务 Payload。");
          }
          panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
        } else if (msg.command === "fillExecutorProfileTerminal") {
          var profileFillPayload = "";
          var profileFillItem = inboxResponse && inboxResponse.hasInboxItem && inboxResponse.item ? inboxResponse.item : null;
          var profileFillExecutorId = normalizeExecutorId(profileFillItem && profileFillItem.target);
          if (profileFillItem && profileFillItem.accepted === true && typeof profileFillItem.taskCardText === "string") {
            profileFillPayload = profileFillItem.taskCardText;
          }
          if (!profileFillPayload) {
            terminalFillState = buildTerminalFillState(profileFillItem, null, "blocked_no_payload", "当前没有可填入的 Execution Inbox Payload。", { executorId: profileFillExecutorId, fillMode: "executor_profile" });
            vscode.window.showWarningMessage("ACB: 当前没有可填入的 Execution Inbox Payload。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          var profileFillResult = fillExecutorTerminal(profileFillExecutorId, profileFillPayload, profileFillItem);
          if (!profileFillResult.filled) {
            terminalFillState = buildTerminalFillState(profileFillItem, null, "blocked_" + profileFillResult.status, "未找到唯一可用的 " + getExecutorDisplayName(profileFillExecutorId) + " profile 终端；ACB 不会猜测或填入其它终端。", { executorId: profileFillExecutorId, fillMode: "executor_profile", bindingStatus: profileFillResult.status });
            vscode.window.showWarningMessage("ACB: 未找到唯一可用的 " + getExecutorDisplayName(profileFillExecutorId) + " profile 终端。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          terminalFillState = buildTerminalFillState(profileFillItem, profileFillResult.terminal, "terminal_fill_attempted", "已填入 " + getExecutorDisplayName(profileFillExecutorId) + " profile 终端。ACB 未回车、未执行。", { executorId: profileFillExecutorId, fillMode: "executor_profile", bindingStatus: profileFillResult.status });
          vscode.window.showInformationMessage("ACB: 已填入 " + getExecutorDisplayName(profileFillExecutorId) + " profile 终端。ACB 未回车、未执行。");
          panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
        } else if (msg.command === "bindCurrentTerminalToExecutor") {
          var bindItem = inboxResponse && inboxResponse.hasInboxItem && inboxResponse.item ? inboxResponse.item : null;
          var bindExecutorId = normalizeExecutorId(bindItem && bindItem.target);
          if (!bindExecutorId) {
            terminalFillState = buildTerminalFillState(bindItem, null, "blocked_unsupported_executor", "当前任务 target 不支持终端绑定。");
            vscode.window.showWarningMessage("ACB: 当前任务 target 不支持终端绑定。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          var bindTerminal = vscode.window.activeTerminal;
          if (!bindTerminal) {
            terminalFillState = buildTerminalFillState(bindItem, null, "blocked_no_active_terminal", "没有当前终端。请先在当前 VS Code 窗口打开对应执行端终端。", { executorId: bindExecutorId });
            vscode.window.showWarningMessage("ACB: 没有当前终端。请先在当前 VS Code 窗口打开对应执行端终端。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          executionTerminalBindings[bindExecutorId] = {
            executorId: bindExecutorId,
            terminalName: bindTerminal.name || "",
            terminal: bindTerminal,
            boundAt: new Date().toISOString()
          };
          terminalFillState = buildTerminalFillState(bindItem, bindTerminal, "terminal_bound", "已将当前终端绑定为 " + getExecutorDisplayName(bindExecutorId) + "。", { executorId: bindExecutorId, fillMode: "binding_only" });
          vscode.window.showInformationMessage("ACB: 已绑定当前终端为 " + getExecutorDisplayName(bindExecutorId) + "。");
          panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
        } else if (msg.command === "fillBoundTerminalInput") {
          var boundFillPayload = "";
          var boundFillItem = inboxResponse && inboxResponse.hasInboxItem && inboxResponse.item ? inboxResponse.item : null;
          var boundFillExecutorId = normalizeExecutorId(boundFillItem && boundFillItem.target);
          if (boundFillItem && boundFillItem.accepted === true && typeof boundFillItem.taskCardText === "string") {
            boundFillPayload = boundFillItem.taskCardText;
          }
          if (!boundFillPayload) {
            terminalFillState = buildTerminalFillState(boundFillItem, null, "blocked_no_payload", "当前没有可填入的 Execution Inbox Payload。", { executorId: boundFillExecutorId, fillMode: "bound_terminal" });
            vscode.window.showWarningMessage("ACB: 当前没有可填入的 Execution Inbox Payload。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          var boundResolution = resolveExecutionTerminalBinding(boundFillExecutorId);
          if (!boundResolution.canFill || !boundResolution.terminal) {
            terminalFillState = buildTerminalFillState(boundFillItem, null, "blocked_" + boundResolution.status, "未找到可用的 " + getExecutorDisplayName(boundFillExecutorId) + " 绑定终端；ACB 不会猜测或填入其它终端。", { executorId: boundFillExecutorId, fillMode: "bound_terminal", bindingStatus: boundResolution.status });
            vscode.window.showWarningMessage("ACB: 未找到可用的 " + getExecutorDisplayName(boundFillExecutorId) + " 绑定终端。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          boundResolution.terminal.sendText(boundFillPayload, false);
          terminalFillState = buildTerminalFillState(boundFillItem, boundResolution.terminal, "terminal_fill_attempted", "已填入绑定的 " + getExecutorDisplayName(boundFillExecutorId) + " 终端。ACB 未回车、未执行。", { executorId: boundFillExecutorId, fillMode: "bound_terminal", bindingStatus: boundResolution.status });
          vscode.window.showInformationMessage("ACB: 已填入绑定的 " + getExecutorDisplayName(boundFillExecutorId) + " 终端。ACB 未回车、未执行。");
          panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
        } else if (msg.command === "fillActiveTerminalInput") {
          var fillPayload = "";
          var fillItem = inboxResponse && inboxResponse.hasInboxItem && inboxResponse.item ? inboxResponse.item : null;
          if (fillItem && fillItem.accepted === true && typeof fillItem.taskCardText === "string") {
            fillPayload = fillItem.taskCardText;
          }
          if (!fillPayload) {
            terminalFillState = buildTerminalFillState(fillItem, null, "blocked_no_payload", "当前没有可填入的 Execution Inbox Payload。");
            vscode.window.showWarningMessage("ACB: 当前没有可填入的 Execution Inbox Payload。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          var activeTerminal = vscode.window.activeTerminal;
          if (!activeTerminal) {
            terminalFillState = buildTerminalFillState(fillItem, null, "blocked_no_active_terminal", "没有当前终端。请先打开 Codex / Claude Code 所在 VS Code 终端。");
            vscode.window.showWarningMessage("ACB: 没有当前终端。请先打开 Codex / Claude Code 所在 VS Code 终端。");
            panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
            return;
          }
          activeTerminal.sendText(fillPayload, false);
          terminalFillState = buildTerminalFillState(fillItem, activeTerminal, "terminal_fill_attempted", "已填入当前终端输入区。ACB 未回车、未执行。请人工检查后自行决定是否按 Enter。", { fillMode: "active_terminal" });
          vscode.window.showInformationMessage("ACB: 已填入当前终端输入区。ACB 未回车、未执行。");
          panel.webview.html = buildExecutionInboxHtml(inboxResponse, localStatus, terminalFillState);
        }
      });
    } catch (err) {
      vscode.window.showErrorMessage("ACB: Failed to open execution inbox - " + (err.message || String(err)));
    }
  });

  context.subscriptions.push(showCmd);
  context.subscriptions.push(copyCmd);
  context.subscriptions.push(showReviewCmd);
  context.subscriptions.push(showExecutionInboxCmd);
}

/**
 * Build HTML for the project status webview panel.
 * All styles are inline; no external resources.
 * @param {Object} status
 * @returns {string}
 */
function buildStatusHtml(status) {
  var git = status.git || {};
  var escapedPath = escapeHtml(String(status.workspacePath || "No workspace opened"));
  var escapedName = escapeHtml(String(status.workspaceName || "N/A"));
  var escapedGitRoot = escapeHtml(String(git.repoRoot || "N/A"));
  var escapedBranch = escapeHtml(String(git.branch || "N/A"));
  var escapedCommit = escapeHtml(String(git.commitHash || "N/A"));
  var escapedLatestCommit = escapeHtml(String(git.commitSummary || "N/A"));
  var escapedError = git.error ? escapeHtml(git.error) : "";

  var gitAvailable = git.available ? "Yes" : "No";
  var gitColor = git.available ? "#16a34a" : "#dc2626";
  var workingTree = git.available ? (git.clean ? "clean" : "dirty") : "unknown";
  var treeColor = git.available ? (git.clean ? "#16a34a" : "#ea580c") : "#6b7280";
  var changesCount = String(git.changes || 0);
  var stagedCount = String(git.indexChanges || 0);
  var untrackedCount = String(git.untracked || 0);

  var changedFilesHtml = "";
  if (git.available && Array.isArray(git.changedFiles) && git.changedFiles.length > 0) {
    var maxShow = 20;
    changedFilesHtml += "<h3 style=\"margin:16px 0 8px;font-size:13px;\">Changed Files (" + git.changedFiles.length + ")</h3>";
    changedFilesHtml += "<ul style=\"margin:0;padding-left:20px;\">";
    for (var i = 0; i < git.changedFiles.length && i < maxShow; i++) {
      changedFilesHtml += "<li style=\"font-size:11px;font-family:Consolas,monospace;margin-bottom:2px;\">" + escapeHtml(git.changedFiles[i]) + "</li>";
    }
    if (git.changedFiles.length > maxShow) {
      changedFilesHtml += "<li style=\"font-size:11px;color:#6b7280;\">... and " + String(git.changedFiles.length - maxShow) + " more</li>";
    }
    changedFilesHtml += "</ul>";
  }

  // Runtime Diagnostics section
  var diagnosticsHtml = "";
  if (status.diagnostics) {
    var d = status.diagnostics;
    diagnosticsHtml += "<hr style=\"margin:16px 0;border:none;border-top:2px solid #e5e7eb;\">";
    diagnosticsHtml += "<h3 style=\"margin:0 0 8px;font-size:14px;color:#374151;\">Runtime Diagnostics</h3>";
    diagnosticsHtml += "<table style=\"width:100%;border-collapse:collapse;font-size:11px;font-family:Consolas,monospace;\">";
    diagnosticsHtml += buildDiagRow("diagnosticsEnabled", d.diagnosticsEnabled);
    diagnosticsHtml += buildDiagRow("processPlatform", d.processPlatform);
    diagnosticsHtml += buildDiagRow("processCwd", d.processCwd);
    diagnosticsHtml += buildDiagRow("workspaceFoldersLength", d.workspaceFoldersLength);
    diagnosticsHtml += buildDiagRow("folderName", d.folderName);
    diagnosticsHtml += buildDiagRow("folderIndexUsed", d.folderIndexUsed);
    diagnosticsHtml += buildDiagRow("folderUriToString", d.folderUriToString);
    diagnosticsHtml += buildDiagRow("folderUriScheme", d.folderUriScheme);
    diagnosticsHtml += buildDiagRow("folderUriAuthority", d.folderUriAuthority);
    diagnosticsHtml += buildDiagRow("folderUriPath", d.folderUriPath);
    diagnosticsHtml += buildDiagRow("folderUriFsPath", d.folderUriFsPath);
    diagnosticsHtml += buildDiagRow("rawWorkspacePathBeforeNormalize", d.rawWorkspacePathBeforeNormalize);
    diagnosticsHtml += buildDiagRow("normalizedWorkspacePath", d.normalizedWorkspacePath);
    diagnosticsHtml += buildDiagRow("normalizedWorkspacePathExists", d.normalizedWorkspacePathExists);
    diagnosticsHtml += buildDiagRow("normalizedWorkspacePathIsDirectory", d.normalizedWorkspacePathIsDirectory);
    diagnosticsHtml += buildDiagRow("gitApiExtensionFound", d.gitApiExtensionFound);
    diagnosticsHtml += buildDiagRow("gitApiActivated", d.gitApiActivated);
    diagnosticsHtml += buildDiagRow("gitApiRepositoryCount", d.gitApiRepositoryCount);
    diagnosticsHtml += buildDiagRow("gitApiFirstRepoRootFsPath", d.gitApiFirstRepoRootFsPath);
    diagnosticsHtml += buildDiagRow("gitApiFirstRepoHeadName", d.gitApiFirstRepoHeadName);
    diagnosticsHtml += buildDiagRow("gitApiFirstRepoHeadCommit", d.gitApiFirstRepoHeadCommit);
    diagnosticsHtml += buildDiagRow("cliFallbackAttempted", d.cliFallbackAttempted);
    diagnosticsHtml += buildDiagRow("cliFallbackCwd", d.cliFallbackCwd);
    diagnosticsHtml += buildDiagRow("cliFallbackCwdExists", d.cliFallbackCwdExists);
    diagnosticsHtml += buildDiagRow("cliFallbackRevParseSuccess", d.cliFallbackRevParseSuccess);
    diagnosticsHtml += buildDiagRow("cliFallbackErrorMessage", d.cliFallbackErrorMessage);
    diagnosticsHtml += "</table>";
  }

  return "<!DOCTYPE html>" +
    "<html>" +
    "<head><meta charset=\"utf-8\"></head>" +
    "<body style=\"font-family:-apple-system,Arial,sans-serif;font-size:13px;color:#1e1e1e;padding:16px;background:#fff;\">" +

    "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;\">" +
    "<h2 style=\"margin:0;font-size:16px;\">ACB Project Status</h2>" +
    "<div style=\"display:flex;gap:8px;\">" +
    "<button onclick=\"openTaskCardReview()\" style=\"padding:4px 12px;border:1px solid #0f766e;border-radius:4px;background:#0f766e;color:#fff;cursor:pointer;font-size:12px;\">Task Card Review</button>" +
    "<button onclick=\"openExecutionInbox()\" style=\"padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#fff;color:#7c3aed;cursor:pointer;font-size:12px;\">Execution Inbox</button>" +
    "<button onclick=\"refresh()\" style=\"padding:4px 12px;border:1px solid #1976d2;border-radius:4px;background:#fff;color:#1976d2;cursor:pointer;font-size:12px;\">Refresh</button>" +
    "<button onclick=\"copy()\" style=\"padding:4px 12px;border:1px solid #16a34a;border-radius:4px;background:#16a34a;color:#fff;cursor:pointer;font-size:12px;\">Copy Summary</button>" +
    "</div>" +
    "</div>" +

    "<table style=\"width:100%;border-collapse:collapse;\">" +
    buildRow("Project Path", escapedPath) +
    buildRow("Workspace Name", escapedName) +
    buildRow("Git Root", escapedGitRoot) +
    buildRow("Git Available", "<span style=\"color:" + gitColor + ";font-weight:bold;\">" + gitAvailable + "</span>" + (escapedError ? " <span style=\"color:#dc2626;\">(" + escapedError + ")</span>" : "")) +
    buildRow("Branch", escapedBranch) +
    buildRow("Current Commit", "<code style=\"font-size:11px;\">" + escapedCommit + "</code>") +
    buildRow("Latest Commit", "<span style=\"font-size:11px;\">" + escapedLatestCommit + "</span>") +
    buildRow("Working Tree", "<span style=\"color:" + treeColor + ";font-weight:bold;\">" + workingTree + "</span>") +
    buildRow("Changed Files", changesCount + " (staged: " + stagedCount + ", untracked: " + untrackedCount + ")") +
    buildRow("Generated At", status.generatedAt || "N/A") +
    "</table>" +

    changedFilesHtml +

    diagnosticsHtml +

    (status.hasWorkspace ? "" : "<p style=\"margin-top:12px;padding:8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;font-size:12px;\">No workspace opened. Open a folder to see project status.</p>") +
    (!status.hasWorkspace || git.available ? "" : "<p style=\"margin-top:12px;padding:8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;font-size:12px;\">" + (escapedError || "Git extension unavailable or no repository detected.") + "</p>") +

    "<script>" +
    "var vscode = acquireVsCodeApi();" +
    "function copy() { vscode.postMessage({command:'copy'}); }" +
    "function refresh() { vscode.postMessage({command:'refresh'}); }" +
    "function openTaskCardReview() { vscode.postMessage({command:'openTaskCardReview'}); }" +
    "function openExecutionInbox() { vscode.postMessage({command:'openExecutionInbox'}); }" +
    "</script>" +

    "</body></html>";
}

/**
 * Build a table row with label and value.
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
function buildRow(label, value) {
  return "<tr style=\"border-bottom:1px solid #e5e7eb;\">" +
    "<td style=\"padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;width:140px;\">" + escapeHtml(label) + "</td>" +
    "<td style=\"padding:6px 0;word-break:break-word;\">" + value + "</td>" +
    "</tr>";
}

/**
 * Build a diagnostics table row (compact, monospace).
 * @param {string} label
 * @param {*} value
 * @returns {string}
 */
function buildDiagRow(label, value) {
  return "<tr style=\"border-bottom:1px solid #f3f4f6;\">" +
    "<td style=\"padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;vertical-align:top;width:220px;\">" + escapeHtml(String(label)) + "</td>" +
    "<td style=\"padding:2px 0;word-break:break-all;\">" + escapeHtml(String(value)) + "</td>" +
    "</tr>";
}

async function fetchBridgeTaskCardReviewLatest() {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: "127.0.0.1",
      port: 17373,
      path: "/acb/v1/task-card-review/latest",
      method: "GET",
      headers: { "Accept": "application/json" }
    }, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var raw = Buffer.concat(chunks).toString("utf8");
        var body = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch (_e) {
          reject(new Error("Invalid JSON from bridge latest endpoint."));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error("HTTP " + String(res.statusCode) + (body && body.error ? (": " + body.error) : "")));
          return;
        }
        resolve(body || { ok: true, hasReview: false });
      });
    });

    req.on("error", function (err) {
      reject(err);
    });
    req.setTimeout(5000, function () {
      req.destroy(new Error("Bridge task-card-review/latest request timed out."));
    });
    req.end();
  });
}

async function fetchBridgeExecutionInboxLatest() {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: "127.0.0.1",
      port: 17373,
      path: "/acb/v1/execution-inbox/latest",
      method: "GET",
      headers: { "Accept": "application/json" }
    }, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var raw = Buffer.concat(chunks).toString("utf8");
        var body = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch (_e) {
          reject(new Error("Invalid JSON from bridge execution-inbox/latest endpoint."));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error("HTTP " + String(res.statusCode) + (body && body.error ? (": " + body.error) : "")));
          return;
        }
        resolve(body || { ok: true, hasInboxItem: false });
      });
    });

    req.on("error", function (err) {
      reject(err);
    });
    req.setTimeout(5000, function () {
      req.destroy(new Error("Bridge execution-inbox/latest request timed out."));
    });
    req.end();
  });
}

function buildTaskCardReviewHtml(reviewResp, localStatus) {
  var hasReview = Boolean(reviewResp && reviewResp.hasReview && reviewResp.review);
  var review = hasReview ? reviewResp.review : null;
  var reviewMeta = review && review.reviewMetadata ? review.reviewMetadata : {};
  var validation = review && review.validationSummary ? review.validationSummary : {};
  var diagnostics = validation.diagnostics || {};
  var safety = review && review.safety ? review.safety : {
    noAutoDispatch: true,
    noCommandExecution: true,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false
  };
  var git = localStatus && localStatus.git ? localStatus.git : {};
  var fields = hasReview ? parseTaskCardFieldsForDisplay(review.executablePayload || "") : {};

  if (!hasReview) {
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:-apple-system,Arial,sans-serif;padding:16px;\">" +
      "<h2 style=\"margin:0 0 12px 0;\">ACB Task Card Review</h2>" +
      "<p style=\"margin:0 0 12px 0;color:#6b7280;\">尚未接收到任务卡。</p>" +
      "<p style=\"margin:0 0 16px 0;padding:10px;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;font-size:12px;\">" +
      "当前面板仅用于查看和人工校验任务卡；不会执行命令、不会派发 Agent、不会修改文件、不会写入 Git。未来如果进入执行流程，也只能使用下方完整 ACB_TASK_CARD 作为执行载荷，其他元信息仅用于审查、测试和排障。" +
      "</p>" +
      "<button onclick=\"refreshReview()\" style=\"padding:6px 12px;border:1px solid #1976d2;border-radius:4px;background:#fff;color:#1976d2;cursor:pointer;\">Refresh</button>" +
      "<script>var vscode=acquireVsCodeApi();function refreshReview(){vscode.postMessage({command:'refreshReview'});}</script>" +
      "</body></html>";
  }

  var payloadText = escapeHtml(String(review.executablePayload || ""));
  var blockingText = diagnostics.requiredFieldsMissing && diagnostics.requiredFieldsMissing.length
    ? diagnostics.requiredFieldsMissing.join(", ")
    : "none";

  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:-apple-system,Arial,sans-serif;font-size:13px;color:#1e1e1e;padding:16px;background:#fff;\">" +
    "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;\">" +
    "<h2 style=\"margin:0;font-size:16px;\">ACB Task Card Review</h2>" +
    "<div style=\"display:flex;gap:8px;\">" +
    "<button onclick=\"refreshReview()\" style=\"padding:4px 12px;border:1px solid #1976d2;border-radius:4px;background:#fff;color:#1976d2;cursor:pointer;font-size:12px;\">Refresh</button>" +
    "<button onclick=\"copyPayload()\" style=\"padding:4px 12px;border:1px solid #16a34a;border-radius:4px;background:#16a34a;color:#fff;cursor:pointer;font-size:12px;\">Copy Executable Payload</button>" +
    "</div></div>" +

    "<p style=\"margin:0 0 14px 0;padding:10px;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;font-size:12px;\">" +
    "当前面板仅用于查看和人工校验任务卡；不会执行命令、不会派发 Agent、不会修改文件、不会写入 Git。未来如果进入执行流程，也只能使用下方完整 ACB_TASK_CARD 作为执行载荷，其他元信息仅用于审查、测试和排障。" +
    "</p>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">1. Review Status</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("receivedAt", escapeHtml(String(review.receivedAt || "-"))) +
      buildRow("accepted", String(review.accepted === true)) +
      buildRow("validation status", escapeHtml(String(validation.status || "-"))) +
      buildRow("taskCardId", escapeHtml(String(review.taskCardId || "-"))) +
      buildRow("target", escapeHtml(String(review.target || "-"))) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">2. Source Metadata</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("channelId", escapeHtml(String(reviewMeta.channelId || "-"))) +
      buildRow("channelName", escapeHtml(String(reviewMeta.channelName || "-"))) +
      buildRow("feedbackHash", escapeHtml(String(reviewMeta.feedbackHash || "-"))) +
      buildRow("contextId", escapeHtml(String(reviewMeta.contextId || "-"))) +
      buildRow("actionStepIndex", escapeHtml(String(reviewMeta.actionStepIndex !== undefined ? reviewMeta.actionStepIndex : "-"))) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">3. Task Card Metadata</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("projectDir", escapeHtml(String(fields.projectDir || "-"))) +
      buildRow("currentBranch", escapeHtml(String(fields.currentBranch || "-"))) +
      buildRow("currentCommit", escapeHtml(String(fields.currentCommit || "-"))) +
      buildRow("allowedFiles summary", escapeHtml(shortMultiline(fields.allowedFiles || "-"))) +
      buildRow("forbiddenActions summary", escapeHtml(shortMultiline(fields.forbiddenActions || "-"))) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">4. Local Project Status</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("local project path", escapeHtml(String(localStatus.workspacePath || "-"))) +
      buildRow("local branch", escapeHtml(String(git.branch || "-"))) +
      buildRow("local commit", escapeHtml(String(git.commitHash || "-"))) +
      buildRow("working tree status", escapeHtml(String(git.available ? (git.clean ? "clean" : "dirty") : "unknown"))) +
      buildRow("changed files count", escapeHtml(String(git.changes || 0))) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">5. Preflight / Readiness</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("payloadStatus", escapeHtml(String(reviewMeta.payloadStatus || "-"))) +
      buildRow("preflightStatus", escapeHtml(String(reviewMeta.preflightStatus || "-"))) +
      buildRow("readinessStatus", escapeHtml(String(reviewMeta.readinessStatus || "-"))) +
      buildRow("warning reasons", escapeHtml(arrayToText(reviewMeta.warningReasons))) +
      buildRow("blocking reasons", escapeHtml(arrayToText(reviewMeta.blockingReasons))) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">6. Safety Flags</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("noAutoDispatch", String(safety.noAutoDispatch === true)) +
      buildRow("noCommandExecution", String(safety.noCommandExecution === true)) +
      buildRow("executionAllowed", String(safety.executionAllowed === true)) +
      buildRow("agentDispatchAllowed", String(safety.agentDispatchAllowed === true)) +
      buildRow("gitWriteAllowed", String(safety.gitWriteAllowed === true)) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">7. Executable Payload</h3>" +
    "<p style=\"margin:0 0 6px 0;font-size:11px;color:#6b7280;\">Validation: start=" + String(diagnostics.startDetected) +
      ", end=" + String(diagnostics.endDetected) +
      ", idMatched=" + String(diagnostics.idMatched) +
      ", targetMatched=" + String(diagnostics.targetMatched) +
      ", missingFields=" + escapeHtml(blockingText) + "</p>" +
    "<pre style=\"margin:0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow-y:auto;\">" + payloadText + "</pre>" +

    "<script>" +
    "var vscode=acquireVsCodeApi();" +
    "function refreshReview(){vscode.postMessage({command:'refreshReview'});}" +
    "function copyPayload(){vscode.postMessage({command:'copyExecutablePayload'});}" +
    "</script>" +
    "</body></html>";
}

function normalizeExecutorId(value) {
  var raw = String(value || "").trim().toLowerCase();
  if (raw === "codex" || raw === "openai-codex") {
    return "codex";
  }
  if (raw === "claude-code" || raw === "claude_code" || raw === "claude code" || raw === "claude") {
    return "claude-code";
  }
  if (raw === "deepseek" || raw === "deep-seek") {
    return "deepseek";
  }
  return "";
}

function getExecutorDisplayName(executorId) {
  if (executorId === "codex") {
    return "Codex";
  }
  if (executorId === "claude-code") {
    return "Claude Code";
  }
  if (executorId === "deepseek") {
    return "DeepSeek";
  }
  return executorId ? String(executorId) : "Unknown";
}

function resolveExecutionTerminalBinding(executorId) {
  var normalized = normalizeExecutorId(executorId);
  if (!normalized) {
    return { status: "unsupported_executor", binding: null, terminal: null, canFill: false, duplicateCount: 0 };
  }
  var binding = executionTerminalBindings[normalized] || null;
  if (!binding) {
    return { status: "no_terminal_bound", binding: null, terminal: null, canFill: false, duplicateCount: 0 };
  }
  var terminals = vscode.window.terminals || [];
  var objectStillLive = terminals.indexOf(binding.terminal) !== -1;
  if (objectStillLive) {
    return { status: "bound_terminal_exists", binding: binding, terminal: binding.terminal, canFill: true, duplicateCount: 0 };
  }
  var sameName = terminals.filter(function (terminal) {
    return terminal && terminal.name === binding.terminalName;
  });
  if (sameName.length > 1) {
    return { status: "duplicate_terminal_name_conflict", binding: binding, terminal: null, canFill: false, duplicateCount: sameName.length };
  }
  return { status: "bound_terminal_missing", binding: binding, terminal: null, canFill: false, duplicateCount: sameName.length };
}

function getBindingStatusLabel(status) {
  if (status === "bound_terminal_exists") {
    return "已绑定可用终端";
  }
  if (status === "no_terminal_bound") {
    return "尚未绑定终端";
  }
  if (status === "bound_terminal_missing") {
    return "绑定终端已不可用，请重新绑定";
  }
  if (status === "duplicate_terminal_name_conflict") {
    return "终端名称重复，请重新绑定";
  }
  if (status === "unsupported_executor") {
    return "当前 target 暂不支持绑定";
  }
  return String(status || "unknown");
}

function getWorkspaceRootPath() {
  var folders = vscode.workspace.workspaceFolders || [];
  if (folders.length > 0 && folders[0] && folders[0].uri && folders[0].uri.fsPath) {
    return folders[0].uri.fsPath;
  }
  return "";
}

function getSafeExecutorCwd(item) {
  var projectDir = item && item.projectDir ? String(item.projectDir).trim() : "";
  if (projectDir) {
    return projectDir;
  }
  return getWorkspaceRootPath();
}

function getExecutorProfile(executorId, item) {
  var normalized = normalizeExecutorId(executorId);
  var defaults = {
    "codex": {
      displayName: "Codex",
      terminalName: "ACB Codex",
      launchCommand: process.platform === "win32" ? "codex.cmd" : "codex"
    },
    "claude-code": {
      displayName: "Claude Code",
      terminalName: "ACB Claude Code",
      launchCommand: "claude"
    },
    "deepseek": {
      displayName: "DeepSeek",
      terminalName: "ACB DeepSeek",
      launchCommand: ""
    }
  };
  var base = defaults[normalized];
  if (!base) {
    return null;
  }
  var config = vscode.workspace.getConfiguration("acb");
  var prefix = "executorProfiles." + normalized + ".";
  var terminalName = String(config.get(prefix + "terminalName", base.terminalName) || base.terminalName).trim();
  var launchCommand = getExecutorLaunchCommand(config, prefix + "launchCommand", base.launchCommand);
  return {
    executorId: normalized,
    displayName: base.displayName,
    terminalName: terminalName,
    launchCommand: launchCommand,
    cwd: getSafeExecutorCwd(item),
    launchCommandConfigured: launchCommand.length > 0
  };
}

function getExecutorLaunchCommand(config, key, platformDefault) {
  var inspected = config.inspect(key) || {};
  var explicitValue = undefined;
  if (Object.prototype.hasOwnProperty.call(inspected, "workspaceFolderValue") && inspected.workspaceFolderValue !== undefined) {
    explicitValue = inspected.workspaceFolderValue;
  } else if (Object.prototype.hasOwnProperty.call(inspected, "workspaceValue") && inspected.workspaceValue !== undefined) {
    explicitValue = inspected.workspaceValue;
  } else if (Object.prototype.hasOwnProperty.call(inspected, "globalValue") && inspected.globalValue !== undefined) {
    explicitValue = inspected.globalValue;
  }
  if (explicitValue !== undefined) {
    return String(explicitValue || "").trim();
  }
  return String(platformDefault || "").trim();
}

function resolveExecutorTerminal(executorId, item) {
  var profile = getExecutorProfile(executorId, item);
  if (!profile) {
    return { status: "unsupported_executor", profile: null, terminal: null, matchedTerminals: [], canFill: false };
  }
  var terminals = vscode.window.terminals || [];
  var matched = terminals.filter(function (terminal) {
    return terminal && terminal.name === profile.terminalName;
  });
  if (matched.length === 1) {
    return { status: "terminal_found", profile: profile, terminal: matched[0], matchedTerminals: matched, canFill: true };
  }
  if (matched.length > 1) {
    return { status: "ambiguous_terminal", profile: profile, terminal: null, matchedTerminals: matched, canFill: false };
  }
  if (!profile.launchCommandConfigured) {
    return { status: "launch_command_not_configured", profile: profile, terminal: null, matchedTerminals: matched, canFill: false };
  }
  return { status: "terminal_missing", profile: profile, terminal: null, matchedTerminals: matched, canFill: false };
}

function buildExecutorTerminalLaunchState(profile, status, commandSent, terminal) {
  return {
    executor_terminal_launch_attempted: true,
    executor_terminal_launch_executor: profile && profile.executorId ? profile.executorId : "",
    executor_terminal_launch_terminal_name: profile && profile.terminalName ? profile.terminalName : "",
    executor_terminal_launch_command_configured: Boolean(profile && profile.launchCommandConfigured),
    executor_terminal_launch_command_sent: commandSent === true,
    executor_terminal_launch_status: status,
    executor_terminal_launch_at: new Date().toISOString(),
    executor_terminal_launch_terminal_name_actual: terminal && terminal.name ? String(terminal.name) : ""
  };
}

function createOrShowExecutorTerminal(executorId, item) {
  var resolution = resolveExecutorTerminal(executorId, item);
  if (!resolution.profile) {
    return {
      status: "unsupported_executor",
      terminal: null,
      launchState: buildExecutorTerminalLaunchState(null, "unsupported_executor", false, null)
    };
  }
  if (resolution.status === "ambiguous_terminal") {
    return {
      status: "ambiguous_terminal",
      terminal: null,
      launchState: buildExecutorTerminalLaunchState(resolution.profile, "ambiguous_terminal", false, null)
    };
  }
  if (resolution.terminal) {
    resolution.terminal.show();
    return {
      status: "terminal_shown",
      terminal: resolution.terminal,
      launchState: buildExecutorTerminalLaunchState(resolution.profile, "terminal_shown", false, resolution.terminal)
    };
  }
  if (!resolution.profile.launchCommandConfigured) {
    return {
      status: "launch_command_not_configured",
      terminal: null,
      launchState: buildExecutorTerminalLaunchState(resolution.profile, "launch_command_not_configured", false, null)
    };
  }
  var terminal = vscode.window.createTerminal({
    name: resolution.profile.terminalName,
    cwd: resolution.profile.cwd || undefined
  });
  terminal.show();
  terminal.sendText(resolution.profile.launchCommand, true);
  return {
    status: "terminal_started",
    terminal: terminal,
    launchState: buildExecutorTerminalLaunchState(resolution.profile, "terminal_started", true, terminal)
  };
}

function fillExecutorTerminal(executorId, payload, item) {
  var resolution = resolveExecutorTerminal(executorId, item);
  if (!resolution.canFill || !resolution.terminal) {
    return {
      filled: false,
      status: resolution.status,
      terminal: null,
      resolution: resolution
    };
  }
  resolution.terminal.sendText(payload, false);
  return {
    filled: true,
    status: resolution.status,
    terminal: resolution.terminal,
    resolution: resolution
  };
}

/**
 * Bridge terminal action handler — dispatches status/launch/fill requests
 * from browser console through the local bridge.
 * Returns { ok, status, data } for JSON response.
 */
function handleBridgeTerminalAction(action, params) {
  if (!action) {
    return { ok: false, status: 400, data: { error: "missing_action" } };
  }

  if (action === "status") {
    return handleBridgeTerminalStatus(params);
  }
  if (action === "launch") {
    return handleBridgeTerminalLaunch(params);
  }
  if (action === "fill") {
    return handleBridgeTerminalFill(params);
  }

  return { ok: false, status: 400, data: { error: "unknown_action", action: action } };
}

function handleBridgeTerminalStatus(params) {
  var executorId = normalizeExecutorId(params && params.executorId);
  if (!executorId) {
    return {
      ok: false,
      status: 400,
      data: {
        error: "missing_executor_id",
        terminal_found: false,
        can_fill: false,
        can_launch: false
      }
    };
  }

  var resolution = resolveExecutorTerminal(executorId, null);
  var statusData = {
    executor_id: executorId,
    display_name: resolution.profile ? resolution.profile.displayName : "Unknown",
    terminal_name: resolution.profile ? resolution.profile.terminalName : "",
    terminal_status: resolution.status,
    terminal_found: resolution.status === "terminal_found",
    can_fill: resolution.canFill,
    can_launch: resolution.status === "terminal_missing" && resolution.profile && resolution.profile.launchCommandConfigured,
    launch_command_configured: resolution.profile ? resolution.profile.launchCommandConfigured : false,
    matched_terminal_count: (resolution.matchedTerminals || []).length,
    bridge_status: "connected"
  };

  return { ok: true, status: 200, data: statusData };
}

function handleBridgeTerminalLaunch(params) {
  var executorId = normalizeExecutorId(params && params.executorId);
  if (!executorId) {
    return {
      ok: false,
      status: 400,
      data: {
        error: "missing_executor_id",
        launched: false,
        no_auto_enter: true,
        no_execution: true
      }
    };
  }

  var result = createOrShowExecutorTerminal(executorId, null);
  lastExecutorTerminalLaunchState = result.launchState;

  var launchData = {
    executor_id: executorId,
    launch_status: result.status,
    launched: result.status === "terminal_started" || result.status === "terminal_shown",
    terminal_name: result.launchState ? result.launchState.executor_terminal_launch_terminal_name : "",
    terminal_name_actual: result.launchState ? result.launchState.executor_terminal_launch_terminal_name_actual : "",
    command_sent: result.launchState ? result.launchState.executor_terminal_launch_command_sent : false,
    no_auto_enter: true,
    no_execution: true,
    task_payload_filled_after_launch: false
  };

  var ok = result.status === "terminal_started" || result.status === "terminal_shown";
  return { ok: ok, status: ok ? 200 : 422, data: launchData };
}

function handleBridgeTerminalFill(params) {
  var executorId = normalizeExecutorId(params && params.executorId);
  var payload = params && typeof params.payload === "string" ? params.payload : "";
  var taskCardId = params && typeof params.taskCardId === "string" ? params.taskCardId : "";
  var expectedTarget = params && typeof params.expectedTarget === "string" ? params.expectedTarget : "";

  if (!executorId || !payload) {
    return {
      ok: false,
      status: 400,
      data: {
        error: !executorId ? "missing_executor_id" : "missing_payload",
        filled: false,
        no_auto_enter: true,
        no_execution: true
      }
    };
  }

  // Verify executorId matches expected target
  if (expectedTarget && normalizeExecutorId(expectedTarget) !== executorId) {
    return {
      ok: false,
      status: 422,
      data: {
        error: "target_mismatch",
        detail: "当前浏览器任务与 VS Code 收件箱任务不一致，已阻止填入。",
        filled: false,
        executor_id: executorId,
        expected_target: expectedTarget,
        no_auto_enter: true,
        no_execution: true
      }
    };
  }

  var fillResult = fillExecutorTerminal(executorId, payload, null);
  var fillData = {
    executor_id: executorId,
    task_card_id: taskCardId || "",
    fill_status: fillResult.status,
    filled: fillResult.filled,
    terminal_name: fillResult.resolution && fillResult.resolution.profile ? fillResult.resolution.profile.terminalName : "",
    no_auto_enter: true,
    no_execution: true
  };

  if (!fillResult.filled) {
    fillData.error = "fill_blocked_" + fillResult.status;
    fillData.detail = getTerminalFillBlockedDetail(fillResult.status, executorId);
  }

  return { ok: fillResult.filled, status: fillResult.filled ? 200 : 422, data: fillData };
}

function getTerminalFillBlockedDetail(status, executorId) {
  if (status === "terminal_missing") {
    return "目标终端未打开，请先启动终端。";
  }
  if (status === "ambiguous_terminal") {
    return "目标终端名称重复，请关闭重复终端。";
  }
  if (status === "launch_command_not_configured") {
    return "启动命令未配置。";
  }
  if (status === "unsupported_executor") {
    return "当前 target 暂不支持 executor profile。";
  }
  return "未找到唯一可用的 " + getExecutorDisplayName(executorId) + " profile 终端；ACB 不会猜测或填入其它终端。";
}

function getExecutorTerminalStatusLabel(status) {
  if (status === "terminal_found") {
    return "已找到目标终端";
  }
  if (status === "terminal_missing") {
    return "目标终端未打开";
  }
  if (status === "ambiguous_terminal") {
    return "目标终端名称重复";
  }
  if (status === "launch_command_not_configured") {
    return "启动命令未配置";
  }
  if (status === "unsupported_executor") {
    return "当前 target 暂不支持 profile";
  }
  return String(status || "unknown");
}

function buildExecutionInboxHtml(inboxResp, localStatus, terminalFillState) {
  var hasItem = Boolean(inboxResp && inboxResp.hasInboxItem && inboxResp.item);
  var item = hasItem ? inboxResp.item : null;
  var safety = item && item.safetyMetadata ? item.safetyMetadata : {
    noAutoDispatch: true,
    noCommandExecution: true,
    canTriggerExecution: false,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false
  };
  var git = localStatus && localStatus.git ? localStatus.git : {};

  if (!hasItem) {
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:-apple-system,Arial,sans-serif;padding:16px;\">" +
      "<h2 style=\"margin:0 0 12px 0;\">ACB Execution Inbox 收件箱</h2>" +
      "<p style=\"margin:0 0 12px 0;color:#6b7280;\">还没有收到任务。</p>" +
      "<p style=\"margin:0 0 16px 0;color:#6b7280;\">请先从 ACB 浏览器控制台发送任务到 Execution Inbox。</p>" +
      "<p style=\"margin:0 0 16px 0;padding:10px;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;font-size:12px;line-height:1.45;\">" +
      "这里仅用于查看和复制任务。不会自动执行、不会控制终端、不会自动粘贴或回车、不会派发 Agent，也不会写 Git。" +
      "</p>" +
      "<button onclick=\"refreshExecutionInbox()\" style=\"padding:6px 12px;border:1px solid #1976d2;border-radius:4px;background:#fff;color:#1976d2;cursor:pointer;\">Refresh</button>" +
      "<script>var vscode=acquireVsCodeApi();function refreshExecutionInbox(){vscode.postMessage({command:'refreshExecutionInbox'});}</script>" +
      "</body></html>";
  }

  var taskCardText = escapeHtml(String(item.taskCardText || ""));
  var taskCardPreview = escapeHtml(String(item.taskCardText || "").slice(0, 3000));
  var routeResultText = escapeHtml(JSON.stringify(item.routeResult || {}, null, 2));
  var payloadValidationText = escapeHtml(JSON.stringify(item.payloadValidation || {}, null, 2));
  var sourceMetadataText = escapeHtml(JSON.stringify(item.sourceMetadata || {}, null, 2));
  var preflightText = escapeHtml(JSON.stringify(item.preflightSnapshot || {}, null, 2));
  var readinessText = escapeHtml(JSON.stringify(item.readinessSnapshot || {}, null, 2));
  var rejectReasons = arrayToText(item.rejectReasons);
  var warnings = arrayToText(item.warnings);
  var sourceContextId = item.sourceMetadata && item.sourceMetadata.contextId ? item.sourceMetadata.contextId : "";
  var accepted = item.accepted === true;
  var statusColor = accepted ? "#047857" : "#b45309";
  var statusBg = accepted ? "#ecfdf5" : "#fffbeb";
  var statusBorder = accepted ? "#a7f3d0" : "#fde68a";
  var hasBoundedPayload = accepted && typeof item.taskCardText === "string" && item.taskCardText.length > 0;
  var currentExecutorId = normalizeExecutorId(item.target);
  var executorResolution = resolveExecutorTerminal(currentExecutorId, item);
  var bindingResolution = resolveExecutionTerminalBinding(currentExecutorId);
  var terminalFillHtml = buildTerminalFillHtml(item, hasBoundedPayload, terminalFillState, bindingResolution, executorResolution, lastExecutorTerminalLaunchState);

  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:-apple-system,Arial,sans-serif;font-size:13px;color:#1e1e1e;padding:16px;background:#fff;\">" +
    "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;\">" +
    "<h2 style=\"margin:0;font-size:16px;\">ACB Execution Inbox 收件箱</h2>" +
    "<div style=\"display:flex;gap:8px;\">" +
    "<button onclick=\"refreshExecutionInbox()\" style=\"padding:4px 12px;border:1px solid #1976d2;border-radius:4px;background:#fff;color:#1976d2;cursor:pointer;font-size:12px;\">Refresh</button>" +
    "<button onclick=\"copyPayload()\" style=\"padding:4px 12px;border:1px solid #16a34a;border-radius:4px;background:#16a34a;color:#fff;cursor:pointer;font-size:12px;\">复制 Payload</button>" +
    (hasBoundedPayload ? "<button onclick=\"showTerminalFillConfirm()\" style=\"padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#fff;color:#7c3aed;cursor:pointer;font-size:12px;\">填入当前终端输入框（不回车）</button>" : "") +
    "</div></div>" +

    "<p style=\"margin:0 0 14px 0;padding:10px;background:#eef2ff;border:1px solid #818cf8;border-radius:4px;font-size:12px;line-height:1.45;\">" +
    "Execution Inbox 已收到此任务。请复制 Payload，并手动粘贴到 Codex / Claude Code / DeepSeek。不会自动执行、控制终端、粘贴或回车。" +
    "</p>" +

    terminalFillHtml +

    "<section style=\"margin:0 0 14px 0;padding:12px;border:1px solid " + statusBorder + ";border-radius:6px;background:" + statusBg + ";\">" +
    "<h3 style=\"margin:0 0 8px 0;font-size:14px;color:" + statusColor + ";\">当前收到的任务</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:10px;\">" +
      buildRow("status", escapeHtml(String(item.status || "-"))) +
      buildRow("accepted", String(accepted)) +
      buildRow("inboxItemId", escapeHtml(String(item.inboxItemId || "-"))) +
      buildRow("taskCardId", escapeHtml(String(item.taskCardId || "-"))) +
      buildRow("target executor", escapeHtml(String(item.target || "-"))) +
      buildRow("receivedAt", escapeHtml(String(item.createdAt || "-"))) +
      buildRow("rejectReasons", escapeHtml(rejectReasons)) +
      buildRow("warnings", escapeHtml(warnings)) +
    "</table>" +
    "<p style=\"margin:0;font-size:12px;color:#475569;line-height:1.45;\">此任务已在本地收件箱可见，但尚未执行。请点击“复制 Payload”，再手动粘贴到选定执行端。</p>" +
    "</section>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">Payload 预览</h3>" +
    "<pre style=\"margin:0 0 12px 0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto;\">" + taskCardPreview + (String(item.taskCardText || "").length > 3000 ? "\\n...此处只显示预览；点击“复制 Payload”会复制完整任务卡。" : "") + "</pre>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">任务上下文</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("projectDir", escapeHtml(String(item.projectDir || "-"))) +
      buildRow("currentBranch", escapeHtml(String(item.currentBranch || "-"))) +
      buildRow("currentCommit", escapeHtml(String(item.currentCommit || "-"))) +
      buildRow("local project path", escapeHtml(String(localStatus.workspacePath || "-"))) +
      buildRow("local branch", escapeHtml(String(git.branch || "-"))) +
      buildRow("local commit", escapeHtml(String(git.commitHash || "-"))) +
      buildRow("working tree status", escapeHtml(String(git.available ? (git.clean ? "clean" : "dirty") : "unknown"))) +
    "</table>" +

    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">安全边界</h3>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:12px;\">" +
      buildRow("noAutoDispatch", String(safety.noAutoDispatch === true)) +
      buildRow("noCommandExecution", String(safety.noCommandExecution === true)) +
      buildRow("canTriggerExecution", String(safety.canTriggerExecution === true)) +
      buildRow("executionAllowed", String(safety.executionAllowed === true)) +
      buildRow("agentDispatchAllowed", String(safety.agentDispatchAllowed === true)) +
      buildRow("gitWriteAllowed", String(safety.gitWriteAllowed === true)) +
    "</table>" +

    "<details style=\"margin:0 0 12px 0;\">" +
    "<summary style=\"cursor:pointer;color:#334155;font-weight:bold;\">Debug / Historical Details</summary>" +
    "<table style=\"width:100%;border-collapse:collapse;margin:8px 0 12px 0;\">" +
      buildRow("source context", escapeHtml(String(sourceContextId || "-"))) +
      buildRow("historical item", "false") +
    "</table>" +
    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">Route / Gate Metadata</h3>" +
    "<pre style=\"margin:0 0 12px 0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow-y:auto;\">" + routeResultText + "</pre>" +
    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">Payload Validation</h3>" +
    "<pre style=\"margin:0 0 12px 0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow-y:auto;\">" + payloadValidationText + "</pre>" +
    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">Source / Preflight / Readiness Snapshots</h3>" +
    "<pre style=\"margin:0 0 12px 0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow-y:auto;\">sourceMetadata\\n" + sourceMetadataText + "\\n\\npreflightSnapshot\\n" + preflightText + "\\n\\nreadinessSnapshot\\n" + readinessText + "</pre>" +
    "<h3 style=\"margin:0 0 6px 0;font-size:14px;\">Full Stored Task Card</h3>" +
    "<pre style=\"margin:0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow-y:auto;\">" + taskCardText + "</pre>" +
    "</details>" +

    "<script>" +
    "var vscode=acquireVsCodeApi();" +
    "function refreshExecutionInbox(){vscode.postMessage({command:'refreshExecutionInbox'});}" +
    "function copyPayload(){vscode.postMessage({command:'copyPayload'});}" +
    "function startExecutorTerminal(){vscode.postMessage({command:'startExecutorTerminal'});}" +
    "function showExecutorProfileFillConfirm(){var box=document.getElementById('acb-executor-profile-fill-confirm');if(box){box.style.display='block';}}" +
    "function hideExecutorProfileFillConfirm(){var box=document.getElementById('acb-executor-profile-fill-confirm');if(box){box.style.display='none';}}" +
    "function fillExecutorProfileTerminal(){vscode.postMessage({command:'fillExecutorProfileTerminal'});}" +
    "function bindCurrentTerminalToExecutor(){vscode.postMessage({command:'bindCurrentTerminalToExecutor'});}" +
    "function showBoundTerminalFillConfirm(){var box=document.getElementById('acb-bound-terminal-fill-confirm');if(box){box.style.display='block';}}" +
    "function hideBoundTerminalFillConfirm(){var box=document.getElementById('acb-bound-terminal-fill-confirm');if(box){box.style.display='none';}}" +
    "function fillBoundTerminalInput(){vscode.postMessage({command:'fillBoundTerminalInput'});}" +
    "function showTerminalFillConfirm(){var box=document.getElementById('acb-terminal-fill-confirm');if(box){box.style.display='block';}}" +
    "function hideTerminalFillConfirm(){var box=document.getElementById('acb-terminal-fill-confirm');if(box){box.style.display='none';}}" +
    "function fillActiveTerminalInput(){vscode.postMessage({command:'fillActiveTerminalInput'});}" +
    "</script>" +
    "</body></html>";
}

function buildTerminalFillState(item, terminal, status, message, options) {
  var opts = options || {};
  var payload = item && typeof item.taskCardText === "string" ? item.taskCardText : "";
  var executorId = normalizeExecutorId(opts.executorId || (item && item.target));
  var fillMode = opts.fillMode || (terminal ? "active_terminal" : "");
  return {
    status: status,
    message: message,
    terminal_fill_attempted: status === "terminal_fill_attempted",
    terminal_fill_mode: fillMode,
    terminal_fill_executor: executorId,
    terminal_fill_at: new Date().toISOString(),
    terminal_fill_target: terminal ? fillMode || "active_terminal" : "",
    terminal_fill_terminal_name: terminal && terminal.name ? String(terminal.name) : "",
    terminal_fill_newline_added: false,
    terminal_fill_execution_triggered: false,
    bindingStatus: opts.bindingStatus || "",
    payloadLength: payload.length,
    payloadHasEmbeddedNewlines: /[\r\n]/.test(payload),
    itemId: item && item.inboxItemId ? String(item.inboxItemId) : "",
    taskCardId: item && item.taskCardId ? String(item.taskCardId) : "",
    targetExecutor: item && item.target ? String(item.target) : "",
    terminalName: terminal && terminal.name ? String(terminal.name) : ""
  };
}

function buildTerminalFillHtml(item, hasBoundedPayload, terminalFillState, bindingResolution, executorResolution, launchState) {
  var payload = item && typeof item.taskCardText === "string" ? item.taskCardText : "";
  var payloadLength = String(payload.length);
  var itemId = escapeHtml(String(item && item.inboxItemId ? item.inboxItemId : "-"));
  var taskCardId = escapeHtml(String(item && item.taskCardId ? item.taskCardId : "-"));
  var executorId = normalizeExecutorId(item && item.target);
  var executorName = getExecutorDisplayName(executorId);
  var profile = executorResolution && executorResolution.profile ? executorResolution.profile : getExecutorProfile(executorId, item);
  var profileStatus = executorResolution ? executorResolution.status : "unsupported_executor";
  var profileStatusLabel = getExecutorTerminalStatusLabel(profileStatus);
  var profileTerminalName = profile && profile.terminalName ? profile.terminalName : "";
  var profileLaunchCommand = profile && profile.launchCommand ? profile.launchCommand : "";
  var profileLaunchConfigured = Boolean(profile && profile.launchCommandConfigured);
  var profileMatchedCount = executorResolution && executorResolution.matchedTerminals ? executorResolution.matchedTerminals.length : 0;
  var profileFillButtonLabel = "填入 " + executorName + " 终端（不回车）";
  var profileStartButtonLabel = "启动 " + executorName + " 终端";
  var targetExecutor = escapeHtml(String(item && item.target ? item.target : "-"));
  var binding = bindingResolution && bindingResolution.binding ? bindingResolution.binding : null;
  var bindingStatus = bindingResolution ? bindingResolution.status : "unsupported_executor";
  var bindingStatusLabel = getBindingStatusLabel(bindingStatus);
  var boundTerminalName = binding && binding.terminalName ? binding.terminalName : "";
  var boundAt = binding && binding.boundAt ? binding.boundAt : "";
  var bindButtonLabel = "将当前终端绑定为 " + executorName;
  var boundFillButtonLabel = "填入绑定的 " + executorName + " 终端（不回车）";
  var stateHtml = "";
  if (terminalFillState) {
    var stateColor = terminalFillState.status === "terminal_fill_attempted" ? "#047857" : "#b45309";
    var stateBg = terminalFillState.status === "terminal_fill_attempted" ? "#ecfdf5" : "#fffbeb";
    var stateBorder = terminalFillState.status === "terminal_fill_attempted" ? "#a7f3d0" : "#fde68a";
    stateHtml =
      "<section style=\"margin:0 0 12px 0;padding:10px;border:1px solid " + stateBorder + ";border-radius:6px;background:" + stateBg + ";\">" +
      "<p style=\"margin:0 0 6px 0;font-size:12px;font-weight:bold;color:" + stateColor + ";\">" + escapeHtml(String(terminalFillState.message || "")) + "</p>" +
      "<table style=\"width:100%;border-collapse:collapse;margin-bottom:0;\">" +
        buildRow("terminal_fill_attempted", String(terminalFillState.terminal_fill_attempted === true)) +
        buildRow("terminal_fill_mode", escapeHtml(String(terminalFillState.terminal_fill_mode || "-"))) +
        buildRow("terminal_fill_executor", escapeHtml(String(terminalFillState.terminal_fill_executor || "-"))) +
        buildRow("terminal_fill_at", escapeHtml(String(terminalFillState.terminal_fill_at || "-"))) +
        buildRow("terminal_fill_target", escapeHtml(String(terminalFillState.terminal_fill_target || "-"))) +
        buildRow("terminal_fill_terminal_name", escapeHtml(String(terminalFillState.terminal_fill_terminal_name || "-"))) +
        buildRow("terminal_fill_newline_added", String(terminalFillState.terminal_fill_newline_added === true)) +
        buildRow("terminal_fill_execution_triggered", String(terminalFillState.terminal_fill_execution_triggered === true)) +
      "</table>" +
      "<details style=\"margin-top:8px;\">" +
      "<summary style=\"cursor:pointer;color:#334155;font-weight:bold;font-size:12px;\">Terminal Fill Debug Details</summary>" +
      "<table style=\"width:100%;border-collapse:collapse;margin:8px 0 0 0;\">" +
        buildRow("payload length", escapeHtml(String(terminalFillState.payloadLength || 0))) +
        buildRow("payload has embedded newlines", String(terminalFillState.payloadHasEmbeddedNewlines === true)) +
        buildRow("itemId", escapeHtml(String(terminalFillState.itemId || "-"))) +
        buildRow("taskCardId", escapeHtml(String(terminalFillState.taskCardId || "-"))) +
        buildRow("target executor", escapeHtml(String(terminalFillState.targetExecutor || "-"))) +
        buildRow("profile terminal name", escapeHtml(profileTerminalName || "-")) +
        buildRow("profile resolution status", escapeHtml(profileStatusLabel || "-")) +
        buildRow("matched terminal count", escapeHtml(String(profileMatchedCount))) +
        buildRow("launch command configured", String(profileLaunchConfigured)) +
        buildRow("binding status", escapeHtml(String(terminalFillState.bindingStatus || bindingStatusLabel || "-"))) +
        buildRow("terminal name", escapeHtml(String(terminalFillState.terminalName || "-"))) +
      "</table>" +
      "</details>" +
      "</section>";
  }
  var launchStateHtml = "";
  if (launchState && launchState.executor_terminal_launch_attempted) {
    launchStateHtml =
      "<section style=\"margin:0 0 12px 0;padding:10px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;\">" +
      "<p style=\"margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#1d4ed8;\">执行端终端启动状态：" + escapeHtml(String(launchState.executor_terminal_launch_status || "-")) + "</p>" +
      "<table style=\"width:100%;border-collapse:collapse;margin-bottom:0;\">" +
        buildRow("executor_terminal_launch_attempted", "true") +
        buildRow("executor_terminal_launch_executor", escapeHtml(String(launchState.executor_terminal_launch_executor || "-"))) +
        buildRow("executor_terminal_launch_terminal_name", escapeHtml(String(launchState.executor_terminal_launch_terminal_name || "-"))) +
        buildRow("executor_terminal_launch_command_configured", String(launchState.executor_terminal_launch_command_configured === true)) +
        buildRow("executor_terminal_launch_command_sent", String(launchState.executor_terminal_launch_command_sent === true)) +
        buildRow("executor_terminal_launch_at", escapeHtml(String(launchState.executor_terminal_launch_at || "-"))) +
      "</table>" +
      "<p style=\"margin:6px 0 0 0;font-size:11px;color:#475569;line-height:1.4;\">启动动作只用于启动执行端 CLI；不会填入任务卡 Payload。</p>" +
      "</section>";
  }
  if (!hasBoundedPayload) {
    return stateHtml + launchStateHtml;
  }
  return stateHtml +
    launchStateHtml +
    "<section style=\"margin:0 0 14px 0;padding:10px;border:1px solid #c4b5fd;border-radius:6px;background:#faf5ff;\">" +
    "<p style=\"margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#6d28d9;\">Executor Profile 目标终端填入</p>" +
    "<p style=\"margin:0 0 6px 0;font-size:12px;color:#475569;line-height:1.45;\">当前 target：" + escapeHtml(executorName) + "。期望终端：" + escapeHtml(profileTerminalName || "-") + "。状态：" + escapeHtml(profileStatusLabel) + "。填入任务卡不会回车、不会执行。</p>" +
    "<p style=\"margin:0 0 6px 0;font-size:12px;color:#475569;line-height:1.45;\">启动执行端终端只启动 " + escapeHtml(executorName) + " CLI，不会填入任务卡。用户必须人工确认后自行按 Enter。</p>" +
    "<p style=\"margin:0 0 8px 0;font-size:12px;color:#92400e;line-height:1.45;\">警告：Payload 内含换行时，部分终端应用可能以自己的方式解释多行输入。请在按 Enter 前人工核对、编辑或删除。</p>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:8px;\">" +
      buildRow("current target executor", escapeHtml(executorName)) +
      buildRow("profile terminal name", escapeHtml(profileTerminalName || "-")) +
      buildRow("profile status", escapeHtml(profileStatusLabel)) +
      buildRow("matched terminal count", escapeHtml(String(profileMatchedCount))) +
      buildRow("launch command configured", String(profileLaunchConfigured)) +
      buildRow("launch command", profileLaunchCommand ? escapeHtml(profileLaunchCommand) : "-") +
      buildRow("binding status", escapeHtml(bindingStatusLabel)) +
      buildRow("bound terminal name", escapeHtml(boundTerminalName || "-")) +
      buildRow("binding timestamp", escapeHtml(boundAt || "-")) +
      buildRow("payload length", escapeHtml(payloadLength)) +
      buildRow("itemId", itemId) +
      buildRow("taskCardId", taskCardId) +
      buildRow("target executor", targetExecutor) +
      buildRow("embedded newlines", String(/[\r\n]/.test(payload))) +
    "</table>" +
    (executorId && (profileStatus === "terminal_missing" || profileStatus === "launch_command_not_configured" || profileStatus === "terminal_found") ? "<button onclick=\"startExecutorTerminal()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #2563eb;border-radius:4px;background:#fff;color:#2563eb;cursor:pointer;font-size:12px;\">" + escapeHtml(profileStartButtonLabel) + "</button>" : "") +
    (executorResolution && executorResolution.canFill ? "<button onclick=\"showExecutorProfileFillConfirm()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;\">" + escapeHtml(profileFillButtonLabel) + "</button>" : "") +
    (profileStatus === "launch_command_not_configured" ? "<p style=\"margin:8px 0 0 0;font-size:11px;color:#92400e;line-height:1.4;\">该执行端启动命令未配置。请在 VS Code 设置中配置后再启动；ACB 不会猜测命令。</p>" : "") +
    (profileStatus === "terminal_missing" ? "<p style=\"margin:8px 0 0 0;font-size:11px;color:#92400e;line-height:1.4;\">目标终端未打开。可显式启动执行端终端；启动不会填入任务 Payload。</p>" : "") +
    (profileStatus === "ambiguous_terminal" ? "<p style=\"margin:8px 0 0 0;font-size:11px;color:#b91c1c;line-height:1.4;\">找到多个同名目标终端，ACB 不会猜测。请关闭重复终端或修改配置。</p>" : "") +
    "<div id=\"acb-executor-profile-fill-confirm\" style=\"display:none;margin-top:10px;padding:10px;border:1px solid #7c3aed;border-radius:6px;background:#f5f3ff;\">" +
    "<p style=\"margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#6d28d9;\">确认填入 " + escapeHtml(executorName) + " profile 终端？</p>" +
    "<p style=\"margin:0 0 8px 0;font-size:12px;color:#475569;line-height:1.45;\">ACB 只会填入任务卡 Payload，不会附加回车，不会执行。用户必须自行检查，并手动决定是否按 Enter。</p>" +
    "<button onclick=\"fillExecutorProfileTerminal()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;\">确认填入 profile 终端（不回车）</button>" +
    "<button onclick=\"hideExecutorProfileFillConfirm()\" style=\"padding:4px 12px;border:1px solid #9ca3af;border-radius:4px;background:#fff;color:#374151;cursor:pointer;font-size:12px;\">取消</button>" +
    "</div>" +
    "<hr style=\"margin:12px 0;border:none;border-top:1px dashed #c4b5fd;\">" +
    "<p style=\"margin:0 0 8px 0;font-size:11px;color:#64748b;line-height:1.4;\">Fallback：以下保留 P0-3.6B session binding 与 P0-3.6A active terminal 手动填入路径。</p>" +
    (executorId ? "<button onclick=\"bindCurrentTerminalToExecutor()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #6d28d9;border-radius:4px;background:#fff;color:#6d28d9;cursor:pointer;font-size:12px;\">" + escapeHtml(bindButtonLabel) + "</button>" : "") +
    (bindingResolution && bindingResolution.canFill ? "<button onclick=\"showBoundTerminalFillConfirm()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;\">" + escapeHtml(boundFillButtonLabel) + "</button>" : "") +
    "<button onclick=\"showTerminalFillConfirm()\" style=\"padding:4px 12px;border:1px solid #0369a1;border-radius:4px;background:#fff;color:#0369a1;cursor:pointer;font-size:12px;\">填入当前终端输入框（不回车）</button>" +
    (bindingResolution && !bindingResolution.canFill ? "<p style=\"margin:8px 0 0 0;font-size:11px;color:#92400e;line-height:1.4;\">未找到当前 target 的可用绑定终端；ACB 不会猜测，也不会填入其它执行端终端。仍可使用手动 active terminal fallback。</p>" : "") +
    "<div id=\"acb-bound-terminal-fill-confirm\" style=\"display:none;margin-top:10px;padding:10px;border:1px solid #7c3aed;border-radius:6px;background:#f5f3ff;\">" +
    "<p style=\"margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#6d28d9;\">确认填入绑定的 " + escapeHtml(executorName) + " 终端？</p>" +
    "<p style=\"margin:0 0 8px 0;font-size:12px;color:#475569;line-height:1.45;\">ACB 只会填入绑定终端，不会附加回车。用户必须自行检查，并手动决定是否按 Enter。</p>" +
    "<button onclick=\"fillBoundTerminalInput()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;\">确认填入绑定终端（不回车）</button>" +
    "<button onclick=\"hideBoundTerminalFillConfirm()\" style=\"padding:4px 12px;border:1px solid #9ca3af;border-radius:4px;background:#fff;color:#374151;cursor:pointer;font-size:12px;\">取消</button>" +
    "</div>" +
    "<div id=\"acb-terminal-fill-confirm\" style=\"display:none;margin-top:10px;padding:10px;border:1px solid #f59e0b;border-radius:6px;background:#fffbeb;\">" +
    "<p style=\"margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#92400e;\">确认填入当前 active terminal？</p>" +
    "<p style=\"margin:0 0 8px 0;font-size:12px;color:#475569;line-height:1.45;\">ACB 只会调用 VS Code 当前终端填入文本，不会附加回车。用户必须自行检查，并手动决定是否按 Enter。</p>" +
    "<button onclick=\"fillActiveTerminalInput()\" style=\"margin-right:8px;padding:4px 12px;border:1px solid #7c3aed;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;\">确认填入（不回车）</button>" +
    "<button onclick=\"hideTerminalFillConfirm()\" style=\"padding:4px 12px;border:1px solid #9ca3af;border-radius:4px;background:#fff;color:#374151;cursor:pointer;font-size:12px;\">取消</button>" +
    "</div>" +
    "</section>";
}

function parseTaskCardFieldsForDisplay(text) {
  var output = {};
  var src = String(text || "").replace(/\r\n/g, "\n");
  var keys = [
    "taskCardId",
    "target",
    "taskTitle",
    "projectDir",
    "currentBranch",
    "currentCommit",
    "objective",
    "allowedFiles",
    "forbiddenActions",
    "implementationRequirements",
    "checks",
    "gitBoundary",
    "reportFormat",
    "acceptanceCriteria"
  ];

  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var regex = new RegExp("(?:^|\\n)\\s*" + key + "\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*[a-zA-Z][a-zA-Z0-9_]*\\s*[:：]|$)", "i");
    var match = src.match(regex);
    output[key] = match ? String(match[1]).trim() : "";
  }
  return output;
}

function shortMultiline(text) {
  var src = String(text || "").trim();
  if (!src) {
    return "-";
  }
  var lines = src.split(/\r?\n/).filter(function (line) { return line.trim(); });
  if (lines.length <= 2) {
    return lines.join(" | ");
  }
  return lines.slice(0, 2).join(" | ") + " | ...";
}

function arrayToText(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "none";
  }
  return value.join("; ");
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deactivate() {
  localBridgeServer.stop().catch(function (err) {
    console.error("[ACB] bridge server stop error: " + (err.message || String(err)));
  });
}

module.exports = { activate, deactivate };
