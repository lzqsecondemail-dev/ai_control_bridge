"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var BRIDGE_PORT = 17373;
var BRIDGE_HOST = "127.0.0.1";

var FORBIDDEN_FIELDS = [
  "command",
  "shellCommand",
  "powershell",
  "gitCommand",
  "agentCommand",
  "execute",
  "run",
  "writeFile",
  "deleteFile",
  "fullTaskCard"
];

var ALLOWED_MESSAGE_TYPES = [
  "content",
  "decision",
  "strategy",
  "recommendation",
  "execution",
  "other"
];

var server = null;

// In-memory cache for latest preflight result summary (no fullTaskCard persisted)
var latestPreflightCache = null;
// In-memory cache for latest accepted task card review (M3-Bridge.4, no disk persistence)
var latestTaskCardReviewCache = null;
// In-memory cache for latest execution inbox gate result (M3-ExecSend.1-A, no disk persistence)
var latestExecutionInboxCache = null;
// Registered terminal action handler — extension.js registers after bridge start
var _terminalHandler = null;
// In-memory cache for latest terminal action state
var latestTerminalStateCache = null;

/**
 * Start the local bridge HTTP server.
 * @param {Object} [opts]
 * @param {number} [opts.port] - Override default port (for testing).
 * @returns {Promise<{port: number, host: string}>}
 */
function start(opts) {
  return new Promise(function (resolve, reject) {
    if (server) {
      resolve({ port: BRIDGE_PORT, host: BRIDGE_HOST });
      return;
    }

    var port = (opts && opts.port) ? opts.port : BRIDGE_PORT;
    BRIDGE_PORT = port;

    server = http.createServer(function (req, res) {
      setCorsHeaders(req, res);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        routeRequest(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify({ error: "internal_error", detail: err.message || String(err) }));
      }
    });

    server.on("error", function (err) {
      console.error("[ACB Bridge] server error", err.message || String(err));
      server = null;
      reject(err);
    });

    server.listen(port, BRIDGE_HOST, function () {
      console.log("[ACB Bridge] listening on " + BRIDGE_HOST + ":" + port);
      resolve({ port: port, host: BRIDGE_HOST });
    });
  });
}

/**
 * Stop the local bridge HTTP server.
 * @returns {Promise<void>}
 */
function stop() {
  return new Promise(function (resolve) {
    if (!server) {
      resolve();
      return;
    }
    server.close(function () {
      console.log("[ACB Bridge] stopped");
      server = null;
      resolve();
    });
  });
}

/**
 * Check if the server is running.
 * @returns {boolean}
 */
function isRunning() {
  return server !== null && server.listening;
}

function setCorsHeaders(req, res) {
  var origin = req.headers && req.headers.origin;
  if (origin && /^chrome-extension:\/\//.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function routeRequest(req, res) {
  var rawUrl = req.url || "/";
  var qsIdx = rawUrl.indexOf("?");
  var url = qsIdx !== -1 ? rawUrl.substring(0, qsIdx) : rawUrl;
  var method = (req.method || "GET").toUpperCase();

  if (method === "GET" && url === "/acb/v1/health") {
    handleHealth(req, res);
    return;
  }

  if (method === "GET" && url === "/acb/v1/project-status") {
    handleProjectStatus(req, res);
    return;
  }

  if (method === "POST" && url === "/acb/v1/message") {
    handleMessage(req, res);
    return;
  }

  if (method === "POST" && url === "/acb/v1/preflight") {
    handlePreflight(req, res);
    return;
  }

  if (method === "GET" && url === "/acb/v1/readiness") {
    handleReadiness(req, res);
    return;
  }

  if (method === "POST" && url === "/acb/v1/task-card-review") {
    handleTaskCardReview(req, res);
    return;
  }

  if (method === "GET" && url === "/acb/v1/task-card-review/latest") {
    handleTaskCardReviewLatest(req, res);
    return;
  }

  if (method === "POST" && url === "/acb/v1/execution-inbox") {
    handleExecutionInbox(req, res);
    return;
  }

  if (method === "GET" && url === "/acb/v1/execution-inbox/latest") {
    handleExecutionInboxLatest(req, res);
    return;
  }

  if (method === "GET" && url.indexOf("/acb/v1/execution-reports/by-task/") === 0) {
    var taskCardId = url.substring("/acb/v1/execution-reports/by-task/".length);
    handleExecutionReportByTask(req, res, taskCardId);
    return;
  }

  if (method === "GET" && url === "/acb/v1/terminal/status") {
    handleTerminalStatus(req, res);
    return;
  }

  if (method === "POST" && url === "/acb/v1/terminal/launch") {
    handleTerminalLaunch(req, res);
    return;
  }

  if (method === "POST" && url === "/acb/v1/terminal/fill") {
    handleTerminalFill(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found", path: url, method: method }));
}

function handleProjectStatus(req, res) {
  var generatedAt = new Date().toISOString();

  var bridgeInfo = {
    name: "acb-local-bridge",
    version: "0.1.0",
    protocol: "acb/v1",
    host: BRIDGE_HOST,
    port: BRIDGE_PORT
  };

  var safetyInfo = {
    noAutoDispatch: true,
    noCommandExecution: true
  };

  var projectStatus;
  try {
    projectStatus = require("./projectStatus.js");
  } catch (_e) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      bridge: bridgeInfo,
      safety: safetyInfo,
      projectStatus: null,
      diagnostics: null,
      error: "project_status_unavailable",
      detail: "VS Code extension host not available. Project status requires the VS Code API.",
      generatedAt: generatedAt
    }));
    return;
  }

  projectStatus.getProjectStatus().then(function (status) {
    var git = status.git || {};
    var workingTree = "unknown";
    if (git.available) {
      workingTree = git.clean ? "clean" : "dirty";
    }

    var diag = status.diagnostics || {};

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      bridge: bridgeInfo,
      safety: safetyInfo,
      projectStatus: {
        projectPath: status.workspacePath || null,
        workspaceName: status.workspaceName || null,
        hasWorkspace: status.hasWorkspace,
        gitRoot: git.repoRoot || null,
        gitAvailable: git.available,
        branch: git.branch || null,
        currentCommit: git.commitHash || null,
        latestCommit: git.commitSummary || null,
        workingTree: workingTree,
        changedFiles: git.changes || 0,
        stagedFiles: git.indexChanges || 0,
        untrackedFiles: git.untracked || 0,
        generatedAt: status.generatedAt || null
      },
      diagnostics: {
        diagnosticsEnabled: diag.diagnosticsEnabled,
        processPlatform: diag.processPlatform,
        workspaceFoldersLength: diag.workspaceFoldersLength,
        folderName: diag.folderName,
        gitApiExtensionFound: diag.gitApiExtensionFound,
        gitApiActivated: diag.gitApiActivated,
        gitApiRepositoryCount: diag.gitApiRepositoryCount,
        gitApiFirstRepoRootFsPath: diag.gitApiFirstRepoRootFsPath,
        gitApiFirstRepoHeadName: diag.gitApiFirstRepoHeadName,
        gitApiFirstRepoHeadCommit: diag.gitApiFirstRepoHeadCommit,
        cliFallbackAttempted: diag.cliFallbackAttempted,
        cliVerifyAttempted: diag.cliVerifyAttempted,
        cliVerifyHead: diag.cliVerifyHead,
        cliVerifyApiCommitHash: diag.cliVerifyApiCommitHash,
        commitSourceMismatch: diag.commitSourceMismatch,
        currentCommitSource: diag.currentCommitSource
      },
      generatedAt: generatedAt
    }));
  }).catch(function (err) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      bridge: bridgeInfo,
      safety: safetyInfo,
      projectStatus: null,
      diagnostics: null,
      error: "project_status_error",
      detail: err.message || String(err),
      generatedAt: generatedAt
    }));
  });
}

function handleHealth(req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "ok",
    bridge: "acb-local-bridge",
    version: "0.1.0",
    protocol: "acb/v1",
    host: BRIDGE_HOST,
    port: BRIDGE_PORT,
    noAutoDispatch: true,
    noCommandExecution: true,
    generatedAt: new Date().toISOString()
  }));
}

