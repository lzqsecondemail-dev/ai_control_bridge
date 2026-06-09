"use strict";

var BRIDGE_URL = "http://127.0.0.1:17373";
var BRIDGE_LATEST_KEY = "acb.localBridge.latest";
var PROJECT_STATUS_KEY = "acb.localBridge.projectStatusLatest";
var PREFLIGHT_KEY = "acb.localBridge.preflightLatest";
var READINESS_KEY = "acb.localBridge.readinessLatest";
var TASK_CARD_REVIEW_KEY = "acb.localBridge.taskCardReviewLatest";
var EXECUTION_INBOX_KEY = "acb.localBridge.executionInboxLatest";

chrome.runtime.onInstalled.addListener(function () {
  console.log("[ACB] service worker installed");
});

/**
 * Handle messages from content scripts / popup.
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("[ACB Bridge] onMessage received", message && message.type);

  if (!message || !message.type) {
    console.log("[ACB Bridge] onMessage ignored — no type");
    return false;
  }

  if (message.type === "ACB_BRIDGE_PING" || message.type === "ACB_BRIDGE_HEALTH") {
    console.log("[ACB Bridge] handling health check, type=" + message.type);
    handleBridgeHealth(message).then(function (result) {
      console.log("[ACB Bridge] health check done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] health check error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_PROJECT_STATUS") {
    console.log("[ACB Bridge] handling project status request");
    handleBridgeProjectStatus(message).then(function (result) {
      console.log("[ACB Bridge] project status done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] project status error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_PREFLIGHT_PAYLOAD") {
    console.log("[ACB Bridge] handling preflight payload");
    handleBridgePreflightPayload(message).then(function (result) {
      console.log("[ACB Bridge] preflight done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] preflight error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_READINESS_GATE") {
    console.log("[ACB Bridge] handling readiness gate");
    handleBridgeReadinessGate(message).then(function (result) {
      console.log("[ACB Bridge] readiness gate done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] readiness gate error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_SEND_TASK_CARD_REVIEW") {
    console.log("[ACB Bridge] handling task card review send");
    handleBridgeTaskCardReviewSend(message).then(function (result) {
      console.log("[ACB Bridge] task card review send done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] task card review send error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_SEND_EXECUTION_INBOX") {
    console.log("[ACB Bridge] handling execution inbox send");
    handleBridgeExecutionInboxSend(message).then(function (result) {
      console.log("[ACB Bridge] execution inbox send done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] execution inbox send error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_READ_LOCAL_EXECUTION_REPORT") {
    console.log("[ACB Bridge] handling local execution report read");
    handleBridgeReadLocalExecutionReport(message).then(function (result) {
      console.log("[ACB Bridge] local execution report read done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] local execution report read error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_TERMINAL_STATUS") {
    console.log("[ACB Bridge] handling terminal status");
    handleBridgeTerminalStatus(message).then(function (result) {
      console.log("[ACB Bridge] terminal status done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] terminal status error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_TERMINAL_LAUNCH") {
    console.log("[ACB Bridge] handling terminal launch");
    handleBridgeTerminalLaunch(message).then(function (result) {
      console.log("[ACB Bridge] terminal launch done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] terminal launch error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_TERMINAL_FILL") {
    console.log("[ACB Bridge] handling terminal fill");
    handleBridgeTerminalFill(message).then(function (result) {
      console.log("[ACB Bridge] terminal fill done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] terminal fill error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === "ACB_BRIDGE_MESSAGE") {
    console.log("[ACB Bridge] handling bridge message");
    handleBridgeMessage(message).then(function (result) {
      console.log("[ACB Bridge] message done, ok=" + result.ok);
      sendResponse(result);
    }).catch(function (err) {
      console.error("[ACB Bridge] message error", err.message || String(err));
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }

  console.log("[ACB Bridge] onMessage ignored — unknown type");
  return false;
});

async function handleBridgeHealth(message) {
  var timeout = message.timeout || 5000;
  console.log("[ACB Bridge] handleBridgeHealth — timeout=" + timeout);

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    console.log("[ACB Bridge] fetching " + BRIDGE_URL + "/acb/v1/health");
    var response = await fetch(BRIDGE_URL + "/acb/v1/health", {
      method: "GET",
      signal: controller.signal
    });

    console.log("[ACB Bridge] fetch response status=" + response.status + " ok=" + response.ok);

    if (!response.ok) {
      var errorBody = "";
      try { errorBody = await response.text(); } catch (_e) {}
      var result = {
        ok: false,
        status: response.status,
        error: "Bridge health check returned HTTP " + response.status,
        detail: errorBody.substring(0, 500)
      };
      await storeBridgeLatest(result);
      return result;
    }

    var data = await response.json();
    console.log("[ACB Bridge] health data: bridge=" + data.bridge + " version=" + data.version);
    var result = {
      ok: true,
      status: response.status,
      data: data
    };
    await storeBridgeLatest(result);
    return result;
  } catch (err) {
    console.error("[ACB Bridge] fetch failed: " + (err.message || String(err)));
    var result = {
      ok: false,
      error: err.name === "AbortError" ? "Bridge health check timed out after " + timeout + "ms" : (err.message || String(err))
    };
    await storeBridgeLatest(result);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleBridgeMessage(message) {
  var payload = message.payload || {};
  var timeout = message.timeout || 5000;
  console.log("[ACB Bridge] handleBridgeMessage — timeout=" + timeout);

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    console.log("[ACB Bridge] posting to " + BRIDGE_URL + "/acb/v1/message");
    var response = await fetch(BRIDGE_URL + "/acb/v1/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    var data;
    try { data = await response.json(); } catch (_e) { data = null; }

    console.log("[ACB Bridge] message response status=" + response.status + " ok=" + response.ok);

    if (!response.ok) {
      var result = {
        ok: false,
        status: response.status,
        data: data
      };
      await storeBridgeLatest(result);
      return result;
    }

    var result = {
      ok: true,
      status: response.status,
      data: data
    };
    await storeBridgeLatest(result);
    return result;
  } catch (err) {
    console.error("[ACB Bridge] message fetch failed: " + (err.message || String(err)));
    var result = {
      ok: false,
      error: err.name === "AbortError" ? "Bridge message timed out after " + timeout + "ms" : (err.message || String(err))
    };
    await storeBridgeLatest(result);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeBridgeLatest(result) {
  try {
    var entry = {
      timestamp: new Date().toISOString(),
      ok: result.ok,
      status: result.status,
      error: result.error || null,
      data: result.data || null
    };
    console.log("[ACB Bridge] storing latest to " + BRIDGE_LATEST_KEY);
    await chrome.storage.local.set({ [BRIDGE_LATEST_KEY]: entry });
    console.log("[ACB Bridge] storage write done");
  } catch (_e) {
    console.error("[ACB Bridge] storage write failed", _e.message || String(_e));
  }
}

async function handleBridgeProjectStatus(message) {
  var timeout = message.timeout || 5000;
  console.log("[ACB Bridge] handleBridgeProjectStatus — timeout=" + timeout);

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    console.log("[ACB Bridge] fetching " + BRIDGE_URL + "/acb/v1/project-status");
    var response = await fetch(BRIDGE_URL + "/acb/v1/project-status", {
      method: "GET",
      signal: controller.signal
    });

    console.log("[ACB Bridge] project status response status=" + response.status + " ok=" + response.ok);

    if (!response.ok) {
      var errorBody = "";
      try { errorBody = await response.text(); } catch (_e) {}
      var result = {
        ok: false,
        status: response.status,
        error: "Bridge project status returned HTTP " + response.status,
        detail: errorBody.substring(0, 500)
      };
      await storeProjectStatusLatest(result);
      return result;
    }

    var data = await response.json();
    console.log("[ACB Bridge] project status data: ok=" + data.ok);
    var result = {
      ok: true,
      status: response.status,
      data: data
    };
    await storeProjectStatusLatest(result);
    return result;
  } catch (err) {
    console.error("[ACB Bridge] project status fetch failed: " + (err.message || String(err)));
    var result = {
      ok: false,
      error: err.name === "AbortError" ? "Bridge project status timed out after " + timeout + "ms" : (err.message || String(err))
    };
    await storeProjectStatusLatest(result);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeProjectStatusLatest(result) {
  try {
    var entry = {
      timestamp: new Date().toISOString(),
      ok: result.ok,
      status: result.status,
      error: result.error || null,
      data: result.data || null
    };
    console.log("[ACB Bridge] storing project status to " + PROJECT_STATUS_KEY);
    await chrome.storage.local.set({ [PROJECT_STATUS_KEY]: entry });
    console.log("[ACB Bridge] project status storage write done");
  } catch (_e) {
    console.error("[ACB Bridge] project status storage write failed", _e.message || String(_e));
  }
}

async function handleBridgePreflightPayload(message) {
  var timeout = message.timeout || 10000;
  console.log("[ACB Bridge] handleBridgePreflightPayload — timeout=" + timeout);

  var payload = {
    messageType: "execution",
    payloadKind: "ACB_TASK_CARD",
    source: "browser-floating-console",
    targetAgent: message.targetAgent || "unknown",
    fullTaskCard: message.fullTaskCard || "",
    selectedStep: message.selectedStep || {},
    safety: {
      noAutoDispatch: true,
      noCommandExecution: true
    },
    requestedAt: new Date().toISOString()
  };

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    console.log("[ACB Bridge] posting preflight to " + BRIDGE_URL + "/acb/v1/preflight");
    var response = await fetch(BRIDGE_URL + "/acb/v1/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    var data;
    try { data = await response.json(); } catch (_e) { data = null; }

    console.log("[ACB Bridge] preflight response status=" + response.status + " ok=" + (data ? data.ok : "null"));

    if (!response.ok) {
      var result = {
        ok: false,
        status: response.status,
        data: data
      };
      await storePreflightLatest(result);
      return result;
    }

    var result = {
      ok: true,
      status: response.status,
      data: data
    };
    await storePreflightLatest(result, message);
    return result;
  } catch (err) {
    console.error("[ACB Bridge] preflight fetch failed: " + (err.message || String(err)));
    var result = {
      ok: false,
      error: err.name === "AbortError" ? "Bridge preflight timed out after " + timeout + "ms" : (err.message || String(err))
    };
    await storePreflightLatest(result, message);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storePreflightLatest(result, message) {
  try {
    var entry = {
      timestamp: new Date().toISOString(),
      ok: result.ok,
      status: result.status,
      error: result.error || null,
      data: result.data || null
    };
    // Store only summary metadata, not full task card
    if (entry.data && entry.data.preflight) {
      entry.summary = {
        status: entry.data.preflight.status,
        taskCardId: entry.data.preflight.taskCardId,
        target: entry.data.preflight.target
      };
    }
    // Store context metadata for context binding
    if (message) {
      entry.contextId = message.contextId || "";
      entry.feedbackHash = message.feedbackHash || "";
      entry.channelId = message.channelId || "";
      entry.actionStepIndex = typeof message.actionStepIndex === "number" ? message.actionStepIndex : -1;
      entry.taskCardId = message.taskCardId || "";
      entry.target = message.target || "";
    }
    console.log("[ACB Bridge] storing preflight to " + PREFLIGHT_KEY + " contextId=" + (entry.contextId || "none"));
    await chrome.storage.local.set({ [PREFLIGHT_KEY]: entry });
    console.log("[ACB Bridge] preflight storage write done");
  } catch (_e) {
    console.error("[ACB Bridge] preflight storage write failed", _e.message || String(_e));
  }
}

async function handleBridgeReadinessGate(message) {
  var timeout = message.timeout || 5000;
  var contextId = message.contextId || "";
  console.log("[ACB Bridge] handleBridgeReadinessGate — timeout=" + timeout + " contextId=" + contextId);

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var url = BRIDGE_URL + "/acb/v1/readiness";
    if (contextId) {
      url += "?contextId=" + encodeURIComponent(contextId);
    }
    console.log("[ACB Bridge] fetching " + url);
    var response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    console.log("[ACB Bridge] readiness response status=" + response.status + " ok=" + response.ok);

    if (!response.ok) {
      var errorBody = "";
      try { errorBody = await response.text(); } catch (_e) {}
      var result = {
        ok: false,
        status: response.status,
        error: "Bridge readiness returned HTTP " + response.status,
        detail: errorBody.substring(0, 500)
      };
      await storeReadinessLatest(result);
      return result;
    }

    var data = await response.json();
    console.log("[ACB Bridge] readiness data: status=" + (data.readiness ? data.readiness.status : "null"));
    var result = {
      ok: true,
      status: response.status,
      data: data
    };
    await storeReadinessLatest(result);
    return result;
  } catch (err) {
    console.error("[ACB Bridge] readiness fetch failed: " + (err.message || String(err)));
    var result = {
      ok: false,
      error: err.name === "AbortError" ? "Bridge readiness timed out after " + timeout + "ms" : (err.message || String(err))
    };
    await storeReadinessLatest(result);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeReadinessLatest(result) {
  try {
    var entry = {
      timestamp: new Date().toISOString(),
      ok: result.ok,
      status: result.status,
      error: result.error || null,
      data: result.data || null
    };
    // Store only readiness status data, not full task card
    if (entry.data && entry.data.readiness) {
      entry.summary = {
        status: entry.data.readiness.status,
        blockingReasons: entry.data.readiness.blockingReasons || [],
        warningReasons: entry.data.readiness.warningReasons || [],
        taskCardId: entry.data.readiness.taskCardId || "",
        target: entry.data.readiness.target || ""
      };
    }
    console.log("[ACB Bridge] storing readiness to " + READINESS_KEY);
    await chrome.storage.local.set({ [READINESS_KEY]: entry });
    console.log("[ACB Bridge] readiness storage write done");
  } catch (_e) {
    console.error("[ACB Bridge] readiness storage write failed", _e.message || String(_e));
  }
}

async function handleBridgeTaskCardReviewSend(message) {
  var timeout = message.timeout || 10000;
  var executablePayload = typeof message.executablePayload === "string" ? message.executablePayload : "";
  if (!executablePayload.trim()) {
    var missingResult = {
      ok: false,
      status: 400,
      error: "missing_executable_payload"
    };
    await storeTaskCardReviewLatest(missingResult, message);
    return missingResult;
  }

  var payload = {
    executablePayload: executablePayload,
    reviewMetadata: message.reviewMetadata && typeof message.reviewMetadata === "object" ? message.reviewMetadata : {},
    safety: normalizeTaskCardReviewSafety(message.safety),
    sentAt: new Date().toISOString()
  };

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var response = await fetch(BRIDGE_URL + "/acb/v1/task-card-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    var data;
    try { data = await response.json(); } catch (_e) { data = null; }
    var result = {
      ok: response.ok,
      status: response.status,
      data: data || null
    };
    if (!response.ok) {
      result.error = (data && (data.error || data.detail)) || ("HTTP " + response.status);
    }
    await storeTaskCardReviewLatest(result, message);
    return result;
  } catch (err) {
    var failed = {
      ok: false,
      error: err.name === "AbortError"
        ? "Bridge task-card-review timed out after " + timeout + "ms"
        : (err.message || String(err))
    };
    await storeTaskCardReviewLatest(failed, message);
    return failed;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeTaskCardReviewSafety(safety) {
  return {
    noAutoDispatch: true,
    noCommandExecution: true,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false,
    requestedExecutionAllowed: Boolean(safety && safety.executionAllowed),
    requestedAgentDispatchAllowed: Boolean(safety && safety.agentDispatchAllowed),
    requestedGitWriteAllowed: Boolean(safety && safety.gitWriteAllowed)
  };
}

async function storeTaskCardReviewLatest(result, message) {
  try {
    var data = result && result.data ? result.data : {};
    var review = data && data.review ? data.review : null;
    var entry = {
      timestamp: new Date().toISOString(),
      attempted: true,
      ok: Boolean(result && result.ok),
      status: result ? result.status : undefined,
      error: result ? (result.error || null) : null,
      accepted: Boolean(data && data.accepted),
      taskCardId: (data && data.taskCardId) || "",
      target: (data && data.target) || "",
      validationStatus: (review && review.validationSummary && review.validationSummary.status) || "",
      diagnostics: (data && data.diagnostics) || null
    };
    if (message) {
      entry.contextId = message.contextId || "";
      entry.feedbackHash = message.feedbackHash || "";
      entry.channelId = message.channelId || "";
      entry.channelName = message.channelName || "";
      entry.actionStepIndex = typeof message.actionStepIndex === "number" ? message.actionStepIndex : -1;
      entry.payloadStatus = message.payloadStatus || "";
    }
    await chrome.storage.local.set({ [TASK_CARD_REVIEW_KEY]: entry });
  } catch (_e) {
    console.error("[ACB Bridge] task card review storage write failed", _e.message || String(_e));
  }
}

async function handleBridgeExecutionInboxSend(message) {
  var timeout = message.timeout || 10000;
  var envelope = message.envelope && typeof message.envelope === "object" ? message.envelope : null;
  if (!envelope || typeof envelope.taskCardText !== "string" || !envelope.taskCardText.trim()) {
    var missingResult = {
      ok: false,
      status: 400,
      error: "missing_task_card_text",
      data: {
        accepted: false,
        status: "rejected_by_gate",
        rejectReasons: ["missing_task_card_text"],
        canTriggerExecution: false,
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }
    };
    await storeExecutionInboxLatest(missingResult, message);
    return missingResult;
  }

  var payload = Object.assign({}, envelope, {
    safetyMetadata: normalizeExecutionInboxSafety(envelope.safetyMetadata),
    sentAt: new Date().toISOString()
  });

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var response = await fetch(BRIDGE_URL + "/acb/v1/execution-inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    var data;
    try { data = await response.json(); } catch (_e) { data = null; }
    var result = {
      ok: response.ok,
      status: response.status,
      data: data || null
    };
    if (!response.ok) {
      result.error = (data && (data.error || data.detail)) || ("HTTP " + response.status);
    }
    await storeExecutionInboxLatest(result, message);
    return result;
  } catch (err) {
    var failed = {
      ok: false,
      error: err.name === "AbortError"
        ? "Bridge execution-inbox timed out after " + timeout + "ms"
        : (err.message || String(err)),
      data: {
        accepted: false,
        status: "rejected_by_gate",
        rejectReasons: [err.name === "AbortError" ? "bridge_timeout" : "bridge_send_error"],
        canTriggerExecution: false,
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }
    };
    await storeExecutionInboxLatest(failed, message);
    return failed;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeExecutionInboxSafety(safety) {
  return {
    noAutoDispatch: true,
    noCommandExecution: true,
    canTriggerExecution: false,
    executionAllowed: false,
    agentDispatchAllowed: false,
    gitWriteAllowed: false,
    requestedCanTriggerExecution: Boolean(safety && safety.canTriggerExecution),
    requestedExecutionAllowed: Boolean(safety && safety.executionAllowed),
    requestedAgentDispatchAllowed: Boolean(safety && safety.agentDispatchAllowed),
    requestedGitWriteAllowed: Boolean(safety && safety.gitWriteAllowed)
  };
}

async function storeExecutionInboxLatest(result, message) {
  try {
    var data = result && result.data ? result.data : {};
    var item = data && data.item ? data.item : null;
    var envelope = message && message.envelope && typeof message.envelope === "object" ? message.envelope : {};
    var entry = {
      timestamp: new Date().toISOString(),
      attempted: true,
      ok: Boolean(result && result.ok),
      status: data && data.status ? data.status : (result ? result.status : undefined),
      error: result ? (result.error || null) : null,
      accepted: Boolean(data && data.accepted),
      inboxItemId: (data && data.inboxItemId) || (item && item.inboxItemId) || "",
      taskCardId: (data && data.taskCardId) || envelope.taskCardId || "",
      target: (data && data.target) || envelope.target || "",
      rejectReasons: (data && data.rejectReasons) || [],
      warnings: (data && data.warnings) || [],
      canTriggerExecution: false,
      noAutoDispatch: true,
      noCommandExecution: true,
      executionAllowed: false,
      agentDispatchAllowed: false,
      gitWriteAllowed: false
    };
    if (message) {
      entry.contextId = message.contextId || "";
      entry.feedbackHash = message.feedbackHash || "";
      entry.channelId = message.channelId || "";
      entry.channelName = message.channelName || "";
      entry.actionStepIndex = typeof message.actionStepIndex === "number" ? message.actionStepIndex : -1;
      entry.payloadStatus = message.payloadStatus || "";
      entry.staleContextIgnored = Boolean(message.staleContextIgnored);
      entry.taskCardPayloadPresent = Boolean(envelope.taskCardText);
    }
    await chrome.storage.local.set({ [EXECUTION_INBOX_KEY]: entry });
  } catch (_e) {
    console.error("[ACB Bridge] execution inbox storage write failed", _e.message || String(_e));
  }
}

async function handleBridgeReadLocalExecutionReport(message) {
  var timeout = message.timeout || 10000;
  var taskCardId = message.taskCardId || "";
  console.log("[ACB Bridge] handleBridgeReadLocalExecutionReport — taskCardId=" + taskCardId + " timeout=" + timeout);

  if (!taskCardId) {
    return {
      ok: false,
      error: "missing_taskCardId",
      detail: "taskCardId is required to read a local execution report."
    };
  }

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var url = BRIDGE_URL + "/acb/v1/execution-reports/by-task/" + encodeURIComponent(taskCardId);
    console.log("[ACB Bridge] fetching " + url);
    var response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    console.log("[ACB Bridge] local execution report response status=" + response.status + " ok=" + response.ok);

    var data;
    try { data = await response.json(); } catch (_e) { data = null; }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: "bridge_error",
        detail: "Bridge returned HTTP " + response.status,
        data: data
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data
    };
  } catch (err) {
    console.error("[ACB Bridge] local execution report fetch failed: " + (err.message || String(err)));
    return {
      ok: false,
      error: err.name === "AbortError"
        ? "Bridge local execution report read timed out after " + timeout + "ms"
        : (err.message || String(err))
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Unwrap bridge terminal action response data.
 * The bridge returns { ok, status, data: { actualPayload } }.
 * The service worker's job is to return the actual payload at .data level,
 * not the full bridge envelope.
 */
