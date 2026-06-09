"use strict";

/**
 * M3-Bridge.0 Bridge Server Automated Smoke Tests
 *
 * Covers:
 * - Server lifecycle (start/stop/isRunning)
 * - GET /acb/v1/health
 * - POST /acb/v1/message (valid + edge cases)
 * - G1: noAutoDispatch=false → 400
 * - G2: noCommandExecution=false → 400
 * - G3: missing/invalid messageType → 400
 * - Forbidden field rejection
 * - Invalid JSON rejection
 * - 404 handling
 * - OPTIONS CORS preflight
 */

var bridge = require("../src/localBridgeServer.js");

var TEST_PORT = process.env.ACB_BRIDGE_TEST_PORT ? Number(process.env.ACB_BRIDGE_TEST_PORT) : 17383;
if (!TEST_PORT || Number.isNaN(TEST_PORT)) {
  TEST_PORT = 17383;
}
var BASE = "http://127.0.0.1:" + String(TEST_PORT);
var passed = 0;
var failed = 0;

function assert(cond, name) {
  if (cond) { passed += 1; console.log("PASS: " + name); }
  else { failed += 1; console.log("FAIL: " + name); }
}

async function post(body) {
  var resp = await fetch(BASE + "/acb/v1/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  var json = await resp.json();
  return { status: resp.status, body: json };
}

async function postPreflight(body) {
  var resp = await fetch(BASE + "/acb/v1/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  var json = await resp.json();
  return { status: resp.status, body: json };
}

async function postTaskCardReview(body) {
  var resp = await fetch(BASE + "/acb/v1/task-card-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  var json = await resp.json();
  return { status: resp.status, body: json };
}

var MINIMAL_TASK_CARD = [
  '<ACB_TASK_CARD id="test-preflight-001" target="deepseek" version="1">',
  '',
  'taskCardId:',
  'test-preflight-001',
  '',
  'target:',
  'deepseek',
  '',
  'taskTitle:',
  'Test Preflight Task Card',
  '',
  'projectDir:',
  '/test/project',
  '',
  'currentBranch:',
  'master',
  '',
  'currentCommit:',
  'abc1234',
  '',
  'objective:',
  'Test objective.',
  '',
  'allowedFiles:',
  '- test/file.js',
  '',
  'forbiddenActions:',
  '- Do not execute.',
  '',
  'implementationRequirements:',
  'Test requirements.',
  '',
  'checks:',
  '- node --check test/file.js',
  '',
  'gitBoundary:',
  '- Create exactly one commit.',
  '',
  'reportFormat:',
  'Return a completion report.',
  '',
  'acceptanceCriteria:',
  '- Test passes.',
  '',
  '<ACB_TASK_CARD_END id="test-preflight-001">'
].join("\n");

var safePayload = {
  messageType: "execution",
  kind: "bridge_ping",
  source: "browser-extension",
  messageId: "test-001",
  createdAt: new Date().toISOString(),
  noAutoDispatch: true,
  noCommandExecution: true
};

async function run() {
  console.log("ACB M3-Bridge.0 Bridge Server Smoke Test");
  console.log("Platform: " + process.platform);
  console.log("Node: " + process.version);
  console.log("");

  // --- Lifecycle ---
  var info = await bridge.start({ port: TEST_PORT });
  assert(info.port === TEST_PORT, "start: port=" + String(TEST_PORT));
  assert(info.host === "127.0.0.1", "start: host=127.0.0.1");

  // --- Health endpoint ---
  var healthResp = await fetch(BASE + "/acb/v1/health");
  var health = await healthResp.json();
  assert(healthResp.status === 200, "health: status 200");
  assert(health.status === "ok", "health: status=ok");
  assert(health.bridge === "acb-local-bridge", "health: bridge identifier");
  assert(health.version === "0.1.0", "health: version");
  assert(health.noAutoDispatch === true, "health: noAutoDispatch=true");
  assert(health.noCommandExecution === true, "health: noCommandExecution=true");

  // --- Project Status endpoint ---
  var psResp = await fetch(BASE + "/acb/v1/project-status");
  var ps = await psResp.json();
  assert(psResp.status === 200, "project-status: status 200");
  assert(typeof ps.ok === "boolean", "project-status: ok is boolean");
  assert(ps.bridge && typeof ps.bridge === "object", "project-status: bridge present");
  assert(ps.bridge.name === "acb-local-bridge", "project-status: bridge name");
  assert(ps.bridge.version === "0.1.0", "project-status: bridge version");
  assert(ps.bridge.host === "127.0.0.1", "project-status: bridge host=127.0.0.1");
  assert(ps.safety && typeof ps.safety === "object", "project-status: safety present");
  assert(ps.safety.noAutoDispatch === true, "project-status: safety.noAutoDispatch=true");
  assert(ps.safety.noCommandExecution === true, "project-status: safety.noCommandExecution=true");
  assert(typeof ps.generatedAt === "string", "project-status: generatedAt present");

  if (ps.ok) {
    // VS Code Extension Host available
    assert(ps.projectStatus !== null, "project-status: projectStatus present when ok=true");
  } else {
    // VS Code Extension Host not available (test environment)
    assert(ps.error === "project_status_unavailable" || ps.error === "project_status_error",
      "project-status: safe error when unavailable",
      "got: " + ps.error);
  }

  // --- Valid message ---
  var r1 = await post(safePayload);
  assert(r1.status === 200, "valid bridge_ping: status 200");
  assert(r1.body.received === true, "valid bridge_ping: received=true");
  assert(r1.body.noAutoDispatch === true, "valid bridge_ping: noAutoDispatch=true");
  assert(r1.body.noCommandExecution === true, "valid bridge_ping: noCommandExecution=true");
  assert(r1.body.messageType === "execution", "valid bridge_ping: messageType echoed");

  // --- G3: missing messageType ---
  var r2 = await post({ kind: "bridge_ping", noAutoDispatch: true, noCommandExecution: true });
  assert(r2.status === 400, "missing messageType: status 400");
  assert(r2.body.error === "invalid_messageType", "missing messageType: error=invalid_messageType");

  // --- G3: illegal messageType ---
  var r3 = await post({ messageType: "attack", noAutoDispatch: true, noCommandExecution: true });
  assert(r3.status === 400, "illegal messageType: status 400");
  assert(r3.body.error === "invalid_messageType", "illegal messageType: error=invalid_messageType");

  // --- All allowed messageTypes ---
  var allowedTypes = ["content", "decision", "strategy", "recommendation", "execution", "other"];
  for (var i = 0; i < allowedTypes.length; i += 1) {
    var p = Object.assign({}, safePayload, { messageType: allowedTypes[i] });
    var r = await post(p);
    assert(r.status === 200, "allowed messageType '" + allowedTypes[i] + "': status 200");
  }

  // --- G1: noAutoDispatch=false ---
  var r4 = await post({ messageType: "execution", noAutoDispatch: false, noCommandExecution: true });
  assert(r4.status === 400, "noAutoDispatch=false: status 400");
  assert(r4.body.error === "invalid_noAutoDispatch", "noAutoDispatch=false: error=invalid_noAutoDispatch");

  // --- G1: noAutoDispatch missing ---
  var r5 = await post({ messageType: "execution", noCommandExecution: true });
  assert(r5.status === 400, "noAutoDispatch missing: status 400");
  assert(r5.body.error === "invalid_noAutoDispatch", "noAutoDispatch missing: error=invalid_noAutoDispatch");

  // --- G2: noCommandExecution=false ---
  var r6 = await post({ messageType: "execution", noAutoDispatch: true, noCommandExecution: false });
  assert(r6.status === 400, "noCommandExecution=false: status 400");
  assert(r6.body.error === "invalid_noCommandExecution", "noCommandExecution=false: error=invalid_noCommandExecution");

  // --- G2: noCommandExecution missing ---
  var r7 = await post({ messageType: "execution", noAutoDispatch: true });
  assert(r7.status === 400, "noCommandExecution missing: status 400");
  assert(r7.body.error === "invalid_noCommandExecution", "noCommandExecution missing: error=invalid_noCommandExecution");

  // --- Forbidden: command ---
  var f1 = await post(Object.assign({}, safePayload, { command: "ls" }));
  assert(f1.status === 400, "forbidden command: status 400");
  assert(f1.body.error === "forbidden_field", "forbidden command: error=forbidden_field");

  // --- Forbidden: powershell ---
  var f2 = await post(Object.assign({}, safePayload, { powershell: "dir" }));
  assert(f2.status === 400, "forbidden powershell: status 400");

  // --- Forbidden: fullTaskCard ---
  var f3 = await post(Object.assign({}, safePayload, { fullTaskCard: "{}" }));
  assert(f3.status === 400, "forbidden fullTaskCard: status 400");

  // --- Forbidden: execute ---
  var f4 = await post(Object.assign({}, safePayload, { execute: "x" }));
  assert(f4.status === 400, "forbidden execute: status 400");

  // --- Forbidden: gitCommand ---
  var f5 = await post(Object.assign({}, safePayload, { gitCommand: "status" }));
  assert(f5.status === 400, "forbidden gitCommand: status 400");

  // --- Invalid JSON ---
  var badJson = await fetch(BASE + "/acb/v1/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json"
  });
  assert(badJson.status === 400, "invalid JSON: status 400");
  var badBody = await badJson.json();
  assert(badBody.error === "invalid_json", "invalid JSON: error=invalid_json");

  // --- 404 ---
  var nf = await fetch(BASE + "/acb/v1/nonexistent");
  assert(nf.status === 404, "404: status 404");

  // --- OPTIONS CORS preflight (message) ---
  var opt1 = await fetch(BASE + "/acb/v1/message", { method: "OPTIONS" });
  assert(opt1.status === 204, "OPTIONS /message: status 204");

  // --- OPTIONS CORS preflight (health) ---
  var opt2 = await fetch(BASE + "/acb/v1/health", { method: "OPTIONS" });
  assert(opt2.status === 204, "OPTIONS /health: status 204");

  // --- OPTIONS CORS preflight (project-status) ---
  var opt3 = await fetch(BASE + "/acb/v1/project-status", { method: "OPTIONS" });
  assert(opt3.status === 204, "OPTIONS /project-status: status 204");

  // --- Preflight endpoint ---

  // Helper to make a valid preflight request
  function makePreflightRequest(fullTaskCard, overrides) {
    var base = {
      messageType: "execution",
      payloadKind: "ACB_TASK_CARD",
      source: "browser-floating-console",
      targetAgent: "deepseek",
      fullTaskCard: fullTaskCard,
      selectedStep: { stepIndex: 1, target: "deepseek", payloadStatus: "complete" },
      safety: { noAutoDispatch: true, noCommandExecution: true },
      requestedAt: new Date().toISOString()
    };
    return Object.assign(base, overrides || {});
  }

  // Test 1: Valid complete task card
  var pf1 = await postPreflight(makePreflightRequest(MINIMAL_TASK_CARD));
  assert(pf1.status === 200, "preflight valid: status 200");
  assert(pf1.body.ok === true, "preflight valid: ok=true");
  assert(pf1.body.preflight && typeof pf1.body.preflight === "object", "preflight valid: preflight present");
  assert(pf1.body.preflight.status === "pass", "preflight valid: status=pass");
  assert(pf1.body.preflight.taskCardStartDetected === true, "preflight valid: start detected");
  assert(pf1.body.preflight.taskCardEndDetected === true, "preflight valid: end detected");
  assert(pf1.body.preflight.taskCardIdMatched === true, "preflight valid: id matched");
  assert(pf1.body.preflight.targetMatched === true, "preflight valid: target matched");
  assert(pf1.body.preflight.requiredFieldsPresent === true, "preflight valid: fields present");
  assert(pf1.body.preflight.requiredFieldsMissing.length === 0, "preflight valid: no missing fields");
  assert(pf1.body.preflight.canExecuteLocally === false, "preflight valid: canExecuteLocally=false");
  assert(pf1.body.preflight.canSendToAgentByStructure === true, "preflight valid: canSendToAgentByStructure=true");

  // Safety fields in response
  assert(pf1.body.safety.executionAllowed === false, "preflight valid: executionAllowed=false");
  assert(pf1.body.safety.agentDispatchAllowed === false, "preflight valid: agentDispatchAllowed=false");
  assert(pf1.body.safety.gitWriteAllowed === false, "preflight valid: gitWriteAllowed=false");
  assert(pf1.body.safety.noAutoDispatch === true, "preflight valid: noAutoDispatch=true");
  assert(pf1.body.safety.noCommandExecution === true, "preflight valid: noCommandExecution=true");

  // Test 2: Missing fullTaskCard
  var pf2 = await postPreflight(makePreflightRequest(""));
  assert(pf2.status === 200, "preflight no-card: status 200");
  assert(pf2.body.ok === false, "preflight no-card: ok=false");
  assert(pf2.body.preflight.status === "fail", "preflight no-card: status=fail");
  assert(pf2.body.preflight.taskCardStartDetected === false, "preflight no-card: start not detected");

  // Test 3: Missing start tag
  var pf3 = await postPreflight(makePreflightRequest("some random text without task card tags"));
  assert(pf3.status === 200, "preflight no-start: status 200");
  assert(pf3.body.ok === false, "preflight no-start: ok=false");
  assert(pf3.body.preflight.taskCardStartDetected === false, "preflight no-start: start not detected");

  // Test 4: Missing end tag
  var incompleteCard = MINIMAL_TASK_CARD.replace('<ACB_TASK_CARD_END id="test-preflight-001">', "");
  var pf4 = await postPreflight(makePreflightRequest(incompleteCard));
  assert(pf4.status === 200, "preflight no-end: status 200");
  assert(pf4.body.ok === false, "preflight no-end: ok=false");
  assert(pf4.body.preflight.taskCardStartDetected === true, "preflight no-end: start detected");
  assert(pf4.body.preflight.taskCardEndDetected === false, "preflight no-end: end not detected");

  // Test 5: Mismatched IDs
  var mismatchedCard = MINIMAL_TASK_CARD.replace(/id="test-preflight-001"/, 'id="mismatched-id"');
  var pf5 = await postPreflight(makePreflightRequest(mismatchedCard));
  assert(pf5.status === 200, "preflight id-mismatch: status 200");
  assert(pf5.body.ok === false, "preflight id-mismatch: ok=false");
  assert(pf5.body.preflight.taskCardIdMatched === false, "preflight id-mismatch: id not matched");

  // Test 6: Missing required fields
  var missingFieldsCard = [
    '<ACB_TASK_CARD id="test-minimal-002" target="deepseek" version="1">',
    'taskCardId:',
    'test-minimal-002',
    'target:',
    'deepseek',
    '<ACB_TASK_CARD_END id="test-minimal-002">'
  ].join("\n");
  var pf6 = await postPreflight(makePreflightRequest(missingFieldsCard));
  assert(pf6.status === 200, "preflight missing-fields: status 200");
  assert(pf6.body.ok === false, "preflight missing-fields: ok=false");
  assert(pf6.body.preflight.requiredFieldsPresent === false, "preflight missing-fields: fields not present");
  assert(pf6.body.preflight.requiredFieldsMissing.length > 0, "preflight missing-fields: has missing list");

  // Test 7: safety.noAutoDispatch=false
  var pf7 = await postPreflight(makePreflightRequest(MINIMAL_TASK_CARD, { safety: { noAutoDispatch: false, noCommandExecution: true } }));
  assert(pf7.status === 200, "preflight noAutoDispatch=false: status 200");
  assert(pf7.body.ok === false, "preflight noAutoDispatch=false: ok=false");
  assert(pf7.body.preflight.status === "fail", "preflight noAutoDispatch=false: status=fail");

  // Test 8: safety.noCommandExecution=false
  var pf8 = await postPreflight(makePreflightRequest(MINIMAL_TASK_CARD, { safety: { noAutoDispatch: true, noCommandExecution: false } }));
  assert(pf8.status === 200, "preflight noCommandExecution=false: status 200");
  assert(pf8.body.ok === false, "preflight noCommandExecution=false: ok=false");
  assert(pf8.body.preflight.status === "fail", "preflight noCommandExecution=false: status=fail");

  // Test 9: Safety fields always present even on fail
  assert(pf8.body.safety.executionAllowed === false, "preflight fail: executionAllowed=false");
  assert(pf8.body.safety.agentDispatchAllowed === false, "preflight fail: agentDispatchAllowed=false");
  assert(pf8.body.safety.gitWriteAllowed === false, "preflight fail: gitWriteAllowed=false");

  // Test 10: Invalid JSON → 400
  var badPf = await fetch(BASE + "/acb/v1/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json"
  });
  assert(badPf.status === 400, "preflight invalid JSON: status 400");
  var badPfBody = await badPf.json();
  assert(badPfBody.error === "invalid_json", "preflight invalid JSON: error=invalid_json");

  // Test 11: OPTIONS CORS preflight
  var opt4 = await fetch(BASE + "/acb/v1/preflight", { method: "OPTIONS" });
  assert(opt4.status === 204, "OPTIONS /preflight: status 204");

  // --- Readiness endpoint ---

  // First, run a valid preflight to populate in-memory cache
  var pfForRd = await postPreflight(makePreflightRequest(MINIMAL_TASK_CARD));
  assert(pfForRd.status === 200, "readiness preflight prep: status 200");
  assert(pfForRd.body.ok === true, "readiness preflight prep: ok=true");

  // Test 12: Readiness endpoint returns 200
  var rd1 = await fetch(BASE + "/acb/v1/readiness");
  var rd1Body = await rd1.json();
  assert(rd1.status === 200, "readiness: status 200");
  assert(rd1Body.ok === true, "readiness: ok=true");
  assert(rd1Body.readiness && typeof rd1Body.readiness === "object", "readiness: readiness present");

  // Test 13: Readiness has required fields
  assert(typeof rd1Body.readiness.status === "string", "readiness: status is string");
  assert(rd1Body.readiness.status === "ready" || rd1Body.readiness.status === "warning" || rd1Body.readiness.status === "blocked",
    "readiness: status is valid value", "got: " + rd1Body.readiness.status);
  assert(Array.isArray(rd1Body.readiness.blockingReasons), "readiness: blockingReasons is array");
  assert(Array.isArray(rd1Body.readiness.warningReasons), "readiness: warningReasons is array");
  assert(Array.isArray(rd1Body.readiness.checks), "readiness: checks is array");
  assert(typeof rd1Body.readiness.bridgeConnected === "boolean", "readiness: bridgeConnected is boolean");
  assert(rd1Body.readiness.bridgeConnected === true, "readiness: bridgeConnected=true");
  assert(typeof rd1Body.readiness.projectStatusAvailable === "boolean", "readiness: projectStatusAvailable is boolean");
  assert(typeof rd1Body.readiness.preflightAvailable === "boolean", "readiness: preflightAvailable is boolean");
  assert(rd1Body.readiness.preflightAvailable === true, "readiness: preflightAvailable=true (cache populated)");
  assert(rd1Body.readiness.preflightPassed === true, "readiness: preflightPassed=true");
  assert(rd1Body.readiness.preflightStatus === "pass", "readiness: preflightStatus=pass from cache");
  assert(typeof rd1Body.readiness.requiredFieldsPresent === "boolean", "readiness: requiredFieldsPresent is boolean");
  assert(typeof rd1Body.readiness.summary === "string", "readiness: summary present");

  // Test 14: Readiness checks contain expected check names
  var rdCheckNames = rd1Body.readiness.checks.map(function (c) { return c.name; });
  assert(rdCheckNames.indexOf("bridge_connected") !== -1, "readiness checks: bridge_connected");
  assert(rdCheckNames.indexOf("safety_flags_locked") !== -1, "readiness checks: safety_flags_locked");
  assert(rdCheckNames.indexOf("project_status") !== -1, "readiness checks: project_status");
  assert(rdCheckNames.indexOf("preflight") !== -1, "readiness checks: preflight");
  assert(rdCheckNames.indexOf("task_card_metadata") !== -1, "readiness checks: task_card_metadata");
  assert(rdCheckNames.indexOf("required_fields") !== -1, "readiness checks: required_fields");

  // Test 15: Readiness safety flags
  assert(rd1Body.safety.executionAllowed === false, "readiness: executionAllowed=false");
  assert(rd1Body.safety.agentDispatchAllowed === false, "readiness: agentDispatchAllowed=false");
  assert(rd1Body.safety.gitWriteAllowed === false, "readiness: gitWriteAllowed=false");
  assert(rd1Body.safety.noAutoDispatch === true, "readiness: noAutoDispatch=true");
  assert(rd1Body.safety.noCommandExecution === true, "readiness: noCommandExecution=true");

  // Test 16: Readiness blocked after failed preflight
  var failCard = [
    '<ACB_TASK_CARD id="test-fail-003" target="deepseek" version="1">',
    'taskCardId:',
    'test-fail-003',
    'target:',
    'deepseek',
    '<ACB_TASK_CARD_END id="test-fail-003">'
  ].join("\n");
  await postPreflight(makePreflightRequest(failCard)); // populates cache with fail
  var rdBlocked = await fetch(BASE + "/acb/v1/readiness");
  var rdBlockedBody = await rdBlocked.json();
  assert(rdBlockedBody.readiness.status === "blocked", "readiness blocked: status=blocked", "got: " + rdBlockedBody.readiness.status);
  assert(rdBlockedBody.readiness.blockingReasons.length > 0, "readiness blocked: has blocking reasons");

  // Test 17: OPTIONS CORS preflight
  var opt5 = await fetch(BASE + "/acb/v1/readiness", { method: "OPTIONS" });
  assert(opt5.status === 204, "OPTIONS /readiness: status 204");

  // --- Readiness context binding ---

  // Restore a valid preflight with contextId for context binding tests
  var ctxPf = await postPreflight(makePreflightRequest(MINIMAL_TASK_CARD, { contextId: "fb-hash-ch-eng-1-card-ctx-001" }));
  assert(ctxPf.status === 200, "ctx: preflight with contextId: status 200");
  assert(ctxPf.body.ok === true, "ctx: preflight with contextId: ok=true");

  // Test 18: Readiness with matching contextId — should be ready
  var rdCtxMatch = await fetch(BASE + "/acb/v1/readiness?contextId=" + encodeURIComponent("fb-hash-ch-eng-1-card-ctx-001"));
  var rdCtxMatchBody = await rdCtxMatch.json();
  assert(rdCtxMatch.status === 200, "ctx: readiness matching context: status 200");
  assert(rdCtxMatchBody.readiness.preflightAvailable === true, "ctx: readiness matching context: preflightAvailable=true");
  assert(rdCtxMatchBody.readiness.preflightContextMismatch === false, "ctx: readiness matching context: contextMismatch=false");
  assert(rdCtxMatchBody.readiness.status !== "blocked" || rdCtxMatchBody.readiness.blockingReasons.join(" ").indexOf("Preflight has not been run") === -1,
    "ctx: readiness matching context: not blocked by 'preflight not run'");

  // Test 19: Readiness with non-matching contextId — should be blocked/stale
  var rdCtxMismatch = await fetch(BASE + "/acb/v1/readiness?contextId=" + encodeURIComponent("fb-other-ch-eng-2-card-other-999"));
  var rdCtxMismatchBody = await rdCtxMismatch.json();
  assert(rdCtxMismatch.status === 200, "ctx: readiness mismatched context: status 200");
  assert(rdCtxMismatchBody.readiness.preflightContextMismatch === true, "ctx: readiness mismatched context: contextMismatch=true");
  assert(rdCtxMismatchBody.readiness.status === "blocked", "ctx: readiness mismatched context: status=blocked", "got: " + rdCtxMismatchBody.readiness.status);
  assert(rdCtxMismatchBody.readiness.blockingReasons.join(" ").indexOf("context mismatch") !== -1,
    "ctx: readiness mismatched context: blocking reason mentions context mismatch");

  // Test 20: Readiness without contextId — backward compatible, uses cache
  var rdNoCtx = await fetch(BASE + "/acb/v1/readiness");
  var rdNoCtxBody = await rdNoCtx.json();
  assert(rdNoCtx.status === 200, "ctx: readiness no contextId: status 200");
  assert(rdNoCtxBody.readiness.requestContextId !== undefined, "ctx: readiness has requestContextId field");
  assert(rdNoCtxBody.readiness.cachedContextId !== undefined, "ctx: readiness has cachedContextId field");
  assert(rdNoCtxBody.readiness.preflightContextMismatch !== undefined, "ctx: readiness has preflightContextMismatch field");
  // Without contextId, should see cached preflight
  assert(rdNoCtxBody.readiness.preflightAvailable === true, "ctx: readiness no contextId: preflightAvailable=true");

  // --- Task Card Review Bridge endpoint ---
  function makeTaskCardReviewPayload(executablePayload, overrides) {
    var base = {
      executablePayload: executablePayload,
      reviewMetadata: {
        taskCardId: "test-preflight-001",
        target: "deepseek",
        contextId: "ctx-bridge-review-001",
        feedbackHash: "fb-hash-001",
        channelId: "engineering-advisor",
        channelName: "工程参谋",
        actionStepIndex: 1,
        payloadStatus: "complete",
        preflightStatus: "pass",
        readinessStatus: "ready",
        warningReasons: [],
        blockingReasons: []
      },
      safety: {
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }
    };
    return Object.assign(base, overrides || {});
  }

  // TCR-1: Reject missing executablePayload
  var tcr1 = await postTaskCardReview(makeTaskCardReviewPayload(""));
  assert(tcr1.status === 400, "task-card-review missing payload: status 400");
  assert(tcr1.body.accepted === false, "task-card-review missing payload: accepted=false");

  // TCR-2: Reject missing start marker
  var tcr2 = await postTaskCardReview(makeTaskCardReviewPayload("plain text"));
  assert(tcr2.status === 400, "task-card-review missing start: status 400");
  assert(tcr2.body.error === "missing_task_card_start_marker", "task-card-review missing start: error");

  // TCR-3: Reject missing end marker
  var tcr3 = await postTaskCardReview(makeTaskCardReviewPayload(MINIMAL_TASK_CARD.replace('<ACB_TASK_CARD_END id="test-preflight-001">', "")));
  assert(tcr3.status === 400, "task-card-review missing end: status 400");
  assert(tcr3.body.error === "missing_task_card_end_marker", "task-card-review missing end: error");

  // TCR-4: Reject id mismatch
  var tcr4 = await postTaskCardReview(makeTaskCardReviewPayload(MINIMAL_TASK_CARD.replace('<ACB_TASK_CARD_END id="test-preflight-001">', '<ACB_TASK_CARD_END id="bad-id">')));
  assert(tcr4.status === 400, "task-card-review id mismatch: status 400");
  assert(tcr4.body.error === "task_card_id_mismatch", "task-card-review id mismatch: error");

  // TCR-5/TCR-6/TCR-7: Accept complete task card with safety flags locked
  var tcr5 = await postTaskCardReview(makeTaskCardReviewPayload(MINIMAL_TASK_CARD));
  assert(tcr5.status === 200, "task-card-review valid: status 200");
  assert(tcr5.body.accepted === true, "task-card-review valid: accepted=true");
  assert(tcr5.body.taskCardId === "test-preflight-001", "task-card-review valid: taskCardId");
  assert(tcr5.body.target === "deepseek", "task-card-review valid: target");
  assert(tcr5.body.noAutoDispatch === true, "task-card-review valid: noAutoDispatch=true");
  assert(tcr5.body.noCommandExecution === true, "task-card-review valid: noCommandExecution=true");
  assert(tcr5.body.executionAllowed === false, "task-card-review valid: executionAllowed=false");
  assert(tcr5.body.agentDispatchAllowed === false, "task-card-review valid: agentDispatchAllowed=false");
  assert(tcr5.body.gitWriteAllowed === false, "task-card-review valid: gitWriteAllowed=false");

  // TCR-8: Latest endpoint returns accepted object
  var tcrLatest1Resp = await fetch(BASE + "/acb/v1/task-card-review/latest");
  var tcrLatest1 = await tcrLatest1Resp.json();
  assert(tcrLatest1Resp.status === 200, "task-card-review latest: status 200");
  assert(tcrLatest1.ok === true, "task-card-review latest: ok=true");
  assert(tcrLatest1.hasReview === true, "task-card-review latest: hasReview=true");
  assert(tcrLatest1.review && tcrLatest1.review.taskCardId === "test-preflight-001", "task-card-review latest: taskCardId retained");

  // TCR-9: Invalid payload should not overwrite latest accepted object
  var tcr9 = await postTaskCardReview(makeTaskCardReviewPayload("invalid payload after valid"));
  assert(tcr9.status === 400, "task-card-review invalid after valid: status 400");
  var tcrLatest2Resp = await fetch(BASE + "/acb/v1/task-card-review/latest");
  var tcrLatest2 = await tcrLatest2Resp.json();
  assert(tcrLatest2Resp.status === 200, "task-card-review latest after invalid: status 200");
  assert(tcrLatest2.hasReview === true, "task-card-review latest after invalid: still hasReview=true");
  assert(tcrLatest2.review && tcrLatest2.review.taskCardId === "test-preflight-001", "task-card-review latest after invalid: previous accepted retained");

  // TCR-10: OPTIONS CORS preflight
  var opt6 = await fetch(BASE + "/acb/v1/task-card-review", { method: "OPTIONS" });
  assert(opt6.status === 204, "OPTIONS /task-card-review: status 204");

  // --- isRunning ---
  assert(bridge.isRunning() === true, "isRunning: true");

  // --- Stop ---
  await bridge.stop();
  assert(bridge.isRunning() === false, "stop: isRunning=false");

  console.log("");
  console.log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(function (e) {
  console.error("FATAL: " + (e.message || String(e)));
  process.exit(1);
});