function handleMessage(req, res) {
  var chunks = [];
  req.on("data", function (chunk) {
    chunks.push(chunk);
  });
  req.on("end", function () {
    var raw = Buffer.concat(chunks).toString("utf8");
    var body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_json", detail: "Request body is not valid JSON." }));
      return;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_body", detail: "Request body must be a JSON object." }));
      return;
    }

    var forbidden = findForbiddenField(body);
    if (forbidden) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "forbidden_field",
        detail: "Request contains forbidden field: " + forbidden,
        noAutoDispatch: true,
        noCommandExecution: true
      }));
      return;
    }

    var validationError = validateMessageBody(body);
    if (validationError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: false,
        error: validationError.error,
        message: validationError.message,
        noAutoDispatch: true,
        noCommandExecution: true
      }));
      return;
    }

    var sanitized = sanitizeMessageBody(body);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      received: true,
      noAutoDispatch: true,
      noCommandExecution: true,
      messageType: (body.type || body.messageType || "unknown"),
      messageEcho: sanitized,
      generatedAt: new Date().toISOString()
    }));
  });
}

function findForbiddenField(body) {
  for (var i = 0; i < FORBIDDEN_FIELDS.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(body, FORBIDDEN_FIELDS[i])) {
      return FORBIDDEN_FIELDS[i];
    }
  }
  return null;
}

function validateMessageBody(body) {
  if (!body.messageType || typeof body.messageType !== "string") {
    return { error: "invalid_messageType", message: "messageType is required and must be a string." };
  }
  if (ALLOWED_MESSAGE_TYPES.indexOf(body.messageType) === -1) {
    return { error: "invalid_messageType", message: "messageType '" + body.messageType + "' is not allowed. Allowed: " + ALLOWED_MESSAGE_TYPES.join(", ") };
  }
  if (!Object.prototype.hasOwnProperty.call(body, "noAutoDispatch") || body.noAutoDispatch !== true) {
    return { error: "invalid_noAutoDispatch", message: "noAutoDispatch must be true." };
  }
  if (!Object.prototype.hasOwnProperty.call(body, "noCommandExecution") || body.noCommandExecution !== true) {
    return { error: "invalid_noCommandExecution", message: "noCommandExecution must be true." };
  }
  return null;
}

function sanitizeMessageBody(body) {
  var safe = {};
  var keys = Object.keys(body);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (FORBIDDEN_FIELDS.indexOf(key) !== -1) {
      continue;
    }
    var val = body[key];
    if (typeof val === "string") {
      safe[key] = val.length > 200 ? val.substring(0, 200) + "..." : val;
    } else if (typeof val === "number" || typeof val === "boolean" || val === null) {
      safe[key] = val;
    }
  }
  return safe;
}

// ─── Task Card Parser ────────────────────────────────────────────────

var REQUIRED_PREFLIGHT_FIELDS = [
  "taskCardId", "target", "taskTitle", "projectDir",
  "currentBranch", "currentCommit", "objective",
  "allowedFiles", "forbiddenActions", "implementationRequirements",
  "checks", "gitBoundary", "reportFormat", "acceptanceCriteria"
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTaskCardAttrs(text) {
  var result = {
    startDetected: false,
    endDetected: false,
    startId: "",
    endId: "",
    startTarget: "",
    body: ""
  };

  var startRegex = /<ACB_TASK_CARD\s+([^>]+)>/i;
  var startMatch = text.match(startRegex);
  if (!startMatch) {
    return result;
  }

  result.startDetected = true;
  var startAttrs = startMatch[1];

  var idMatch = startAttrs.match(/\bid\s*=\s*"([^"]*)"/i);
  if (idMatch) { result.startId = idMatch[1]; }

  var targetMatch = startAttrs.match(/\btarget\s*=\s*"([^"]*)"/i);
  if (targetMatch) { result.startTarget = targetMatch[1]; }

  var startIndex = text.indexOf(startMatch[0]);
  var afterStart = text.slice(startIndex + startMatch[0].length);

  var endRegex = /<ACB_TASK_CARD_END\s+([^>]+)>/i;
  var endMatch = afterStart.match(endRegex);
  if (endMatch) {
    result.endDetected = true;
    var endAttrs = endMatch[1];
    var endIdMatch = endAttrs.match(/\bid\s*=\s*"([^"]*)"/i);
    if (endIdMatch) { result.endId = endIdMatch[1]; }
    var endIndex = afterStart.indexOf(endMatch[0]);
    result.body = afterStart.slice(0, endIndex);
  } else {
    result.body = afterStart;
  }

  return result;
}

function parseTaskCardFields(body) {
  var normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var positions = [];

  for (var i = 0; i < REQUIRED_PREFLIGHT_FIELDS.length; i += 1) {
    var name = REQUIRED_PREFLIGHT_FIELDS[i];
    var pattern = new RegExp("(?:^|\\n)\\s*" + escapeRegex(name) + "\\s*[：:]\\s*", "im");
    var match = normalized.match(pattern);
    if (match) {
      positions.push({
        name: name,
        matchIndex: match.index,
        valueStart: match.index + match[0].length
      });
    }
  }

  positions.sort(function (a, b) { return a.valueStart - b.valueStart; });

  var fields = {};
  for (var j = 0; j < positions.length; j += 1) {
    var pos = positions[j];
    var end = (j + 1 < positions.length) ? positions[j + 1].matchIndex : normalized.length;
    var value = normalized.slice(pos.valueStart, end).replace(/\n+$/, "").trim();
    fields[pos.name] = value;
  }

  return fields;
}

function countTaskCardMarkers(text) {
  return {
    startCount: (text.match(/<ACB_TASK_CARD\s+/gi) || []).length,
    endCount: (text.match(/<ACB_TASK_CARD_END\s+/gi) || []).length
  };
}

function getMissingRequiredFields(fields) {
  var missing = [];
  for (var i = 0; i < REQUIRED_PREFLIGHT_FIELDS.length; i += 1) {
    var key = REQUIRED_PREFLIGHT_FIELDS[i];
    if (!fields[key] || !String(fields[key]).trim()) {
      missing.push(key);
    }
  }
  return missing;
}

function validateTaskCardReviewPayload(body) {
  var result = {
    ok: false,
    diagnostics: {
      hasExecutablePayload: false,
      startDetected: false,
      endDetected: false,
      startCount: 0,
      endCount: 0,
      exactlyOneTaskCard: false,
      idMatched: false,
      taskCardIdPresent: false,
      taskCardIdMatched: false,
      targetPresent: false,
      targetMatched: false,
      requiredFieldsMissing: []
    },
    summary: {
      status: "invalid",
      taskCardId: "",
      target: "",
      message: ""
    },
    extracted: {
      attrs: null,
      fields: null
    },
    error: ""
  };

  var executablePayload = typeof body.executablePayload === "string" ? body.executablePayload : "";
  if (!executablePayload.trim()) {
    result.error = "missing_executable_payload";
    result.summary.message = "executablePayload is required.";
    return result;
  }

  result.diagnostics.hasExecutablePayload = true;
  var markers = countTaskCardMarkers(executablePayload);
  result.diagnostics.startCount = markers.startCount;
  result.diagnostics.endCount = markers.endCount;
  result.diagnostics.exactlyOneTaskCard = markers.startCount === 1 && markers.endCount === 1;

  var attrs = parseTaskCardAttrs(executablePayload);
  result.extracted.attrs = attrs;
  result.diagnostics.startDetected = attrs.startDetected;
  result.diagnostics.endDetected = attrs.endDetected;

  var fields = parseTaskCardFields(attrs.body || "");
  result.extracted.fields = fields;
  result.summary.taskCardId = fields.taskCardId || attrs.startId || "";
  result.summary.target = fields.target || attrs.startTarget || "";

  result.diagnostics.idMatched = Boolean(
    attrs.startDetected && attrs.endDetected && attrs.startId && attrs.endId && attrs.startId === attrs.endId
  );
  result.diagnostics.taskCardIdPresent = Boolean(fields.taskCardId && String(fields.taskCardId).trim());
  result.diagnostics.taskCardIdMatched = result.diagnostics.taskCardIdPresent && attrs.startId
    ? String(fields.taskCardId).trim() === String(attrs.startId).trim()
    : false;

  result.diagnostics.targetPresent = Boolean(fields.target && String(fields.target).trim() && attrs.startTarget);
  result.diagnostics.targetMatched = result.diagnostics.targetPresent
    ? String(fields.target).trim().toLowerCase() === String(attrs.startTarget).trim().toLowerCase()
    : false;

  result.diagnostics.requiredFieldsMissing = getMissingRequiredFields(fields);

  if (!result.diagnostics.startDetected) {
    result.error = "missing_task_card_start_marker";
    result.summary.message = "ACB_TASK_CARD start marker not found.";
    return result;
  }
  if (!result.diagnostics.endDetected) {
    result.error = "missing_task_card_end_marker";
    result.summary.message = "ACB_TASK_CARD_END marker not found.";
    return result;
  }
  if (!result.diagnostics.exactlyOneTaskCard) {
    result.error = "invalid_task_card_count";
    result.summary.message = "executablePayload must contain exactly one ACB_TASK_CARD block.";
    return result;
  }
  if (!result.diagnostics.idMatched) {
    result.error = "task_card_id_mismatch";
    result.summary.message = "Task card start/end id mismatch.";
    return result;
  }
  if (!result.diagnostics.taskCardIdPresent) {
    result.error = "missing_taskCardId_field";
    result.summary.message = "taskCardId field is required.";
    return result;
  }
  if (!result.diagnostics.taskCardIdMatched) {
    result.error = "taskCardId_field_mismatch";
    result.summary.message = "taskCardId field does not match marker id.";
    return result;
  }
  if (!result.diagnostics.targetPresent) {
    result.error = "missing_target_field";
    result.summary.message = "target field is required and must match start marker target.";
    return result;
  }
  if (!result.diagnostics.targetMatched) {
    result.error = "target_mismatch";
    result.summary.message = "target field does not match marker target.";
    return result;
  }
  if (result.diagnostics.requiredFieldsMissing.length > 0) {
    result.error = "missing_required_fields";
    result.summary.message = "Required fields missing: " + result.diagnostics.requiredFieldsMissing.join(", ");
    return result;
  }

  result.ok = true;
  result.summary.status = "valid";
  result.summary.message = "Task card review payload accepted.";
  return result;
}