function unwrapBridgeTerminalData(bridgeData) {
  if (bridgeData && typeof bridgeData === "object" && !Array.isArray(bridgeData) && bridgeData.data && typeof bridgeData.data === "object") {
    return bridgeData.data;
  }
  return bridgeData;
}

async function handleBridgeTerminalStatus(message) {
  var timeout = message.timeout || 10000;
  var executorId = message.executorId || "";

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var url = BRIDGE_URL + "/acb/v1/terminal/status?executorId=" + encodeURIComponent(executorId);
    var response = await fetch(url, { method: "GET", signal: controller.signal });
    var rawData;
    try { rawData = await response.json(); } catch (_e) { rawData = null; }
    var data = unwrapBridgeTerminalData(rawData);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: data || { error: "HTTP " + response.status, bridge_status: "error" }
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === "AbortError"
        ? "Bridge terminal status timed out after " + timeout + "ms"
        : (err.message || String(err)),
      data: { bridge_status: "unavailable" }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleBridgeTerminalLaunch(message) {
  var timeout = message.timeout || 10000;
  var executorId = message.executorId || "";

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var response = await fetch(BRIDGE_URL + "/acb/v1/terminal/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executorId: executorId }),
      signal: controller.signal
    });
    var rawData;
    try { rawData = await response.json(); } catch (_e) { rawData = null; }
    var data = unwrapBridgeTerminalData(rawData);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: data || { error: "HTTP " + response.status }
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === "AbortError"
        ? "Bridge terminal launch timed out after " + timeout + "ms"
        : (err.message || String(err)),
      data: { bridge_status: "unavailable" }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleBridgeTerminalFill(message) {
  var timeout = message.timeout || 10000;
  var executorId = message.executorId || "";
  var payload = message.payload || "";
  var taskCardId = message.taskCardId || "";
  var expectedTarget = message.expectedTarget || "";

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

  try {
    var response = await fetch(BRIDGE_URL + "/acb/v1/terminal/fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        executorId: executorId,
        payload: payload,
        taskCardId: taskCardId,
        expectedTarget: expectedTarget
      }),
      signal: controller.signal
    });
    var rawData;
    try { rawData = await response.json(); } catch (_e) { rawData = null; }
    var data = unwrapBridgeTerminalData(rawData);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: data || { error: "HTTP " + response.status }
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === "AbortError"
        ? "Bridge terminal fill timed out after " + timeout + "ms"
        : (err.message || String(err)),
      data: { bridge_status: "unavailable" }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