// ─── Project Comparison Helpers ──────────────────────────────────────

function getSafeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function makeExecutionInboxSafety() {
  return {
    noAutoDispatch: true,
    noCommandExecution: true,
    canTriggerExecution: false,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false
  };
}

function makeExecutionInboxId(now) {
  var compactTime = String(now || new Date().toISOString()).replace(/[^0-9]/g, "").slice(0, 14);
  var suffix = Math.random().toString(36).slice(2, 8);
  return "exec-inbox-" + compactTime + "-" + suffix;
}

function validateExecutionInboxEnvelope(body) {
  var rejectReasons = [];
  var warnings = [];
  var diagnostics = {
    taskCardStartDetected: false,
    taskCardEndDetected: false,
    exactlyOneTaskCard: false,
    markerIdMatched: false,
    taskCardIdMatched: false,
    targetMatched: false
  };
  var extracted = {
    attrs: null,
    fields: null
  };

  var taskCardText = typeof body.taskCardText === "string" ? body.taskCardText : "";
  if (!taskCardText.trim()) {
    rejectReasons.push("missing_taskCardText");
  }

  var markers = countTaskCardMarkers(taskCardText);
  diagnostics.exactlyOneTaskCard = markers.startCount === 1 && markers.endCount === 1;
  if (taskCardText.trim()) {
    var attrs = parseTaskCardAttrs(taskCardText);
    var fields = parseTaskCardFields(attrs.body || "");
    extracted.attrs = attrs;
    extracted.fields = fields;
    diagnostics.taskCardStartDetected = attrs.startDetected;
    diagnostics.taskCardEndDetected = attrs.endDetected;
    diagnostics.markerIdMatched = Boolean(
      attrs.startDetected && attrs.endDetected && attrs.startId && attrs.endId && attrs.startId === attrs.endId
    );

    var requestTaskCardId = body.taskCardId ? String(body.taskCardId).trim() : "";
    var fieldTaskCardId = fields.taskCardId ? String(fields.taskCardId).trim() : "";
    var markerTaskCardId = attrs.startId ? String(attrs.startId).trim() : "";
    diagnostics.taskCardIdMatched = Boolean(requestTaskCardId && fieldTaskCardId && markerTaskCardId
      && requestTaskCardId === fieldTaskCardId
      && fieldTaskCardId === markerTaskCardId);

    var requestTarget = body.target ? String(body.target).trim().toLowerCase() : "";
    var fieldTarget = fields.target ? String(fields.target).trim().toLowerCase() : "";
    var markerTarget = attrs.startTarget ? String(attrs.startTarget).trim().toLowerCase() : "";
    diagnostics.targetMatched = Boolean(requestTarget && fieldTarget && markerTarget
      && requestTarget === fieldTarget
      && fieldTarget === markerTarget);

    if (!attrs.startDetected) {
      rejectReasons.push("missing_task_card_start_marker");
    }
    if (!attrs.endDetected) {
      rejectReasons.push("missing_task_card_end_marker");
    }
    if (!diagnostics.exactlyOneTaskCard) {
      rejectReasons.push("invalid_task_card_count");
    }
    if (!diagnostics.markerIdMatched) {
      rejectReasons.push("task_card_marker_id_mismatch");
    }
    if (!requestTaskCardId) {
      rejectReasons.push("missing_taskCardId");
    }
    if (!diagnostics.taskCardIdMatched) {
      rejectReasons.push("taskCardId_mismatch");
    }
    if (!requestTarget) {
      rejectReasons.push("missing_target");
    }
    if (!diagnostics.targetMatched) {
      rejectReasons.push("target_mismatch");
    }
  }

  if (!body.projectDir || !String(body.projectDir).trim()) {
    warnings.push("missing_projectDir");
  }
  if (!body.currentBranch || !String(body.currentBranch).trim()) {
    rejectReasons.push("missing_currentBranch");
  }
  if (!body.currentCommit || !String(body.currentCommit).trim()) {
    rejectReasons.push("missing_currentCommit");
  }

  var routeResult = getSafeObject(body.routeResult);
  if (Object.keys(routeResult).length === 0) {
    rejectReasons.push("missing_routeResult");
  }
  if (routeResult.protocolType !== "acb_task_card") {
    rejectReasons.push("routeResult.protocolType_not_acb_task_card");
  }
  if (routeResult.payloadStatus !== "complete") {
    rejectReasons.push("routeResult.payloadStatus_not_complete");
  }
  if (routeResult.targetRole !== "agent") {
    rejectReasons.push("routeResult.targetRole_not_agent");
  }
  if (routeResult.terminalState !== "ROUTE-TASK-CARD-READY") {
    rejectReasons.push("routeResult.terminalState_not_ready");
  }
  if (routeResult.canSendToAgent !== true) {
    rejectReasons.push("routeResult.canSendToAgent_not_true");
  }
  if (routeResult.canTriggerExecution !== false) {
    rejectReasons.push("routeResult.canTriggerExecution_not_false");
  }
  if (routeResult.sampleOnly !== false) {
    rejectReasons.push("routeResult.sampleOnly_not_false");
  }
  if (routeResult.cannotDispatch !== false) {
    rejectReasons.push("routeResult.cannotDispatch_not_false");
  }

  var payloadValidation = getSafeObject(body.payloadValidation);
  if (payloadValidation.payloadStatus && payloadValidation.payloadStatus !== "complete") {
    rejectReasons.push("payloadValidation.payloadStatus_not_complete");
  }
  if (payloadValidation.canSendToAgent === false) {
    rejectReasons.push("payloadValidation.canSendToAgent_false");
  }

  var safetyMetadata = getSafeObject(body.safetyMetadata);
  if (safetyMetadata.executionAllowed !== false) {
    rejectReasons.push("safetyMetadata.executionAllowed_not_false");
  }
  if (safetyMetadata.agentDispatchAllowed !== false) {
    rejectReasons.push("safetyMetadata.agentDispatchAllowed_not_false");
  }
  if (safetyMetadata.gitWriteAllowed !== false) {
    rejectReasons.push("safetyMetadata.gitWriteAllowed_not_false");
  }
  if (safetyMetadata.noAutoDispatch !== true) {
    rejectReasons.push("safetyMetadata.noAutoDispatch_not_true");
  }
  if (safetyMetadata.noCommandExecution !== true) {
    rejectReasons.push("safetyMetadata.noCommandExecution_not_true");
  }

  return {
    ok: rejectReasons.length === 0,
    status: rejectReasons.length === 0 ? "accepted_to_inbox" : "rejected_by_gate",
    rejectReasons: rejectReasons,
    warnings: warnings,
    diagnostics: diagnostics,
    extracted: extracted
  };
}

function buildExecutionInboxItem(body, validation, now) {
  var fields = validation.extracted && validation.extracted.fields ? validation.extracted.fields : {};
  return {
    inboxItemId: makeExecutionInboxId(now),
    createdAt: now,
    status: validation.status,
    accepted: validation.ok === true,
    taskCardId: body.taskCardId || fields.taskCardId || "",
    target: body.target || fields.target || "",
    projectDir: body.projectDir || fields.projectDir || "",
    currentBranch: body.currentBranch || fields.currentBranch || "",
    currentCommit: body.currentCommit || fields.currentCommit || "",
    taskCardText: typeof body.taskCardText === "string" ? body.taskCardText : "",
    sourceMetadata: getSafeObject(body.sourceMetadata),
    routeResult: getSafeObject(body.routeResult),
    payloadValidation: getSafeObject(body.payloadValidation),
    preflightSnapshot: getSafeObject(body.preflightSnapshot),
    readinessSnapshot: getSafeObject(body.readinessSnapshot),
    safetyMetadata: makeExecutionInboxSafety(),
    rejectReasons: validation.rejectReasons || [],
    warnings: validation.warnings || []
  };
}

function normalizePathForCompare(p) {
  if (!p) { return ""; }
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function comparePaths(path1, path2) {
  return normalizePathForCompare(path1) === normalizePathForCompare(path2);
}

function compareCommits(tcCommit, localCommit) {
  if (!tcCommit || !localCommit) { return "unknown"; }
  var tc = tcCommit.toLowerCase().trim();
  var lc = localCommit.toLowerCase().trim();
  if (tc === lc) { return true; }
  if (tc.length >= 7 && lc.length >= 7 && (lc.indexOf(tc) === 0 || tc.indexOf(lc) === 0)) { return true; }
  return false;
}

// ─── Preflight Handler ───────────────────────────────────────────────

function handlePreflight(req, res) {
  var chunks = [];
  req.on("data", function (chunk) { chunks.push(chunk); });
  req.on("end", function () {
    var raw = Buffer.concat(chunks).toString("utf8");
    var body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_json", detail: "Request body is not valid JSON." }));
      return;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_body", detail: "Request body must be a JSON object." }));
      return;
    }

    var generatedAt = new Date().toISOString();
    var bridgeInfo = {
      name: "acb-local-bridge",
      version: "0.1.0",
      protocol: "acb/v1",
      host: BRIDGE_HOST,
      port: BRIDGE_PORT
    };

    var safetyResponse = {
      noAutoDispatch: true,
      noCommandExecution: true,
      executionAllowed: false,
      agentDispatchAllowed: false,
      gitWriteAllowed: false
    };

    // Safety gate: noAutoDispatch must be true
    if (!Object.prototype.hasOwnProperty.call(body, "safety") || !body.safety || body.safety.noAutoDispatch !== true) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: false,
        bridge: bridgeInfo,
        safety: safetyResponse,
        preflight: {
          status: "fail",
          payloadKind: body.payloadKind || "unknown",
          taskCardStartDetected: false,
          taskCardEndDetected: false,
          taskCardIdMatched: false,
          targetMatched: false,
          target: "",
          taskCardId: "",
          requiredFieldsPresent: false,
          requiredFieldsMissing: [],
          multipleTaskCardsDetected: false,
          truncatedSuspected: false,
          canSendToAgentByStructure: false,
          canExecuteLocally: false,
          checks: [{ name: "safety_noAutoDispatch", status: "fail", message: "safety.noAutoDispatch must be true." }]
        },
        projectComparison: null,
        projectStatus: null,
        generatedAt: generatedAt
      }));
      return;
    }

    // Safety gate: noCommandExecution must be true
    if (body.safety.noCommandExecution !== true) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: false,
        bridge: bridgeInfo,
        safety: safetyResponse,
        preflight: {
          status: "fail",
          payloadKind: body.payloadKind || "unknown",
          taskCardStartDetected: false,
          taskCardEndDetected: false,
          taskCardIdMatched: false,
          targetMatched: false,
          target: "",
          taskCardId: "",
          requiredFieldsPresent: false,
          requiredFieldsMissing: [],
          multipleTaskCardsDetected: false,
          truncatedSuspected: false,
          canSendToAgentByStructure: false,
          canExecuteLocally: false,
          checks: [{ name: "safety_noCommandExecution", status: "fail", message: "safety.noCommandExecution must be true." }]
        },
        projectComparison: null,
        projectStatus: null,
        generatedAt: generatedAt
      }));
      return;
    }

    // Gate: fullTaskCard required
    var fullTaskCard = body.fullTaskCard || "";
    if (!fullTaskCard) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: false,
        bridge: bridgeInfo,
        safety: safetyResponse,
        preflight: {
          status: "fail",
          payloadKind: body.payloadKind || "unknown",
          taskCardStartDetected: false,
          taskCardEndDetected: false,
          taskCardIdMatched: false,
          targetMatched: false,
          target: "",
          taskCardId: "",
          requiredFieldsPresent: false,
          requiredFieldsMissing: [],
          multipleTaskCardsDetected: false,
          truncatedSuspected: false,
          canSendToAgentByStructure: false,
          canExecuteLocally: false,
          checks: [{ name: "full_task_card_missing", status: "fail", message: "fullTaskCard is required." }]
        },
        projectComparison: null,
        projectStatus: null,
        generatedAt: generatedAt
      }));
      return;
    }

    // Parse task card
    var attrs = parseTaskCardAttrs(fullTaskCard);
    var checks = [];
    var issues = 0;

    // Check start tag
    if (attrs.startDetected) {
      checks.push({ name: "start_tag", status: "pass", message: "ACB_TASK_CARD start tag detected. id=" + attrs.startId });
    } else {
      checks.push({ name: "start_tag", status: "fail", message: "ACB_TASK_CARD start tag not found." });
      issues += 1;
    }

    // Check end tag
    if (attrs.endDetected) {
      checks.push({ name: "end_tag", status: "pass", message: "ACB_TASK_CARD_END end tag detected. id=" + attrs.endId });
    } else {
      checks.push({ name: "end_tag", status: "fail", message: "ACB_TASK_CARD_END end tag not found." });
      issues += 1;
    }

    // Check ID match
    var idMatched = attrs.startDetected && attrs.endDetected && attrs.startId && attrs.endId && attrs.startId === attrs.endId;
    if (idMatched) {
      checks.push({ name: "id_match", status: "pass", message: "Start and end IDs match: " + attrs.startId });
    } else {
      checks.push({ name: "id_match", status: "fail", message: "IDs do not match. start=" + attrs.startId + " end=" + attrs.endId });
      issues += 1;
    }

    // Parse body fields
    var fields = attrs.body ? parseTaskCardFields(attrs.body) : {};
    var missingFields = [];
    for (var k = 0; k < REQUIRED_PREFLIGHT_FIELDS.length; k += 1) {
      if (!Object.prototype.hasOwnProperty.call(fields, REQUIRED_PREFLIGHT_FIELDS[k]) || !fields[REQUIRED_PREFLIGHT_FIELDS[k]]) {
        missingFields.push(REQUIRED_PREFLIGHT_FIELDS[k]);
      }
    }

    var requiredFieldsPresent = missingFields.length === 0;
    if (requiredFieldsPresent) {
      checks.push({ name: "required_fields", status: "pass", message: "All " + REQUIRED_PREFLIGHT_FIELDS.length + " required fields present." });
    } else {
      checks.push({ name: "required_fields", status: "fail", message: "Missing required fields: " + missingFields.join(", ") });
      issues += 1;
    }

    // Check target match between tag attribute and body field
    var bodyTarget = fields.target || "";
    var targetMatched = attrs.startTarget && bodyTarget && attrs.startTarget.toLowerCase() === bodyTarget.toLowerCase();
    if (attrs.startTarget && bodyTarget) {
      if (targetMatched) {
        checks.push({ name: "target_match", status: "pass", message: "Target matches: " + attrs.startTarget });
      } else {
        checks.push({ name: "target_match", status: "fail", message: "Target mismatch: tag=" + attrs.startTarget + " body=" + bodyTarget });
        issues += 1;
      }
    } else if (!attrs.startTarget) {
      checks.push({ name: "target_match", status: "warn", message: "No target in start tag attributes." });
    }

    // Multiple task cards detection
    var startTagCount = (fullTaskCard.match(/<ACB_TASK_CARD\s+/gi) || []).length;
    var endTagCount = (fullTaskCard.match(/<ACB_TASK_CARD_END\s+/gi) || []).length;
    var multipleDetected = startTagCount > 1 || endTagCount > 1;
    if (multipleDetected) {
      checks.push({ name: "multiple_cards", status: "warn", message: "Multiple task card tags detected: " + startTagCount + " start, " + endTagCount + " end." });
    }

    // Truncation detection: end tag missing but body ends abruptly
    var truncatedSuspected = attrs.startDetected && !attrs.endDetected;
    if (truncatedSuspected) {
      checks.push({ name: "truncation", status: "warn", message: "Task card may be truncated: start found but no end tag." });
    }

    // Overall structural status
    var structuralOk = issues === 0;
    var structuralStatus = structuralOk ? "pass" : "fail";

    // ─── Project comparison ───
    var comparison = null;
    var projectStatusData = null;

    if (structuralOk && fields.projectDir) {
      var psModule;
      try { psModule = require("./projectStatus.js"); } catch (_e) { psModule = null; }

      if (psModule) {
        try {
          var ps = psModule.getProjectStatusSync ? psModule.getProjectStatusSync() : null;
          // getProjectStatus is async; for preflight we run a synchronous snapshot via existing data
        } catch (_e) { /* ignore */ }

        // Use async getProjectStatus
        psModule.getProjectStatus().then(function (status) {
          sendPreflightResponse(res, attrs, fields, checks, structuralStatus, issues, multipleDetected, truncatedSuspected, idMatched, targetMatched, requiredFieldsPresent, missingFields, bodyTarget, bridgeInfo, safetyResponse, generatedAt, status, body.payloadKind || "unknown", body);
        }).catch(function (_err) {
          sendPreflightResponse(res, attrs, fields, checks, structuralStatus, issues, multipleDetected, truncatedSuspected, idMatched, targetMatched, requiredFieldsPresent, missingFields, bodyTarget, bridgeInfo, safetyResponse, generatedAt, null, body.payloadKind || "unknown", body);
        });
        return;
      }
    }

    sendPreflightResponse(res, attrs, fields, checks, structuralStatus, issues, multipleDetected, truncatedSuspected, idMatched, targetMatched, requiredFieldsPresent, missingFields, bodyTarget, bridgeInfo, safetyResponse, generatedAt, null, body.payloadKind || "unknown", body);
  });
}

function sendPreflightResponse(res, attrs, fields, checks, structuralStatus, issues, multipleDetected, truncatedSuspected, idMatched, targetMatched, requiredFieldsPresent, missingFields, bodyTarget, bridgeInfo, safetyResponse, generatedAt, status, payloadKind, body) {
  var taskCardId = fields.taskCardId || attrs.startId || "";
  var target = bodyTarget || attrs.startTarget || "";

  // Build preflight result
  var preflightResult = {
    status: structuralStatus,
    payloadKind: payloadKind,
    taskCardStartDetected: attrs.startDetected,
    taskCardEndDetected: attrs.endDetected,
    taskCardIdMatched: idMatched,
    targetMatched: targetMatched,
    target: target,
    taskCardId: taskCardId,
    requiredFieldsPresent: requiredFieldsPresent,
    requiredFieldsMissing: missingFields,
    multipleTaskCardsDetected: multipleDetected,
    truncatedSuspected: truncatedSuspected,
    canSendToAgentByStructure: structuralStatus === "pass",
    canExecuteLocally: false,
    checks: checks
  };

  // Build project comparison
  var comparison = null;
  var projectStatusOut = null;

  if (status) {
    var git = status.git || {};
    var wt = "unknown";
    if (git.available) { wt = git.clean ? "clean" : "dirty"; }

    var taskProjectDir = fields.projectDir || "";
    var taskBranch = fields.currentBranch || "";
    var taskCommit = fields.currentCommit || "";

    var localPath = status.workspacePath || "";
    var localBranch = git.branch || "";
    var localCommit = git.commitHash || "";
    var localLatestCommit = git.commitSummary || "";

    var dirMatched = comparePaths(taskProjectDir, localPath);
    var branchMatched = taskBranch && localBranch ? taskBranch === localBranch : "unknown";
    var commitMatched = compareCommits(taskCommit, localCommit) || compareCommits(taskCommit, localLatestCommit);

    var warnings = [];
    if (dirMatched === false) { warnings.push("Project directory mismatch: task=" + taskProjectDir + " local=" + localPath); }
    if (branchMatched === false) { warnings.push("Branch mismatch: task=" + taskBranch + " local=" + localBranch); }
    if (commitMatched === false) { warnings.push("Commit mismatch: task=" + taskCommit + " local=" + localCommit); }
    if (wt === "dirty") { warnings.push("Working tree is dirty (" + (git.changes || 0) + " changes)."); }

    // Only warn on project mismatches, don't fail
    if (structuralStatus === "pass" && warnings.length > 0) {
      preflightResult.status = "warn";
    }

    comparison = {
      projectStatusAvailable: true,
      taskProjectDir: taskProjectDir,
      localProjectPath: localPath,
      projectDirMatched: dirMatched,
      taskBranch: taskBranch,
      localBranch: localBranch,
      branchMatched: branchMatched,
      taskCurrentCommit: taskCommit,
      localCurrentCommit: localCommit,
      currentCommitMatched: commitMatched,
      workingTree: wt,
      workingTreeClean: wt === "clean",
      changedFiles: git.changes || 0,
      warnings: warnings
    };

    projectStatusOut = {
      projectPath: localPath,
      workspaceName: status.workspaceName || null,
      gitRoot: git.repoRoot || null,
      gitAvailable: git.available,
      branch: localBranch,
      currentCommit: localCommit,
      latestCommit: localLatestCommit,
      workingTree: wt,
      changedFiles: git.changes || 0,
      stagedFiles: git.indexChanges || 0,
      untrackedFiles: git.untracked || 0,
      generatedAt: status.generatedAt || null
    };
  }

  var ok = preflightResult.status !== "fail";

  // Cache preflight summary (no fullTaskCard)
  latestPreflightCache = {
    ok: ok,
    preflight: preflightResult,
    projectComparison: comparison,
    safety: safetyResponse,
    generatedAt: generatedAt,
    contextId: body.contextId || "",
    taskCardId: taskCardId
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: ok,
    bridge: bridgeInfo,
    safety: safetyResponse,
    preflight: preflightResult,
    projectComparison: comparison,
    projectStatus: projectStatusOut,
    generatedAt: generatedAt
  }));
}

// ─── Readiness Handler ─────────────────────────────────────────────────

function handleReadiness(req, res) {
  var generatedAt = new Date().toISOString();

  // Parse optional contextId from query string
  var requestContextId = "";
  try {
    var qsIndex = req.url.indexOf("?");
    if (qsIndex !== -1) {
      var qs = req.url.substring(qsIndex + 1);
      var params = qs.split("&");
      for (var pi = 0; pi < params.length; pi += 1) {
        var pair = params[pi].split("=");
        if (pair.length === 2 && pair[0] === "contextId") {
          requestContextId = decodeURIComponent(pair[1].replace(/\+/g, " "));
          break;
        }
      }
    }
  } catch (_e) {
    requestContextId = "";
  }

  var bridgeInfo = {
    name: "acb-local-bridge",
    version: "0.1.0",
    protocol: "acb/v1",
    host: BRIDGE_HOST,
    port: BRIDGE_PORT
  };

  var safetyResponse = {
    noAutoDispatch: true,
    noCommandExecution: true,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false
  };

  // Always: bridge is connected (endpoint is reachable)
  var bridgeConnected = true;

  // Collect checks
  var checks = [];

  // Check 1: Bridge health
  checks.push({
    name: "bridge_connected",
    status: bridgeConnected ? "pass" : "fail",
    message: bridgeConnected ? "Bridge is reachable at " + BRIDGE_HOST + ":" + BRIDGE_PORT : "Bridge is not reachable."
  });

  // Safety flags always locked
  checks.push({
    name: "safety_flags_locked",
    status: "pass",
    message: "executionAllowed=false, agentDispatchAllowed=false, gitWriteAllowed=false."
  });

  // Check 2: Project status availability
  var psModule;
  try { psModule = require("./projectStatus.js"); } catch (_e) { psModule = null; }

  if (!psModule) {
    // Can't check project status synchronously; evaluate readiness without it
    evaluateAndSendReadiness(req, res, null, bridgeInfo, safetyResponse, checks, generatedAt, bridgeConnected, requestContextId);
    return;
  }

  psModule.getProjectStatus().then(function (status) {
    evaluateAndSendReadiness(req, res, status, bridgeInfo, safetyResponse, checks, generatedAt, bridgeConnected, requestContextId);
  }).catch(function (_err) {
    evaluateAndSendReadiness(req, res, null, bridgeInfo, safetyResponse, checks, generatedAt, bridgeConnected, requestContextId);
  });
}

function evaluateAndSendReadiness(req, res, status, bridgeInfo, safetyResponse, checks, generatedAt, bridgeConnected, requestContextId) {
  requestContextId = requestContextId || "";
  var projectStatusAvailable = status !== null;
  var git = status ? (status.git || {}) : {};

  // Check: project status
  if (projectStatusAvailable && git.available) {
    checks.push({
      name: "project_status",
      status: "pass",
      message: "Project status available. branch=" + git.branch + " commit=" + git.commitHash
    });
  } else if (projectStatusAvailable) {
    checks.push({
      name: "project_status",
      status: "warn",
      message: "Project status available but Git not detected."
    });
  } else {
    checks.push({
      name: "project_status",
      status: "warn",
      message: "Project status unavailable. VS Code Extension Host may not be running."
    });
  }

  // Check: preflight — context-bound
  var preflightAvailable = latestPreflightCache !== null;
  var preflightContextMismatch = false;
  if (preflightAvailable && requestContextId) {
    var cachedContextId = latestPreflightCache.contextId || "";
    if (cachedContextId && cachedContextId !== requestContextId) {
      preflightContextMismatch = true;
    }
  }
  // If context doesn't match current request, treat preflight as unavailable
  var effectivePreflightAvailable = preflightAvailable && !preflightContextMismatch;
  var preflightPassed = effectivePreflightAvailable && latestPreflightCache.ok;
  var preflightStatus = effectivePreflightAvailable ? latestPreflightCache.preflight.status : "not_run";

  if (!preflightAvailable) {
    checks.push({
      name: "preflight",
      status: "fail",
      message: "Preflight has not been run. No task card has been validated."
    });
  } else if (preflightContextMismatch) {
    checks.push({
      name: "preflight",
      status: "fail",
      message: "Preflight is stale — cached context does not match current request context."
    });
  } else if (preflightPassed) {
    checks.push({
      name: "preflight",
      status: "pass",
      message: "Preflight passed. taskCardId=" + latestPreflightCache.preflight.taskCardId + " status=" + preflightStatus
    });
  } else {
    checks.push({
      name: "preflight",
      status: "fail",
      message: "Preflight failed. taskCardId=" + latestPreflightCache.preflight.taskCardId + " status=" + preflightStatus
    });
  }

  // Check: task card metadata
  if (effectivePreflightAvailable && preflightPassed) {
    var pf = latestPreflightCache.preflight;
    if (pf.taskCardId && pf.target) {
      checks.push({
        name: "task_card_metadata",
        status: "pass",
        message: "Task card metadata present. taskCardId=" + pf.taskCardId + " target=" + pf.target
      });
    }

    if (pf.requiredFieldsPresent) {
      checks.push({
        name: "required_fields",
        status: "pass",
        message: "All required fields present."
      });
    } else {
      checks.push({
        name: "required_fields",
        status: "fail",
        message: "Missing required fields: " + (pf.requiredFieldsMissing || []).join(", ")
      });
    }
  }

  // Check: project comparison (only if effective preflight + project status both available)
  var comparison = null;
  if (effectivePreflightAvailable && preflightPassed && projectStatusAvailable && latestPreflightCache.projectComparison) {
    comparison = latestPreflightCache.projectComparison;
    var pc = comparison;

    if (pc.projectDirMatched === true) {
      checks.push({ name: "project_dir_match", status: "pass", message: "Project directory matches." });
    } else if (pc.projectDirMatched === false) {
      checks.push({ name: "project_dir_match", status: "warn", message: "Project directory mismatch." });
    } else {
      checks.push({ name: "project_dir_match", status: "warn", message: "Project directory comparison unknown." });
    }

    if (pc.branchMatched === true) {
      checks.push({ name: "branch_match", status: "pass", message: "Branch matches." });
    } else if (pc.branchMatched === false) {
      checks.push({ name: "branch_match", status: "warn", message: "Branch mismatch." });
    } else {
      checks.push({ name: "branch_match", status: "warn", message: "Branch comparison unknown." });
    }

    if (pc.currentCommitMatched === true) {
      checks.push({ name: "commit_match", status: "pass", message: "Commit matches." });
    } else if (pc.currentCommitMatched === false) {
      checks.push({ name: "commit_match", status: "warn", message: "Commit mismatch." });
    } else {
      checks.push({ name: "commit_match", status: "warn", message: "Commit comparison unknown." });
    }

    if (pc.workingTreeClean === true) {
      checks.push({ name: "working_tree", status: "pass", message: "Working tree is clean." });
    } else if (pc.workingTreeClean === false) {
      checks.push({ name: "working_tree", status: "warn", message: "Working tree is dirty (" + (pc.changedFiles || 0) + " changes)." });
    } else {
      checks.push({ name: "working_tree", status: "warn", message: "Working tree status unknown." });
    }
  }

  // ─── Determine readiness status ───
  var blockingReasons = [];
  var warningReasons = [];
  var blocked = false;
  var warning = false;

  // Blocked conditions
  if (!effectivePreflightAvailable) {
    blocked = true;
    if (preflightContextMismatch) {
      blockingReasons.push("Preflight context mismatch: cached preflight is for a different task card / context.");
    } else {
      blockingReasons.push("Preflight has not been run.");
    }
  } else if (!preflightPassed) {
    blocked = true;
    blockingReasons.push("Preflight failed: task card is structurally invalid.");
  }

  // Check safety flags (always locked, but verify)
  if (safetyResponse.executionAllowed !== false || safetyResponse.agentDispatchAllowed !== false || safetyResponse.gitWriteAllowed !== false) {
    blocked = true;
    blockingReasons.push("Safety flags are not fully locked.");
  }

  // Warning conditions
  if (!blocked) {
    if (!projectStatusAvailable) {
      warning = true;
      warningReasons.push("Project status unavailable.");
    }

    if (comparison) {
      if (comparison.projectDirMatched === false) {
        warning = true;
        warningReasons.push("Project directory mismatch: task=" + comparison.taskProjectDir + " local=" + comparison.localProjectPath);
      }
      if (comparison.branchMatched === false) {
        warning = true;
        warningReasons.push("Branch mismatch: task=" + comparison.taskBranch + " local=" + comparison.localBranch);
      }
      if (comparison.currentCommitMatched === false) {
        warning = true;
        warningReasons.push("Commit mismatch: task=" + comparison.taskCurrentCommit + " local=" + comparison.localCurrentCommit);
      }
      if (comparison.workingTreeClean === false) {
        warning = true;
        warningReasons.push("Working tree is dirty (" + (comparison.changedFiles || 0) + " changes).");
      }
    }
  }

  var readinessStatus;
  if (blocked) {
    readinessStatus = "blocked";
  } else if (warning) {
    readinessStatus = "warning";
  } else {
    readinessStatus = "ready";
  }

  // Build project status summary
  var projectStatusOut = null;
  if (projectStatusAvailable) {
    projectStatusOut = {
      projectPath: status.workspacePath || null,
      workspaceName: status.workspaceName || null,
      gitRoot: git.repoRoot || null,
      gitAvailable: git.available,
      branch: git.branch || null,
      currentCommit: git.commitHash || null,
      latestCommit: git.commitSummary || null,
      workingTree: git.available ? (git.clean ? "clean" : "dirty") : "unknown",
      changedFiles: git.changes || 0,
      stagedFiles: git.indexChanges || 0,
      untrackedFiles: git.untracked || 0,
      generatedAt: status.generatedAt || null
    };
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: true,
    bridge: bridgeInfo,
    safety: safetyResponse,
    readiness: {
      status: readinessStatus,
      summary: readinessStatus === "ready"
        ? "All checks passed. Task card is structurally valid and project state matches. Ready to proceed."
        : readinessStatus === "warning"
          ? "Task card is structurally valid but some project state checks have warnings."
          : "Execution blocked. " + blockingReasons.join(" "),
      blockingReasons: blockingReasons,
      warningReasons: warningReasons,
      checks: checks,
      bridgeConnected: bridgeConnected,
      projectStatusAvailable: projectStatusAvailable,
      preflightAvailable: preflightAvailable,
      preflightStatus: preflightStatus,
      preflightPassed: preflightPassed,
      taskCardId: effectivePreflightAvailable ? latestPreflightCache.preflight.taskCardId : "",
      target: effectivePreflightAvailable ? latestPreflightCache.preflight.target : "",
      requiredFieldsPresent: effectivePreflightAvailable ? latestPreflightCache.preflight.requiredFieldsPresent : false,
      preflightContextMismatch: preflightContextMismatch,
      requestContextId: requestContextId || "",
      cachedContextId: preflightAvailable ? (latestPreflightCache.contextId || "") : "",
      projectComparison: comparison,
      workingTreeClean: comparison ? comparison.workingTreeClean : null,
      changedFiles: comparison ? comparison.changedFiles : null
    },
    projectStatus: projectStatusOut,
    generatedAt: generatedAt
  }));
}

function handleTaskCardReview(req, res) {
  var chunks = [];
  req.on("data", function (chunk) { chunks.push(chunk); });
  req.on("end", function () {
    var raw = Buffer.concat(chunks).toString("utf8");
    var body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        accepted: false,
        error: "invalid_json",
        detail: "Request body is not valid JSON.",
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }));
      return;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        accepted: false,
        error: "invalid_body",
        detail: "Request body must be a JSON object.",
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }));
      return;
    }

    var validation = validateTaskCardReviewPayload(body);
    if (!validation.ok) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        accepted: false,
        error: validation.error || "invalid_task_card_payload",
        detail: validation.summary.message || "Task card review payload validation failed.",
        diagnostics: validation.diagnostics,
        taskCardId: validation.summary.taskCardId || "",
        target: validation.summary.target || "",
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }));
      return;
    }

    var now = new Date().toISOString();
    var reviewMetadata = body.reviewMetadata && typeof body.reviewMetadata === "object" ? body.reviewMetadata : {};
    latestTaskCardReviewCache = {
      accepted: true,
      receivedAt: now,
      taskCardId: validation.summary.taskCardId,
      target: validation.summary.target,
      validationSummary: {
        status: validation.summary.status,
        message: validation.summary.message,
        diagnostics: validation.diagnostics
      },
      reviewMetadata: reviewMetadata,
      safety: {
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      },
      executablePayload: body.executablePayload
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      accepted: true,
      taskCardId: validation.summary.taskCardId,
      target: validation.summary.target,
      receivedAt: now,
      review: latestTaskCardReviewCache,
      noAutoDispatch: true,
      noCommandExecution: true,
      executionAllowed: false,
      agentDispatchAllowed: false,
      gitWriteAllowed: false
    }));
  });
}

function handleTaskCardReviewLatest(req, res) {
  if (!latestTaskCardReviewCache) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      hasReview: false,
      message: "No task card review received yet.",
      noAutoDispatch: true,
      noCommandExecution: true,
      executionAllowed: false,
      agentDispatchAllowed: false,
      gitWriteAllowed: false
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: true,
    hasReview: true,
    review: latestTaskCardReviewCache,
    noAutoDispatch: true,
    noCommandExecution: true,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false
  }));
}

function handleExecutionInbox(req, res) {
  var chunks = [];
  req.on("data", function (chunk) { chunks.push(chunk); });
  req.on("end", function () {
    var raw = Buffer.concat(chunks).toString("utf8");
    var body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(Object.assign({
        ok: false,
        accepted: false,
        status: "rejected_by_gate",
        error: "invalid_json",
        detail: "Request body is not valid JSON.",
        rejectReasons: ["invalid_json"]
      }, makeExecutionInboxSafety())));
      return;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(Object.assign({
        ok: false,
        accepted: false,
        status: "rejected_by_gate",
        error: "invalid_body",
        detail: "Request body must be a JSON object.",
        rejectReasons: ["invalid_body"]
      }, makeExecutionInboxSafety())));
      return;
    }

    var now = new Date().toISOString();
    var validation = validateExecutionInboxEnvelope(body);
    var item = buildExecutionInboxItem(body, validation, now);

    if (validation.ok) {
      latestExecutionInboxCache = item;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Object.assign({
      ok: validation.ok,
      accepted: validation.ok,
      status: validation.status,
      inboxItemId: validation.ok ? item.inboxItemId : "",
      taskCardId: item.taskCardId,
      target: item.target,
      item: item,
      rejectReasons: validation.rejectReasons,
      warnings: validation.warnings
    }, makeExecutionInboxSafety())));
  });
}

function handleExecutionInboxLatest(req, res) {
  if (!latestExecutionInboxCache) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Object.assign({
      ok: true,
      hasInboxItem: false,
      message: "No execution inbox item accepted yet."
    }, makeExecutionInboxSafety())));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(Object.assign({
    ok: true,
    hasInboxItem: true,
    item: latestExecutionInboxCache
  }, makeExecutionInboxSafety())));
}

// ─── Execution Report by Task Handler ───────────────────────────────

var TASK_CARD_ID_ALLOWED_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;

function sanitizeTaskCardId(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  var trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Reject path traversal patterns
  if (trimmed.indexOf("..") !== -1) {
    return null;
  }
  // Reject path separators (both POSIX and Windows)
  if (trimmed.indexOf("/") !== -1 || trimmed.indexOf("\\") !== -1) {
    return null;
  }
  // Reject URL patterns
  if (trimmed.indexOf("://") !== -1 || trimmed.indexOf(":") !== -1) {
    return null;
  }
  // Reject absolute path indicators
  if (trimmed[0] === "/" || trimmed[0] === "\\") {
    return null;
  }
  // Reject if it looks like a Windows absolute path (e.g., C:)
  if (trimmed.length >= 2 && trimmed[1] === ":" && /^[A-Za-z]/.test(trimmed[0])) {
    return null;
  }
  // Only allow safe characters
  if (!TASK_CARD_ID_ALLOWED_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function getWorkspaceRootSync() {
  try {
    var psModule = require("./projectStatus.js");
    if (psModule && psModule.getProjectStatusSync) {
      var status = psModule.getProjectStatusSync();
      if (status && status.workspacePath) {
        return path.normalize(status.workspacePath);
      }
    }
    // Try async cached result — but for sync we fall through
  } catch (_e) {
    // ignore
  }

  // Fallback: try VS Code workspace directly
  try {
    var vscode = require("vscode");
    if (vscode && vscode.workspace && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      var folder = vscode.workspace.workspaceFolders[0];
      var fsPath = folder.uri.fsPath;
      return path.normalize(fsPath);
    }
  } catch (_e) {
    // ignore
  }

  return null;
}

var workspaceRootCache = null;
var workspaceRootCacheTime = 0;
var WORKSPACE_ROOT_CACHE_MS = 30000;

function getWorkspaceRoot() {
  var now = Date.now();
  if (workspaceRootCache && (now - workspaceRootCacheTime) < WORKSPACE_ROOT_CACHE_MS) {
    return workspaceRootCache;
  }

  try {
    var psModule = require("./projectStatus.js");
    if (psModule && psModule.getProjectStatus) {
      psModule.getProjectStatus().then(function (status) {
        if (status && status.workspacePath) {
          workspaceRootCache = path.normalize(status.workspacePath);
          workspaceRootCacheTime = Date.now();
        }
      }).catch(function () {
        // ignore
      });
    }
  } catch (_e) {
    // ignore
  }

  // Synchronous fallback for immediate use
  var root = getWorkspaceRootSync();
  if (root) {
    workspaceRootCache = root;
    workspaceRootCacheTime = Date.now();
  }
  return workspaceRootCache;
}

function buildExecutionReportReadPath(workspaceRoot, sanitizedTaskCardId) {
  if (!workspaceRoot || !sanitizedTaskCardId) {
    return { ok: false, error: "invalid_parameters" };
  }

  var reportsDir = path.join(workspaceRoot, ".ai-control", "reports", "inbox");
  var filePath = path.join(reportsDir, sanitizedTaskCardId + ".md");
  var normalized = path.normalize(filePath);
  var normalizedReportsDir = path.normalize(reportsDir);

  // Verify the resolved path stays within the reports directory
  if (normalized.indexOf(normalizedReportsDir) !== 0) {
    return { ok: false, error: "path_validation_failed", detail: "Resolved path is outside the allowed reports directory." };
  }

  return { ok: true, path: normalized, reportsDir: normalizedReportsDir };
}

function parseReportMarkdown(content) {
  var result = {
    metadata: {},
    reportText: ""
  };

  if (!content || typeof content !== "string") {
    return result;
  }

  // Normalize line endings
  var normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var separatorIndex = normalized.indexOf("\n---\n");

  if (separatorIndex === -1) {
    // No separator found — entire content is reportText
    result.reportText = normalized.trim();
    return result;
  }

  var headerSection = normalized.substring(0, separatorIndex);
  result.reportText = normalized.substring(separatorIndex + 5).trim();

  // Parse key: value lines from header
  var lines = headerSection.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }
    var key = line.substring(0, colonIdx).trim();
    var value = line.substring(colonIdx + 1).trim();
    if (key && value) {
      result.metadata[key] = value;
    }
  }

  return result;
}

function handleExecutionReportByTask(req, res, rawTaskCardId) {
  var generatedAt = new Date().toISOString();
  var safetyResponse = {
    noAutoDispatch: true,
    noCommandExecution: true,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false
  };
  var bridgeInfo = {
    name: "acb-local-bridge",
    version: "0.1.0",
    protocol: "acb/v1",
    host: BRIDGE_HOST,
    port: BRIDGE_PORT
  };

  // 1. Sanitize taskCardId
  var taskCardId = sanitizeTaskCardId(rawTaskCardId);
  if (!taskCardId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      status: "rejected",
      error: "invalid_taskCardId",
      detail: "taskCardId contains disallowed characters or path patterns.",
      bridge: bridgeInfo,
      safety: safetyResponse,
      canAutoReview: false,
      canAutoExecute: false,
      generatedAt: generatedAt
    }));
    return;
  }

  // 2. Get workspace root
  var workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      status: "workspace_unavailable",
      error: "workspace_not_found",
      detail: "Cannot determine workspace root. Open a folder in VS Code.",
      bridge: bridgeInfo,
      safety: safetyResponse,
      canAutoReview: false,
      canAutoExecute: false,
      generatedAt: generatedAt
    }));
    return;
  }

  // 3. Build and validate report path
  var pathResult = buildExecutionReportReadPath(workspaceRoot, taskCardId);
  if (!pathResult.ok) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      status: "path_validation_failed",
      error: pathResult.error,
      detail: pathResult.detail || "",
      bridge: bridgeInfo,
      safety: safetyResponse,
      canAutoReview: false,
      canAutoExecute: false,
      generatedAt: generatedAt
    }));
    return;
  }

  // 4. Check file exists
  var reportPath = pathResult.path;
  var exists = false;
  try {
    exists = fs.existsSync(reportPath);
  } catch (_e) {
    exists = false;
  }

  if (!exists) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      status: "not_found",
      taskCardId: taskCardId,
      sourcePath: path.relative(workspaceRoot, reportPath).replace(/\\/g, "/"),
      detail: "No report file found for taskCardId: " + taskCardId,
      bridge: bridgeInfo,
      safety: safetyResponse,
      canAutoReview: false,
      canAutoExecute: false,
      generatedAt: generatedAt
    }));
    return;
  }

  // 5. Read file
  var fileContent = "";
  try {
    fileContent = fs.readFileSync(reportPath, "utf8");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      status: "read_error",
      error: "file_read_failed",
      detail: err.message || String(err),
      bridge: bridgeInfo,
      safety: safetyResponse,
      canAutoReview: false,
      canAutoExecute: false,
      generatedAt: generatedAt
    }));
    return;
  }

  // 6. Parse markdown content
  var parsed = parseReportMarkdown(fileContent);
  var meta = parsed.metadata || {};
  var fileTaskCardId = meta.taskCardId || "";
  var reportText = parsed.reportText || "";

  // 7. taskCardId conflict check
  var taskCardIdConflict = false;
  var taskCardIdWarning = "";
  if (fileTaskCardId && fileTaskCardId !== taskCardId) {
    taskCardIdConflict = true;
    taskCardIdWarning = "taskCardId mismatch: URL=" + taskCardId + " file=" + fileTaskCardId;
  }

  // 8. Build response
  var relativeSourcePath = "";
  try {
    relativeSourcePath = path.relative(workspaceRoot, reportPath).replace(/\\/g, "/");
  } catch (_e) {
    relativeSourcePath = reportPath;
  }

  var fileStats = null;
  try {
    fileStats = fs.statSync(reportPath);
  } catch (_e) {
    // ignore
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: !taskCardIdConflict,
    status: taskCardIdConflict ? "warning" : "ok",
    taskCardId: taskCardId,
    fileTaskCardId: fileTaskCardId || taskCardId,
    taskCardIdConflict: taskCardIdConflict,
    taskCardIdWarning: taskCardIdWarning || "",
    sourcePath: relativeSourcePath,
    reportText: reportText,
    metadata: {
      target: meta.target || "",
      executor: meta.executor || "",
      status: meta.status || "",
      commitHash: meta.commitHash || "",
      changedFiles: meta.changedFiles || "",
      generatedAt: meta.generatedAt || "",
      sourceContextId: meta.sourceContextId || "",
      sourceActionStepIndex: meta.sourceActionStepIndex || ""
    },
    fileInfo: fileStats ? {
      size: fileStats.size,
      mtime: fileStats.mtime ? fileStats.mtime.toISOString() : ""
    } : null,
    bridge: bridgeInfo,
    safety: safetyResponse,
    canAutoReview: false,
    canAutoExecute: false,
    generatedAt: generatedAt
  }));
}

/**
 * Register a terminal action handler from extension.js.
 * The handler receives (action, params) and must return { ok, status, data }.
 * @param {Function} handler
 */
function registerTerminalHandler(handler) {
  _terminalHandler = handler;
}

function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    req.on("data", function (chunk) { chunks.push(chunk); });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", function () { resolve(""); });
  });
}

function handleTerminalStatus(req, res) {
  var rawUrl = req.url || "";
  var qsIdx = rawUrl.indexOf("?");
  var qs = qsIdx !== -1 ? rawUrl.substring(qsIdx + 1) : "";
  var params = {};
  qs.split("&").forEach(function (pair) {
    var eq = pair.indexOf("=");
    if (eq !== -1) {
      params[decodeURIComponent(pair.substring(0, eq))] = decodeURIComponent(pair.substring(eq + 1));
    } else if (pair) {
      params[pair] = "true";
    }
  });

  if (!_terminalHandler) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "terminal_handler_not_registered" }));
    return;
  }

  try {
    var result = _terminalHandler("status", params);
    res.writeHead(result.ok ? 200 : 422, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "terminal_status_error", detail: err.message || String(err) }));
  }
}

function handleTerminalLaunch(req, res) {
  if (!_terminalHandler) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "terminal_handler_not_registered" }));
    return;
  }

  readBody(req).then(function (body) {
    var params = {};
    try { params = JSON.parse(body || "{}"); } catch (_e) { params = {}; }
    try {
      var result = _terminalHandler("launch", params);
      res.writeHead(result.ok ? 200 : 422, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "terminal_launch_error", detail: err.message || String(err) }));
    }
  });
}

function handleTerminalFill(req, res) {
  if (!_terminalHandler) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "terminal_handler_not_registered" }));
    return;
  }

  readBody(req).then(function (body) {
    var params = {};
    try { params = JSON.parse(body || "{}"); } catch (_e) { params = {}; }
    try {
      var result = _terminalHandler("fill", params);
      res.writeHead(result.ok ? 200 : 422, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "terminal_fill_error", detail: err.message || String(err) }));
    }
  });
}

module.exports = {
  start: start,
  stop: stop,
  isRunning: isRunning,
  registerTerminalHandler: registerTerminalHandler,
  BRIDGE_PORT: BRIDGE_PORT,
  BRIDGE_HOST: BRIDGE_HOST
};
