(function () {
  "use strict";

  var MODE_MOCK = "mock";
  var MODE_CHATGPT = "chatgpt";

  var SOURCE_MOCK = "mock-chatgpt";
  var SOURCE_CHATGPT = "chatgpt-page";

  var STABLE_DELAY_MS = 2000;
  var ASSISTANT_SELECTOR = '[data-acb-role="assistant"]';
  var USER_SELECTOR = '[data-acb-role="user"]';
  var CHAT_SELECTOR = '[data-acb-chat="messages"]';
  var CHANNEL_STATE_SELECTOR = "#acb-current-channel";

  var CHANNELS = [
    { id: "execution-controller", name: "执行总控", type: "controller", pinned: true },
    { id: "engineering-advisor", name: "工程参谋", type: "advisor", pinned: false },
    { id: "test-advisor", name: "测试参谋", type: "advisor", pinned: false },
    { id: "security-advisor", name: "安全参谋", type: "advisor", pinned: false },
    { id: "ux-advisor", name: "UI/UX 参谋", type: "advisor", pinned: false }
  ];

  var FEEDBACK_TYPES = ["content", "decision", "strategy", "recommendation", "execution"];
  var DEFAULT_BEHAVIORS = ["autoRead", "pendingReview", "pendingDecision", "actionRequired", "noChange"];
  var RECOMMENDED_STATUSES = ["seen", "pending", "action_required", "done", "archived"];
  var ATTENTION_LEVELS = ["low", "medium", "high", "urgent", "done"];
  var CONFIDENCE_LEVELS = ["low", "medium", "high"];
  var ACTION_PLAN_STATUSES = ["draft", "active", "done", "cancelled"];
  var ACTION_STEP_STATUSES = ["pending", "copied", "in_progress", "reported", "done", "skipped"];
  var ACTION_STEP_TARGETS = [
    "controller", "user",
    "codex", "openai_codex", "codex_cli",
    "claude-code", "claude", "claude_code", "cloud", "cloudcode",
    "deepseek", "powershell", "git", "docs", "manual", "unknown"
  ];

  var FEEDBACK_TYPE_LABELS = {
    content: "内容",
    decision: "判断",
    strategy: "战略",
    recommendation: "建议",
    execution: "执行"
  };
  var DEFAULT_BEHAVIOR_LABELS = {
    autoRead: "浏览后已读",
    pendingReview: "挂起待复核",
    pendingDecision: "挂起待决策",
    actionRequired: "需要行动",
    noChange: "不改变状态"
  };
  var RECOMMENDED_STATUS_LABELS = {
    seen: "已读",
    pending: "挂起",
    action_required: "需要行动",
    done: "已完成",
    archived: "已归档"
  };
  var ATTENTION_LEVEL_LABELS = {
    low: "低",
    medium: "中",
    high: "高",
    urgent: "紧急",
    done: "完成"
  };
  var META_SOURCE_LABELS = {
    acb_card_meta: "ACB_CARD_META",
    fallback_rule: "本地规则",
    manual: "用户修改"
  };
  var ACTION_TARGET_LABELS = {
    controller: "总控",
    user: "用户",
    codex: "Codex",
    openai_codex: "OpenAI Codex",
    codex_cli: "Codex CLI",
    "claude-code": "Claude Code",
    claude: "Claude",
    claude_code: "Claude Code",
    cloud: "CloudCode",
    cloudcode: "CloudCode",
    deepseek: "DeepSeek",
    powershell: "PowerShell",
    git: "Git",
    docs: "Docs",
    manual: "手工",
    unknown: "未知"
  };
  var ACTION_STEP_STATUS_LABELS = {
    pending: "pending",
    copied: "copied",
    in_progress: "in_progress",
    reported: "reported",
    done: "done",
    skipped: "skipped"
  };
  var PRE_EXECUTION_EXECUTOR_PROFILES = [
    {
      executorId: "codex",
      displayName: "Codex",
      executorType: "agent",
      roleIdentity: "execution-agent",
      currentRole: "execution-agent",
      commandName: "codex",
      targetAliases: ["codex", "openai_codex", "codex_cli"],
      defaultPermissionMode: "manual_confirmed",
      defaultHandoffMode: "manual/copyable",
      supportsInteractiveTerminal: true,
      supportsClipboardPrompt: true,
      trustedProjectOnly: true,
      enabledByDefault: true
    },
    {
      executorId: "deepseek",
      displayName: "DeepSeek",
      executorType: "agent",
      roleIdentity: "execution-agent",
      currentRole: "execution-agent",
      commandName: "deepseek",
      targetAliases: ["deepseek", "deepseek_cli", "deepseek-coder", "deepseek_coder"],
      defaultPermissionMode: "manual_confirmed",
      defaultHandoffMode: "manual/copyable",
      supportsInteractiveTerminal: true,
      supportsClipboardPrompt: true,
      trustedProjectOnly: true,
      enabledByDefault: true
    },
    {
      executorId: "claude-code",
      displayName: "Claude Code",
      executorType: "agent",
      roleIdentity: "execution-agent",
      currentRole: "execution-agent",
      commandName: "claude",
      targetAliases: ["claude-code", "claude_code", "claude", "cloud", "cloudcode"],
      defaultPermissionMode: "manual_confirmed",
      defaultHandoffMode: "manual/copyable",
      supportsInteractiveTerminal: true,
      supportsClipboardPrompt: true,
      trustedProjectOnly: true,
      enabledByDefault: true
    }
  ];
  var PRE_EXECUTION_TARGET_ALIAS_MAP = buildExecutorTargetAliasMap(PRE_EXECUTION_EXECUTOR_PROFILES);
  var PRE_EXECUTION_NON_AGENT_TARGETS = {
    controller: true,
    advisor: true,
    test: true,
    sample: true
  };
  var MANUAL_EXECUTION_REPORT_STATUSES = {
    none: true,
    report_received: true,
    waiting_controller_review: true
  };
  var TASK_LIFECYCLE_LABELS = {
    captured: "Captured",
    classified: "Classified",
    payload_missing: "Payload Missing",
    route_blocked: "Route Blocked",
    ready_for_prepare: "Ready For Prepare",
    prepared: "Prepared",
    manual_handoff_marked: "Manual Handoff Marked",
    report_received: "Report Received",
    waiting_controller_review: "Waiting Controller Review"
  };

  var USER_TEXT_SELECTORS = [
    '[data-message-author-role="user"] .whitespace-pre-wrap',
    '[data-message-author-role="user"] .markdown',
    '[data-message-author-role="user"]'
  ];
  var ASSISTANT_TEXT_SELECTORS = [
    '[data-message-author-role="assistant"] .whitespace-pre-wrap',
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"]'
  ];

  var currentMode = null;
  var CONSOLE_DISPLAY_MODE_NORMAL = "normal";
  var CONSOLE_DISPLAY_MODE_DEBUG = "debug";
  var floatingConsoleDisplayMode = CONSOLE_DISPLAY_MODE_NORMAL;
  var floatingVisible = false;
  var floatingSelectedChannelId = CHANNELS[0].id;
  var floatingFeedbacks = {};
  var floatingChannelStates = {};
  var floatingCards = [];
  var floatingFeedbackClassifications = {};
  var floatingActionPlans = {};
  var floatingBridgeLatest = null;
  var floatingProjectStatusLatest = null;
  var floatingPreflightLatest = null;
  var floatingTaskCardReviewLatest = null;
  var floatingExecutionInboxLatest = null;
  var floatingExecutionInboxHandoffStates = {};
  var floatingPreExecutionHandoffLatest = null;
  var floatingManualExecutionReportLatest = null;
  var floatingLocalReportReadResult = null;
  var preExecutionHandoffStorageLoaded = false;
  var floatingReadinessLatest = null;
  var currentPageBinding = null;
  var currentClassificationKey = null;
  var classificationDraftKey = null;
  var currentActionPlanKey = null;
  var currentActionStepId = null;
  var selectedExecutorId = null;
  var executorUnreadDots = {};
  var terminalActionState = null;
  var terminalActionDebug = { rendered: false, lastClicked: "", handlerEntered: false, handlerError: "" };
  var terminalStatusCache = null;
  var preflightChecking = false;
  var readinessChecking = false;
  var actionFeedbackState = {
    title: "待操作",
    message: "请先选择任务步骤。",
    detail: "",
    severity: "info",
    updatedAt: ""
  };

  var settleTimer = null;
  var lastSeenAssistant = "";
  var pendingContext = null;

  function isMockPage() {
    return location.pathname.toLowerCase().endsWith("/mock-chatgpt.html");
  }

  function isChatGptPage() {
    var host = (location.hostname || "").toLowerCase();
    return host === "chatgpt.com" || host === "chat.openai.com";
  }

  function pageBindingKey() {
    return location.href;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  }

  function setStatus(text) {
    setText("acb-float-status", text);
  }

  function setCopyStatus(text, color) {
    var el = document.getElementById("acb-float-copy-status");
    if (!el) {
      return;
    }
    el.textContent = text || "";
    el.style.color = color || "#666";
  }

  function setCaptureStatus(text, isError) {
    var el = document.getElementById("acb-float-capture-status");
    if (!el) {
      return;
    }
    el.textContent = text || "";
    el.style.color = isError ? "#c62828" : "#2e7d32";
  }

  function setClassificationStatus(text, isError) {
    var el = document.getElementById("acb-feedback-class-edit-status");
    if (!el) {
      return;
    }
    el.textContent = text || "";
    el.style.color = isError ? "#c62828" : "#2e7d32";
  }

  function setActionStepsStatus(text, isError) {
    var el = document.getElementById("acb-action-steps-status");
    if (!el) {
      return;
    }
    el.textContent = text || "";
    el.style.color = isError ? "#c62828" : "#2e7d32";
  }

  function severityLabel(level) {
    var map = {
      info: "信息",
      success: "成功",
      warning: "警告",
      error: "错误"
    };
    return map[level] || "信息";
  }

  function severityColor(level) {
    if (level === "success") { return "#166534"; }
    if (level === "warning") { return "#b45309"; }
    if (level === "error") { return "#b91c1c"; }
    return "#1f2937";
  }

  function severityBackground(level) {
    if (level === "success") { return "#dcfce7"; }
    if (level === "warning") { return "#fef3c7"; }
    if (level === "error") { return "#fee2e2"; }
    return "#e2e8f0";
  }

  function setUnifiedActionFeedback(title, message, severity, detail) {
    actionFeedbackState = {
      title: title || "操作结果",
      message: message || "",
      detail: detail || "",
      severity: severity || "info",
      updatedAt: new Date().toISOString()
    };
    renderUnifiedActionFeedback();
  }

  function renderUnifiedActionFeedback() {
    var panel = document.getElementById("acb-action-feedback-panel");
    if (!panel) {
      return;
    }
    var titleEl = document.getElementById("acb-action-feedback-title");
    var levelEl = document.getElementById("acb-action-feedback-level");
    var messageEl = document.getElementById("acb-action-feedback-message");
    var detailEl = document.getElementById("acb-action-feedback-detail");
    var timeEl = document.getElementById("acb-action-feedback-time");
    if (titleEl) {
      titleEl.textContent = actionFeedbackState.title || "操作结果";
    }
    if (levelEl) {
      levelEl.textContent = severityLabel(actionFeedbackState.severity);
      levelEl.style.color = severityColor(actionFeedbackState.severity);
    }
    if (messageEl) {
      messageEl.textContent = actionFeedbackState.message || "暂无操作记录。";
      messageEl.style.color = severityColor(actionFeedbackState.severity);
    }
    if (detailEl) {
      detailEl.textContent = actionFeedbackState.detail || "-";
    }
    if (timeEl) {
      timeEl.textContent = actionFeedbackState.updatedAt ? ("时间: " + actionFeedbackState.updatedAt) : "时间: -";
    }
    var summary = getUnifiedActionFeedbackSummary();
    var stateEl = document.getElementById("acb-action-feedback-user-state");
    var reasonEl = document.getElementById("acb-action-feedback-user-reason");
    var nextEl = document.getElementById("acb-action-feedback-user-next");
    if (stateEl) {
      stateEl.textContent = summary.stateLabel;
      stateEl.style.color = severityColor(actionFeedbackState.severity);
    }
    if (reasonEl) {
      reasonEl.textContent = summary.reason;
    }
    if (nextEl) {
      nextEl.textContent = summary.nextAction;
    }
    panel.style.borderColor = severityColor(actionFeedbackState.severity);
    panel.style.background = severityBackground(actionFeedbackState.severity);
  }

  function getUnifiedActionFeedbackSummary() {
    var severity = actionFeedbackState && actionFeedbackState.severity ? actionFeedbackState.severity : "info";
    var message = actionFeedbackState && actionFeedbackState.message ? actionFeedbackState.message : "";
    var detail = actionFeedbackState && actionFeedbackState.detail ? actionFeedbackState.detail : "";
    if (!message) {
      return {
        stateLabel: "未检查",
        reason: "尚未执行发送前检查。",
        nextAction: "点击“检查可发送状态”获取当前结果。"
      };
    }
    if (severity === "success") {
      return {
        stateLabel: "可发送",
        reason: message,
        nextAction: "可继续“发送到 VS Code 查看端”。"
      };
    }
    if (severity === "warning") {
      return {
        stateLabel: "警告",
        reason: detail || message,
        nextAction: "建议先处理警告项，再执行发送。"
      };
    }
    if (severity === "error") {
      return {
        stateLabel: "不可发送",
        reason: detail || message,
        nextAction: "请先修复阻断项，然后重新检查可发送状态。"
      };
    }
    return {
      stateLabel: "未检查",
      reason: message,
      nextAction: "请先执行“检查可发送状态”。"
    };
  }

  function resolveCurrentActionStep(plan) {
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      currentActionStepId = null;
      return null;
    }
    for (var i = 0; i < plan.steps.length; i += 1) {
      if (plan.steps[i] && plan.steps[i].id === currentActionStepId) {
        return plan.steps[i];
      }
    }
    for (var j = 0; j < plan.steps.length; j += 1) {
      var actionable = plan.steps[j];
      if (!actionable || actionable.target === "controller") {
        continue;
      }
      var actionGate = applyRouteResultEligibility(actionable);
      if (actionable.payloadStatus === "complete" && Boolean(actionable.fullTaskCard) && actionGate.canSendToAgent === true) {
        currentActionStepId = actionable.id;
        return actionable;
      }
    }
    for (var k = 0; k < plan.steps.length; k += 1) {
      if (plan.steps[k] && plan.steps[k].target !== "controller") {
        currentActionStepId = plan.steps[k].id;
        return plan.steps[k];
      }
    }
    currentActionStepId = plan.steps[0].id;
    return plan.steps[0];
  }

  function evaluateStepSendAvailability(step) {
    if (!step) {
      return { canSend: false, reason: "当前无可发送步骤。" };
    }
    if (step.target === "controller") {
      return { canSend: false, reason: "当前步骤为总控审查步骤，不作为发送载荷。" };
    }
    var pv = step.payloadValidation || {};
    if (!step.fullTaskCard || step.payloadStatus !== "complete" || pv.canSendToAgent !== true) {
      return { canSend: false, reason: "当前步骤缺少完整任务卡或 payload 未通过校验。" };
    }
    var routeGate = applyRouteResultEligibility(step);
    if (!routeGate.canSendToAgent) {
      return { canSend: false, reason: "RouteResult gate blocked: " + getRouteGateBlockingReasonText(routeGate) };
    }
    var stepCtx = getExecutionContextForStep(step);
    if (!stepCtx.hasCompleteTaskCard) {
      return { canSend: false, reason: "当前步骤上下文未形成完整任务卡。" };
    }
    var bridgeConnected = Boolean(floatingBridgeLatest && floatingBridgeLatest.ok);
    if (!bridgeConnected) {
      return { canSend: false, reason: "本地 Bridge 未连接。" };
    }
    if (!floatingPreflightLatest || !floatingPreflightLatest.data || !floatingPreflightLatest.data.preflight) {
      return { canSend: false, reason: "尚未获得预检结果，请先点击“检查可发送状态”。" };
    }
    if (!preflightMatchesContext(floatingPreflightLatest, stepCtx)) {
      return { canSend: false, reason: "预检结果与当前任务上下文不匹配。" };
    }
    var preflightStatus = floatingPreflightLatest.data.preflight.status || "unknown";
    if (preflightStatus !== "pass") {
      return { canSend: false, reason: "预检状态为 " + preflightStatus + "，当前不可发送。" };
    }
    if (!floatingReadinessLatest || !floatingReadinessLatest.data || !floatingReadinessLatest.data.readiness) {
      return { canSend: false, reason: "尚未获得 readiness 结果，请先点击“检查可发送状态”。" };
    }
    var rd = floatingReadinessLatest.data.readiness;
    var readinessMatched = Boolean(stepCtx.contextId && rd.requestContextId && rd.requestContextId === stepCtx.contextId);
    if (!readinessMatched) {
      return { canSend: false, reason: "readiness 结果与当前任务上下文不匹配。" };
    }
    var readinessStatus = rd.status || "unknown";
    if (readinessStatus !== "ready") {
      return { canSend: false, reason: "readiness 状态为 " + readinessStatus + "，当前不可发送。" };
    }
    var sf = floatingReadinessLatest.data.safety || {};
    if (!(sf.noAutoDispatch === true && sf.noCommandExecution === true && sf.executionAllowed === false && sf.agentDispatchAllowed === false && sf.gitWriteAllowed === false)) {
      return { canSend: false, reason: "安全锁状态不满足只读要求，发送被禁止。" };
    }
    return { canSend: true, reason: "检查通过，可发送到 VS Code 查看端。" };
  }

  function normalizeText(text) {
    if (!text) {
      return "";
    }

    return String(text)
      .replace(/\r/g, "")
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line.length > 0;
      })
      .join("\n")
      .trim();
  }

  function trimToLength(text, maxLength) {
    var normalized = normalizeText(text || "");
    if (!normalized) {
      return "";
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return normalized.slice(0, maxLength);
  }

  function shortText(text, limit) {
    var normalized = normalizeText(text || "");
    if (!normalized) {
      return "-";
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return normalized.slice(0, limit) + "...";
  }

  function shortHash(hash) {
    var value = String(hash || "").trim();
    if (!value) {
      return "unknown";
    }
    if (value.length <= 10) {
      return value;
    }
    return value.slice(0, 10) + "...";
  }

  function extractConversationIdFromUrl(url) {
    var raw = String(url || "");
    if (!raw) {
      return "";
    }
    var match = raw.match(/\/c\/([a-zA-Z0-9\-_]+)/);
    return match ? match[1] : "";
  }

  function getFeedbackConversationId(feedback) {
    if (!feedback) {
      return "";
    }
    return extractConversationIdFromUrl(feedback.pageUrl || "");
  }

  function getSelectedConversationUrl() {
    var feedback = getSelectedFeedback();
    if (feedback && feedback.pageUrl) {
      return feedback.pageUrl;
    }
    if (currentPageBinding && currentPageBinding.pageUrl) {
      return currentPageBinding.pageUrl;
    }
    return "";
  }

  function openSelectedConversation() {
    var url = getSelectedConversationUrl();
    if (!url) {
      setStatus("当前身份卡没有可打开的原对话链接");
      return;
    }
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_e) {
      location.href = url;
    }
  }

  function openConversationUrl(url) {
    if (!url) {
      return;
    }
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_e) {
      location.href = url;
    }
  }

  function getChannelFeedback(channelId) {
    return floatingFeedbacks[channelId] || null;
  }

  function getCurrentPageConversationId() {
    if (currentMode !== MODE_CHATGPT) {
      return "";
    }
    return extractConversationIdFromUrl(location.href);
  }

  function getCurrentPageLabel() {
    if (currentMode !== MODE_CHATGPT) {
      return isMockPage() ? "Mock 页面" : "当前页面";
    }
    var conversationId = getCurrentPageConversationId();
    return conversationId ? "ChatGPT 页面" : "\u5f53\u524d\u9875\u9762";
  }

  function isTimestampOlderThanDays(isoString, dayCount) {
    var timestamp = Date.parse(String(isoString || ""));
    if (!timestamp || Number.isNaN(timestamp)) {
      return false;
    }
    return (Date.now() - timestamp) > (dayCount * 24 * 60 * 60 * 1000);
  }

  function getChannelBindingContext(channel, feedback, options) {
    var opts = options || {};
    var originalUrl = feedback && feedback.pageUrl ? feedback.pageUrl : "";
    var boundConversationId = getFeedbackConversationId(feedback) || "";
    var pageConversationId = getCurrentPageConversationId();
    var isChatPage = currentMode === MODE_CHATGPT;
    var pageRecognized = Boolean(pageConversationId);
    var boundOnCurrentPage = Boolean(currentPageBinding && currentPageBinding.channelId === channel.id);
    var hasBinding = Boolean(boundConversationId || boundOnCurrentPage);
    var matchesCurrentPage = Boolean(pageRecognized && (boundOnCurrentPage || (boundConversationId && boundConversationId === pageConversationId)));
    var staleCapture = isTimestampOlderThanDays(feedback && feedback.capturedAt, 7);
    var forBindingBar = Boolean(opts.forBindingBar);
    var context = {
      state: "idle",
      accent: "#94a3b8",
      softBackground: "#f8fafc",
      icon: "·",
      pageLabel: getCurrentPageLabel(),
      bindingLabel: hasBinding ? "\u5df2\u7ed1\u5b9a\u5176\u4ed6\u5bf9\u8bdd" : "\u5c1a\u672a\u7ed1\u5b9a",
      hint: "\u5c1a\u672a\u7ed1\u5b9a\uff0c\u53ef\u5148\u9009\u4e2d\u8eab\u4efd\u5361\u3002",
      cardNotice: "",
      hintColor: "#64748b",
      canBind: false,
      requiresRebind: false,
      allowCapture: false,
      showOpenOriginal: false,
      showDisabledBind: false,
      disabledActionLabel: "\u7ed1\u5b9a /\u91c7\u96c6\u7981\u7528",
      originalUrl: originalUrl,
      boundConversationId: boundConversationId,
      pageConversationId: pageConversationId,
      hasBinding: hasBinding,
      matchesCurrentPage: matchesCurrentPage,
      buttonLabel: "\u7ed1\u5b9a\u5f53\u524d\u5bf9\u8bdd"
    };

    if (!isChatPage) {
      context.bindingLabel = hasBinding ? "\u5df2\u7ed1\u5b9a\u5176\u4ed6\u5bf9\u8bdd" : "\u5c1a\u672a\u7ed1\u5b9a";
      context.hint = originalUrl
        ? "\u5f53\u524d\u9875\u4e0d\u5339\u914d\uff0c\u53ef\u6253\u5f00\u539f\u5bf9\u8bdd\u67e5\u770b\u6765\u6e90\u3002"
        : "\u5f53\u524d\u9875\u4e0d\u5339\u914d\uff0c\u4ec5\u652f\u6301\u67e5\u770b\u5df2\u6355\u83b7\u4fe1\u606f\u3002";
      context.cardNotice = "\u5f53\u524d\u9875\u4e0d\u5339\u914d";
      context.showOpenOriginal = Boolean(originalUrl);
      return context;
    }

    if (!pageRecognized) {
      context.state = "error";
      context.accent = "#dc2626";
      context.softBackground = "#fef2f2";
      context.icon = "!";
      context.bindingLabel = hasBinding ? "\u5df2\u7ed1\u5b9a\u5176\u4ed6\u5bf9\u8bdd" : "\u5c1a\u672a\u7ed1\u5b9a";
      context.hint = hasBinding
        ? "\u6765\u6e90\u4fe1\u606f\u4e0d\u5b8c\u6574\uff0c\u53ef\u6253\u5f00\u539f\u5bf9\u8bdd\u67e5\u770b\u3002"
        : "\u6765\u6e90\u4fe1\u606f\u4e0d\u5b8c\u6574\uff0c\u7ed1\u5b9a\u4e0e\u91c7\u96c6\u7981\u7528\u3002";
      context.cardNotice = "\u6765\u6e90\u4fe1\u606f\u4e0d\u5b8c\u6574";
      context.hintColor = "#b91c1c";
      context.showOpenOriginal = Boolean(originalUrl);
      context.showDisabledBind = true;
      return context;
    }

    if (!hasBinding) {
      context.bindingLabel = "\u5c1a\u672a\u7ed1\u5b9a";
      context.canBind = true;
      if (forBindingBar) {
        context.state = "ok";
        context.accent = "#16a34a";
        context.softBackground = "#f0fdf4";
        context.icon = "\u2713";
        context.hint = "\u5f53\u524d\u9875\u53ef\u8bc6\u522b\uff0c\u53ef\u7ed1\u5b9a\u5230\u6240\u9009\u8eab\u4efd\u5361\u3002";
        context.hintColor = "#166534";
      } else {
        context.hint = "\u5c1a\u672a\u7ed1\u5b9a\uff0c\u53ef\u7ee7\u7eed\u9009\u4e2d\u8eab\u4efd\u5361\u3002";
      }
      context.cardNotice = "\u5c1a\u672a\u7ed1\u5b9a";
      return context;
    }

    if (matchesCurrentPage) {
      context.bindingLabel = "\u5f53\u524d\u9875\u5df2\u7ed1\u5b9a";
      context.allowCapture = true;
      if (staleCapture) {
        context.state = "warn";
        context.accent = "#d97706";
        context.softBackground = "#fffbeb";
        context.icon = "!";
        context.hint = "\u5df2\u5339\u914d\uff0c\u4f46\u6700\u8fd1\u91c7\u96c6\u8f83\u65e9\uff0c\u5efa\u8bae\u91cd\u65b0\u91c7\u96c6\u3002";
        context.cardNotice = "\u5f53\u524d\u9875\u5339\u914d";
        context.hintColor = "#b45309";
      } else {
        context.state = "ok";
        context.accent = "#16a34a";
        context.softBackground = "#f0fdf4";
        context.icon = "\u2713";
        context.hint = "\u5f53\u524d\u9875\u4e0e\u6240\u9009\u8eab\u4efd\u5361\u5df2\u5339\u914d\uff0c\u53ef\u7ee7\u7eed\u91c7\u96c6\u3002";
        context.hintColor = "#166534";
        context.cardNotice = "\u5f53\u524d\u9875\u5339\u914d";
      }
      return context;
    }

    context.state = "info";
    context.accent = "#3b82f6";
    context.softBackground = "#eff6ff";
    context.icon = "\u21c4";
    context.bindingLabel = "\u5df2\u7ed1\u5b9a\u5176\u4ed6\u5bf9\u8bdd";
    context.hint = "\u5f53\u524d\u9875\u4e0d\u5339\u914d\uff0c\u7ed1\u5b9a\u5c06\u66ff\u6362\u6765\u6e90\u3002";
    context.cardNotice = boundConversationId ? "\u5df2\u7ed1\u5b9a\u5176\u4ed6\u5bf9\u8bdd" : "\u5f53\u524d\u9875\u4e0d\u5339\u914d";
    context.hintColor = "#1d4ed8";
    context.showOpenOriginal = Boolean(originalUrl);
    context.canBind = true;
    context.requiresRebind = true;
    context.buttonLabel = "\u66ff\u6362\u7ed1\u5b9a";
    return context;
  }

  function applyActionButtonState(button, enabled, tone) {
    if (!button) {
      return;
    }
    button.disabled = !enabled;
    button.style.opacity = enabled ? "1" : "0.7";
    button.style.cursor = enabled ? "pointer" : "not-allowed";
    button.style.background = enabled ? tone.background : "#e5e7eb";
    button.style.borderColor = enabled ? tone.border : "#9ca3af";
    button.style.color = enabled ? tone.color : "#6b7280";
  }

  function updateCaptureActionState(context) {
    var recaptureBtn = document.getElementById("acb-feedback-recapture-btn");
    var feedbackOpenBtn = document.getElementById("acb-feedback-open-source-btn");
    if (feedbackOpenBtn) {
      feedbackOpenBtn.style.display = context && context.showOpenOriginal ? "" : "none";
    }
    if (!recaptureBtn || currentMode !== MODE_CHATGPT) {
      return;
    }
    var canCapture = Boolean(context && context.allowCapture);
    applyActionButtonState(recaptureBtn, canCapture, {
      background: "#fff",
      border: "#2563eb",
      color: "#2563eb"
    });
    recaptureBtn.title = canCapture ? "" : ((context && context.hint) || "\u5f53\u524d\u72b6\u6001\u4e0d\u5141\u8bb8\u91c7\u96c6\u3002");
  }

  async function bindCurrentPageToChannel(channelId) {
    var channel = getChannelById(channelId);
    currentPageBinding = {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      boundAt: new Date().toISOString(),
      pageUrl: location.href
    };

    await globalThis.AcbStorage.setPageBinding(pageBindingKey(), currentPageBinding);
    floatingSelectedChannelId = channel.id;
    await refreshFloatingConsole();
  }

  function confirmSelectedBindingChange(context) {
    if (!context || !context.canBind) {
      return false;
    }
    var channel = getChannelById(floatingSelectedChannelId);
    var currentLabel = context.pageConversationId ? ("ChatGPT · " + context.pageConversationId) : "\u5f53\u524d\u9875\u9762";
    var message = context.requiresRebind
      ? "\u786e\u8ba4\u66ff\u6362\u7ed1\u5b9a\uff1f\n\n\u76ee\u6807\u8eab\u4efd\u5361\uff1a" + channel.name + "\n\u539f\u7ed1\u5b9a\u5bf9\u8bdd\uff1a" + (context.boundConversationId || "unknown") + "\n\u65b0\u6765\u6e90\uff1a" + currentLabel + "\n\n\u66ff\u6362\u540e\uff0c\u5f53\u524d\u9875\u9762\u5c06\u6210\u4e3a\u65b0\u7684\u91c7\u96c6\u6765\u6e90\u3002"
      : "\u786e\u8ba4\u7ed1\u5b9a\u5f53\u524d\u5bf9\u8bdd\uff1f\n\n\u76ee\u6807\u8eab\u4efd\u5361\uff1a" + channel.name + "\n\u5f53\u524d\u9875\u9762\uff1a" + currentLabel + "\n\n\u7ed1\u5b9a\u540e\uff0c\u540e\u7eed\u201c\u91c7\u96c6\u5f53\u524d\u9875\u201d\u5c06\u4ee5\u8be5\u5bf9\u8bdd\u4f5c\u4e3a\u6765\u6e90\u3002";
    return window.confirm(message);
  }

  async function bindCurrentPageToSelectedIdentity() {
    var channel = getChannelById(floatingSelectedChannelId);
    var feedback = getSelectedFeedback();
    var context = getChannelBindingContext(channel, feedback, { forBindingBar: true });
    if (!context.canBind) {
      setStatus(context.hint || "\u5f53\u524d\u72b6\u6001\u4e0d\u5141\u8bb8\u7ed1\u5b9a\u3002");
      return;
    }
    if (!confirmSelectedBindingChange(context)) {
      setStatus("\u5df2\u53d6\u6d88\u7ed1\u5b9a\u64cd\u4f5c");
      return;
    }
    await bindCurrentPageToChannel(channel.id);
    setStatus(context.requiresRebind ? "\u5df2\u66ff\u6362\u5f53\u524d\u9875\u9762\u7ed1\u5b9a" : "\u5f53\u524d\u9875\u9762\u5df2\u7ed1\u5b9a\u5230\u6240\u9009\u8eab\u4efd\u5361");
    setCaptureStatus("", false);
  }

  function preventCardActionBubble(event) {
    if (!event) {
      return;
    }
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
  }

  function bindButtonWithoutCardSelection(button, onClick) {
    if (!button) {
      return button;
    }
    button.addEventListener("click", function (event) {
      preventCardActionBubble(event);
      onClick(event);
    });
    return button;
  }

  function deriveBridgeUiState() {
    var hasBridgeSnapshot = Boolean(floatingBridgeLatest);
    var bridgeConnected = Boolean(floatingBridgeLatest && floatingBridgeLatest.ok);
    var bridgeTimestamp = floatingBridgeLatest && floatingBridgeLatest.timestamp
      ? Date.parse(floatingBridgeLatest.timestamp)
      : NaN;
    var bridgeIsFresh = Boolean(bridgeTimestamp) && !Number.isNaN(bridgeTimestamp) && (Date.now() - bridgeTimestamp) < (30 * 1000);
    var reviewFailureSuggestsRefresh = Boolean(
      floatingTaskCardReviewLatest &&
      floatingTaskCardReviewLatest.ok === false &&
      floatingTaskCardReviewLatest.error &&
      !/^eligibility_rejected:/i.test(String(floatingTaskCardReviewLatest.error || ""))
    );

    if (!hasBridgeSnapshot) {
      return {
        connected: false,
        chipText: "\u672a\u77e5",
        connectionText: "\u672a\u77e5",
        badgeText: "\u672a\u68c0\u6d4b",
        attention: "#9ca3af",
        note: "\u8bf7\u5148\u5237\u65b0 Bridge \u72b6\u6001\u3002"
      };
    }

    if (!bridgeConnected) {
      return {
        connected: false,
        chipText: "\u672a\u8fde\u63a5",
        connectionText: "\u672a\u8fde\u63a5",
        badgeText: "\u65ad\u5f00",
        attention: "#dc2626",
        note: "\u672c\u5730 Bridge \u672a\u8fde\u63a5\uff0c\u4ec5\u80fd\u4f7f\u7528\u53ea\u8bfb\u67e5\u770b\u3002"
      };
    }

    if (!bridgeIsFresh || reviewFailureSuggestsRefresh) {
      return {
        connected: false,
        chipText: "\u4e0a\u6b21\u8fde\u63a5",
        connectionText: "\u4e0a\u6b21\u8fde\u63a5 / \u9700\u5237\u65b0",
        badgeText: "\u7f13\u5b58",
        attention: "#d97706",
        note: reviewFailureSuggestsRefresh
          ? "\u5168\u5c40 Bridge \u66fe\u8fde\u901a\uff0c\u4f46\u5f53\u524d\u53d1\u9001\u94fe\u8def\u6700\u8fd1\u4e00\u6b21\u5931\u8d25\uff0c\u8bf7\u5148\u5237\u65b0\u72b6\u6001\u3002"
          : "\u5f53\u524d\u663e\u793a\u4e3a\u7f13\u5b58\u8fde\u63a5\u72b6\u6001\uff0c\u8bf7\u5237\u65b0\u540e\u518d\u4ee5\u5176\u4f5c\u4e3a\u53d1\u9001\u4f9d\u636e\u3002"
      };
    }

    return {
      connected: true,
      chipText: "\u5df2\u8fde\u63a5",
      connectionText: "\u5df2\u8fde\u63a5",
      badgeText: "\u67e5\u770b\u7aef",
      attention: "#16a34a",
      note: "\u5df2\u8fde\u63a5\u672c\u5730 Bridge\uff0c\u53ef\u7528\u4e8e review viewer \u8bed\u4e49\u7684\u4efb\u52a1\u5361\u5ba1\u67e5\u3002"
    };
  }

  function normalizeEnum(value, allowed, fallback) {
    var normalized = String(value || "").trim();
    for (var i = 0; i < allowed.length; i += 1) {
      if (normalized === allowed[i]) {
        return normalized;
      }
    }
    return fallback;
  }

  function normalizeBoolean(value, fallback) {
    if (value === true || value === false) {
      return value;
    }
    var lower = String(value || "").toLowerCase().trim();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
    return fallback;
  }

  function getChannelById(channelId) {
    for (var i = 0; i < CHANNELS.length; i += 1) {
      if (CHANNELS[i].id === channelId) {
        return CHANNELS[i];
      }
    }
    return CHANNELS[0];
  }

  function getSelectedFeedback() {
    return floatingFeedbacks[floatingSelectedChannelId] || null;
  }

  function getLastText(selector) {
    var nodes = document.querySelectorAll(selector);
    if (!nodes.length) {
      return "";
    }
    return (nodes[nodes.length - 1].textContent || "").trim();
  }

  function getCurrentMockChannel() {
    var state = document.querySelector(CHANNEL_STATE_SELECTOR);
    var fallback = CHANNELS[0];

    if (!state || !state.dataset) {
      return {
        channelId: fallback.id,
        channelName: fallback.name,
        channelType: fallback.type
      };
    }

    return {
      channelId: state.dataset.channelId || fallback.id,
      channelName: state.dataset.channelName || fallback.name,
      channelType: state.dataset.channelType || fallback.type
    };
  }

  function buildFeedback(channelMeta, lastUserMessage, assistantMessage, source, pageUrl, captureMeta) {
    var meta = captureMeta || {};
    var contextId = meta.contextId || extractConversationIdFromUrl(pageUrl || "") || "";
    var base = [
      source,
      channelMeta.channelId,
      lastUserMessage,
      assistantMessage
    ].join("||");

    return {
      id: channelMeta.channelId + ":" + Date.now(),
      source: source,
      pageUrl: pageUrl || "",
      channelId: channelMeta.channelId,
      channelName: channelMeta.channelName,
      channelType: channelMeta.channelType,
      lastUserMessage: lastUserMessage,
      assistantMessage: assistantMessage,
      contextId: contextId,
      captureSelectedMessageStrategy: meta.captureSelectedMessageStrategy || "",
      latestAssistantMessageDetected: Boolean(meta.latestAssistantMessageDetected),
      selectedAssistantMessageIndex: meta.selectedAssistantMessageIndex || 0,
      capturedAssistantMessageHash: meta.capturedAssistantMessageHash || "",
      capturedAssistantContainsTaskCard: Boolean(meta.capturedAssistantContainsTaskCard),
      selectedAssistantTaskCardId: meta.selectedAssistantTaskCardId || "",
      selectedAssistantTaskCardTarget: meta.selectedAssistantTaskCardTarget || "",
      selectedAssistantMessageLength: meta.selectedAssistantMessageLength || assistantMessage.length,
      visibleAssistantMessageCount: meta.visibleAssistantMessageCount || 0,
      visibleAssistantMessageLatestIndex: meta.visibleAssistantMessageLatestIndex || 0,
      hash: globalThis.AcbHash.simpleHash(base),
      capturedAt: new Date().toISOString()
    };
  }

  async function persistFeedback(channelMeta, lastUserMessage, assistantMessage, source, pageUrl, captureMeta) {
    if (!assistantMessage) {
      return { updated: false, reason: "missing-assistant" };
    }

    var feedback = buildFeedback(
      channelMeta,
      lastUserMessage,
      assistantMessage,
      source,
      pageUrl,
      captureMeta
    );

    var previous = await globalThis.AcbStorage.getLatestFeedback(channelMeta.channelId);
    if (previous && previous.hash === feedback.hash) {
      return { updated: false, reason: "same-hash", feedback: previous };
    }

    await globalThis.AcbStorage.setLatestFeedback(channelMeta.channelId, feedback);
    await globalThis.AcbStorage.setChannelStatus(channelMeta.channelId, "unread");
    return { updated: true, feedback: feedback };
  }

  function scheduleMockCapture(channelMeta) {
    pendingContext = {
      channelId: channelMeta.channelId,
      channelName: channelMeta.channelName,
      channelType: channelMeta.channelType
    };

    if (settleTimer) {
      clearTimeout(settleTimer);
    }

    settleTimer = setTimeout(function () {
      var context = pendingContext;
      pendingContext = null;
      persistFeedback(
        context,
        getLastText(USER_SELECTOR),
        getLastText(ASSISTANT_SELECTOR),
        SOURCE_MOCK,
        location.href
      ).catch(function (error) {
        console.error("[ACB][mock-listener] capture failed", error);
      });
    }, STABLE_DELAY_MS);
  }

  function onPotentialAssistantUpdate() {
    var assistantText = getLastText(ASSISTANT_SELECTOR);
    if (!assistantText || assistantText === lastSeenAssistant) {
      return;
    }
    lastSeenAssistant = assistantText;
    scheduleMockCapture(getCurrentMockChannel());
  }

  function startMockObserver() {
    var chatRoot = document.querySelector(CHAT_SELECTOR) || document.body;
    var observer = new MutationObserver(onPotentialAssistantUpdate);
    observer.observe(chatRoot, {
      childList: true,
      subtree: true,
      characterData: true
    });
    onPotentialAssistantUpdate();
  }

  function isVisibleElement(node) {
    if (!node || !node.isConnected) {
      return false;
    }

    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) {
      return false;
    }

    var style = window.getComputedStyle(el);
    if (!style || style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (style.opacity === "0") {
      return false;
    }

    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getLastVisibleText(selectors) {
    // Try textContent first (full raw text, not CSS-truncated) then innerText as fallback
    for (var s = 0; s < selectors.length; s += 1) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = nodes.length - 1; i >= 0; i -= 1) {
        var node = nodes[i];
        if (!isVisibleElement(node)) {
          continue;
        }

        var text = normalizeText(node.textContent || node.innerText || "");
        if (text) {
          return text;
        }
      }
    }
    // Also try code/pre blocks which may hold full un-truncated content
    var codeSelectors = [
      '[data-message-author-role="assistant"] pre',
      '[data-message-author-role="assistant"] code',
      '[data-message-author-role="assistant"] .markdown pre',
      '[data-message-author-role="assistant"] .whitespace-pre-wrap pre'
    ];
    var allParts = [];
    for (var cs = 0; cs < codeSelectors.length; cs += 1) {
      var codeNodes = document.querySelectorAll(codeSelectors[cs]);
      for (var ci = codeNodes.length - 1; ci >= 0; ci -= 1) {
        var cn = codeNodes[ci];
        var ct = (cn.textContent || "").trim();
        if (ct) {
          allParts.push(ct);
        }
      }
      if (allParts.length > 0) break;
    }
    return allParts.join("\n\n");
  }

  function getMessageBodyText(node) {
    if (!node) {
      return "";
    }

    var body = null;
    if (node.querySelector) {
      body = node.querySelector(".whitespace-pre-wrap, .markdown, pre, code");
    }

    var sourceNode = body || node;
    return normalizeText(sourceNode.textContent || sourceNode.innerText || "");
  }

  function getLatestVisibleAssistantMessageCapture() {
    var assistantNodes = document.querySelectorAll('[data-message-author-role="assistant"]');
    var visibleCandidates = [];

    for (var i = 0; i < assistantNodes.length; i += 1) {
      var node = assistantNodes[i];
      if (!isVisibleElement(node)) {
        continue;
      }

      var text = getMessageBodyText(node);
      if (!text) {
        continue;
      }

      var extracted = extractTaskCardFromAssistantMessage(text);
      var hasCompleteTaskCard = Boolean(
        extracted.startDetected &&
        extracted.endDetected &&
        extracted.startId &&
        extracted.endId &&
        extracted.startId === extracted.endId &&
        extracted.target
      );

      visibleCandidates.push({
        text: text,
        extracted: extracted,
        domIndex: i,
        visibleIndex: visibleCandidates.length + 1,
        hasCompleteTaskCard: hasCompleteTaskCard
      });
    }

    if (visibleCandidates.length > 0) {
      var selectedCandidate = visibleCandidates[visibleCandidates.length - 1];
      var strategy = "latest_visible_assistant_no_complete_task_card";
      var latestVisibleCandidate = visibleCandidates[visibleCandidates.length - 1];

      for (var j = visibleCandidates.length - 1; j >= 0; j -= 1) {
        if (visibleCandidates[j].hasCompleteTaskCard) {
          selectedCandidate = visibleCandidates[j];
          strategy = (j === visibleCandidates.length - 1)
            ? "latest_visible_complete_assistant"
            : "latest_complete_visible_assistant";
          break;
        }
      }

      return {
        assistantMessage: selectedCandidate.text,
        latestAssistantMessageDetected: true,
        selectedAssistantMessageIndex: selectedCandidate.visibleIndex,
        captureSelectedMessageStrategy: strategy,
        capturedAssistantMessageHash: globalThis.AcbHash.simpleHash(selectedCandidate.text),
        capturedAssistantContainsTaskCard: Boolean(selectedCandidate.hasCompleteTaskCard),
        selectedAssistantTaskCardId: selectedCandidate.extracted.startId || "",
        selectedAssistantTaskCardTarget: selectedCandidate.extracted.target || "",
        selectedAssistantMessageLength: selectedCandidate.text.length,
        visibleAssistantMessageCount: visibleCandidates.length,
        visibleAssistantMessageLatestIndex: latestVisibleCandidate.visibleIndex
      };
    }

    var fallbackAssistantMessage = getLastVisibleText(ASSISTANT_TEXT_SELECTORS);
    if (!fallbackAssistantMessage) {
      return {
        assistantMessage: "",
        latestAssistantMessageDetected: false,
        selectedAssistantMessageIndex: 0,
        captureSelectedMessageStrategy: "no_visible_assistant_message",
        capturedAssistantMessageHash: "",
        capturedAssistantContainsTaskCard: false,
        selectedAssistantTaskCardId: "",
        selectedAssistantTaskCardTarget: "",
        selectedAssistantMessageLength: 0,
        visibleAssistantMessageCount: 0,
        visibleAssistantMessageLatestIndex: 0
      };
    }

    var fallbackExtracted = extractTaskCardFromAssistantMessage(fallbackAssistantMessage);
    var fallbackHasCompleteTaskCard = Boolean(
      fallbackExtracted.startDetected &&
      fallbackExtracted.endDetected &&
      fallbackExtracted.startId &&
      fallbackExtracted.endId &&
      fallbackExtracted.startId === fallbackExtracted.endId &&
      fallbackExtracted.target
    );
    return {
      assistantMessage: fallbackAssistantMessage,
      latestAssistantMessageDetected: true,
      selectedAssistantMessageIndex: 1,
      captureSelectedMessageStrategy: "selector_fallback_last_visible_text",
      capturedAssistantMessageHash: globalThis.AcbHash.simpleHash(fallbackAssistantMessage),
      capturedAssistantContainsTaskCard: fallbackHasCompleteTaskCard,
      selectedAssistantTaskCardId: fallbackExtracted.startId || "",
      selectedAssistantTaskCardTarget: fallbackExtracted.target || "",
      selectedAssistantMessageLength: fallbackAssistantMessage.length,
      visibleAssistantMessageCount: 0,
      visibleAssistantMessageLatestIndex: 0
    };
  }

  function getLatestChatGptConversation() {
    var lastUserMessage = getLastVisibleText(USER_TEXT_SELECTORS);
    var assistantCapture = getLatestVisibleAssistantMessageCapture();
    var assistantMessage = assistantCapture ? assistantCapture.assistantMessage : "";

    if (!lastUserMessage || !assistantMessage) {
      return null;
    }

    return {
      lastUserMessage: lastUserMessage,
      assistantMessage: assistantMessage,
      assistantCapture: assistantCapture
    };
  }

  function getEffectiveChannelStatus(channelId) {
    if (!floatingFeedbacks[channelId]) {
      return null;
    }
    var state = floatingChannelStates[channelId];
    if (!state || !state.status) {
      return "unread";
    }
    return state.status;
  }

  function getStatusColor(status) {
    if (status === "unread") {
      return "#e53935";
    }
    if (status === "pending") {
      return "#f59e0b";
    }
    if (status === "done") {
      return "#10b981";
    }
    return "transparent";
  }

  function findFirstDelimiterIndex(line) {
    var colon = line.indexOf(":");
    var fullColon = line.indexOf("：");
    if (colon === -1) {
      return fullColon;
    }
    if (fullColon === -1) {
      return colon;
    }
    return Math.min(colon, fullColon);
  }

  function parseAcbCardMeta(text) {
    if (!text) {
      return null;
    }

    var startTag = "<ACB_CARD_META>";
    var endTag = "</ACB_CARD_META>";
    var start = text.indexOf(startTag);
    var end = text.indexOf(endTag);

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    var block = text.slice(start + startTag.length, end);
    var lines = block.split("\n");
    var raw = {};

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line) {
        continue;
      }

      var delimiter = findFirstDelimiterIndex(line);
      if (delimiter === -1) {
        continue;
      }

      var key = line.slice(0, delimiter).trim();
      var value = line.slice(delimiter + 1).trim();
      if (!key || !value) {
        continue;
      }
      raw[key] = value;
    }

    var parsedType = raw.feedbackType || raw.cardType || "";
    var feedbackType = normalizeEnum(parsedType, FEEDBACK_TYPES, "");
    var defaultBehavior = normalizeEnum(raw.defaultBehavior || "", DEFAULT_BEHAVIORS, "");
    var recommendedStatus = normalizeEnum(raw.recommendedStatus || "", RECOMMENDED_STATUSES, "");
    var attentionLevel = normalizeEnum(raw.attentionLevel || "", ATTENTION_LEVELS, "");
    var confidence = normalizeEnum(raw.confidence || "", CONFIDENCE_LEVELS, "");
    var needsExecution = normalizeBoolean(raw.needsExecution, null);

    var title = normalizeText(raw.title || "");
    var summary = normalizeText(raw.summary || "");
    var suggestedNextAction = normalizeText(raw.suggestedNextAction || "");

    if (
      !feedbackType &&
      !title &&
      !summary &&
      !defaultBehavior &&
      !recommendedStatus &&
      !attentionLevel &&
      needsExecution === null &&
      !suggestedNextAction &&
      !confidence
    ) {
      return null;
    }

    return {
      feedbackType: feedbackType || "content",
      title: title,
      summary: summary,
      defaultBehavior: defaultBehavior || "",
      recommendedStatus: recommendedStatus || "",
      attentionLevel: attentionLevel || "",
      needsExecution: needsExecution,
      suggestedNextAction: suggestedNextAction,
      confidence: confidence || "",
      metaSource: "acb_card_meta",
      userEdited: false
    };
  }

  function buildFallbackClassificationFromText(feedback) {
    var assistantText = normalizeText(feedback ? (feedback.assistantMessage || "") : "");
    var lower = assistantText.toLowerCase();

    var classification = {
      feedbackType: "content",
      defaultBehavior: "autoRead",
      recommendedStatus: "seen",
      attentionLevel: "low",
      needsExecution: false,
      confidence: "low",
      suggestedNextAction: "read_only",
      metaSource: "fallback_rule"
    };

    function hasAny(words) {
      for (var i = 0; i < words.length; i += 1) {
        if (lower.indexOf(words[i]) !== -1) {
          return true;
        }
      }
      return false;
    }

    var hasExecutionActor = hasAny(["codex", "claude code", "deepseek", "powershell"]);
    var hasExecutionAction = hasAny(["执行", "修复", "实现", "修改", "提交", "任务卡", "action steps", "implement", "fix"]);
    var hasTaskIntent = hasAny(["任务", "步骤", "请你", "需要", "please", "todo"]);

    if (hasExecutionActor || (hasExecutionAction && hasTaskIntent)) {
      classification.feedbackType = "execution";
      classification.defaultBehavior = "actionRequired";
      classification.recommendedStatus = "action_required";
      classification.attentionLevel = "urgent";
      classification.needsExecution = true;
      classification.confidence = "medium";
      classification.suggestedNextAction = "prepare_execution";
      return classification;
    }

    if (hasAny(["建议", "下一步", "可考虑", "暂缓", "recommend", "option"])) {
      classification.feedbackType = "recommendation";
      classification.defaultBehavior = "pendingDecision";
      classification.recommendedStatus = "pending";
      classification.attentionLevel = "medium";
      classification.needsExecution = false;
      classification.confidence = "medium";
      classification.suggestedNextAction = "review_and_decide";
      return classification;
    }

    if (hasAny(["原则", "战略", "架构", "边界", "产品方向", "strategy", "architecture", "principle"])) {
      classification.feedbackType = "strategy";
      classification.defaultBehavior = "pendingReview";
      classification.recommendedStatus = "pending";
      classification.attentionLevel = "high";
      classification.needsExecution = false;
      classification.confidence = "medium";
      classification.suggestedNextAction = "review_and_confirm";
      return classification;
    }

    if (hasAny(["通过", "不通过", "验收", "收口", "返工", "acceptance", "pass", "fail"])) {
      classification.feedbackType = "decision";
      classification.defaultBehavior = "pendingReview";
      classification.recommendedStatus = "pending";
      classification.attentionLevel = "high";
      classification.needsExecution = false;
      classification.confidence = "medium";
      classification.suggestedNextAction = "review_and_confirm";
      return classification;
    }

    return classification;
  }

  function buildClassificationKey(feedback) {
    if (!feedback) {
      return null;
    }
    var channelId = feedback.channelId || floatingSelectedChannelId;
    var idOrHash = feedback.id || feedback.hash || "";
    if (!channelId || !idOrHash) {
      return null;
    }
    return channelId + ":" + idOrHash;
  }

  function buildAutoClassification(feedback, channel) {
    var meta = parseAcbCardMeta(feedback ? (feedback.assistantMessage || "") : "");
    var auto = meta || buildFallbackClassificationFromText(feedback);

    var defaultTitle = trimToLength(feedback ? (feedback.assistantMessage || "") : "", 48) || "未命名反馈";
    var defaultSummary = trimToLength(feedback ? (feedback.assistantMessage || "") : "", 140);
    var now = new Date().toISOString();

    var classification = {
      id: "classification_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8),
      feedbackId: feedback.id || "",
      feedbackHash: feedback.hash || "",
      sourceChannelId: feedback.channelId || channel.id,
      sourceChannelName: feedback.channelName || channel.name,
      sourceChannelType: feedback.channelType || channel.type,
      feedbackType: normalizeEnum(auto.feedbackType || "content", FEEDBACK_TYPES, "content"),
      title: normalizeText(auto.title || "") || defaultTitle,
      summary: normalizeText(auto.summary || "") || defaultSummary,
      defaultBehavior: normalizeEnum(auto.defaultBehavior || "autoRead", DEFAULT_BEHAVIORS, "autoRead"),
      recommendedStatus: normalizeEnum(auto.recommendedStatus || "seen", RECOMMENDED_STATUSES, "seen"),
      attentionLevel: normalizeEnum(auto.attentionLevel || "low", ATTENTION_LEVELS, "low"),
      needsExecution: normalizeBoolean(auto.needsExecution, false),
      suggestedNextAction: normalizeText(auto.suggestedNextAction || ""),
      confidence: normalizeEnum(auto.confidence || "low", CONFIDENCE_LEVELS, "low"),
      metaSource: normalizeEnum(auto.metaSource || "fallback_rule", ["acb_card_meta", "fallback_rule", "manual"], "fallback_rule"),
      userEdited: false,
      createdAt: now,
      updatedAt: now
    };

    return classification;
  }

  function getCurrentClassification() {
    if (!currentClassificationKey) {
      return null;
    }
    return floatingFeedbackClassifications[currentClassificationKey] || null;
  }

  async function ensureSelectedFeedbackClassification() {
    var feedback = getSelectedFeedback();
    if (!feedback) {
      currentClassificationKey = null;
      return null;
    }

    var key = buildClassificationKey(feedback);
    if (!key) {
      currentClassificationKey = null;
      return null;
    }

    currentClassificationKey = key;

    if (floatingFeedbackClassifications[key]) {
      return floatingFeedbackClassifications[key];
    }

    var classification = buildAutoClassification(feedback, getChannelById(floatingSelectedChannelId));
    floatingFeedbackClassifications[key] = classification;
    await globalThis.AcbStorage.setFeedbackClassification(key, classification);
    return classification;
  }

  function getFeedbackTypeLabel(value) {
    return FEEDBACK_TYPE_LABELS[value] || value || "-";
  }

  function getDefaultBehaviorLabel(value) {
    return DEFAULT_BEHAVIOR_LABELS[value] || value || "-";
  }

  function getRecommendedStatusLabel(value) {
    return RECOMMENDED_STATUS_LABELS[value] || value || "-";
  }

  function getAttentionLevelLabel(value) {
    return ATTENTION_LEVEL_LABELS[value] || value || "-";
  }

  function getMetaSourceLabel(value) {
    return META_SOURCE_LABELS[value] || value || "-";
  }

  function getClassificationAccent(classification) {
    if (!classification) {
      return {
        border: "#cbd5e1",
        background: "#f8fafc"
      };
    }

    if (
      classification.needsExecution ||
      classification.feedbackType === "execution" ||
      classification.attentionLevel === "urgent" ||
      classification.recommendedStatus === "action_required"
    ) {
      return { border: "#dc2626", background: "#fef2f2" };
    }

    if (classification.recommendedStatus === "done" || classification.attentionLevel === "done") {
      return { border: "#16a34a", background: "#f0fdf4" };
    }

    if (classification.attentionLevel === "high") {
      return { border: "#ea580c", background: "#fff7ed" };
    }

    if (classification.attentionLevel === "medium") {
      return { border: "#d97706", background: "#fffbeb" };
    }

    return { border: "#64748b", background: "#f8fafc" };
  }

  function getLegacyCardStats() {
    var stats = {
      total: floatingCards.length,
      newCount: 0,
      pendingCount: 0,
      doneCount: 0,
      archivedCount: 0
    };

    for (var i = 0; i < floatingCards.length; i += 1) {
      var status = floatingCards[i].status;
      if (status === "new") {
        stats.newCount += 1;
      } else if (status === "pending") {
        stats.pendingCount += 1;
      } else if (status === "done") {
        stats.doneCount += 1;
      } else if (status === "archived") {
        stats.archivedCount += 1;
      }
    }

    return stats;
  }

  function renderClassificationDisplay() {
    var classification = getCurrentClassification();
    var hasClassification = Boolean(classification);
    var detected = hasClassification ? "true" : "false";
    var accent = getClassificationAccent(classification);
    var box = document.getElementById("acb-feedback-type-box");

    if (box) {
      box.style.borderColor = accent.border;
      box.style.background = accent.background;
    }

    setText(
      "acb-feedback-class-compact",
      hasClassification
        ? ("反馈: " + getFeedbackTypeLabel(classification.feedbackType) +
          " · 标题: " + summarizeTaskCardText(classification.title || "-", 26) +
          " · 摘要: " + summarizeTaskCardText(classification.summary || "-", 38))
        : "反馈: 未分类"
    );
    setText("acb-feedback-class-detected", detected);
    setText("acb-feedback-class-type", hasClassification ? getFeedbackTypeLabel(classification.feedbackType) : "-");
    setText("acb-feedback-class-title", hasClassification ? (classification.title || "-") : "-");
    setText("acb-feedback-class-summary", hasClassification ? (classification.summary || "-") : "-");
    setText("acb-feedback-class-default-behavior", hasClassification ? getDefaultBehaviorLabel(classification.defaultBehavior) : "-");
    setText("acb-feedback-class-recommended-status", hasClassification ? getRecommendedStatusLabel(classification.recommendedStatus) : "-");
    setText("acb-feedback-class-attention-level", hasClassification ? getAttentionLevelLabel(classification.attentionLevel) : "-");
    setText("acb-feedback-class-needs-execution", hasClassification ? (classification.needsExecution ? "是" : "否") : "-");
    setText("acb-feedback-class-next-action", hasClassification ? (classification.suggestedNextAction || "-") : "-");
    setText("acb-feedback-class-confidence", hasClassification ? (classification.confidence || "-") : "-");
    setText("acb-feedback-class-source", hasClassification ? getMetaSourceLabel(classification.metaSource) : "-");
    setText("acb-feedback-class-user-edited", hasClassification ? String(Boolean(classification.userEdited)) : "false");
  }

  function renderClassificationEditor() {
    var feedback = getSelectedFeedback();
    var hasFeedback = Boolean(feedback);
    var classification = getCurrentClassification();

    var typeSelect = document.getElementById("acb-feedback-type-select");
    var titleInput = document.getElementById("acb-feedback-title-input");
    var summaryInput = document.getElementById("acb-feedback-summary-input");
    var behaviorSelect = document.getElementById("acb-feedback-default-behavior-select");
    var statusSelect = document.getElementById("acb-feedback-recommended-status-select");
    var attentionSelect = document.getElementById("acb-feedback-attention-level-select");
    var executionSelect = document.getElementById("acb-feedback-needs-execution-select");
    var nextActionInput = document.getElementById("acb-feedback-next-action-input");
    var confidenceSelect = document.getElementById("acb-feedback-confidence-select");
    var saveBtn = document.getElementById("acb-feedback-save-btn");
    var resetBtn = document.getElementById("acb-feedback-reset-btn");

    var controls = [
      typeSelect, titleInput, summaryInput, behaviorSelect, statusSelect, attentionSelect,
      executionSelect, nextActionInput, confidenceSelect, saveBtn, resetBtn
    ];
    for (var i = 0; i < controls.length; i += 1) {
      if (controls[i]) {
        controls[i].disabled = !hasFeedback;
      }
    }

    if (!hasFeedback || !classification || !currentClassificationKey) {
      classificationDraftKey = null;
      setClassificationStatus("当前无反馈可分类。", true);
      return;
    }

    if (classificationDraftKey !== currentClassificationKey) {
      if (typeSelect) typeSelect.value = classification.feedbackType || "content";
      if (titleInput) titleInput.value = classification.title || "";
      if (summaryInput) summaryInput.value = classification.summary || "";
      if (behaviorSelect) behaviorSelect.value = classification.defaultBehavior || "autoRead";
      if (statusSelect) statusSelect.value = classification.recommendedStatus || "seen";
      if (attentionSelect) attentionSelect.value = classification.attentionLevel || "low";
      if (executionSelect) executionSelect.value = classification.needsExecution ? "true" : "false";
      if (nextActionInput) nextActionInput.value = classification.suggestedNextAction || "";
      if (confidenceSelect) confidenceSelect.value = classification.confidence || "low";
      classificationDraftKey = currentClassificationKey;
      setClassificationStatus("可手动修改后保存。", false);
    }
  }

  function getCurrentActionPlan() {
    if (!currentActionPlanKey) {
      return null;
    }
    return floatingActionPlans[currentActionPlanKey] || null;
  }

  /**
   * Unified active execution context — the single source of truth for
   * Payload Preflight UI/report/request and Readiness UI/report/request.
   *
   * Returns a normalized object used everywhere to prevent divergent
   * context-building paths.
   */
  function getActiveExecutionContext() {
    var feedback = getSelectedFeedback();
    var generateBtn = document.getElementById("acb-action-steps-generate-btn");
    if (generateBtn) {
      generateBtn.title = "生成当前任务卡动作步骤";
    }
    var plan = getCurrentActionPlan();
    var feedbackHash = feedback ? (feedback.hash || feedback.id || "no-feedback") : "no-feedback";
    var channelId = floatingSelectedChannelId || "no-channel";

    var stepIndex = -1;
    var taskCardId = "";
    var target = "";
    var payloadStatus = "unknown";
    var payloadType = "none";
    var canSendToAgent = false;

    // Active step selection: find the first non-controller complete payload.
    if (plan && Array.isArray(plan.steps)) {
      for (var i = 0; i < plan.steps.length; i++) {
        var st = plan.steps[i];
        var sv = st.payloadValidation || {};
        if (st.target !== "controller" && st.payloadStatus === "complete" && sv.canSendToAgent && st.fullTaskCard) {
          var activeRouteGate = applyRouteResultEligibility(st);
          stepIndex = i;
          payloadStatus = st.payloadStatus;
          payloadType = st.payloadType || "none";
          canSendToAgent = activeRouteGate.canSendToAgent === true;

          // --- taskCardId extraction priority ---
          // 1. step.taskCardId
          if (st.taskCardId && String(st.taskCardId).trim()) {
            taskCardId = String(st.taskCardId).trim();
          }
          // 2. payloadValidation.taskCardId
          if (!taskCardId && sv.taskCardId && String(sv.taskCardId).trim()) {
            taskCardId = String(sv.taskCardId).trim();
          }
          // 3. payloadValidation.startId
          if (!taskCardId && sv.startId && String(sv.startId).trim()) {
            taskCardId = String(sv.startId).trim();
          }
          // 4. payloadValidation.id
          if (!taskCardId && sv.id && String(sv.id).trim()) {
            taskCardId = String(sv.id).trim();
          }
          // 5. parse from fullTaskCard start marker
          if (!taskCardId && st.fullTaskCard) {
            var parsedFromCard = extractTaskCardFromAssistantMessage(st.fullTaskCard);
            if (parsedFromCard && parsedFromCard.startId) {
              taskCardId = parsedFromCard.startId;
            }
          }
          // 6. parse from step.payload / sourceTaskBlock if present
          if (!taskCardId && st.payload) {
            var parsedFromPayload = extractTaskCardFromAssistantMessage(String(st.payload));
            if (parsedFromPayload && parsedFromPayload.startId) {
              taskCardId = parsedFromPayload.startId;
            }
          }
          if (!taskCardId && st.sourceTaskBlock) {
            var parsedFromSource = extractTaskCardFromAssistantMessage(String(st.sourceTaskBlock));
            if (parsedFromSource && parsedFromSource.startId) {
              taskCardId = parsedFromSource.startId;
            }
          }

          // --- target extraction priority ---
          // 1. step.target
          if (st.target && String(st.target).trim()) {
            target = String(st.target).trim();
          }
          // 2. payloadValidation.target
          if (!target && sv.target && String(sv.target).trim()) {
            target = String(sv.target).trim();
          }
          // 3. parse target from fullTaskCard
          if (!target && st.fullTaskCard) {
            var parsedTarget = extractTaskCardFromAssistantMessage(st.fullTaskCard);
            if (parsedTarget && parsedTarget.target) {
              target = parsedTarget.target;
            }
          }
          // 4. parse target from step.payload / sourceTaskBlock
          if (!target && st.payload) {
            var parsedTargetPayload = extractTaskCardFromAssistantMessage(String(st.payload));
            if (parsedTargetPayload && parsedTargetPayload.target) {
              target = parsedTargetPayload.target;
            }
          }
          if (!target && st.sourceTaskBlock) {
            var parsedTargetSource = extractTaskCardFromAssistantMessage(String(st.sourceTaskBlock));
            if (parsedTargetSource && parsedTargetSource.target) {
              target = parsedTargetSource.target;
            }
          }

          break;
        }
      }
    }

    // Determine hasCompleteTaskCard and reason
    var hasCompleteTaskCard = payloadStatus === "complete" && Boolean(taskCardId) && Boolean(target);

    var reason = "";
    if (hasCompleteTaskCard) {
      reason = "complete_payload";
    } else if (payloadStatus === "complete" && !taskCardId) {
      reason = "invalid_complete_payload_missing_taskCardId";
      hasCompleteTaskCard = false;
    } else if (payloadStatus === "complete" && !target) {
      reason = "invalid_complete_payload_missing_target";
      hasCompleteTaskCard = false;
    } else {
      reason = "no_current_complete_payload";
    }

    // Context ID construction — never produce no-task-card when payloadStatus=complete
    var contextSuffix;
    if (hasCompleteTaskCard) {
      contextSuffix = taskCardId;
    } else if (payloadStatus === "complete" && !taskCardId) {
      contextSuffix = "invalid-complete-payload";
    } else {
      contextSuffix = "no-task-card";
    }
    var contextId = feedbackHash + "::" + channelId + "::" + stepIndex + "::" + contextSuffix;

    return {
      feedbackHash: feedbackHash,
      channelId: channelId,
      actionStepIndex: stepIndex,
      payloadStatus: payloadStatus,
      payloadType: payloadType,
      canSendToAgent: canSendToAgent,
      taskCardId: taskCardId,
      target: target,
      contextId: contextId,
      hasCompleteTaskCard: hasCompleteTaskCard,
      reason: reason
    };
  }

  function getExecutionContextForStep(step) {
    if (!step) {
      return getActiveExecutionContext();
    }
    var feedback = getSelectedFeedback();
    var plan = getCurrentActionPlan();
    var feedbackHash = feedback ? (feedback.hash || feedback.id || "no-feedback") : "no-feedback";
    var channelId = floatingSelectedChannelId || "no-channel";
    var stepIndex = (typeof step.order === "number" && step.order > 0) ? (step.order - 1) : -1;
    if (plan && Array.isArray(plan.steps)) {
      for (var i = 0; i < plan.steps.length; i += 1) {
        if (plan.steps[i] && step && plan.steps[i].id === step.id) {
          stepIndex = i;
          break;
        }
      }
    }
    var payloadStatus = step.payloadStatus || "unknown";
    var payloadType = step.payloadType || "none";
    var pv = step.payloadValidation || {};
    var routeGate = applyRouteResultEligibility(step);
    var canSendToAgent = routeGate.canSendToAgent === true;
    var taskCardId = (step.taskCardId && String(step.taskCardId).trim()) || "";
    if (!taskCardId && pv.taskCardId) {
      taskCardId = String(pv.taskCardId).trim();
    }
    if (!taskCardId && pv.startId) {
      taskCardId = String(pv.startId).trim();
    }
    if (!taskCardId && step.fullTaskCard) {
      var parsedForId = extractTaskCardFromAssistantMessage(step.fullTaskCard);
      taskCardId = parsedForId && parsedForId.startId ? String(parsedForId.startId).trim() : "";
    }
    var target = (step.target && String(step.target).trim()) || "";
    if (!target && pv.target) {
      target = String(pv.target).trim();
    }
    if (!target && step.fullTaskCard) {
      var parsedForTarget = extractTaskCardFromAssistantMessage(step.fullTaskCard);
      target = parsedForTarget && parsedForTarget.target ? String(parsedForTarget.target).trim() : "";
    }
    var hasCompleteTaskCard = payloadStatus === "complete" && Boolean(step.fullTaskCard) && Boolean(taskCardId) && Boolean(target);
    var reason = "";
    if (hasCompleteTaskCard) {
      reason = "complete_payload";
    } else if (payloadStatus === "complete" && !taskCardId) {
      reason = "invalid_complete_payload_missing_taskCardId";
    } else if (payloadStatus === "complete" && !target) {
      reason = "invalid_complete_payload_missing_target";
    } else {
      reason = "no_current_complete_payload";
    }
    var contextSuffix = hasCompleteTaskCard ? taskCardId : (payloadStatus === "complete" ? "invalid-complete-payload" : "no-task-card");
    var contextId = feedbackHash + "::" + channelId + "::" + stepIndex + "::" + contextSuffix;
    return {
      feedbackHash: feedbackHash,
      channelId: channelId,
      actionStepIndex: stepIndex,
      payloadStatus: payloadStatus,
      payloadType: payloadType,
      canSendToAgent: canSendToAgent,
      taskCardId: taskCardId,
      target: target,
      contextId: contextId,
      hasCompleteTaskCard: hasCompleteTaskCard,
      reason: reason
    };
  }

  /**
   * Check whether a cached preflight entry matches the active context.
   * Returns true if the entry's context matches the current context.
   */
  function preflightMatchesContext(entry, ctx) {
    if (!entry || !ctx) { return false; }
    // If entry has contextId, use exact match
    if (entry.contextId && ctx.contextId) {
      return entry.contextId === ctx.contextId;
    }
    // Fallback: match by taskCardId when hasCompleteTaskCard
    if (ctx.hasCompleteTaskCard && entry.taskCardId && ctx.taskCardId) {
      return entry.taskCardId === ctx.taskCardId;
    }
    return false;
  }

  function canGenerateActionSteps(classification) {
    return Boolean(
      classification &&
      (classification.feedbackType === "execution" || classification.needsExecution === true)
    );
  }

  function getActionTargetLabel(target) {
    return ACTION_TARGET_LABELS[target] || target || "未知";
  }

  function getActionStepStatusLabel(status) {
    return ACTION_STEP_STATUS_LABELS[status] || status || "pending";
  }

  function actionTextHasAny(lowerText, keywords) {
    for (var i = 0; i < keywords.length; i += 1) {
      if (lowerText.indexOf(String(keywords[i]).toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  }

  var REQUIRED_TASK_CARD_FIELDS = [
    "taskCardId", "target", "taskTitle", "projectDir", "currentBranch",
    "currentCommit", "objective", "allowedFiles", "forbiddenActions",
    "implementationRequirements", "checks", "gitBoundary", "reportFormat", "acceptanceCriteria"
  ];

  function preserveTaskCardFieldBoundaries(rawText) {
    if (!rawText) return { text: rawText, flattenedDetected: false };
    var knownFields = [
      "taskCardId", "target", "taskTitle", "projectDir", "currentBranch",
      "currentCommit", "objective", "background", "allowedFiles", "forbiddenActions",
      "implementationRequirements", "checks", "gitBoundary", "checkpointRequirement",
      "reportFormat", "acceptanceCriteria"
    ];
    var text = rawText;
    var flattenedDetected = false;
    for (var i = 0; i < knownFields.length; i += 1) {
      var field = knownFields[i];
      var escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("([^\"\\n])(" + escaped + ")[：:]", "g");
      var prev = text;
      text = text.replace(re, function (_m, before, fieldName) {
        flattenedDetected = true;
        return before + "\n" + fieldName + ":";
      });
      if (text === prev) {
        // Also try the reverse case: field label immediately after a newline-less word end
        var re2 = new RegExp("([^\"\\n])(" + escaped + ")\\s*[：:]\\s*", "g");
        text = text.replace(re2, function (_m2, before2, fieldName2) {
          flattenedDetected = true;
          return before2 + "\n" + fieldName2 + ": ";
        });
      }
    }
    return { text: text, flattenedDetected: flattenedDetected };
  }

  function extractTaskCardFromAssistantMessage(assistantMessage) {
    var text = String(assistantMessage || "");
    var result = {
      fullTaskCard: "",
      startDetected: false,
      endDetected: false,
      startCount: 0,
      endCount: 0,
      multipleTaskCardsDetected: false,
      truncatedSuspected: false,
      startId: "",
      endId: "",
      target: "",
      version: "",
      assistantMessageLength: text.length,
      extractedTaskCardLength: 0,
      extractionSource: "textContent_first",
      taskCardFlattenedDetected: false,
      fieldBoundaryPreserved: false
    };

    result.startCount = (text.match(/<ACB_TASK_CARD\s+/gi) || []).length;
    result.endCount = (text.match(/<ACB_TASK_CARD_END\s+/gi) || []).length;
    result.multipleTaskCardsDetected = result.startCount > 1 || result.endCount > 1;

    var startRegex = /<ACB_TASK_CARD\s+([^>]+)>/i;
    var startMatch = text.match(startRegex);
    if (!startMatch) {
      return result;
    }

    result.startDetected = true;
    var attrs = startMatch[1];

    var idMatch = attrs.match(/\bid\s*=\s*"([^"]*)"/i);
    if (idMatch) {
      result.startId = idMatch[1];
    }

    var targetMatch = attrs.match(/\btarget\s*=\s*"([^"]*)"/i);
    if (targetMatch) {
      result.target = targetMatch[1];
    }

    var versionMatch = attrs.match(/\bversion\s*=\s*"([^"]*)"/i);
    if (versionMatch) {
      result.version = versionMatch[1];
    }

    var startIndex = text.indexOf(startMatch[0]);
    var afterStart = text.slice(startIndex + startMatch[0].length);

    var endRegex = /<ACB_TASK_CARD_END\s+([^>]+)>/i;
    var endMatch = afterStart.match(endRegex);
    if (endMatch) {
      result.endDetected = true;
      var endAttrs = endMatch[1];
      var endIdMatch = endAttrs.match(/\bid\s*=\s*"([^"]*)"/i);
      if (endIdMatch) {
        result.endId = endIdMatch[1];
      }
      var endIndex = afterStart.indexOf(endMatch[0]);
      result.fullTaskCard = text.slice(startIndex, startIndex + startMatch[0].length + endIndex + endMatch[0].length);
    } else {
      result.fullTaskCard = text.slice(startIndex);
    }

    if (result.fullTaskCard.length > 0) {
      var boundaryResult = preserveTaskCardFieldBoundaries(result.fullTaskCard);
      result.taskCardFlattenedDetected = boundaryResult.flattenedDetected;
      result.fieldBoundaryPreserved = boundaryResult.flattenedDetected;
      result.fullTaskCard = boundaryResult.text;
    }
    result.extractedTaskCardLength = result.fullTaskCard.length;
    result.truncatedSuspected = result.startDetected && !result.endDetected;

    return result;
  }

  function getMissingTaskCardFields(taskCardBody) {
    var missing = [];
    for (var i = 0; i < REQUIRED_TASK_CARD_FIELDS.length; i += 1) {
      var fieldName = REQUIRED_TASK_CARD_FIELDS[i];
      if (taskCardBody.indexOf(fieldName + ":") === -1 && taskCardBody.indexOf(fieldName + "：") === -1) {
        missing.push(fieldName);
      }
    }
    return missing;
  }

  function cloneSimple(obj) {
    var out = {};
    var keys = Object.keys(obj);
    for (var ki = 0; ki < keys.length; ki += 1) {
      var k = keys[ki];
      var v = obj[k];
      if (Array.isArray(v)) {
        out[k] = v.slice();
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function validateTaskCardPayload(step, assistantMessage) {
    var target = step.target || "controller";

    var assistantMsgLen = String(assistantMessage || "").length;
    var basePayloadValidation = {
      hasPayload: false,
      hasStartMarker: false,
      hasEndMarker: false,
      taskCardIdMatched: false,
      targetMatched: false,
      multipleTaskCardsDetected: false,
      truncatedSuspected: false,
      requiredFieldsMissing: [],
      canSendToAgent: false,
      taskCardId: "",
      target: target,
      assistantMessageLength: assistantMsgLen,
      extractedTaskCardLength: 0,
      longTaskCardCaptureIncomplete: false,
      incompleteReason: "",
      taskCardFlattenedDetected: false,
      fieldBoundaryPreserved: false
    };

    if (target === "controller") {
      var pv1 = cloneSimple(basePayloadValidation);
      return {
        payloadType: "none",
        payloadSource: "none",
        fullTaskCard: "",
        payloadStatus: "not_applicable",
        payloadValidation: pv1
      };
    }

    var extracted = extractTaskCardFromAssistantMessage(assistantMessage);
    assistantMsgLen = extracted.assistantMessageLength;

    if (!extracted.startDetected) {
      var pv2 = cloneSimple(basePayloadValidation);
      pv2.assistantMessageLength = assistantMsgLen;
      return {
        payloadType: "none",
        payloadSource: "none",
        fullTaskCard: "",
        payloadStatus: "missing",
        payloadValidation: pv2
      };
    }

    var hasStartMarker = extracted.startDetected;
    var hasEndMarker = extracted.endDetected;
    var taskCardIdMatched = hasStartMarker && hasEndMarker && extracted.startId === extracted.endId;
    var targetMatched = normalizeExecutorTargetAlias(extracted.target) === normalizeExecutorTargetAlias(target);
    var multipleTaskCardsDetected = Boolean(extracted.multipleTaskCardsDetected);
    var truncatedSuspected = Boolean(extracted.truncatedSuspected);
    var missingFields = [];
    var hasPayload = extracted.fullTaskCard.length > 0;
    var longTaskCardCaptureIncomplete = hasStartMarker && !hasEndMarker;
    var incompleteReason = "";

    if (longTaskCardCaptureIncomplete) {
      incompleteReason = "long_task_card_capture_incomplete: start marker present but end marker missing — task card may be too long for DOM capture";
    }

    if (hasStartMarker && hasEndMarker) {
      missingFields = getMissingTaskCardFields(extracted.fullTaskCard);
    }

    var allChecksPassed = hasPayload &&
      hasStartMarker &&
      hasEndMarker &&
      taskCardIdMatched &&
      targetMatched &&
      missingFields.length === 0 &&
      !multipleTaskCardsDetected &&
      !truncatedSuspected;

    if (!allChecksPassed && !incompleteReason) {
      if (!hasEndMarker) {
        incompleteReason = "missing_end_marker";
      } else if (!taskCardIdMatched) {
        incompleteReason = "task_card_id_mismatch";
      } else if (!targetMatched) {
        incompleteReason = "target_mismatch";
      } else if (missingFields.length > 0) {
        incompleteReason = "missing_required_fields: " + missingFields.join(", ");
      } else if (multipleTaskCardsDetected) {
        incompleteReason = "multiple_task_cards_detected";
      } else if (truncatedSuspected) {
        incompleteReason = "truncation_suspected";
      }
    }

    return {
      payloadType: hasStartMarker ? "full_task_card" : "none",
      payloadSource: hasStartMarker ? "assistant_message" : "none",
      fullTaskCard: extracted.fullTaskCard,
      payloadStatus: allChecksPassed ? "complete" : (hasStartMarker ? "incomplete" : "missing"),
      taskCardId: extracted.startId || "",
      payloadValidation: {
        hasPayload: hasPayload,
        hasStartMarker: hasStartMarker,
        hasEndMarker: hasEndMarker,
        taskCardIdMatched: taskCardIdMatched,
        targetMatched: targetMatched,
        multipleTaskCardsDetected: multipleTaskCardsDetected,
        truncatedSuspected: truncatedSuspected,
        requiredFieldsMissing: missingFields,
        canSendToAgent: allChecksPassed,
        taskCardId: extracted.startId || "",
        target: extracted.target || "",
        assistantMessageLength: assistantMsgLen,
        extractedTaskCardLength: extracted.fullTaskCard.length,
        longTaskCardCaptureIncomplete: longTaskCardCaptureIncomplete,
        incompleteReason: incompleteReason,
        taskCardFlattenedDetected: Boolean(extracted.taskCardFlattenedDetected),
        fieldBoundaryPreserved: Boolean(extracted.fieldBoundaryPreserved)
      }
    };
  }

  function inferActionTargetFromText(text) {
    var lower = String(text || "").toLowerCase();

    if (actionTextHasAny(lower, ["codex"])) {
      return "codex";
    }
    if (actionTextHasAny(lower, ["claude code", "claude"])) {
      return "claude";
    }
    if (actionTextHasAny(lower, ["deepseek"])) {
      return "deepseek";
    }
    if (actionTextHasAny(lower, ["powershell", "命令", "command"])) {
      return "powershell";
    }
    if (actionTextHasAny(lower, ["git", "commit", "status", "diff"])) {
      return "git";
    }
    if (actionTextHasAny(lower, ["文档", "markdown", "docs"])) {
      return "docs";
    }
    if (actionTextHasAny(lower, ["总控", "审查", "决策", "改写", "批准", "转派", "controller", "review"])) {
      return "controller";
    }
    return "controller";
  }

  function createActionStep(order, target, title, summary, detail) {
    var now = new Date().toISOString();
    return {
      id: "step_" + order + "_" + Math.random().toString(16).slice(2, 8),
      order: order,
      target: normalizeEnum(target, ACTION_STEP_TARGETS, "controller"),
      title: normalizeText(title || ""),
      summary: normalizeText(summary || ""),
      detail: normalizeText(detail || ""),
      status: "pending",
      taskCardId: "",
      payloadType: "none",
      payloadSource: "none",
      fullTaskCard: "",
      payloadStatus: "not_applicable",
      payloadValidation: {
        hasPayload: false,
        hasStartMarker: false,
        hasEndMarker: false,
        taskCardIdMatched: false,
        targetMatched: false,
        multipleTaskCardsDetected: false,
        truncatedSuspected: false,
        requiredFieldsMissing: [],
        canSendToAgent: false,
        taskCardId: "",
        target: ""
      },
      createdAt: now,
      updatedAt: now
    };
  }

  function buildActionPlanFromFeedback(feedback, classification) {
    var channel = getChannelById(feedback.channelId || floatingSelectedChannelId);
    var feedbackText = normalizeText(feedback.assistantMessage || "");
    var lower = feedbackText.toLowerCase();
    var planKey = buildClassificationKey(feedback);
    var now = new Date().toISOString();
    var steps = [];

    var taskCardExtract = extractTaskCardFromAssistantMessage(feedbackText);
    var hasCompleteTaskCard = taskCardExtract.startDetected && taskCardExtract.endDetected &&
      taskCardExtract.startId && taskCardExtract.endId &&
      taskCardExtract.startId === taskCardExtract.endId && Boolean(taskCardExtract.target);

    if (hasCompleteTaskCard) {
      var rawTaskCardTarget = normalizeText(taskCardExtract.target).toLowerCase();
      var taskCardTarget = normalizeEnum(rawTaskCardTarget, ACTION_STEP_TARGETS, "unknown");
      steps.push(createActionStep(
        1,
        taskCardTarget,
        "执行 ACB_TASK_CARD: " + (taskCardExtract.startId || ""),
        "从 assistantMessage 中提取到完整 ACB_TASK_CARD，目标执行端为 " + getActionTargetLabel(taskCardTarget) + "。",
        "完整任务卡内容已保存到 fullTaskCard 字段，可直接发送给 Agent 执行。"
      ));
    } else {
      var isExecutionType = classification && classification.feedbackType === "execution";
      var needsExecution = classification && classification.needsExecution === true;
      var hasTaskCue = actionTextHasAny(lower, [
        "任务卡", "复制给", "copy to", "交给", "codex", "claude", "deepseek", "powershell", "git", "docs", "action steps"
      ]);
      var advisorCue = actionTextHasAny(lower, [
        "建议", "审查", "草案", "交接", "可考虑", "下一步", "review", "proposal", "draft", "handoff"
      ]);
      var explicitApprovalCue = actionTextHasAny(lower, [
        "已批准", "批准", "通过", "请执行", "立即执行", "approved", "approved task", "execute now"
      ]);

    if (!isExecutionType && needsExecution) {
      steps.push(createActionStep(
        1,
        "controller",
        "确认执行需求",
        "当前反馈标记为需要执行，但类型不是 execution，需要先确认执行边界。",
        "请总控先确认边界、风险和优先级，再决定是否转为正式执行任务卡。"
      ));
    } else if (channel.type === "controller" && hasTaskCue && (explicitApprovalCue || inferActionTargetFromText(feedbackText) !== "controller")) {
      var inferredTarget = inferActionTargetFromText(feedbackText);
      steps.push(createActionStep(
        1,
        inferredTarget,
        "执行当前反馈中的任务卡",
        "将当前反馈中的执行任务交给指定执行端处理。",
        "使用当前 assistantMessage 作为初始任务来源，展开后复制给执行端处理。"
      ));
      steps.push(createActionStep(
        2,
        "controller",
        "回报审查",
        "执行端完成后，将回报交回总控审查。",
        "总控根据回报判断是否通过、返工或进入下一步。"
      ));
    } else if (channel.type === "advisor" || advisorCue) {
      steps.push(createActionStep(
        1,
        "controller",
        "审查顾问任务建议",
        "当前反馈可能是顾问提交给总控的任务建议，需要总控判断是否采纳。",
        "总控应审查该建议是否符合产品战略、当前阶段、合规边界和任务优先级。"
      ));
      steps.push(createActionStep(
        2,
        "controller",
        "改写为执行任务卡",
        "若总控采纳该建议，应将其改写为边界清晰的执行任务卡。",
        "执行任务卡应明确允许修改文件、禁止事项、验收标准、Git 边界和完成回报格式。"
      ));
    } else {
      steps.push(createActionStep(
        1,
        "controller",
        "复核执行意图",
        "当前反馈被识别为执行型，但需要总控确认是否拆任务。",
        "请用户或总控确认是否需要将其转为正式任务卡。"
      ));
    }
    } // end else block: no complete ACB_TASK_CARD

    for (var si = 0; si < steps.length; si += 1) {
      var step = steps[si];
      if (step.target === "controller") {
        step.payloadStatus = "not_applicable";
        step.payloadValidation.canSendToAgent = false;
      } else {
        var payload = validateTaskCardPayload(step, feedbackText);
        step.payloadType = payload.payloadType;
        step.payloadSource = payload.payloadSource;
        step.fullTaskCard = payload.fullTaskCard;
        step.payloadStatus = payload.payloadStatus;
        step.payloadValidation = payload.payloadValidation;
        step.taskCardId = payload.taskCardId || "";
      }
      refreshActionStepRouteResult(step, si, {
        feedback: feedback,
        classification: classification,
        channel: channel
      });
    }

    return {
      id: "action_plan_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8),
      feedbackId: feedback.id || "",
      feedbackHash: feedback.hash || "",
      sourceChannelId: feedback.channelId || channel.id,
      sourceChannelName: feedback.channelName || channel.name,
      classificationKey: planKey || "",
      createdAt: now,
      updatedAt: now,
      status: "draft",
      steps: steps
    };
  }

  async function generateActionStepsForCurrentFeedback() {
    var feedback = getSelectedFeedback();
    var classification = getCurrentClassification();

    if (!feedback || !classification) {
      setActionStepsStatus("未选择反馈。", true);
      return;
    }

    if (!canGenerateActionSteps(classification)) {
      setActionStepsStatus("当前反馈不需要执行。", true);
      return;
    }

    var key = buildClassificationKey(feedback);
    if (!key) {
      setActionStepsStatus("动作计划 key 无效。", true);
      return;
    }

    var plan = buildActionPlanFromFeedback(feedback, classification);
    if (!ACTION_PLAN_STATUSES.includes(plan.status)) {
      plan.status = "draft";
    }

    floatingActionPlans[key] = plan;
    currentActionPlanKey = key;
    await globalThis.AcbStorage.setActionPlan(key, plan);
    renderActionStepsSection();
    setActionStepsStatus("动作步骤已生成（草稿）。", false);
    setStatus("动作步骤已生成");
  }

  async function updateActionStepInPlan(stepId, patch) {
    var plan = getCurrentActionPlan();
    if (!plan || !stepId || !patch) {
      return;
    }

    var changed = false;
    var now = new Date().toISOString();
    var nextSteps = [];

    for (var i = 0; i < plan.steps.length; i += 1) {
      var step = plan.steps[i];
      if (step.id !== stepId) {
        nextSteps.push(step);
        continue;
      }

      changed = true;
      nextSteps.push(Object.assign({}, step, patch, {
        target: normalizeEnum((patch.target || step.target), ACTION_STEP_TARGETS, "controller"),
        status: normalizeEnum((patch.status || step.status), ACTION_STEP_STATUSES, "pending"),
        title: normalizeText((patch.title !== undefined ? patch.title : step.title) || ""),
        summary: normalizeText((patch.summary !== undefined ? patch.summary : step.summary) || ""),
        detail: normalizeText((patch.detail !== undefined ? patch.detail : step.detail) || ""),
        updatedAt: now
      }));
    }

    if (!changed) {
      return;
    }

    var nextPlan = Object.assign({}, plan, {
      steps: nextSteps,
      updatedAt: now
    });

    if (!ACTION_PLAN_STATUSES.includes(nextPlan.status)) {
      nextPlan.status = "draft";
    }

    floatingActionPlans[currentActionPlanKey] = nextPlan;
    await globalThis.AcbStorage.setActionPlan(currentActionPlanKey, nextPlan);
    renderActionStepsSection();
    setActionStepsStatus("步骤已更新。", false);
  }

  // --- Payload status / target display helpers ---

  function getPayloadStatusLabel(status) {
    var map = {
      complete: "完整",
      missing: "缺失",
      incomplete: "不完整",
      not_applicable: "不适用"
    };
    return map[status] || status || "未知";
  }

  function getPayloadStatusBadgeColor(status) {
    var map = {
      complete: "#16a34a",
      missing: "#dc2626",
      incomplete: "#ea580c",
      not_applicable: "#6b7280"
    };
    return map[status] || "#6b7280";
  }

  function getTargetBadgeColor(target) {
    if (target === "controller") {
      return "#6b7280";
    }
    if (target === "deepseek") {
      return "#6366f1";
    }
    if (target === "claude") {
      return "#d97706";
    }
    if (target === "codex") {
      return "#0ea5e9";
    }
    return "#64748b";
  }

  function getCopyButtonLabel(target) {
    var map = {
      deepseek: "复制给 DeepSeek",
      codex: "复制给 Codex",
      claude: "复制给 Claude",
      powershell: "复制给 PowerShell",
      git: "复制给 Git",
      docs: "复制给 Docs",
      manual: "复制给手工执行",
      user: "复制给用户"
    };
    return map[target] || ("复制给目标执行端 (" + (target || "unknown") + ")");
  }

  // --- Payload detail viewer ---

  function injectPayloadDetailViewer() {
    if (document.getElementById("acb-payload-detail-panel")) {
      return;
    }

    var panel = document.createElement("div");
    panel.id = "acb-payload-detail-panel";
    panel.style.cssText = [
      "display:none",
      "position:fixed",
      "right:652px",
      "top:72px",
      "width:560px",
      "max-height:calc(100vh - 120px)",
      "z-index:2147483645",
      "background:#fff",
      "border:1px solid #d0d0d0",
      "border-radius:8px",
      "box-shadow:0 4px 24px rgba(0,0,0,0.2)",
      "font-family:Arial,sans-serif",
      "font-size:13px",
      "color:#222",
      "flex-direction:column",
      "overflow:hidden"
    ].join(";");

    var header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1e1e2e;color:#fff;flex-shrink:0;";
    var title = document.createElement("span");
    title.id = "acb-payload-detail-title";
    title.textContent = "Payload 详情";
    title.style.cssText = "font-size:14px;font-weight:bold;";
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "X";
    closeBtn.style.cssText = "background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:2px 6px;";
    closeBtn.addEventListener("click", closePayloadDetailViewer);
    header.appendChild(title);
    header.appendChild(closeBtn);

    var metaBar = document.createElement("div");
    metaBar.id = "acb-payload-detail-meta";
    metaBar.style.cssText = "display:flex;gap:10px;padding:8px 16px;border-bottom:1px solid #e0e0e0;background:#fafafa;flex-wrap:wrap;flex-shrink:0;font-size:12px;";

    var body = document.createElement("div");
    body.style.cssText = "flex:1;display:flex;flex-direction:column;gap:10px;overflow:hidden;padding:10px 12px;background:#f8fafc;";

    var topOverview = document.createElement("div");
    topOverview.style.cssText = "padding:10px;border:1px solid #dbeafe;background:#eff6ff;border-radius:6px;flex-shrink:0;";
    var topHeading = document.createElement("h3");
    topHeading.textContent = "项目状态总览";
    topHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#1d4ed8;";
    topOverview.appendChild(topHeading);
    addFeedbackRow(topOverview, "Project", "acb-payload-top-project-name");
    addFeedbackRow(topOverview, "Bridge", "acb-payload-top-bridge-status");
    addFeedbackRow(topOverview, "Branch", "acb-payload-top-branch");
    addFeedbackRow(topOverview, "Commit", "acb-payload-top-commit");
    addFeedbackRow(topOverview, "Working Tree", "acb-payload-top-working-tree");
    addFeedbackRow(topOverview, "Safety Mode", "acb-payload-top-safety-mode");
    addFeedbackRow(topOverview, "Selected Channel", "acb-payload-top-selected-channel");
    addFeedbackRow(topOverview, "Selected Status", "acb-payload-top-selected-status");
    addFeedbackRow(topOverview, "Selected Hash", "acb-payload-top-selected-hash");
    var topActions = document.createElement("div");
    topActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;";
    topActions.appendChild(makeActionBtn("刷新项目状态", function () {
      testProjectStatus().catch(function (err) {
        console.error("[ACB][floating-console] top refresh project status error", err);
      });
    }));
    topActions.appendChild(makeActionBtn("刷新 Bridge 状态", function () {
      testLocalBridge().catch(function (err) {
        console.error("[ACB][floating-console] top refresh bridge error", err);
      });
    }));
    var settingsPlaceholderBtn = makeActionBtn("设置（未开放）", function () {});
    settingsPlaceholderBtn.disabled = true;
    settingsPlaceholderBtn.style.cursor = "not-allowed";
    settingsPlaceholderBtn.style.opacity = "0.6";
    topActions.appendChild(settingsPlaceholderBtn);
    if (topActions.children.length > 1) {
      topActions.removeChild(topActions.children[1]);
    }
    var safetyEntryBtn = makeActionBtn("鍙閿佸畾鍏ュ彛", function () {});
    safetyEntryBtn.disabled = true;
    safetyEntryBtn.style.cursor = "not-allowed";
    safetyEntryBtn.style.opacity = "0.6";
    safetyEntryBtn.title = "褰撳墠浠呮樉绀哄彧璇婚攣瀹氱姸鎬侊紝鏆備笉鏀寔瑙ｉ攣";
    topActions.appendChild(safetyEntryBtn);
    var moreInfoBtn = makeActionBtn("鏇村淇℃伅", function () {
      compactDetails.open = !compactDetails.open;
    });
    topActions.appendChild(moreInfoBtn);
    var topActionButtons = topActions.querySelectorAll("button");
    for (var ta = 0; ta < topActionButtons.length; ta += 1) {
      topActionButtons[ta].style.padding = "2px 8px";
      topActionButtons[ta].style.fontSize = "11px";
      topActionButtons[ta].style.borderRadius = "999px";
    }
    topActions.style.cssText = "display:flex;gap:5px;flex-wrap:nowrap;align-items:center;margin-left:auto;white-space:nowrap;";
    topStrip.appendChild(topActions);

    var middleWrap = document.createElement("div");
    middleWrap.style.cssText = "display:grid;grid-template-columns:minmax(240px, 26%) minmax(420px, 48%) minmax(240px, 26%);gap:10px;flex:1;min-height:0;";
    var leftCol = document.createElement("div");
    leftCol.style.cssText = "min-height:0;overflow:auto;padding-right:2px;";
    var centerCol = document.createElement("div");
    centerCol.style.cssText = "min-height:0;overflow:auto;padding-right:2px;display:flex;flex-direction:column;gap:10px;";
    var rightCol = document.createElement("div");
    rightCol.style.cssText = "min-height:0;overflow:auto;padding-right:2px;";

    var payloadContent = document.createElement("pre");
    payloadContent.id = "acb-payload-detail-content";
    payloadContent.style.cssText = "margin:0;padding:10px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;";
    body.appendChild(payloadContent);

    var footer = document.createElement("div");
    footer.id = "acb-payload-detail-footer";
    footer.style.cssText = "display:flex;gap:8px;padding:10px 16px;border-top:1px solid #e0e0e0;background:#fafafa;flex-shrink:0;align-items:center;";

    var copyBtn = document.createElement("button");
    copyBtn.id = "acb-payload-detail-copy-btn";
    copyBtn.type = "button";
    copyBtn.textContent = "复制完整任务卡";
    copyBtn.style.cssText = "padding:6px 16px;border:1px solid #1976d2;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;";

    var closeFooterBtn = document.createElement("button");
    closeFooterBtn.type = "button";
    closeFooterBtn.textContent = "关闭";
    closeFooterBtn.style.cssText = "padding:6px 16px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;";
    closeFooterBtn.addEventListener("click", closePayloadDetailViewer);

    var footerStatus = document.createElement("span");
    footerStatus.id = "acb-payload-detail-copy-status";
    footerStatus.style.cssText = "font-size:11px;color:#666;margin-left:8px;";

    footer.appendChild(copyBtn);
    footer.appendChild(closeFooterBtn);
    footer.appendChild(footerStatus);

    panel.appendChild(header);
    panel.appendChild(metaBar);
    panel.appendChild(body);
    panel.appendChild(footer);

    document.body.appendChild(panel);
  }

  var _payloadDetailStepRef = null;

  function setPayloadDetailPlaceholder(message) {
    var panel = document.getElementById("acb-payload-detail-panel");
    if (!panel) {
      return;
    }
    var msg = message || "请选择一个任务卡查看详情。";
    var titleEl = document.getElementById("acb-payload-detail-title");
    if (titleEl) {
      titleEl.textContent = "任务详情 / Payload Detail";
    }
    var metaEl = document.getElementById("acb-payload-detail-meta");
    if (metaEl) {
      metaEl.textContent = "未选择任务卡。";
    }
    var contentEl = document.getElementById("acb-payload-detail-content");
    if (contentEl) {
      contentEl.textContent = msg;
    }
    var copyBtn = document.getElementById("acb-payload-detail-copy-btn");
    if (copyBtn) {
      copyBtn.disabled = true;
      copyBtn.style.opacity = "0.6";
      copyBtn.style.cursor = "not-allowed";
      copyBtn.style.background = "#e2e8f0";
      copyBtn.style.borderColor = "#94a3b8";
      copyBtn.style.color = "#64748b";
    }
    var footerStatus = document.getElementById("acb-payload-detail-copy-status");
    if (footerStatus) {
      footerStatus.textContent = "";
    }
    panel.style.display = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? "flex" : "none";
    if (panel.style.display !== "none" && typeof panel.scrollIntoView === "function") {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function normalizeConsoleDisplayMode(mode) {
    return mode === CONSOLE_DISPLAY_MODE_DEBUG ? CONSOLE_DISPLAY_MODE_DEBUG : CONSOLE_DISPLAY_MODE_NORMAL;
  }

  function hasExplicitConsoleDisplayMode(state) {
    return Boolean(state && state.consoleDisplayModeExplicit === true);
  }

  async function loadFloatingConsoleDisplayMode() {
    try {
      var state = await globalThis.AcbStorage.getUiState();
      floatingConsoleDisplayMode = hasExplicitConsoleDisplayMode(state)
        ? normalizeConsoleDisplayMode(state && state.consoleDisplayMode)
        : CONSOLE_DISPLAY_MODE_NORMAL;
    } catch (_e) {
      floatingConsoleDisplayMode = CONSOLE_DISPLAY_MODE_NORMAL;
    }
  }

  async function persistFloatingConsoleDisplayMode(mode) {
    var next = normalizeConsoleDisplayMode(mode);
    floatingConsoleDisplayMode = next;
    try {
      var uiState = await globalThis.AcbStorage.getUiState();
      uiState = uiState && typeof uiState === "object" ? uiState : {};
      uiState.consoleDisplayMode = next;
      uiState.consoleDisplayModeExplicit = true;
      uiState.consoleDisplayModeUpdatedAt = new Date().toISOString();
      await new Promise(function (resolve) {
        chrome.storage.local.set({ [globalThis.AcbStorage.UI_STATE_KEY]: uiState }, function () {
          resolve();
        });
      });
    } catch (_e) {
      // Keep runtime mode even if persistence fails
    }
  }

  function setFieldRowVisibility(fieldId, visible) {
    var el = document.getElementById(fieldId);
    if (!el || !el.parentElement) {
      return;
    }
    el.parentElement.style.display = visible ? "" : "none";
  }

  function setElementVisibilityById(id, visible) {
    var el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.style.display = visible ? "" : "none";
  }

  function ensureConsoleDisplayModeStyle() {
    if (document.getElementById("acb-console-display-mode-style")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "acb-console-display-mode-style";
    style.textContent = [
      "#acb-floating-console.acb-display-mode-normal [data-acb-mode=\"debug\"]{display:none!important;}",
      "#acb-floating-console.acb-display-mode-debug [data-acb-mode=\"normal-hidden\"]{display:none!important;}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function applyConsoleDisplayMode() {
    var isDebugMode = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG;
    var root = document.getElementById("acb-floating-console");
    if (root) {
      root.dataset.acbDisplayMode = isDebugMode ? CONSOLE_DISPLAY_MODE_DEBUG : CONSOLE_DISPLAY_MODE_NORMAL;
      root.classList.toggle("acb-display-mode-debug", isDebugMode);
      root.classList.toggle("acb-display-mode-normal", !isDebugMode);
    }

    var normalBtn = document.getElementById("acb-console-mode-normal-btn");
    var debugBtn = document.getElementById("acb-console-mode-debug-btn");
    if (normalBtn) {
      normalBtn.style.background = isDebugMode ? "#fff" : "#2563eb";
      normalBtn.style.color = isDebugMode ? "#2563eb" : "#fff";
      normalBtn.style.borderColor = "#2563eb";
    }
    if (debugBtn) {
      debugBtn.style.background = isDebugMode ? "#2563eb" : "#fff";
      debugBtn.style.color = isDebugMode ? "#fff" : "#2563eb";
      debugBtn.style.borderColor = "#2563eb";
    }

    var debugHint = document.getElementById("acb-console-mode-debug-hint");
    if (debugHint) {
      debugHint.style.display = isDebugMode ? "" : "none";
      debugHint.textContent = isDebugMode ? "调试信息已展开" : "";
    }

    setElementVisibilityById("acb-debug-section", isDebugMode);
    setElementVisibilityById("acb-bridge-details", isDebugMode);
    setElementVisibilityById("acb-runtime-details", isDebugMode);
    setElementVisibilityById("acb-legacy-section", isDebugMode);
    setElementVisibilityById("acb-safety-section", isDebugMode);

    setFieldRowVisibility("acb-float-conversation-id", isDebugMode);
    setFieldRowVisibility("acb-float-source-url", isDebugMode);
    setFieldRowVisibility("acb-float-hash", isDebugMode);
    setFieldRowVisibility("acb-top-selected-hash", isDebugMode);
    setFieldRowVisibility("acb-top-selected-channel", isDebugMode);
    setFieldRowVisibility("acb-top-layout-version", isDebugMode);
    setFieldRowVisibility("acb-top-generated-at", isDebugMode);
    setFieldRowVisibility("acb-top-project-path", isDebugMode);
    setFieldRowVisibility("acb-top-git-root", isDebugMode);
    setFieldRowVisibility("acb-top-preflight-status", isDebugMode);
    setFieldRowVisibility("acb-top-readiness-status", isDebugMode);
    setFieldRowVisibility("acb-top-review-status", isDebugMode);
    setFieldRowVisibility("acb-float-last-user", isDebugMode);
    setFieldRowVisibility("acb-float-assistant", isDebugMode);
    setElementVisibilityById("acb-top-safety-flags-line", isDebugMode);

    var payloadDetailPanel = document.getElementById("acb-payload-detail-panel");
    if (payloadDetailPanel && !isDebugMode && !_payloadDetailStepRef) {
      payloadDetailPanel.style.display = "none";
    }

    var classificationEditorIds = [
      "acb-feedback-type-select",
      "acb-feedback-title-input",
      "acb-feedback-summary-input",
      "acb-feedback-default-behavior-select",
      "acb-feedback-recommended-status-select",
      "acb-feedback-attention-level-select",
      "acb-feedback-needs-execution-select",
      "acb-feedback-next-action-input",
      "acb-feedback-confidence-select",
      "acb-feedback-save-btn",
      "acb-feedback-reset-btn",
      "acb-feedback-class-edit-status"
    ];
    for (var cei = 0; cei < classificationEditorIds.length; cei += 1) {
      setElementVisibilityById(classificationEditorIds[cei], isDebugMode);
    }

    var debugOnlyEls = document.querySelectorAll("[data-acb-mode='debug']");
    for (var i = 0; i < debugOnlyEls.length; i += 1) {
      debugOnlyEls[i].style.display = isDebugMode ? "" : "none";
    }
  }

  function openPayloadDetailViewer(step) {
    injectPayloadDetailViewer();

    _payloadDetailStepRef = step;
    var panel = document.getElementById("acb-payload-detail-panel");
    if (!panel || !step) {
      return;
    }
    panel.dataset.acbMode = "debug";
    if (floatingConsoleDisplayMode !== CONSOLE_DISPLAY_MODE_DEBUG) {
      panel.style.display = "none";
      applyConsoleDisplayMode();
      return;
    }

    var pv = step.payloadValidation || {};
    var statusLabel = getPayloadStatusLabel(step.payloadStatus);
    var statusColor = getPayloadStatusBadgeColor(step.payloadStatus);

    var titleEl = document.getElementById("acb-payload-detail-title");
    if (titleEl) {
      titleEl.textContent = "Payload 详情 — " + getActionTargetLabel(step.target);
    }

    var metaEl = document.getElementById("acb-payload-detail-meta");
    if (metaEl) {
      metaEl.innerHTML =
        "<span>目标执行端: <strong>" + getActionTargetLabel(step.target) + " (" + (step.target || "unknown") + ")</strong></span>" +
        "<span>载荷状态: <strong style=\"color:" + statusColor + ";\">" + statusLabel + " (" + (step.payloadStatus || "not_applicable") + ")</strong></span>" +
        "<span>可发送给 Agent: <strong>" + (pv.canSendToAgent ? "是" : "否") + "</strong></span>";
    }

    var contentEl = document.getElementById("acb-payload-detail-content");
    if (contentEl) {
      var plan = getCurrentActionPlan();
      var stepIndex = 0;
      if (plan && Array.isArray(plan.steps)) {
        for (var si = 0; si < plan.steps.length; si += 1) {
          if (plan.steps[si] && plan.steps[si].id === step.id) {
            stepIndex = si;
            break;
          }
        }
      }
      var sourceMeta = buildSourceMetadataForStep(step, stepIndex);
      var activeCtx = getActiveExecutionContext();
      var preflightStatus = "not_run";
      var preflightMatched = false;
      if (floatingPreflightLatest && floatingPreflightLatest.data && floatingPreflightLatest.data.preflight) {
        preflightMatched = preflightMatchesContext(floatingPreflightLatest, activeCtx);
        preflightStatus = preflightMatched ? (floatingPreflightLatest.data.preflight.status || "unknown") : "stale_ignored";
      }
      var readinessStatus = "not_run";
      var readinessContextMatched = false;
      if (floatingReadinessLatest && floatingReadinessLatest.data && floatingReadinessLatest.data.readiness) {
        var rd = floatingReadinessLatest.data.readiness;
        readinessStatus = rd.status || "unknown";
        readinessContextMatched = Boolean(activeCtx && rd.requestContextId && rd.requestContextId === activeCtx.contextId);
      }
      var missingList = Array.isArray(pv.requiredFieldsMissing) ? pv.requiredFieldsMissing.join(", ") : "无";

      var detailText = "";
      detailText += "【任务摘要】\n";
      detailText += "标题: " + (step.title || "无") + "\n";
      detailText += "摘要: " + (step.summary || "无") + "\n";
      detailText += "详情: " + (step.detail || "无") + "\n\n";

      detailText += "【来源元数据】\n";
      detailText += "sourceChannelId: " + (sourceMeta.sourceChannelId || "unknown") + "\n";
      detailText += "sourceDisplayName: " + (sourceMeta.sourceDisplayName || "unknown") + "\n";
      detailText += "sourceConversationId: " + (sourceMeta.sourceConversationId || "unknown") + "\n";
      detailText += "sourceMessageHash: " + (sourceMeta.sourceMessageHash || "unknown") + "\n";
      detailText += "sourceCapturedAt: " + (sourceMeta.sourceCapturedAt || "unknown") + "\n";
      detailText += "sourceActionStepIndex: " + (sourceMeta.sourceActionStepIndex || "unknown") + "\n";
      detailText += "taskCardId: " + (sourceMeta.taskCardId || "unknown") + "\n\n";

      detailText += "【Payload 校验】\n";
      detailText += "payloadStatus: " + (step.payloadStatus || "not_applicable") + "\n";
      detailText += "canSendToAgent: " + String(Boolean(pv.canSendToAgent)) + "\n";
      detailText += "startMarker: " + String(Boolean(pv.hasStartMarker)) + "\n";
      detailText += "endMarker: " + String(Boolean(pv.hasEndMarker)) + "\n";
      detailText += "taskCardIdMatched: " + String(Boolean(pv.taskCardIdMatched)) + "\n";
      detailText += "targetMatched: " + String(Boolean(pv.targetMatched)) + "\n";
      detailText += "requiredFieldsMissing: " + missingList + "\n\n";

      detailText += "【预检 / 执行准备】\n";
      detailText += "preflightStatus: " + preflightStatus + " (matched=" + String(preflightMatched) + ")\n";
      detailText += "readinessStatus: " + readinessStatus + " (matched=" + String(readinessContextMatched) + ")\n";
      if (!readinessContextMatched || readinessStatus === "not_run") {
        detailText += "提示: 当前任务卡尚未执行 readiness 检查，请先运行“检查执行准备状态”。\n";
      }
      if (!preflightMatched && floatingPreflightLatest) {
        detailText += "提示: 当前预检结果与已选任务上下文不匹配，已按过期结果处理。\n";
      }
      detailText += "\n";

      if (step.target === "controller") {
        detailText += "【说明】\n";
        detailText += "该步骤目标为 controller（总控），用于审查/改写/决策，不作为执行端 payload。\n";
      } else if (step.fullTaskCard) {
        detailText += "【完整任务卡】\n";
        detailText += "\u5b8c\u6574 ACB_TASK_CARD \u5df2\u5355\u72ec\u63d0\u4f9b\u201c\u67e5\u770b\u5b8c\u6574\u4efb\u52a1\u5361\u201d\u5165\u53e3\uff0c\u8fd9\u91cc\u4ec5\u4fdd\u7559\u8bca\u65ad\u8be6\u60c5\u3002\n";
      } else {
        detailText += "【诊断】\n";
        detailText += "缺少完整 ACB_TASK_CARD，当前摘要不能作为可执行载荷。\n";
      }

      contentEl.textContent = detailText;
    }

    var copyBtn = document.getElementById("acb-payload-detail-copy-btn");
    if (copyBtn) {
      var copyRouteGate = applyRouteResultEligibility(step);
      var canCopy = copyRouteGate.canSendToAgent === true;
      copyBtn.disabled = !canCopy;
      copyBtn.style.opacity = canCopy ? "1" : "0.6";
      copyBtn.style.cursor = canCopy ? "pointer" : "not-allowed";
      copyBtn.style.background = canCopy ? "#1976d2" : "#e2e8f0";
      copyBtn.style.borderColor = canCopy ? "#1976d2" : "#94a3b8";
      copyBtn.style.color = canCopy ? "#fff" : "#64748b";
      copyBtn.title = canCopy ? "" : (step.target === "controller" ? "controller step 不可复制" : "payload 不完整，不可复制");
      copyBtn.onclick = function () {
        if (canCopy) {
          copyFullTaskCardToClipboard(step);
        }
      };
    }

    var footerStatus = document.getElementById("acb-payload-detail-copy-status");
    if (footerStatus) {
      footerStatus.textContent = "";
    }

    panel.style.display = "flex";
  }

  function openFullTaskCardViewer(step) {
    _payloadDetailStepRef = step;
    var panel = document.getElementById("acb-payload-detail-panel");
    if (!panel || !step) {
      return;
    }
    delete panel.dataset.acbMode;

    var titleEl = document.getElementById("acb-payload-detail-title");
    if (titleEl) {
      titleEl.textContent = "\u5b8c\u6574\u4efb\u52a1\u5361 · " + ((step.taskCardId || "unknown"));
    }

    var metaEl = document.getElementById("acb-payload-detail-meta");
    if (metaEl) {
      metaEl.innerHTML =
        "<span>taskCardId: <strong>" + (step.taskCardId || "unknown") + "</strong></span>" +
        "<span>target: <strong>" + getActionTargetLabel(step.target) + " (" + (step.target || "unknown") + ")</strong></span>" +
        "<span>payloadStatus: <strong>" + (step.payloadStatus || "not_applicable") + "</strong></span>";
    }

    var contentEl = document.getElementById("acb-payload-detail-content");
    if (contentEl) {
      contentEl.textContent = step.fullTaskCard || "\u5f53\u524d\u6ca1\u6709\u5b8c\u6574\u4efb\u52a1\u5361\u5185\u5bb9\u3002";
    }

    var copyBtn = document.getElementById("acb-payload-detail-copy-btn");
    if (copyBtn) {
      var canCopy = Boolean(step.fullTaskCard);
      copyBtn.disabled = !canCopy;
      copyBtn.style.opacity = canCopy ? "1" : "0.6";
      copyBtn.style.cursor = canCopy ? "pointer" : "not-allowed";
      copyBtn.style.background = canCopy ? "#1976d2" : "#e2e8f0";
      copyBtn.style.borderColor = canCopy ? "#1976d2" : "#94a3b8";
      copyBtn.style.color = canCopy ? "#fff" : "#64748b";
      copyBtn.onclick = function () {
        if (canCopy) {
          copyFullTaskCardToClipboard(step);
        }
      };
    }

    var footerStatus = document.getElementById("acb-payload-detail-copy-status");
    if (footerStatus) {
      footerStatus.textContent = "";
    }

    panel.style.display = "flex";
  }

  function closePayloadDetailViewer() {
    var panel = document.getElementById("acb-payload-detail-panel");
    if (panel) {
      panel.style.display = "none";
      panel.dataset.acbMode = "debug";
    }
    _payloadDetailStepRef = null;
  }

  function copyFullTaskCardToClipboard(step) {
    if (!step || !step.fullTaskCard) {
      var fs2 = document.getElementById("acb-payload-detail-copy-status");
      if (fs2) {
        fs2.textContent = "复制失败：没有完整任务卡内容。";
        fs2.style.color = "#c62828";
      }
      setUnifiedActionFeedback("复制完整任务卡", "复制失败：没有完整任务卡内容。", "error", "payload 缺失");
      return;
    }

    if (step.payloadStatus !== "complete") {
      var fs3 = document.getElementById("acb-payload-detail-copy-status");
      if (fs3) {
        fs3.textContent = "复制失败：载荷状态不是 complete（当前: " + (step.payloadStatus || "unknown") + "）。";
        fs3.style.color = "#c62828";
      }
      setUnifiedActionFeedback("复制完整任务卡", "复制失败：payload 未完成。", "error", "payloadStatus=" + (step.payloadStatus || "unknown"));
      return;
    }

    var pv = step.payloadValidation || {};
    if (!pv.canSendToAgent) {
      var fs4 = document.getElementById("acb-payload-detail-copy-status");
      if (fs4) {
        fs4.textContent = "复制失败：canSendToAgent 为 false，不允许发送。";
        fs4.style.color = "#c62828";
      }
      setUnifiedActionFeedback("复制完整任务卡", "复制失败：当前步骤不可发送。", "error", "canSendToAgent=false");
      return;
    }
    var copyRouteGate = applyRouteResultEligibility(step);
    if (!copyRouteGate.canSendToAgent) {
      var fs5 = document.getElementById("acb-payload-detail-copy-status");
      if (fs5) {
        fs5.textContent = "复制失败：RouteResult gate blocked。";
        fs5.style.color = "#c62828";
      }
      setUnifiedActionFeedback("复制完整任务卡", "复制失败：RouteResult gate blocked。", "error", getRouteGateBlockingReasonText(copyRouteGate));
      return;
    }

    var nav = navigator.clipboard;
    if (nav && nav.writeText) {
      nav.writeText(step.fullTaskCard).then(function () {
        var fs = document.getElementById("acb-payload-detail-copy-status");
        if (fs) {
          fs.textContent = "完整任务卡已复制，可粘贴给 " + getActionTargetLabel(step.target) + "。";
          fs.style.color = "#2e7d32";
        }
        setCopyStatus("完整任务卡已复制，可粘贴给 " + getActionTargetLabel(step.target) + "。", "#2e7d32");
        setUnifiedActionFeedback("复制完整任务卡", "已复制完整任务卡至剪贴板。", "success", "target=" + getActionTargetLabel(step.target));
      }).catch(function () {
        var fs5 = document.getElementById("acb-payload-detail-copy-status");
        if (fs5) {
          fs5.textContent = "自动复制失败，请手动从详情面板复制。";
          fs5.style.color = "#c62828";
        }
        setUnifiedActionFeedback("复制完整任务卡", "复制失败：自动复制不可用。", "error", "请手动复制");
      });
    } else {
      var fs6 = document.getElementById("acb-payload-detail-copy-status");
      if (fs6) {
        fs6.textContent = "剪贴板不可用，请手动选择并复制。";
        fs6.style.color = "#c62828";
      }
      setUnifiedActionFeedback("复制完整任务卡", "复制失败：浏览器剪贴板不可用。", "error", "请手动复制");
    }
  }

  function syncPreflightCardButton() {
    var btn = document.getElementById("acb-preflight-btn");
    var reason = document.getElementById("acb-preflight-btn-reason");
    if (!btn || !reason) { return; }

    if (preflightChecking) {
      btn.disabled = true;
      btn.textContent = "预检中...";
      btn.style.opacity = "0.8";
      btn.style.cursor = "wait";
      reason.textContent = "正在检查 payload preflight...";
      return;
    }

    var ctx = getActiveExecutionContext();

    if (ctx.hasCompleteTaskCard) {
      btn.disabled = false;
      btn.style.background = "#6366f1";
      btn.style.borderColor = "#6366f1";
      btn.style.color = "#fff";
      btn.style.cursor = "pointer";
      btn.style.opacity = "1";
      reason.textContent = "步骤包含完整任务卡，可进行预检。";
      return;
    }

    // Disabled — use reason from the unified context
    btn.disabled = true;
    btn.style.background = "#e5e7eb";
    btn.style.borderColor = "#9ca3af";
    btn.style.color = "#6b7280";
    btn.style.cursor = "not-allowed";
    btn.style.opacity = "0.7";

    if (ctx.reason === "no_current_complete_payload") {
      var plan = getCurrentActionPlan();
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        reason.textContent = "当前未选择可预检的动作步骤。";
      } else {
        reason.textContent = "当前步骤无完整任务卡，无法进行本地预检。Payload: " + ctx.payloadStatus;
      }
    } else if (ctx.reason === "invalid_complete_payload_missing_taskCardId") {
      reason.textContent = "载荷状态为 complete 但缺少 Task Card ID，无法预检。";
    } else {
      reason.textContent = "当前步骤无完整任务卡，无法进行本地预检。";
    }
  }

  function setPreflightButtonBusy(isBusy) {
    preflightChecking = Boolean(isBusy);
    var btn = document.getElementById("acb-preflight-btn");
    if (!btn) {
      return;
    }
    if (preflightChecking) {
      btn.disabled = true;
      btn.textContent = "预检中...";
      btn.style.opacity = "0.8";
      btn.style.cursor = "wait";
      return;
    }
    btn.textContent = "检查任务卡预检";
    btn.style.opacity = btn.disabled ? "0.7" : "1";
    btn.style.cursor = btn.disabled ? "not-allowed" : "pointer";
  }

  function setReadinessButtonBusy(isBusy) {
    readinessChecking = Boolean(isBusy);
    var btn = document.getElementById("acb-readiness-btn");
    if (!btn) {
      return;
    }
    if (readinessChecking) {
      btn.disabled = true;
      btn.textContent = "检查中...";
      btn.style.opacity = "0.8";
      btn.style.cursor = "wait";
      return;
    }
    btn.disabled = false;
    btn.textContent = "检查执行准备状态";
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }

  function parseTaskCardCoreFields(taskCardText) {
    var text = String(taskCardText || "");
    var pick = function (name) {
      var regex = new RegExp("(?:^|\\n)\\s*" + name + "\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*[a-zA-Z][a-zA-Z0-9_]*\\s*[:：]|$)", "i");
      var match = text.match(regex);
      return match ? normalizeText(match[1] || "") : "";
    };
    return {
      taskCardId: pick("taskCardId"),
      target: pick("target"),
      messageType: pick("messageType"),
      payloadType: pick("payloadType"),
      taskNature: pick("taskNature"),
      taskType: pick("taskType"),
      recommendedModel: pick("recommendedModel"),
      permissionMode: pick("permissionMode"),
      defaultPermissionMode: pick("defaultPermissionMode"),
      handoffMode: pick("handoffMode"),
      taskTitle: pick("taskTitle"),
      objective: pick("objective"),
      allowedFiles: pick("allowedFiles"),
      forbiddenActions: pick("forbiddenActions"),
      implementationRequirements: pick("implementationRequirements"),
      checks: pick("checks"),
      reportFormat: pick("reportFormat"),
      acceptanceCriteria: pick("acceptanceCriteria"),
      projectDir: pick("projectDir"),
      currentBranch: pick("currentBranch"),
      currentCommit: pick("currentCommit")
    };
  }

  function pickTaskCardField(taskCardText, fieldName) {
    var text = String(taskCardText || "");
    var regex = new RegExp("(?:^|\\n)\\s*" + fieldName + "\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*[a-zA-Z][a-zA-Z0-9_]*\\s*[:：]|$)", "i");
    var match = text.match(regex);
    return match ? normalizeText(match[1] || "") : "";
  }

  function summarizeTaskCardText(text, maxLength) {
    var value = normalizeText(text || "");
    if (!value) {
      return "\u6682\u65e0";
    }
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, maxLength - 1) + "\u2026";
  }

  function buildTaskCardSummaryModel(step) {
    var taskCardText = step && step.fullTaskCard ? String(step.fullTaskCard) : "";
    var taskTitle = pickTaskCardField(taskCardText, "taskTitle");
    var objective = pickTaskCardField(taskCardText, "objective");
    var background = pickTaskCardField(taskCardText, "background");
    return {
      taskCardId: (step && step.taskCardId) || pickTaskCardField(taskCardText, "taskCardId") || "unknown",
      lines: [
        "\u8fd9\u662f\u4ec0\u4e48\u4efb\u52a1\uff1a" + summarizeTaskCardText(taskTitle || (step && step.title) || objective, 96),
        "\u4e3b\u8981\u89e3\u51b3\u4ec0\u4e48\uff1a" + summarizeTaskCardText(objective || (step && step.summary) || background, 108),
        "\u4e3a\u4ec0\u4e48\u9700\u8981\u5173\u5fc3\uff1a" + summarizeTaskCardText(background || (step && step.detail) || (step && step.summary), 108)
      ]
    };
  }

  function buildExecutorTargetAliasMap(profiles) {
    var map = {};
    for (var i = 0; i < profiles.length; i += 1) {
      var profile = profiles[i];
      var aliases = Array.isArray(profile.targetAliases) ? profile.targetAliases : [];
      var profileId = String(profile.executorId || "").toLowerCase();
      map[profileId] = profile.executorId;
      map[normalizeExecutorTargetAlias(profileId)] = profile.executorId;
      for (var ai = 0; ai < aliases.length; ai += 1) {
        var alias = String(aliases[ai] || "").toLowerCase();
        map[alias] = profile.executorId;
        map[normalizeExecutorTargetAlias(alias)] = profile.executorId;
      }
    }
    return map;
  }

  function normalizeExecutorTargetAlias(target) {
    return normalizeText(target || "").toLowerCase().replace(/_/g, "-");
  }

  function getExecutorProfileById(executorId) {
    for (var i = 0; i < PRE_EXECUTION_EXECUTOR_PROFILES.length; i += 1) {
      if (PRE_EXECUTION_EXECUTOR_PROFILES[i].executorId === executorId) {
        return PRE_EXECUTION_EXECUTOR_PROFILES[i];
      }
    }
    return null;
  }

  function cloneExecutorProfile(profile) {
    if (!profile) {
      return null;
    }
    return {
      executorId: profile.executorId,
      displayName: profile.displayName,
      executorType: profile.executorType,
      roleIdentity: profile.roleIdentity || "execution-agent",
      currentRole: profile.currentRole || profile.roleIdentity || "execution-agent",
      commandName: profile.commandName,
      targetAliases: Array.isArray(profile.targetAliases) ? profile.targetAliases.slice() : [],
      defaultPermissionMode: profile.defaultPermissionMode,
      defaultHandoffMode: profile.defaultHandoffMode,
      supportsInteractiveTerminal: Boolean(profile.supportsInteractiveTerminal),
      supportsClipboardPrompt: Boolean(profile.supportsClipboardPrompt),
      trustedProjectOnly: Boolean(profile.trustedProjectOnly),
      enabledByDefault: Boolean(profile.enabledByDefault)
    };
  }

  function resolveExecutorProfile(taskCardTarget) {
    var target = normalizeExecutorTargetAlias(taskCardTarget);
    var blockingReasons = [];
    if (!target) {
      blockingReasons.push("missing_target");
    }
    if (PRE_EXECUTION_NON_AGENT_TARGETS[target]) {
      blockingReasons.push("non_execution_agent_target");
      return {
        target: target,
        targetRole: target,
        executorProfile: null,
        blocked: true,
        blockingReasons: uniqueStrings(blockingReasons)
      };
    }
    var executorId = target ? PRE_EXECUTION_TARGET_ALIAS_MAP[target] : "";
    var profile = executorId ? getExecutorProfileById(executorId) : null;
    if (!profile && target) {
      blockingReasons.push("unknown_executor_target");
    }
    return {
      target: target,
      targetRole: profile ? "agent" : "unknown",
      executorProfile: cloneExecutorProfile(profile),
      blocked: blockingReasons.length > 0,
      blockingReasons: uniqueStrings(blockingReasons)
    };
  }

  function buildDeliveryPlan(step) {
    var taskFields = parseTaskCardCoreFields(step && step.fullTaskCard ? step.fullTaskCard : "");
    var taskTarget = taskFields.target || (step && step.target) || "";
    var resolved = resolveExecutorProfile(taskTarget);
    var profile = resolved.executorProfile;
    var routeGate = applyRouteResultEligibility(step);
    var rr = routeGate.routeResult || {};
    var blockingReasons = [];
    var warningReasons = [];
    var fullTaskCardText = step && step.fullTaskCard ? String(step.fullTaskCard) : "";

    if (!step) {
      blockingReasons.push("no_current_action_step");
    }
    if (!fullTaskCardText) {
      blockingReasons.push("no_complete_task_card");
    } else {
      if (fullTaskCardText.indexOf("<ACB_TASK_CARD") === -1 || fullTaskCardText.indexOf("<ACB_TASK_CARD_END") === -1) {
        blockingReasons.push("missing_task_card_marker");
      }
    }
    if (step && step.payloadStatus !== "complete") {
      blockingReasons.push("payload_not_complete");
    }
    if (!taskFields.taskCardId && step && !step.taskCardId) {
      blockingReasons.push("missing_task_card_id");
    }
    if (resolved.blocked) {
      blockingReasons = blockingReasons.concat(resolved.blockingReasons);
    }
    if (rr.targetRole && rr.targetRole !== "agent") {
      blockingReasons.push("target_role_not_agent:" + rr.targetRole);
    }
    if (rr.sampleOnly === true) {
      blockingReasons.push("sample_only_cannot_prepare");
    }
    if (rr.cannotDispatch === true) {
      blockingReasons.push("cannot_dispatch");
    }
    if (!routeGate.canSendToAgent) {
      blockingReasons = blockingReasons.concat(routeGate.blockingReasons || []);
    }
    if (!taskFields.recommendedModel) {
      warningReasons.push("recommended_model_missing");
    }

    blockingReasons = uniqueStrings(blockingReasons);
    warningReasons = uniqueStrings(warningReasons);

    var permissionMode = taskFields.permissionMode || taskFields.defaultPermissionMode || (profile ? profile.defaultPermissionMode : "unknown");
    var handoffMode = taskFields.handoffMode || (profile ? profile.defaultHandoffMode : "manual/copyable");
    var defaultRoute = {
      target: taskTarget || "unknown",
      executorId: profile ? profile.executorId : "",
      executorType: profile ? profile.executorType : "",
      displayName: profile ? profile.displayName : "unresolved",
      commandName: profile ? profile.commandName : "",
      recommendedModel: taskFields.recommendedModel || "",
      permissionMode: permissionMode,
      handoffMode: handoffMode
    };
    var actualRoute = {
      target: defaultRoute.target,
      executorId: defaultRoute.executorId,
      executorType: defaultRoute.executorType,
      displayName: defaultRoute.displayName,
      commandName: defaultRoute.commandName,
      recommendedModel: defaultRoute.recommendedModel,
      permissionMode: defaultRoute.permissionMode,
      handoffMode: defaultRoute.handoffMode
    };

    return {
      status: blockingReasons.length > 0 ? "blocked" : "ready",
      canPrepare: blockingReasons.length === 0,
      defaultRoute: defaultRoute,
      actualRoute: actualRoute,
      routeOverride: {
        enabled: false,
        reason: ""
      },
      ccRoutes: [],
      safety: {
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false,
        noAutoDispatch: true,
        noCommandExecution: true,
        canTriggerExecution: false
      },
      handoff: {
        mode: handoffMode,
        prepareOnly: true,
        manual: true,
        copyable: true,
        noAutoDispatch: true,
        canTriggerExecution: false
      },
      executorProfile: profile,
      blockingReasons: blockingReasons,
      warningReasons: warningReasons
    };
  }

  function buildCopyablePreExecutionPayload(taskFields, deliveryPlan, fullTaskCardText) {
    var fields = taskFields || {};
    var fullTaskCard = String(fullTaskCardText || "");
    var taskCardId = fields.taskCardId || "unknown";
    var executorId = deliveryPlan && deliveryPlan.defaultRoute ? (deliveryPlan.defaultRoute.executorId || "unknown") : "unknown";
    var localReportPath = ".ai-control/reports/inbox/" + taskCardId + ".md";
    var lines = [];
    lines.push("ACB Pre-Execution Handoff Payload");
    lines.push("");
    lines.push("Safety Note:");
    lines.push("- Do not auto-execute this payload.");
    lines.push("- Do not run terminal commands unless explicitly allowed by the task card.");
    lines.push("- Execute only within the task card boundaries.");
    lines.push("- Respect forbiddenActions, gitBoundary, and acceptanceCriteria.");
    lines.push("- noAutoDispatch=true");
    lines.push("- noCommandExecution=true");
    lines.push("- executionAllowed=false");
    lines.push("- agentDispatchAllowed=false");
    lines.push("- gitWriteAllowed=false");
    lines.push("- canAutoExecute=false");
    lines.push("- Report back using the task card reportFormat.");
    lines.push("");
    lines.push("Task Card Summary:");
    lines.push("- taskCardId: " + (fields.taskCardId || "unknown"));
    lines.push("- target: " + (fields.target || "unknown"));
    lines.push("- taskTitle: " + (fields.taskTitle || ""));
    lines.push("- projectDir: " + (fields.projectDir || ""));
    lines.push("- currentBranch: " + (fields.currentBranch || ""));
    lines.push("- currentCommit: " + (fields.currentCommit || ""));
    lines.push("- resolvedExecutor: " + (deliveryPlan.defaultRoute.displayName || "unresolved"));
    lines.push("- commandName: " + (deliveryPlan.defaultRoute.commandName || ""));
    lines.push("- permissionMode: " + (deliveryPlan.defaultRoute.permissionMode || ""));
    lines.push("- handoffMode: " + (deliveryPlan.defaultRoute.handoffMode || ""));
    lines.push("");
    lines.push("Local Execution Report Requirement:");
    lines.push("- protocolDocument: docs/local-execution-report-example.md");
    lines.push("- reportPath: " + localReportPath);
    lines.push("- requiredEnvelopeStart: <ACB_LOCAL_EXEC_REPORT id=\"" + taskCardId + "\" taskCardId=\"" + taskCardId + "\" executor=\"" + executorId + "\" version=\"1\">");
    lines.push("- requiredEnvelopeEnd: <ACB_LOCAL_EXEC_REPORT_END id=\"" + taskCardId + "\">");
    lines.push("- Write a bounded local report for completed, partially_completed, blocked, failed, or cancelled outcomes.");
    lines.push("- Reading the report only enters waiting_controller_review.");
    lines.push("- Do not mark accepted, approved, or closed yourself.");
    lines.push("- Do not stage or commit .ai-control/.");
    lines.push("");
    lines.push("Full ACB_TASK_CARD:");
    lines.push(fullTaskCard || "(missing full task card)");
    lines.push("");
    lines.push("Extracted Reference Fields:");
    lines.push("");
    lines.push("objective:");
    lines.push(fields.objective || "");
    lines.push("");
    lines.push("allowedFiles:");
    lines.push(fields.allowedFiles || "");
    lines.push("");
    lines.push("forbiddenActions:");
    lines.push(fields.forbiddenActions || "");
    lines.push("");
    lines.push("implementationRequirements:");
    lines.push(fields.implementationRequirements || "");
    lines.push("");
    lines.push("checks:");
    lines.push(fields.checks || "");
    lines.push("");
    lines.push("reportFormat:");
    lines.push(fields.reportFormat || "");
    lines.push("");
    lines.push("acceptanceCriteria:");
    lines.push(fields.acceptanceCriteria || "");
    return lines.join("\n");
  }

  function getReadinessSummaryForPackage(step, ctx) {
    var status = "not_run";
    var warnings = [];
    var blockingReasons = [];
    var latest = floatingReadinessLatest;
    if (latest && latest.data && latest.data.readiness) {
      var readiness = latest.data.readiness;
      if (readiness.requestContextId && ctx && readiness.requestContextId !== ctx.contextId) {
        status = "stale_context";
        warnings.push("readiness_stale_context");
      } else {
        status = readiness.status || "unknown";
        if (Array.isArray(readiness.warnings)) {
          warnings = warnings.concat(readiness.warnings);
        }
        if (Array.isArray(readiness.blockingReasons)) {
          blockingReasons = blockingReasons.concat(readiness.blockingReasons);
        }
      }
    }
    if (step && step.payloadStatus !== "complete") {
      blockingReasons.push("payload_not_complete");
    }
    return {
      status: status,
      warnings: uniqueStrings(warnings),
      blockingReasons: uniqueStrings(blockingReasons)
    };
  }

  function getRoleCompatibilityInspectionText(step, taskFields) {
    var fields = taskFields || {};
    return [
      fields.messageType || "",
      fields.payloadType || "",
      fields.taskNature || "",
      fields.taskType || "",
      fields.taskTitle || "",
      fields.objective || "",
      fields.allowedFiles || "",
      fields.forbiddenActions || "",
      fields.implementationRequirements || "",
      fields.checks || "",
      fields.reportFormat || "",
      fields.acceptanceCriteria || "",
      step && step.title ? step.title : "",
      step && step.summary ? step.summary : "",
      step && step.detail ? step.detail : "",
      step && step.fullTaskCard ? step.fullTaskCard : ""
    ].join("\n").toLowerCase();
  }

  function textContainsAny(text, keywords) {
    var value = String(text || "").toLowerCase();
    for (var i = 0; i < keywords.length; i += 1) {
      if (value.indexOf(String(keywords[i]).toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  }

  function parseExplicitBooleanTaskCardField(taskCardText, key) {
    var text = String(taskCardText || "");
    var re = new RegExp("(?:^|\\n)\\s*" + key + "\\s*[:：]\\s*(true|false)\\b", "i");
    var match = text.match(re);
    if (!match) {
      return { matched: false, value: false, source: "none" };
    }
    return {
      matched: true,
      value: String(match[1]).toLowerCase() === "true",
      source: "explicit_field"
    };
  }

  function getExplicitDispatchBlockFlagsFromTaskCard(taskCardText) {
    var sampleOnly = parseExplicitBooleanTaskCardField(taskCardText, "sampleOnly");
    var cannotDispatch = parseExplicitBooleanTaskCardField(taskCardText, "cannotDispatch");
    return {
      sampleOnly: sampleOnly.value === true,
      cannotDispatch: cannotDispatch.value === true,
      dispatchBlockFlagMatched: sampleOnly.value === true || cannotDispatch.value === true,
      dispatchBlockFlagSource: (sampleOnly.value === true || cannotDispatch.value === true) ? "explicit_field" : "none",
      sampleOnlyExplicit: sampleOnly.matched,
      cannotDispatchExplicit: cannotDispatch.matched
    };
  }

  function inferRequiredRoleForPreExecution(step, taskFields) {
    var text = getRoleCompatibilityInspectionText(step, taskFields);
    var scopedIntentText = [
      taskFields && taskFields.taskTitle ? taskFields.taskTitle : "",
      taskFields && taskFields.objective ? taskFields.objective : "",
      taskFields && taskFields.allowedFiles ? taskFields.allowedFiles : "",
      step && step.title ? step.title : "",
      step && step.summary ? step.summary : ""
    ].join("\n").toLowerCase();
    if (text.indexOf("acb_role_message") !== -1 || text.indexOf("advisor-handoff") !== -1 || text.indexOf("advisor handoff") !== -1) {
      return { requiredRole: "review-only", taskNature: "advisor_or_role_message", requiresConfirmation: false };
    }
    if (textContainsAny(scopedIntentText, ["docs/03_design", "private control packet", "private boundary packet"])) {
      return { requiredRole: "review-only", taskNature: "protected_design_or_boundary_work", requiresConfirmation: false };
    }
    if (textContainsAny(scopedIntentText, [
      "product design", "open-ended product", "architecture design", "governance rule",
      "role model design", "roadmap design", "design blueprint",
      "ux / product"
    ])) {
      return { requiredRole: "review-only", taskNature: "design_or_governance", requiresConfirmation: false };
    }
    if (step && step.fullTaskCard && getExplicitDispatchBlockFlagsFromTaskCard(step.fullTaskCard).dispatchBlockFlagMatched) {
      return { requiredRole: "blocked", taskNature: "sample_or_cannot_dispatch", requiresConfirmation: false };
    }
    if (textContainsAny(text, ["controlled doc landing", "doc landing", "document landing", "private records", "private test reports"])) {
      return { requiredRole: "execution-agent", taskNature: "controlled_doc_landing", requiresConfirmation: true };
    }
    if (textContainsAny(text, [
      "implementation", "implement", "fix", "bug", "test", "report", "read-only fact check",
      "fact check", "readonly", "only read", "closeout", "checkpoint"
    ])) {
      return { requiredRole: "execution-agent", taskNature: "bounded_execution", requiresConfirmation: false };
    }
    return { requiredRole: "execution-agent", taskNature: "unknown_execution_nature", requiresConfirmation: true };
  }

  function evaluateRoleCompatibility(step, taskFields, deliveryPlan) {
    var roleInfo = inferRequiredRoleForPreExecution(step, taskFields);
    var profile = deliveryPlan && deliveryPlan.executorProfile ? deliveryPlan.executorProfile : null;
    var executorRole = profile ? (profile.currentRole || profile.roleIdentity || "execution-agent") : "unresolved";
    var blockingReasons = [];
    var warningReasons = [];
    var status = "compatible";
    var compatible = true;

    if (roleInfo.requiredRole === "review-only") {
      compatible = false;
      status = "review_only";
      blockingReasons.push("task_requires_review_only_role");
    } else if (roleInfo.requiredRole === "blocked") {
      compatible = false;
      status = "blocked";
      blockingReasons.push("task_marked_sample_or_cannot_dispatch");
    } else if (!profile) {
      compatible = false;
      status = "blocked";
      blockingReasons.push("executor_profile_unresolved");
    } else if (roleInfo.requiredRole !== executorRole) {
      compatible = false;
      status = "incompatible";
      blockingReasons.push("executor_role_mismatch:" + executorRole + "_requires_" + roleInfo.requiredRole);
    }

    if (roleInfo.requiresConfirmation) {
      warningReasons.push("role_confirmation_required:" + roleInfo.taskNature);
    }

    return {
      inferredRequiredRole: roleInfo.requiredRole,
      requiredRole: roleInfo.requiredRole,
      taskNature: roleInfo.taskNature,
      executorRole: executorRole,
      roleCompatible: compatible,
      roleCompatibilityStatus: status,
      roleBlockingReasons: uniqueStrings(blockingReasons),
      roleWarningReasons: uniqueStrings(warningReasons)
    };
  }

  function aggregatePrepareStatus(deliveryPlan, roleGate, readiness) {
    var blockingReasons = [];
    var warningReasons = [];
    var deliveryBlocked = deliveryPlan && Array.isArray(deliveryPlan.blockingReasons) && deliveryPlan.blockingReasons.length > 0;
    var roleBlocked = roleGate && Array.isArray(roleGate.roleBlockingReasons) && roleGate.roleBlockingReasons.length > 0;
    var roleStatus = roleGate ? roleGate.roleCompatibilityStatus : "blocked";

    if (deliveryPlan && Array.isArray(deliveryPlan.blockingReasons)) {
      blockingReasons = blockingReasons.concat(deliveryPlan.blockingReasons);
    }
    if (roleGate && Array.isArray(roleGate.roleBlockingReasons)) {
      blockingReasons = blockingReasons.concat(roleGate.roleBlockingReasons);
    }
    if (readiness && Array.isArray(readiness.blockingReasons)) {
      blockingReasons = blockingReasons.concat(readiness.blockingReasons);
    }
    if (deliveryPlan && Array.isArray(deliveryPlan.warningReasons)) {
      warningReasons = warningReasons.concat(deliveryPlan.warningReasons);
    }
    if (roleGate && Array.isArray(roleGate.roleWarningReasons)) {
      warningReasons = warningReasons.concat(roleGate.roleWarningReasons);
    }
    if (readiness && Array.isArray(readiness.warnings)) {
      warningReasons = warningReasons.concat(readiness.warnings);
    }

    blockingReasons = uniqueStrings(blockingReasons);
    warningReasons = uniqueStrings(warningReasons);

    if (roleStatus === "review_only") {
      return { prepareStatus: "Review Only", prepareStatusLabel: "Review Only", canPrepare: false, blockingReasons: blockingReasons, warningReasons: warningReasons };
    }
    if (deliveryBlocked || roleBlocked || (readiness && readiness.status === "blocked")) {
      return { prepareStatus: "Blocked", prepareStatusLabel: "Blocked", canPrepare: false, blockingReasons: blockingReasons, warningReasons: warningReasons };
    }
    if (warningReasons.length > 0 || (readiness && readiness.status === "warning")) {
      return { prepareStatus: "Confirm", prepareStatusLabel: "Confirm", canPrepare: true, blockingReasons: blockingReasons, warningReasons: warningReasons };
    }
    return { prepareStatus: "Ready", prepareStatusLabel: "Ready", canPrepare: true, blockingReasons: blockingReasons, warningReasons: warningReasons };
  }

  function getPrepareStatusColor(status) {
    if (status === "Ready") { return "#166534"; }
    if (status === "Confirm") { return "#b45309"; }
    if (status === "Review Only") { return "#4338ca"; }
    return "#b91c1c";
  }

  function getPrepareStatusBackground(status) {
    if (status === "Ready") { return "#f0fdf4"; }
    if (status === "Confirm") { return "#fffbeb"; }
    if (status === "Review Only") { return "#eef2ff"; }
    return "#fef2f2";
  }

  function getPrepareStatusBorder(status) {
    if (status === "Ready") { return "#bbf7d0"; }
    if (status === "Confirm") { return "#fde68a"; }
    if (status === "Review Only") { return "#c7d2fe"; }
    return "#fecaca";
  }

  function buildPreExecutionPackage(step) {
    var taskFields = parseTaskCardCoreFields(step && step.fullTaskCard ? step.fullTaskCard : "");
    var deliveryPlan = buildDeliveryPlan(step);
    var ctx = getExecutionContextForStep(step);
    var readiness = getReadinessSummaryForPackage(step, ctx);
    var roleGate = evaluateRoleCompatibility(step, taskFields, deliveryPlan);
    var prepareAggregate = aggregatePrepareStatus(deliveryPlan, roleGate, readiness);
    var canPrepare = Boolean(prepareAggregate.canPrepare);
    var packageId = "preexec_" +
      sanitizeIdPart(taskFields.taskCardId || (step && step.taskCardId) || "unknown") + "_" +
      sanitizeIdPart(ctx && ctx.contextId ? ctx.contextId : (step && step.id) || "no_context");
    var launchCommandPreview = deliveryPlan.defaultRoute.commandName || "";
    var copyablePayload = canPrepare ? buildCopyablePreExecutionPayload(taskFields, deliveryPlan, step && step.fullTaskCard ? step.fullTaskCard : "") : "";
    var unavailableReason = canPrepare ? "" : (prepareAggregate.blockingReasons.length > 0 ? prepareAggregate.blockingReasons.join(", ") : prepareAggregate.prepareStatus);

    return {
      packageId: packageId,
      sourceTaskCardId: taskFields.taskCardId || (step && step.taskCardId) || "",
      sourceStepId: step && step.id ? step.id : "",
      sourceContextId: ctx && ctx.contextId ? ctx.contextId : "",
      taskTitle: taskFields.taskTitle || (step && step.title) || "",
      target: taskFields.target || (step && step.target) || "",
      resolvedExecutorId: deliveryPlan.defaultRoute.executorId || "",
      resolvedExecutorDisplayName: deliveryPlan.defaultRoute.displayName || "unresolved",
      commandName: deliveryPlan.defaultRoute.commandName || "",
      permissionMode: deliveryPlan.defaultRoute.permissionMode || "",
      handoffMode: deliveryPlan.defaultRoute.handoffMode || "",
      projectDir: taskFields.projectDir || "",
      currentBranch: taskFields.currentBranch || "",
      currentCommit: taskFields.currentCommit || "",
      readinessStatus: readiness.status,
      warnings: prepareAggregate.warningReasons,
      blockingReasons: prepareAggregate.blockingReasons,
      deliveryPlanSummary: {
        status: deliveryPlan.status,
        defaultRoute: deliveryPlan.defaultRoute,
        actualRoute: deliveryPlan.actualRoute,
        routeOverrideEnabled: Boolean(deliveryPlan.routeOverride && deliveryPlan.routeOverride.enabled),
        ccRoutesCount: Array.isArray(deliveryPlan.ccRoutes) ? deliveryPlan.ccRoutes.length : 0
      },
      copyablePayload: copyablePayload,
      copyablePayloadAvailable: Boolean(copyablePayload),
      copyablePayloadUnavailableReason: unavailableReason,
      launchCommandPreview: launchCommandPreview,
      userInstruction: "Open the target executor manually in the corresponding project directory, paste the copyablePayload manually, and execute only within the task card boundary.",
      canPrepare: canPrepare,
      inferredRequiredRole: roleGate.inferredRequiredRole,
      requiredRole: roleGate.requiredRole,
      executorRole: roleGate.executorRole,
      roleCompatible: roleGate.roleCompatible,
      roleCompatibilityStatus: roleGate.roleCompatibilityStatus,
      roleBlockingReasons: roleGate.roleBlockingReasons,
      prepareStatus: prepareAggregate.prepareStatus,
      prepareStatusLabel: prepareAggregate.prepareStatusLabel,
      canAutoExecute: false
    };
  }

  function sanitizeIdPart(value) {
    return String(value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96) || "unknown";
  }

  function buildPreExecutionHandoffLogEntry(pkg, eventType, handoffStatus, note) {
    var eventAt = new Date().toISOString();
    var safePackage = pkg || {};
    return {
      logId: "handoff_" + sanitizeIdPart(safePackage.packageId || "unknown") + "_" + sanitizeIdPart(eventType || "event") + "_" + eventAt.replace(/[^0-9A-Za-z]+/g, "_"),
      sourceTaskCardId: safePackage.sourceTaskCardId || "",
      sourceStepId: safePackage.sourceStepId || safePackage.sourceContextId || "",
      sourceContextId: safePackage.sourceContextId || "",
      target: safePackage.target || "",
      resolvedExecutorId: safePackage.resolvedExecutorId || "",
      prepareStatus: safePackage.prepareStatus || "",
      handoffStatus: handoffStatus || "prepared",
      eventType: eventType || "prepare_package_created",
      eventAt: eventAt,
      actor: "user",
      canAutoExecute: false,
      note: note || ""
    };
  }

  function getPreExecutionHandoffStatusForPackage(pkg) {
    if (!pkg || !floatingPreExecutionHandoffLatest) {
      return null;
    }
    if (floatingPreExecutionHandoffLatest.sourceTaskCardId && pkg.sourceTaskCardId &&
      floatingPreExecutionHandoffLatest.sourceTaskCardId === pkg.sourceTaskCardId) {
      return floatingPreExecutionHandoffLatest;
    }
    if (floatingPreExecutionHandoffLatest.sourceContextId && pkg.sourceContextId &&
      floatingPreExecutionHandoffLatest.sourceContextId === pkg.sourceContextId) {
      return floatingPreExecutionHandoffLatest;
    }
    return null;
  }

  function shouldSkipDuplicateHandoffEvent(entry) {
    var latest = floatingPreExecutionHandoffLatest;
    return Boolean(latest &&
      latest.sourceTaskCardId === entry.sourceTaskCardId &&
      latest.sourceContextId === entry.sourceContextId &&
      latest.handoffStatus === entry.handoffStatus &&
      latest.eventType === entry.eventType);
  }

  function recordPreExecutionHandoffEvent(pkg, eventType, handoffStatus, note) {
    var entry = buildPreExecutionHandoffLogEntry(pkg, eventType, handoffStatus, note);
    if (shouldSkipDuplicateHandoffEvent(entry)) {
      return Promise.resolve(entry);
    }
    floatingPreExecutionHandoffLatest = entry;
    if (globalThis.AcbStorage && globalThis.AcbStorage.setLocalBridgePreExecutionHandoffLatest) {
      return globalThis.AcbStorage.setLocalBridgePreExecutionHandoffLatest(entry).then(function () {
        return entry;
      }).catch(function () {
        return entry;
      });
    }
    return Promise.resolve(entry);
  }

  function ensurePreExecutionHandoffPassiveEvent(pkg) {
    if (!pkg) {
      return;
    }
    if (!preExecutionHandoffStorageLoaded) {
      return;
    }
    var existing = getPreExecutionHandoffStatusForPackage(pkg);
    if (existing && (existing.handoffStatus === "copied" ||
      existing.handoffStatus === "manual_handoff_marked" ||
      existing.handoffStatus === "cancelled")) {
      return;
    }
    if (pkg.prepareStatus === "Blocked") {
      recordPreExecutionHandoffEvent(pkg, "prepare_blocked", "blocked", "prepare_status_blocked");
    } else if (pkg.prepareStatus === "Review Only") {
      recordPreExecutionHandoffEvent(pkg, "review_only_viewed", "review_only", "prepare_status_review_only");
    } else if (pkg.canPrepare) {
      recordPreExecutionHandoffEvent(pkg, "prepare_package_created", "prepared", "prepare_package_created");
    }
  }

  function copyPreExecutionPayloadToClipboard(step) {
    var pkg = buildPreExecutionPackage(step);
    if (!pkg.canPrepare || !pkg.copyablePayload) {
      setUnifiedActionFeedback("Pre-Execution Package", "Copy blocked.", "error", pkg.copyablePayloadUnavailableReason || "copyable_payload_unavailable");
      return;
    }
    var nav = navigator.clipboard;
    if (nav && nav.writeText) {
      nav.writeText(pkg.copyablePayload).then(function () {
        return recordPreExecutionHandoffEvent(pkg, "copyable_payload_copied", "copied", "copyable_payload_copied");
      }).then(function () {
        setCopyStatus("Pre-Execution handoff payload copied.", "#2e7d32");
        setUnifiedActionFeedback("Pre-Execution Package", "Copyable handoff payload copied.", "success", "packageId=" + pkg.packageId);
        renderActionStepsSection();
      }).catch(function (err) {
        setUnifiedActionFeedback("Pre-Execution Package", "Clipboard copy failed.", "error", err && err.message ? err.message : "clipboard_write_failed");
      });
    } else {
      setUnifiedActionFeedback("Pre-Execution Package", "Clipboard is unavailable.", "error", "manual_copy_required");
    }
  }

  function getExecutionInboxHandoffKey(entry, step) {
    var safeEntry = entry || {};
    return [
      safeEntry.inboxItemId || "no_item",
      safeEntry.taskCardId || (step && step.taskCardId) || "no_task",
      safeEntry.contextId || "no_context"
    ].join("::");
  }

  function getExecutionInboxHandoffState(entry, step) {
    var key = getExecutionInboxHandoffKey(entry, step);
    if (!floatingExecutionInboxHandoffStates[key]) {
      floatingExecutionInboxHandoffStates[key] = {
        copiedState: "not_copied",
        copiedAt: "",
        copiedTarget: "",
        deliveredState: "not_delivered",
        deliveredAt: "",
        deliveredTarget: ""
      };
    }
    return floatingExecutionInboxHandoffStates[key];
  }

  function getExecutionInboxHandoffPayloadInfo(step) {
    var pkg = buildPreExecutionPackage(step);
    if (pkg && pkg.canPrepare && pkg.copyablePayload) {
      return { available: true, source: "pre_execution_package", payload: pkg.copyablePayload };
    }
    if (step && step.fullTaskCard && step.payloadStatus === "complete") {
      var fields = parseTaskCardCoreFields(step.fullTaskCard);
      var target = fields.target || step.target || "unknown";
      var taskCardId = fields.taskCardId || step.taskCardId || "unknown";
      return {
        available: true,
        source: "full_task_card_fallback",
        payload: [
          "ACB Manual Execution Inbox Handoff",
          "",
          "- taskCardId: " + taskCardId,
          "- target: " + target,
          "- projectDir: " + (fields.projectDir || ""),
          "- currentBranch: " + (fields.currentBranch || ""),
          "- currentCommit: " + (fields.currentCommit || ""),
          "- noAutoDispatch=true",
          "- noCommandExecution=true",
          "- executionAllowed=false",
          "- agentDispatchAllowed=false",
          "- gitWriteAllowed=false",
          "- Paste this payload into the chosen executor manually.",
          "- Let the executor write the required local report when finished.",
          "",
          step.fullTaskCard
        ].join("\n")
      };
    }
    return { available: false, source: "unavailable", payload: "" };
  }

  function getExecutionInboxHandoffSurfaceData(step) {
    var entry = floatingExecutionInboxLatest;
    var ctx = getExecutionContextForStep(step);
    var contextMatched = executionInboxMatchesContext(entry, ctx);
    var current = Boolean(entry && entry.accepted && contextMatched && ctx && ctx.canSendToAgent === true);
    var stale = Boolean(entry && !current);
    var payloadInfo = current ? getExecutionInboxHandoffPayloadInfo(step) : { available: false, source: "unavailable", payload: "" };
    return {
      detected: Boolean(entry),
      current: current,
      stale: stale,
      contextMatched: contextMatched,
      staleReason: entry && !contextMatched ? "context_mismatch" : (entry && !entry.accepted ? "not_accepted" : ""),
      entry: entry,
      context: ctx,
      payloadAvailable: Boolean(payloadInfo.available),
      payloadSource: payloadInfo.source,
      payload: payloadInfo.payload,
      state: entry ? getExecutionInboxHandoffState(entry, step) : null
    };
  }

  function copyExecutionInboxHandoffPayload(step) {
    var data = getExecutionInboxHandoffSurfaceData(step);
    if (!data.current || !data.payloadAvailable || !data.payload) {
      setUnifiedActionFeedback("Execution Inbox handoff", "复制被阻止：当前没有可投递的任务。", "error", data.staleReason || "handoff_payload_unavailable");
      return;
    }
    var nav = navigator.clipboard;
    if (nav && nav.writeText) {
      nav.writeText(data.payload).then(function () {
        var state = getExecutionInboxHandoffState(data.entry, step);
        state.copiedState = "copied_to_clipboard";
        state.copiedAt = new Date().toISOString();
        state.copiedTarget = (data.entry && data.entry.target) || (step && step.target) || "";
        setCopyStatus("已复制手动投递 Payload。", "#2e7d32");
        setUnifiedActionFeedback("Execution Inbox handoff", "已复制给执行端的手动投递 Payload。", "success", "target=" + (state.copiedTarget || "unknown"));
        renderActionStepsSection();
      }).catch(function (err) {
        setUnifiedActionFeedback("Execution Inbox handoff", "复制失败，请手动复制 Payload。", "error", err && err.message ? err.message : "clipboard_write_failed");
      });
    } else {
      setUnifiedActionFeedback("Execution Inbox handoff", "剪贴板不可用，请手动复制 Payload。", "error", "manual_copy_required");
    }
  }

  function markExecutionInboxManuallyDelivered(step) {
    var data = getExecutionInboxHandoffSurfaceData(step);
    if (!data.current) {
      setUnifiedActionFeedback("Execution Inbox handoff", "无法标记投递：当前没有匹配的收件箱任务。", "error", data.staleReason || "no_current_inbox_item");
      return;
    }
    var state = getExecutionInboxHandoffState(data.entry, step);
    state.deliveredState = "manually_delivered";
    state.deliveredAt = new Date().toISOString();
    state.deliveredTarget = (data.entry && data.entry.target) || (step && step.target) || "";
    setUnifiedActionFeedback("Execution Inbox handoff", "已标记为手动投递。", "success", "target=" + (state.deliveredTarget || "unknown"));
    renderActionStepsSection();
  }

  function renderExecutionInboxHandoffSurface(step) {
    var data = getExecutionInboxHandoffSurfaceData(step);
    if (!data.detected) {
      return null;
    }

    var entry = data.entry || {};
    if (!data.current) {
      if (!data.stale) {
        return null;
      }
      var staleBox = document.createElement("div");
      staleBox.dataset.acbMode = "debug";
      staleBox.style.cssText = "margin:0 0 8px 0;padding:7px 8px;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc;";
      var staleTitle = document.createElement("p");
      staleTitle.style.cssText = "margin:0;font-size:11px;font-weight:bold;color:#64748b;";
      staleTitle.textContent = "历史 Execution Inbox 项目：未作为当前投递目标显示";
      staleBox.appendChild(staleTitle);
      var staleLine = document.createElement("p");
      staleLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#64748b;line-height:1.4;";
      staleLine.textContent = "itemId=" + (entry.inboxItemId || "-") +
        " | taskCardId=" + (entry.taskCardId || "-") +
        " | target=" + (entry.target || "-") +
        " | staleReason=" + (data.staleReason || "not_current_context");
      staleBox.appendChild(staleLine);
      return staleBox;
    }

    var state = data.state || {};
    var box = document.createElement("div");
    box.style.cssText = "margin:0 0 8px 0;padding:8px;border:1px solid #a7f3d0;border-radius:6px;background:#ecfdf5;";

    var title = document.createElement("p");
    title.style.cssText = "margin:0 0 3px 0;font-size:12px;font-weight:bold;color:#047857;";
    title.textContent = "Execution Inbox 已登记：" + (entry.status || "accepted_to_inbox");
    box.appendChild(title);

    var summary = document.createElement("p");
    summary.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.4;";
    summary.textContent = "itemId=" + (entry.inboxItemId || "-") +
      " | taskCardId=" + (entry.taskCardId || "-") +
      " | target=" + (entry.target || "-") +
      " | contextMatched=" + String(Boolean(data.contextMatched));
    box.appendChild(summary);

    var boundary = document.createElement("p");
    boundary.style.cssText = "margin:3px 0 0 0;font-size:11px;color:#475569;line-height:1.4;";
    boundary.textContent = "任务已进入 Execution Inbox。ACB 不会自动粘贴、回车或执行；请复制 Payload 后手动粘贴到执行端。";
    box.appendChild(boundary);

    var stateLine = document.createElement("p");
    stateLine.style.cssText = "margin:3px 0 0 0;font-size:11px;color:#0f766e;line-height:1.4;";
    stateLine.textContent = "copyState=" + (state.copiedState || "not_copied") +
      (state.copiedAt ? " | copiedAt=" + state.copiedAt : "") +
      " | deliveryState=" + (state.deliveredState || "not_delivered") +
      (state.deliveredAt ? " | deliveredAt=" + state.deliveredAt : "");
    box.appendChild(stateLine);

    if (state.copiedState === "copied_to_clipboard" || state.deliveredState === "manually_delivered") {
      var hint = document.createElement("p");
      hint.style.cssText = "margin:3px 0 0 0;font-size:11px;color:#0369a1;line-height:1.4;";
      hint.textContent = "下一步：把已复制的 Payload 手动粘贴到 Claude Code / Codex / DeepSeek，然后让执行端写入 Local Report。";
      box.appendChild(hint);
    }

    var actions = document.createElement("div");
    actions.style.cssText = "margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;";

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "复制给执行端的 Payload";
    copyBtn.disabled = !data.payloadAvailable;
    copyBtn.style.cssText = data.payloadAvailable
      ? "padding:3px 10px;border:1px solid #059669;border-radius:3px;background:#059669;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
      : "padding:3px 10px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;";
    copyBtn.dataset.acbMode = "debug";
    copyBtn.title = data.payloadAvailable ? "仅复制手动投递 Payload；不会自动执行。" : "当前没有可复制的投递 Payload。";
    if (data.payloadAvailable) {
      copyBtn.addEventListener("click", (function (s) {
        return function () { copyExecutionInboxHandoffPayload(s); };
      })(step));
    }
    actions.appendChild(copyBtn);

    var deliveredBtn = document.createElement("button");
    deliveredBtn.type = "button";
    deliveredBtn.textContent = "标记为已手动投递";
    deliveredBtn.style.cssText = "padding:3px 10px;border:1px solid #0369a1;border-radius:3px;background:#fff;color:#0369a1;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
    deliveredBtn.dataset.acbMode = "debug";
    deliveredBtn.title = "只更新本地界面状态；不会粘贴、回车、运行命令或派发 Agent。";
    deliveredBtn.addEventListener("click", (function (s) {
      return function () { markExecutionInboxManuallyDelivered(s); };
    })(step));
    actions.appendChild(deliveredBtn);

    var source = document.createElement("span");
    source.dataset.acbMode = "debug";
    source.style.cssText = "font-size:11px;color:#64748b;";
    source.textContent = "payloadSource=" + data.payloadSource + " | currentContext=true";
    actions.appendChild(source);

    box.appendChild(actions);
    return box;
  }

  function markPreExecutionManualHandoff(step) {
    var pkg = buildPreExecutionPackage(step);
    if (!pkg.canPrepare) {
      setUnifiedActionFeedback("Pre-Execution Package", "Manual handoff mark blocked.", "error", pkg.copyablePayloadUnavailableReason || "handoff_not_prepareable");
      return;
    }
    recordPreExecutionHandoffEvent(pkg, "manual_handoff_marked", "manual_handoff_marked", "user_marked_manual_handoff").then(function () {
      setUnifiedActionFeedback("Pre-Execution Package", "Manual handoff marked.", "success", "handoffStatus=manual_handoff_marked");
      renderActionStepsSection();
    });
  }

  function cancelPreExecutionHandoff(step) {
    var pkg = buildPreExecutionPackage(step);
    recordPreExecutionHandoffEvent(pkg, "handoff_cancelled", "cancelled", "user_cancelled_prepare").then(function () {
      setUnifiedActionFeedback("Pre-Execution Package", "Prepare cancelled.", "warning", "handoffStatus=cancelled");
      renderActionStepsSection();
    });
  }

  function resolveExecutorIdFromReport(report) {
    if (!report) return null;
    var target = report.target || "";
    if (target) {
      var resolved = resolveExecutorProfile(target);
      if (resolved && resolved.executorProfile) {
        return resolved.executorProfile.executorId;
      }
    }
    return report.resolvedExecutorId || null;
  }

  function updateExecutorUnreadDots() {
    executorUnreadDots = {};
    if (!floatingManualExecutionReportLatest || !floatingManualExecutionReportLatest.waitingControllerReview) {
      return;
    }
    var execId = resolveExecutorIdFromReport(floatingManualExecutionReportLatest);
    if (execId) {
      executorUnreadDots[execId] = true;
    }
  }

  function getManualExecutionReportForPackage(pkg) {
    if (!pkg || !floatingManualExecutionReportLatest) {
      return null;
    }
    if (floatingManualExecutionReportLatest.sourceContextId && pkg.sourceContextId &&
      floatingManualExecutionReportLatest.sourceContextId === pkg.sourceContextId) {
      return floatingManualExecutionReportLatest;
    }
    if (floatingManualExecutionReportLatest.sourceTaskCardId && pkg.sourceTaskCardId &&
      floatingManualExecutionReportLatest.sourceTaskCardId === pkg.sourceTaskCardId) {
      return floatingManualExecutionReportLatest;
    }
    return null;
  }

  function evaluateManualExecutionReportEligibility(step, pkg, handoffLatest) {
    var routeGate = applyRouteResultEligibility(step);
    var blockingReasons = [];
    var warningReasons = [];
    var handoffStatus = handoffLatest && handoffLatest.handoffStatus ? handoffLatest.handoffStatus : "none";

    if (!step || !step.fullTaskCard || !pkg || !pkg.sourceTaskCardId || !pkg.sourceContextId) {
      blockingReasons.push("missing_task_card_context");
    }
    if (!routeGate.originalCanSendToAgent) {
      blockingReasons.push("original_can_send_to_agent_false");
    }
    if (!routeGate.canSendToAgent) {
      blockingReasons.push("route_gate_blocked");
    }
    if (pkg && !pkg.canPrepare) {
      blockingReasons.push("prepare_not_allowed");
    }
    if (pkg && (pkg.prepareStatus === "Blocked" || pkg.prepareStatus === "Review Only")) {
      blockingReasons.push("prepare_status_" + String(pkg.prepareStatus).toLowerCase().replace(/\s+/g, "_"));
    }
    if (handoffStatus !== "manual_handoff_marked") {
      warningReasons.push("report_without_manual_handoff");
    }

    return {
      canSave: blockingReasons.length === 0,
      blockingReasons: blockingReasons,
      warningReasons: warningReasons,
      associationStatus: blockingReasons.length === 0 ? "linked" : "blocked",
      handoffStatus: handoffStatus
    };
  }

  function buildManualExecutionReportEntry(step, reportText) {
    var pkg = buildPreExecutionPackage(step);
    var handoffLatest = getPreExecutionHandoffStatusForPackage(pkg);
    var eligibility = evaluateManualExecutionReportEligibility(step, pkg, handoffLatest);
    var receivedAt = new Date().toISOString();

    if (!eligibility.canSave) {
      return {
        ok: false,
        error: "manual_execution_report_blocked",
        blockingReasons: eligibility.blockingReasons,
        associationStatus: eligibility.associationStatus
      };
    }
    if (!String(reportText || "").trim()) {
      return {
        ok: false,
        error: "manual_execution_report_empty",
        blockingReasons: ["empty_report_text"],
        associationStatus: "blocked"
      };
    }

    return {
      ok: true,
      reportId: "manual_report_" +
        sanitizeIdPart(pkg.sourceTaskCardId || "unknown") + "_" +
        sanitizeIdPart(pkg.sourceContextId || "no_context") + "_" +
        receivedAt.replace(/[^0-9A-Za-z]+/g, "_"),
      sourceTaskCardId: pkg.sourceTaskCardId || "",
      sourceStepId: pkg.sourceStepId || pkg.sourceContextId || "",
      sourceContextId: pkg.sourceContextId || "",
      target: pkg.target || "",
      resolvedExecutorId: pkg.resolvedExecutorId || "",
      handoffStatus: eligibility.handoffStatus,
      reportStatus: normalizeManualExecutionReportStatus("waiting_controller_review"),
      reportReceivedStatus: normalizeManualExecutionReportStatus("report_received"),
      reportText: String(reportText || ""),
      reportReceivedAt: receivedAt,
      actor: "user",
      canAutoReview: false,
      canAutoExecute: false,
      associationStatus: "linked",
      warningReasons: eligibility.warningReasons,
      waitingControllerReview: true
    };
  }

  function normalizeManualExecutionReportStatus(status) {
    return MANUAL_EXECUTION_REPORT_STATUSES[status] ? status : "none";
  }

  function saveManualExecutionReport(step, reportText) {
    var entry = buildManualExecutionReportEntry(step, reportText);
    if (!entry.ok) {
      setUnifiedActionFeedback("Manual Execution Report", "Save blocked.", "error", (entry.blockingReasons || [entry.error]).join(", "));
      return Promise.resolve(entry);
    }
    floatingManualExecutionReportLatest = entry;
    if (globalThis.AcbStorage && globalThis.AcbStorage.setLocalBridgeManualExecutionReportLatest) {
      return globalThis.AcbStorage.setLocalBridgeManualExecutionReportLatest(entry).then(function () {
        setUnifiedActionFeedback("Manual Execution Report", "Report received; waiting controller review.", "success", "reportId=" + entry.reportId);
        renderActionStepsSection();
        return entry;
      }).catch(function () {
        setUnifiedActionFeedback("Manual Execution Report", "Report saved in memory only.", "warning", "storage_write_failed");
        renderActionStepsSection();
        return entry;
      });
    }
    setUnifiedActionFeedback("Manual Execution Report", "Report saved in memory only.", "warning", "storage_unavailable");
    renderActionStepsSection();
    return Promise.resolve(entry);
  }

  function readLocalExecutionReport(step) {
    var pkg = buildPreExecutionPackage(step);
    var taskCardId = pkg.sourceTaskCardId || "";
    if (!taskCardId) {
      setUnifiedActionFeedback("Local Execution Report", "Cannot read: missing taskCardId.", "error", "no_taskCardId");
      return Promise.resolve({ ok: false, error: "missing_taskCardId" });
    }

    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_READ_LOCAL_EXECUTION_REPORT",
        taskCardId: taskCardId,
        timeout: 10000
      }, function (response) {
        if (!response || !response.ok) {
          var errMsg = response ? (response.error || response.detail || "unknown_error") : "no_response";
          setUnifiedActionFeedback("Local Execution Report", "Read failed.", "error", errMsg);
          floatingLocalReportReadResult = {
            ok: false,
            taskCardId: taskCardId,
            error: errMsg,
            readAt: new Date().toISOString()
          };
          resolve({ ok: false, error: errMsg });
          return;
        }

        var data = response.data || {};
        floatingLocalReportReadResult = {
          ok: true,
          taskCardId: taskCardId,
          sourcePath: data.sourcePath || "",
          fileTaskCardId: data.fileTaskCardId || taskCardId,
          taskCardIdConflict: Boolean(data.taskCardIdConflict),
          taskCardIdWarning: data.taskCardIdWarning || "",
          reportText: data.reportText || "",
          metadata: data.metadata || {},
          fileInfo: data.fileInfo || null,
          readAt: new Date().toISOString()
        };

        var reportText = data.reportText || "";
        if (!reportText.trim()) {
          setUnifiedActionFeedback("Local Execution Report", "Read succeeded but report is empty.", "warning", "empty_report_text");
          resolve({ ok: true, empty: true });
          return;
        }

        // Build manual execution report entry from local report data
        var meta = data.metadata || {};
        var entry = buildManualExecutionReportFromLocalReport(step, data);
        floatingManualExecutionReportLatest = entry;
        if (globalThis.AcbStorage && globalThis.AcbStorage.setLocalBridgeManualExecutionReportLatest) {
          globalThis.AcbStorage.setLocalBridgeManualExecutionReportLatest(entry).then(function () {
            setUnifiedActionFeedback("Local Execution Report", "Local report imported. Waiting controller review.", "success", "taskCardId=" + taskCardId + " sourcePath=" + (data.sourcePath || ""));
            renderActionStepsSection();
          }).catch(function () {
            setUnifiedActionFeedback("Local Execution Report", "Local report imported in memory only.", "warning", "storage_write_failed");
            renderActionStepsSection();
          });
        } else {
          setUnifiedActionFeedback("Local Execution Report", "Local report imported in memory only.", "warning", "storage_unavailable");
          renderActionStepsSection();
        }
        resolve({ ok: true });
      });
    });
  }

  function buildManualExecutionReportFromLocalReport(step, bridgeData) {
    var pkg = buildPreExecutionPackage(step);
    var handoffLatest = getPreExecutionHandoffStatusForPackage(pkg);
    var eligibility = evaluateManualExecutionReportEligibility(step, pkg, handoffLatest);
    var receivedAt = new Date().toISOString();
    var meta = bridgeData.metadata || {};

    return {
      ok: true,
      reportId: "local_report_" +
        sanitizeIdPart(pkg.sourceTaskCardId || "unknown") + "_" +
        sanitizeIdPart(pkg.sourceContextId || "no_context") + "_" +
        receivedAt.replace(/[^0-9A-Za-z]+/g, "_"),
      sourceTaskCardId: pkg.sourceTaskCardId || "",
      sourceStepId: pkg.sourceStepId || pkg.sourceContextId || "",
      sourceContextId: pkg.sourceContextId || "",
      target: pkg.target || meta.target || "",
      resolvedExecutorId: meta.executor || "",
      handoffStatus: eligibility.handoffStatus,
      reportStatus: normalizeManualExecutionReportStatus("waiting_controller_review"),
      reportReceivedStatus: normalizeManualExecutionReportStatus("report_received"),
      reportText: bridgeData.reportText || "",
      reportReceivedAt: receivedAt,
      actor: "user",
      canAutoReview: false,
      canAutoExecute: false,
      associationStatus: "linked",
      warningReasons: eligibility.warningReasons,
      waitingControllerReview: true,
      localReportReadAt: receivedAt,
      localReportSourcePath: bridgeData.sourcePath || "",
      localReportTaskCardIdConflict: Boolean(bridgeData.taskCardIdConflict),
      localReportFileTaskCardId: bridgeData.fileTaskCardId || "",
      localReportCommitHash: meta.commitHash || ""
    };
  }

  function isLifecycleEntryCurrentForPackage(entry, pkg, contextFieldName, taskFieldName) {
    if (!entry || !pkg) {
      return false;
    }
    var entryContextId = entry[contextFieldName || "sourceContextId"] || "";
    var entryTaskCardId = entry[taskFieldName || "sourceTaskCardId"] || "";
    if (entryContextId && pkg.sourceContextId) {
      return entryContextId === pkg.sourceContextId;
    }
    if (entryTaskCardId && pkg.sourceTaskCardId) {
      return entryTaskCardId === pkg.sourceTaskCardId;
    }
    return false;
  }

  function getTaskLifecycleLabel(status) {
    return TASK_LIFECYCLE_LABELS[status] || TASK_LIFECYCLE_LABELS.captured;
  }

  function deriveTaskLifecycleStatus(input) {
    var data = input || {};
    var step = data.step || null;
    var routeGate = data.routeGate || (step ? applyRouteResultEligibility(step) : null);
    var routeResult = data.routeResult || (routeGate ? routeGate.routeResult : null) || (step ? step.routeResult : null);
    var pkg = data.preExecutionPackage || (step ? buildPreExecutionPackage(step) : null);
    var handoffLatest = data.handoffLatest || null;
    var manualReportLatest = data.manualReportLatest || null;
    var hasFeedback = Boolean(data.hasFeedback);
    var hasClassification = Boolean(data.hasClassification);
    var hasCompletePayload = Boolean(step && step.fullTaskCard && step.payloadStatus === "complete" && pkg && pkg.sourceTaskCardId && pkg.sourceContextId);
    var handoffCurrent = isLifecycleEntryCurrentForPackage(handoffLatest, pkg, "sourceContextId", "sourceTaskCardId");
    var manualReportCurrent = Boolean(manualReportLatest &&
      manualReportLatest.associationStatus === "linked" &&
      isLifecycleEntryCurrentForPackage(manualReportLatest, pkg, "sourceContextId", "sourceTaskCardId"));

    if (manualReportCurrent && manualReportLatest.reportStatus === "waiting_controller_review") {
      return {
        status: "waiting_controller_review",
        label: getTaskLifecycleLabel("waiting_controller_review"),
        source: "manual_execution_report",
        reason: "current_manual_report_waiting_controller_review",
        currentResult: true
      };
    }
    if (manualReportCurrent && (manualReportLatest.reportStatus === "report_received" || manualReportLatest.reportReceivedStatus === "report_received" || manualReportLatest.reportText)) {
      return {
        status: "report_received",
        label: getTaskLifecycleLabel("report_received"),
        source: "manual_execution_report",
        reason: "current_manual_report_received",
        currentResult: true
      };
    }
    if (handoffCurrent && handoffLatest.handoffStatus === "manual_handoff_marked") {
      return {
        status: "manual_handoff_marked",
        label: getTaskLifecycleLabel("manual_handoff_marked"),
        source: "pre_execution_handoff",
        reason: "current_handoff_manual_handoff_marked",
        currentResult: true
      };
    }
    if (handoffCurrent && (handoffLatest.handoffStatus === "prepared" || handoffLatest.handoffStatus === "copied")) {
      return {
        status: "prepared",
        label: getTaskLifecycleLabel("prepared"),
        source: "pre_execution_handoff",
        reason: "current_handoff_" + handoffLatest.handoffStatus,
        currentResult: true
      };
    }

    if (!step || !hasCompletePayload) {
      var missingStatus = step && step.payloadStatus && step.payloadStatus !== "not_applicable"
        ? "payload_" + step.payloadStatus
        : "no_complete_task_card";
      return {
        status: "payload_missing",
        label: getTaskLifecycleLabel("payload_missing"),
        source: "payload_validation",
        reason: missingStatus,
        currentResult: Boolean(step)
      };
    }

    if ((routeGate && routeGate.canSendToAgent !== true) ||
      (routeResult && routeResult.terminalState !== "ROUTE-TASK-CARD-READY") ||
      (routeResult && (routeResult.sampleOnly || routeResult.cannotDispatch)) ||
      (pkg && (pkg.prepareStatus === "Blocked" || pkg.prepareStatus === "Review Only" || pkg.canPrepare !== true))) {
      return {
        status: "route_blocked",
        label: getTaskLifecycleLabel("route_blocked"),
        source: "route_or_prepare_gate",
        reason: routeGate && routeGate.blockingReasons && routeGate.blockingReasons.length > 0
          ? routeGate.blockingReasons.join(", ")
          : (pkg && pkg.prepareStatus ? "prepare_status_" + pkg.prepareStatus : "route_blocked"),
        currentResult: true
      };
    }

    if (pkg && pkg.canPrepare === true && routeGate && routeGate.canSendToAgent === true) {
      return {
        status: "ready_for_prepare",
        label: getTaskLifecycleLabel("ready_for_prepare"),
        source: "route_and_prepare_gate",
        reason: "payload_complete_route_ready_can_prepare",
        currentResult: true
      };
    }
    if (hasClassification) {
      return {
        status: "classified",
        label: getTaskLifecycleLabel("classified"),
        source: "feedback_classification",
        reason: "classification_detected_fallback",
        currentResult: true
      };
    }
    return {
      status: "captured",
      label: getTaskLifecycleLabel("captured"),
      source: "page_capture",
      reason: hasFeedback ? "feedback_captured_fallback" : "no_feedback_context",
      currentResult: hasFeedback
    };
  }


  function deriveRouteGatedCanSendToAgent(step, routeResult) {
    var pv = step && step.payloadValidation ? step.payloadValidation : {};
    var originalCanSendToAgent = Boolean(step && step.target !== "controller" && step.payloadStatus === "complete" && pv.canSendToAgent === true && step.fullTaskCard);
    var rr = routeResult || (step && step.routeResult) || null;
    var blockingReasons = [];
    var terminalBlocks = {
      "ROUTE-SAMPLE-ACCEPTED": true,
      "ROUTE-TASK-CARD-BLOCKED": true,
      "ROUTE-EXECUTION-REVIEW": true,
      "ROUTE-OWNER-REVIEW": true,
      "ROUTE-CLARIFICATION": true,
      "ROUTE-RECOVERABLE-ERROR": true
    };

    if (!originalCanSendToAgent) {
      blockingReasons.push("original_can_send_to_agent_false");
    }
    if (!rr) {
      blockingReasons.push("route_result_missing");
    } else {
      if (rr.protocolType !== "acb_task_card") {
        blockingReasons.push("protocol_not_acb_task_card");
      }
      if (rr.payloadStatus !== "complete") {
        blockingReasons.push("payload_" + (rr.payloadStatus || "invalid"));
      }
      if (rr.targetRole !== "agent") {
        blockingReasons.push(rr.targetRole === "controller" ? "target_controller_not_agent" : "target_not_agent");
      }
      if (rr.sampleOnly) {
        blockingReasons.push("sample_only_cannot_dispatch");
      }
      if (rr.cannotDispatch) {
        blockingReasons.push("cannot_dispatch");
      }
      if (rr.terminalState !== "ROUTE-TASK-CARD-READY") {
        blockingReasons.push("terminal_state_not_ready");
      }
      if (terminalBlocks[rr.terminalState]) {
        blockingReasons.push("terminal_state_blocked:" + rr.terminalState);
      }
      if (rr.canSendToAgent !== true) {
        blockingReasons.push("route_result_can_send_false");
      }
      if (rr.canTriggerExecution !== false) {
        blockingReasons.push("can_trigger_execution_must_remain_false");
      }
      if (Array.isArray(rr.blockingReasons)) {
        for (var i = 0; i < rr.blockingReasons.length; i += 1) {
          if (rr.blockingReasons[i] && rr.blockingReasons[i] !== "locked_readonly_execution_disabled") {
            blockingReasons.push(rr.blockingReasons[i]);
          }
        }
      }
    }

    return {
      originalCanSendToAgent: originalCanSendToAgent,
      canSendToAgent: Boolean(originalCanSendToAgent &&
        rr &&
        rr.protocolType === "acb_task_card" &&
        rr.payloadStatus === "complete" &&
        rr.targetRole === "agent" &&
        rr.sampleOnly !== true &&
        rr.cannotDispatch !== true &&
        rr.terminalState === "ROUTE-TASK-CARD-READY" &&
        rr.canSendToAgent === true &&
        rr.canTriggerExecution === false),
      routeGateApplied: Boolean(rr),
      blockingReasons: uniqueStrings(blockingReasons),
      routeResult: rr
    };
  }

  function applyRouteResultEligibility(step) {
    var gate = deriveRouteGatedCanSendToAgent(step, step ? step.routeResult : null);
    if (step) {
      step.routeGate = gate;
    }
    return gate;
  }

  function getRouteGateBlockingReasonText(gate) {
    if (!gate || !Array.isArray(gate.blockingReasons) || gate.blockingReasons.length === 0) {
      return "route_gate_blocked";
    }
    return gate.blockingReasons.join(", ");
  }

  function taskCardReviewMatchesContext(entry, ctx) {
    if (!entry || !ctx) { return false; }
    if (entry.contextId && ctx.contextId) {
      return entry.contextId === ctx.contextId;
    }
    if (entry.taskCardId && ctx.taskCardId) {
      return entry.taskCardId === ctx.taskCardId;
    }
    return false;
  }

  function evaluateTaskCardReviewBridgeSendEligibility(step) {
    if (!step) {
      return { enabled: false, reason: "no_current_action_step" };
    }
    if (step.target === "controller") {
      return { enabled: false, reason: "target_controller_not_sendable" };
    }
    if (!step.fullTaskCard) {
      return { enabled: false, reason: "missing_full_task_card" };
    }
    if (step.payloadStatus !== "complete") {
      return { enabled: false, reason: "payload_not_complete" };
    }
    var pv = step.payloadValidation || {};
    if (!pv.canSendToAgent) {
      return { enabled: false, reason: "can_send_to_agent_false" };
    }
    var routeGate = applyRouteResultEligibility(step);
    if (!routeGate.canSendToAgent) {
      return { enabled: false, reason: "route_gate_blocked", detail: getRouteGateBlockingReasonText(routeGate) };
    }
    if (String(step.fullTaskCard).indexOf("<ACB_TASK_CARD") === -1) {
      return { enabled: false, reason: "missing_start_marker" };
    }
    if (String(step.fullTaskCard).indexOf("<ACB_TASK_CARD_END") === -1) {
      return { enabled: false, reason: "missing_end_marker" };
    }
    if (!pv.taskCardIdMatched) {
      return { enabled: false, reason: "task_card_id_mismatch" };
    }
    if (!pv.targetMatched) {
      return { enabled: false, reason: "target_mismatch" };
    }
    if (Array.isArray(pv.requiredFieldsMissing) && pv.requiredFieldsMissing.length > 0) {
      return { enabled: false, reason: "missing_required_fields" };
    }
    if (pv.multipleTaskCardsDetected) {
      return { enabled: false, reason: "multiple_task_cards_detected" };
    }
    if (pv.truncatedSuspected) {
      return { enabled: false, reason: "truncated_task_card_suspected" };
    }

    var taskFields = parseTaskCardCoreFields(step.fullTaskCard);
    if (!taskFields.taskCardId) {
      return { enabled: false, reason: "missing_task_card_id_field" };
    }
    if (!taskFields.target) {
      return { enabled: false, reason: "missing_target_field" };
    }
    return { enabled: true, reason: "" };
  }

  function getTaskCardReviewBridgeDisabledReasonText(reason) {
    var map = {
      no_current_action_step: "当前无可发送的 Action Step。",
      target_controller_not_sendable: "controller 步骤仅用于总控审查，不能发送到执行查看端。",
      missing_full_task_card: "当前步骤缺少完整任务卡。",
      payload_not_complete: "当前步骤载荷未达 complete。",
      can_send_to_agent_false: "当前步骤 canSendToAgent=false。",
      missing_start_marker: "任务卡缺少起始标记。",
      missing_end_marker: "任务卡缺少结束标记。",
      task_card_id_mismatch: "任务卡起止 ID 不匹配。",
      target_mismatch: "任务卡 target 不匹配。",
      missing_required_fields: "任务卡缺少必要字段。",
      multiple_task_cards_detected: "检测到多个任务卡块。",
      truncated_task_card_suspected: "任务卡疑似截断。",
      missing_task_card_id_field: "任务卡 body 缺少 taskCardId 字段。",
      missing_target_field: "任务卡 body 缺少 target 字段。"
    };
    return map[reason] || "当前步骤不满足发送条件。";
  }

  function executionInboxMatchesContext(entry, ctx) {
    if (!entry || !ctx) { return false; }
    if (entry.contextId && ctx.contextId) {
      return entry.contextId === ctx.contextId;
    }
    if (entry.taskCardId && ctx.taskCardId) {
      return entry.taskCardId === ctx.taskCardId;
    }
    return false;
  }

  function evaluateExecutionInboxSendEligibility(step) {
    if (!step) {
      return { enabled: false, reason: "no_current_action_step", rejectReasons: ["no_current_action_step"] };
    }
    if (step.target === "controller") {
      return { enabled: false, reason: "target_controller_not_agent", rejectReasons: ["target_controller_not_agent"] };
    }
    if (!step.fullTaskCard) {
      return { enabled: false, reason: "no_complete_task_card", rejectReasons: ["no_complete_task_card"] };
    }
    if (step.payloadStatus !== "complete") {
      return { enabled: false, reason: "payload_not_complete", rejectReasons: ["payload_not_complete"] };
    }
    var pv = step.payloadValidation || {};
    if (!pv.canSendToAgent) {
      return { enabled: false, reason: "route_result_can_send_false", rejectReasons: ["route_result_can_send_false"] };
    }
    var routeGate = applyRouteResultEligibility(step);
    var rr = routeGate.routeResult || {};
    if (!routeGate.canSendToAgent) {
      return { enabled: false, reason: "route_gate_blocked", rejectReasons: routeGate.blockingReasons || ["route_gate_blocked"] };
    }
    if (rr.protocolType !== "acb_task_card") {
      return { enabled: false, reason: "protocol_not_acb_task_card", rejectReasons: ["protocol_not_acb_task_card"] };
    }
    if (rr.payloadStatus !== "complete") {
      return { enabled: false, reason: "payload_not_complete", rejectReasons: ["payload_not_complete"] };
    }
    if (rr.targetRole !== "agent") {
      return { enabled: false, reason: "target_controller_not_agent", rejectReasons: ["target_controller_not_agent"] };
    }
    if (rr.terminalState !== "ROUTE-TASK-CARD-READY") {
      return { enabled: false, reason: "terminal_state_not_ready", rejectReasons: ["terminal_state_not_ready"] };
    }
    if (rr.sampleOnly === true) {
      return { enabled: false, reason: "sample_only_cannot_dispatch", rejectReasons: ["sample_only_cannot_dispatch"] };
    }
    if (rr.cannotDispatch === true) {
      return { enabled: false, reason: "cannot_dispatch", rejectReasons: ["cannot_dispatch"] };
    }
    if (rr.canSendToAgent !== true) {
      return { enabled: false, reason: "route_result_can_send_false", rejectReasons: ["route_result_can_send_false"] };
    }
    if (rr.canTriggerExecution !== false) {
      return { enabled: false, reason: "can_trigger_execution_must_remain_false", rejectReasons: ["can_trigger_execution_must_remain_false"] };
    }
    if (!floatingBridgeLatest || floatingBridgeLatest.ok !== true) {
      return { enabled: false, reason: "bridge_not_connected", rejectReasons: ["bridge_not_connected"] };
    }

    var stepCtx = getExecutionContextForStep(step);
    if (!stepCtx || !stepCtx.contextId || !stepCtx.hasCompleteTaskCard) {
      return { enabled: false, reason: "no_complete_task_card", rejectReasons: ["no_complete_task_card"] };
    }
    if (floatingPreflightLatest && !preflightMatchesContext(floatingPreflightLatest, stepCtx)) {
      return { enabled: false, reason: "stale_context", rejectReasons: ["stale_context"] };
    }
    if (floatingReadinessLatest && floatingReadinessLatest.data && floatingReadinessLatest.data.readiness) {
      var rd = floatingReadinessLatest.data.readiness;
      if (rd.requestContextId && rd.requestContextId !== stepCtx.contextId) {
        return { enabled: false, reason: "stale_context", rejectReasons: ["stale_context"] };
      }
    }
    return { enabled: true, reason: "", rejectReasons: [], context: stepCtx };
  }

  function getExecutionInboxRejectReasonText(reasons) {
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return "execution_inbox_gate_blocked";
    }
    return reasons.join(", ");
  }

  function buildExecutionInboxEnvelope(step, stepIndex, ctx, preflightLatest, readinessLatest) {
    var taskFields = parseTaskCardCoreFields(step.fullTaskCard);
    var feedback = getSelectedFeedback();
    var sourceMeta = buildSourceMetadataForStep(step, stepIndex);
    var routeGate = applyRouteResultEligibility(step);
    var routeResult = routeGate.routeResult || step.routeResult || {};
    return {
      taskCardText: step.fullTaskCard,
      taskCardId: taskFields.taskCardId || step.taskCardId || "",
      target: taskFields.target || step.target || "",
      projectDir: taskFields.projectDir || "",
      currentBranch: taskFields.currentBranch || "",
      currentCommit: taskFields.currentCommit || "",
      sourceMetadata: {
        source: currentMode === MODE_CHATGPT ? "chatgpt-page" : "mock-page",
        contextId: ctx.contextId,
        feedbackHash: feedback ? (feedback.hash || "") : "",
        channelId: floatingSelectedChannelId || "",
        channelName: (getChannelById(floatingSelectedChannelId) || {}).name || "",
        actionStepIndex: stepIndex,
        sourceConversationId: sourceMeta.sourceConversationId || "",
        sourceMessageHash: sourceMeta.sourceMessageHash || "",
        sourceDisplayName: sourceMeta.sourceDisplayName || ""
      },
      routeResult: routeResult,
      payloadValidation: step.payloadValidation || {},
      preflightSnapshot: preflightLatest && preflightLatest.data ? preflightLatest.data : {},
      readinessSnapshot: readinessLatest && readinessLatest.data ? readinessLatest.data : {},
      safetyMetadata: {
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false,
        noAutoDispatch: true,
        noCommandExecution: true,
        canTriggerExecution: false
      }
    };
  }

  function syncTaskCardReviewBridgeButton() {
    // Global send button has been removed; per-step send buttons are
    // rendered inside each Action Step card with their own eligibility.
    // This function is kept as a no-op for backward compatibility with
    // existing call sites that trigger UI refresh.
  }

  function setTaskCardReviewBridgeStatus(text, color) {
    var el = document.getElementById("acb-task-card-review-status");
    if (el) {
      el.textContent = text || "-";
      if (color) {
        el.style.color = color;
      }
    }
  }

  function setStepTaskCardReviewStatus(stepIndex, text, color) {
    var el = document.getElementById("acb-task-card-review-step-status-" + stepIndex);
    if (el) {
      el.textContent = text || "";
      if (color) {
        el.style.color = color;
      }
    }
  }

  // Per-step send to VS Code viewer — bound to a concrete Action Step
  function setStepExecutionInboxStatus(stepIndex, text, color) {
    var el = document.getElementById("acb-execution-inbox-step-status-" + stepIndex);
    if (el) {
      el.textContent = text || "";
      if (color) {
        el.style.color = color;
      }
    }
  }

  async function sendStepToVSCodeViewer(step) {
    if (!step) { return; }

    var stepIndex = (step.order !== undefined ? step.order - 1 : -1);
    var eligibility = evaluateTaskCardReviewBridgeSendEligibility(step);
    if (!eligibility.enabled) {
      var rejectReason = eligibility.detail || getTaskCardReviewBridgeDisabledReasonText(eligibility.reason);
      setStepTaskCardReviewStatus(stepIndex, "发送被拦截：" + rejectReason, "#dc2626");
      setTaskCardReviewBridgeStatus("发送被拦截：" + rejectReason, "#dc2626");
      setUnifiedActionFeedback("发送到 VS Code 查看端", "发送被拦截。", "error", rejectReason);
      // Record rejected attempt so export report reflects the attempt
      globalThis.AcbStorage.setLocalBridgeTaskCardReviewLatest({
        timestamp: new Date().toISOString(),
        ok: false,
        accepted: false,
        attempted: true,
        taskCardId: (step.taskCardId || ""),
        target: step.target || "",
        contextId: "",
        error: "eligibility_rejected: " + rejectReason,
        actionStepIndex: stepIndex,
        payloadStatus: step.payloadStatus || ""
      }).catch(function () {});
      return;
    }

    var ctx = getActiveExecutionContext();
    var feedback = getSelectedFeedback();
    var taskFields = parseTaskCardCoreFields(step.fullTaskCard);
    var preflightLatest = await globalThis.AcbStorage.getLocalBridgePreflightLatest().catch(function () { return null; });
    var readinessLatest = await globalThis.AcbStorage.getLocalBridgeReadinessLatest().catch(function () { return null; });
    var sendRouteGate = applyRouteResultEligibility(step);

    var reviewMetadata = {
      taskCardId: taskFields.taskCardId || step.taskCardId || "",
      target: step.target || taskFields.target || "",
      contextId: ctx.contextId,
      feedbackHash: feedback ? (feedback.hash || "") : "",
      channelId: floatingSelectedChannelId || "",
      channelName: (getChannelById(floatingSelectedChannelId) || {}).name || "",
      actionStepIndex: stepIndex,
      payloadStatus: step.payloadStatus || "not_applicable",
      canSendToAgent: Boolean(sendRouteGate.canSendToAgent),
      originalCanSendToAgent: Boolean(sendRouteGate.originalCanSendToAgent),
      routeGateApplied: Boolean(sendRouteGate.routeGateApplied),
      routeGateBlockingReasons: sendRouteGate.blockingReasons || [],
      preflightStatus: (preflightLatest && preflightLatest.data && preflightLatest.data.preflight) ? (preflightLatest.data.preflight.status || "unknown") : "not_run",
      readinessStatus: (readinessLatest && readinessLatest.data && readinessLatest.data.readiness) ? (readinessLatest.data.readiness.status || "unknown") : "not_run",
      warningReasons: (readinessLatest && readinessLatest.data && readinessLatest.data.readiness && readinessLatest.data.readiness.warningReasons) || [],
      blockingReasons: (readinessLatest && readinessLatest.data && readinessLatest.data.readiness && readinessLatest.data.readiness.blockingReasons) || [],
      projectDir: taskFields.projectDir || "",
      currentBranch: taskFields.currentBranch || "",
      currentCommit: taskFields.currentCommit || "",
      source: currentMode === MODE_CHATGPT ? "chatgpt-page" : "mock-page"
    };

    // Record attempt IMMEDIATELY before async call so export report reflects it
    var immediateAttempt = {
      timestamp: new Date().toISOString(),
      ok: false,
      accepted: false,
      attempted: true,
      status: "sending",
      taskCardId: reviewMetadata.taskCardId,
      target: reviewMetadata.target,
      contextId: ctx.contextId,
      error: null,
      actionStepIndex: stepIndex,
      payloadStatus: reviewMetadata.payloadStatus
    };
    globalThis.AcbStorage.setLocalBridgeTaskCardReviewLatest(immediateAttempt).catch(function () {});

    setStepTaskCardReviewStatus(stepIndex, "发送中...", "#6b7280");
    setTaskCardReviewBridgeStatus("发送中...", "#6b7280");
    setUnifiedActionFeedback("发送到 VS Code 查看端", "正在发送到 VS Code 查看端...", "info", "步骤 " + (step.order || "?"));
    try {
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_SEND_TASK_CARD_REVIEW",
        timeout: 10000,
        executablePayload: step.fullTaskCard,
        reviewMetadata: reviewMetadata,
        safety: {
          noAutoDispatch: true,
          noCommandExecution: true,
          executionAllowed: false,
          agentDispatchAllowed: false,
          gitWriteAllowed: false
        },
        contextId: ctx.contextId,
        feedbackHash: reviewMetadata.feedbackHash,
        channelId: reviewMetadata.channelId,
        channelName: reviewMetadata.channelName,
        actionStepIndex: reviewMetadata.actionStepIndex,
        payloadStatus: reviewMetadata.payloadStatus
      });

      if (result && result.ok && result.data && result.data.accepted) {
        setStepTaskCardReviewStatus(stepIndex, "已接受", "#16a34a");
        setTaskCardReviewBridgeStatus("步骤" + (step.order || "?") + " 已发送并被 VS Code 查看端接受。", "#16a34a");
        setUnifiedActionFeedback("发送到 VS Code 查看端", "已发送到 VS Code 查看端，Bridge 已接受。", "success", "taskCardId=" + (reviewMetadata.taskCardId || "unknown"));
      } else {
        var msg = (result && (result.error || (result.data && (result.data.detail || result.data.error)))) || "未知错误";
        setStepTaskCardReviewStatus(stepIndex, "发送失败：" + msg, "#dc2626");
        setTaskCardReviewBridgeStatus("步骤" + (step.order || "?") + " 发送失败：" + msg, "#dc2626");
        setUnifiedActionFeedback("发送到 VS Code 查看端", "发送被拒绝或失败。", "error", msg);
      }
      loadTaskCardReviewFromStorage();
    } catch (err) {
      setStepTaskCardReviewStatus(stepIndex, "发送异常：" + (err.message || String(err)), "#dc2626");
      setTaskCardReviewBridgeStatus("发送异常：" + (err.message || String(err)), "#dc2626");
      setUnifiedActionFeedback("发送到 VS Code 查看端", "发送失败。", "error", err.message || String(err));
      loadTaskCardReviewFromStorage();
    }
  }

  async function sendStepToExecutionInbox(step) {
    if (!step) { return; }

    var plan = getCurrentActionPlan();
    var freshStep = step;
    var stepIndex = (step.order !== undefined ? step.order - 1 : -1);
    if (plan && Array.isArray(plan.steps)) {
      for (var i = 0; i < plan.steps.length; i += 1) {
        if (plan.steps[i] && plan.steps[i].id === step.id) {
          freshStep = plan.steps[i];
          stepIndex = i;
          break;
        }
      }
    }

    var eligibility = evaluateExecutionInboxSendEligibility(freshStep);
    var ctx = eligibility.context || getExecutionContextForStep(freshStep);
    var rejectText = getExecutionInboxRejectReasonText(eligibility.rejectReasons);
    if (!eligibility.enabled) {
      setStepExecutionInboxStatus(stepIndex, "Execution Inbox blocked: " + rejectText, "#dc2626");
      setUnifiedActionFeedback("Execution Inbox", "Send blocked before POST.", "error", rejectText);
      globalThis.AcbStorage.setLocalBridgeExecutionInboxLatest({
        timestamp: new Date().toISOString(),
        ok: false,
        accepted: false,
        attempted: false,
        status: eligibility.reason === "stale_context" ? "stale" : "rejected_by_gate",
        taskCardId: (freshStep && freshStep.taskCardId) || "",
        target: (freshStep && freshStep.target) || "",
        contextId: ctx ? (ctx.contextId || "") : "",
        rejectReasons: eligibility.rejectReasons || [],
        error: rejectText,
        actionStepIndex: stepIndex,
        payloadStatus: freshStep ? (freshStep.payloadStatus || "") : "",
        staleContextIgnored: eligibility.reason === "stale_context",
        taskCardPayloadPresent: Boolean(freshStep && freshStep.fullTaskCard),
        canTriggerExecution: false,
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }).catch(function () {});
      loadExecutionInboxFromStorage();
      return;
    }

    var preflightLatest = await globalThis.AcbStorage.getLocalBridgePreflightLatest().catch(function () { return null; });
    var readinessLatest = await globalThis.AcbStorage.getLocalBridgeReadinessLatest().catch(function () { return null; });
    if (preflightLatest && !preflightMatchesContext(preflightLatest, ctx)) {
      setStepExecutionInboxStatus(stepIndex, "Execution Inbox blocked: stale_context", "#dc2626");
      setUnifiedActionFeedback("Execution Inbox", "Send blocked before POST.", "error", "stale_context");
      globalThis.AcbStorage.setLocalBridgeExecutionInboxLatest({
        timestamp: new Date().toISOString(),
        ok: false,
        accepted: false,
        attempted: false,
        status: "stale",
        taskCardId: ctx.taskCardId || "",
        target: ctx.target || "",
        contextId: ctx.contextId || "",
        rejectReasons: ["stale_context"],
        error: "stale_context",
        actionStepIndex: stepIndex,
        payloadStatus: ctx.payloadStatus || "",
        staleContextIgnored: true,
        taskCardPayloadPresent: Boolean(freshStep && freshStep.fullTaskCard),
        canTriggerExecution: false,
        noAutoDispatch: true,
        noCommandExecution: true,
        executionAllowed: false,
        agentDispatchAllowed: false,
        gitWriteAllowed: false
      }).catch(function () {});
      loadExecutionInboxFromStorage();
      return;
    }

    var envelope = buildExecutionInboxEnvelope(freshStep, stepIndex, ctx, preflightLatest, readinessLatest);
    var immediateAttempt = {
      timestamp: new Date().toISOString(),
      ok: false,
      accepted: false,
      attempted: true,
      status: "sending",
      taskCardId: envelope.taskCardId,
      target: envelope.target,
      contextId: ctx.contextId,
      error: null,
      rejectReasons: [],
      actionStepIndex: stepIndex,
      payloadStatus: freshStep.payloadStatus || "",
      staleContextIgnored: false,
      taskCardPayloadPresent: Boolean(envelope.taskCardText),
      canTriggerExecution: false,
      noAutoDispatch: true,
      noCommandExecution: true,
      executionAllowed: false,
      agentDispatchAllowed: false,
      gitWriteAllowed: false
    };
    globalThis.AcbStorage.setLocalBridgeExecutionInboxLatest(immediateAttempt).catch(function () {});

    setStepExecutionInboxStatus(stepIndex, "Execution Inbox sending...", "#6b7280");
    setUnifiedActionFeedback("Execution Inbox", "Sending to local execution inbox...", "info", "taskCardId=" + (envelope.taskCardId || "unknown"));
    try {
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_SEND_EXECUTION_INBOX",
        timeout: 10000,
        envelope: envelope,
        contextId: ctx.contextId,
        feedbackHash: envelope.sourceMetadata.feedbackHash,
        channelId: envelope.sourceMetadata.channelId,
        channelName: envelope.sourceMetadata.channelName,
        actionStepIndex: stepIndex,
        payloadStatus: freshStep.payloadStatus || ""
      });

      if (result && result.ok && result.data && result.data.accepted) {
        var inboxItemId = result.data.inboxItemId || "";
        setStepExecutionInboxStatus(stepIndex, "Execution Inbox accepted: " + inboxItemId, "#16a34a");
        setUnifiedActionFeedback("Execution Inbox", "Accepted by local execution inbox.", "success", "inboxItemId=" + (inboxItemId || "unknown"));
      } else {
        var data = result && result.data ? result.data : {};
        var reasons = Array.isArray(data.rejectReasons) ? data.rejectReasons : [];
        var msg = reasons.length > 0 ? reasons.join(", ") : ((result && result.error) || data.detail || data.error || "unknown_error");
        setStepExecutionInboxStatus(stepIndex, "Execution Inbox rejected: " + msg, "#dc2626");
        setUnifiedActionFeedback("Execution Inbox", "Rejected by local execution inbox.", "error", msg);
      }
      loadExecutionInboxFromStorage();
    } catch (err) {
      setStepExecutionInboxStatus(stepIndex, "Execution Inbox error: " + (err.message || String(err)), "#dc2626");
      setUnifiedActionFeedback("Execution Inbox", "Send failed.", "error", err.message || String(err));
      loadExecutionInboxFromStorage();
    }
  }

  // --- Terminal Action: Result Detail Mapping ---
  function normalizeTerminalResultDetail(raw, actionType, result) {
    // Map raw bridge status value to canonical terminal action result detail.
    // When the action succeeded, return action-specific success detail.
    if (result === true || result === "success") {
      if (actionType === "fill_executor_terminal") { return "fill_ok"; }
      if (actionType === "launch_executor_terminal") { return "launch_ok"; }
      if (actionType === "status_executor_terminal") { return "status_ok"; }
      return "success";
    }
    // For blocked / error: if raw is meaningful, use it; otherwise fallback.
    if (!raw || raw === "unknown") {
      if (actionType === "fill_executor_terminal") { return "fill_rejected"; }
      if (actionType === "launch_executor_terminal") { return "launch_rejected"; }
      return "unexpected_exception";
    }
    return raw;
  }

  function mapTerminalActionResultDetail(raw, actionType, result) {
    if (raw && raw !== "unknown") { return raw; }
    if (result === "success") { return "unexpected_exception"; } // should not happen: no detail for success
    if (actionType === "fill_executor_terminal") { return "fill_rejected"; }
    if (actionType === "launch_executor_terminal") { return "launch_rejected"; }
    return "unexpected_exception";
  }

  // --- Terminal Action: Status Query ---
  async function queryTargetTerminalStatus(executorId, taskCardId, target) {
    // Collect context diagnostics before attempt
    var step = null;
    try {
      var plan = getCurrentActionPlan();
      step = resolveCurrentActionStep(plan);
    } catch (_cte) {
      terminalActionState = {
        attempted: true,
        actionType: "status_executor_terminal",
        executor: executorId || "",
        taskCardId: taskCardId || "",
        localInboxTaskCardId: "",
        localInboxTarget: "",
        contextMatched: false,
        endpointPath: "/acb/v1/terminal/status",
        swMessageType: "ACB_BRIDGE_TERMINAL_STATUS",
        result: "error",
        resultDetail: "browser_handler_exception",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      renderActionStepsSection();
      return { ok: false, error: "browser_handler_exception", bridge_status: "not_attempted" };
    }
    var ctx = step ? getExecutionContextForStep(step) : null;
    var handoffData = step ? getExecutionInboxHandoffSurfaceData(step) : null;
    var localInboxTaskCardId = (handoffData && handoffData.entry) ? (handoffData.entry.taskCardId || "") : "";
    var localInboxTarget = (handoffData && handoffData.entry) ? (handoffData.entry.target || "") : "";
    var contextMatched = handoffData ? handoffData.contextMatched : false;

    if (!executorId) {
      terminalStatusCache = { bridge_status: "not_attempted", terminal_status: "not_attempted", terminal_found: false };
      terminalActionState = {
        attempted: true,
        actionType: "status_executor_terminal",
        executor: executorId || "",
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/status",
        swMessageType: "ACB_BRIDGE_TERMINAL_STATUS",
        result: "error",
        resultDetail: "target_missing",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      renderActionStepsSection();
      return { ok: false, error: "missing_executor_id", bridge_status: "not_attempted" };
    }
    setUnifiedActionFeedback("Terminal Status", "正在查询终端状态...", "info", "executorId=" + executorId);
    try {
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_TERMINAL_STATUS",
        timeout: 5000,
        executorId: executorId
      });
      if (result && result.ok && result.data) {
        terminalStatusCache = result.data;
        if (!terminalStatusCache.bridge_status) {
          terminalStatusCache.bridge_status = "connected";
        }
        terminalActionState = {
          attempted: true,
          actionType: "status_executor_terminal",
          executor: executorId,
          taskCardId: taskCardId || "",
          localInboxTaskCardId: localInboxTaskCardId,
          localInboxTarget: localInboxTarget,
          contextMatched: contextMatched,
          endpointPath: "/acb/v1/terminal/status",
          swMessageType: "ACB_BRIDGE_TERMINAL_STATUS",
          result: "success",
          resultDetail: "status_ok",
          terminalName: result.data.terminal_name || "",
          bridgeResponseStatus: result.status,
          bridgeResponseOk: result ? Boolean(result.ok) : null,
          at: new Date().toISOString(),
          noAutoEnter: true,
          noExecution: true
        };
        setUnifiedActionFeedback("Terminal Status", "查询成功。", "success", "terminal=" + (result.data.terminal_name || ""));
        return result.data;
      }
      terminalStatusCache = {
        bridge_status: (result && result.error) ? "request_failed" : "disconnected",
        terminal_status: "unknown_after_query_failed",
        terminal_found: false,
        terminal_name: "",
        executor_id: executorId
      };
      terminalActionState = {
        attempted: true,
        actionType: "status_executor_terminal",
        executor: executorId,
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/status",
        swMessageType: "ACB_BRIDGE_TERMINAL_STATUS",
        result: "error",
        resultDetail: (result && result.error) ? normalizeTerminalStatusQueryFailure(result) : "bridge_unavailable",
        bridgeResponseStatus: result ? result.status : null,
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      setUnifiedActionFeedback("Terminal Status", "查询失败。", "error", (result && result.error) || "bridge_unavailable");
      return { ok: false, bridge_status: terminalStatusCache.bridge_status, error: (result && result.error) || "bridge_unavailable" };
    } catch (err) {
      terminalStatusCache = {
        bridge_status: "disconnected",
        terminal_status: "unknown_after_query_failed",
        terminal_found: false,
        terminal_name: "",
        executor_id: executorId
      };
      terminalActionState = {
        attempted: true,
        actionType: "status_executor_terminal",
        executor: executorId,
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/status",
        swMessageType: "ACB_BRIDGE_TERMINAL_STATUS",
        result: "error",
        resultDetail: "service_worker_error",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      setUnifiedActionFeedback("Terminal Status", "查询失败。", "error", err.message || String(err));
      return { ok: false, bridge_status: "disconnected", error: err.message || String(err) };
    }
  }

  function normalizeTerminalStatusQueryFailure(result) {
    if (!result) { return "bridge_unavailable"; }
    if (result.error) {
      if (String(result.error).indexOf("AbortError") !== -1 || String(result.error).indexOf("timed out") !== -1) { return "service_worker_error"; }
      if (String(result.error).indexOf("HTTP") !== -1 || String(result.error).indexOf("http") !== -1) { return "local_bridge_http_error"; }
    }
    if (result.status === 404) { return "endpoint_missing"; }
    if (result.status === 403 || result.status === 401) { return "status_rejected"; }
    return "bridge_unavailable";
  }

  // --- Terminal Action: Launch Target Terminal ---
  async function launchTargetTerminal(executorId, taskCardId, target) {
    // Collect context diagnostics before attempt
    var step = null;
    try {
      var plan = getCurrentActionPlan();
      step = resolveCurrentActionStep(plan);
    } catch (_cte) {
      terminalActionState = {
        attempted: true,
        actionType: "launch_executor_terminal",
        executor: executorId || "",
        taskCardId: taskCardId || "",
        localInboxTaskCardId: "",
        localInboxTarget: "",
        contextMatched: false,
        endpointPath: "/acb/v1/terminal/launch",
        swMessageType: "ACB_BRIDGE_TERMINAL_LAUNCH",
        result: "error",
        resultDetail: "browser_handler_exception",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      renderActionStepsSection();
      return;
    }
    var ctx = step ? getExecutionContextForStep(step) : null;
    var handoffData = step ? getExecutionInboxHandoffSurfaceData(step) : null;
    var localInboxTaskCardId = (handoffData && handoffData.entry) ? (handoffData.entry.taskCardId || "") : "";
    var localInboxTarget = (handoffData && handoffData.entry) ? (handoffData.entry.target || "") : "";
    var contextMatched = handoffData ? handoffData.contextMatched : false;

    if (!executorId) {
      terminalActionState = {
        attempted: true,
        actionType: "launch_executor_terminal",
        executor: executorId || "",
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/launch",
        swMessageType: "ACB_BRIDGE_TERMINAL_LAUNCH",
        result: "error",
        resultDetail: "target_missing",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      renderActionStepsSection();
      return;
    }

    // Populate bridge/terminal status from any prior status query
    if (terminalStatusCache) {
      var tsc = terminalStatusCache;
    }

    setUnifiedActionFeedback("Terminal Launch", "正在启动目标终端...", "info", "executorId=" + executorId);
    try {
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_TERMINAL_LAUNCH",
        timeout: 10000,
        executorId: executorId
      });
      var data = (result && result.data) || {};
      var launched = data.launched === true;

      // Populate terminalStatusCache from launch response
      if (!data.bridge_status && result && result.ok !== undefined) {
        data.bridge_status = result.ok ? "connected" : "request_failed";
      }
      if (!data.terminal_status) {
        data.terminal_status = data.launch_status || (launched ? "found" : "missing");
      }
      terminalStatusCache = {
        bridge_status: data.bridge_status || (result && result.error ? "request_failed" : "connected"),
        terminal_status: data.terminal_status || "missing",
        terminal_found: data.terminal_status === "terminal_found" || launched,
        terminal_name: data.terminal_name || data.terminal_name_actual || "",
        executor_id: executorId
      };

      terminalActionState = {
        attempted: true,
        actionType: "launch_executor_terminal",
        executor: executorId,
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/launch",
        swMessageType: "ACB_BRIDGE_TERMINAL_LAUNCH",
        result: launched ? "success" : "blocked",
        resultDetail: normalizeTerminalResultDetail(data.launch_status || data.error,
          "launch_executor_terminal", launched),
        terminalName: data.terminal_name || "",
        terminalNameActual: data.terminal_name_actual || "",
        bridgeResponseStatus: result ? result.status : null,
        bridgeResponseOk: result ? Boolean(result.ok) : null,
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true,
        taskPayloadFilledAfterLaunch: data.task_payload_filled_after_launch === true
      };
      if (launched) {
        setUnifiedActionFeedback("Terminal Launch", "终端已启动。未填入任务 Payload。", "success", "terminal=" + (data.terminal_name_actual || data.terminal_name || ""));
      } else {
        setUnifiedActionFeedback("Terminal Launch", "启动失败：" + (data.launch_status || data.error || "launch_rejected"), "error", "");
      }
    } catch (err) {
      terminalStatusCache = { bridge_status: "disconnected", terminal_status: "unknown_after_query_failed", terminal_found: false, terminal_name: "", executor_id: executorId };
      terminalActionState = {
        attempted: true,
        actionType: "launch_executor_terminal",
        executor: executorId,
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/launch",
        swMessageType: "ACB_BRIDGE_TERMINAL_LAUNCH",
        result: "error",
        resultDetail: "service_worker_error",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      setUnifiedActionFeedback("Terminal Launch", "启动失败。", "error", err.message || String(err));
    }
    renderActionStepsSection();
  }

  // --- Terminal Action: Fill Target Terminal ---
  async function fillTargetTerminal(executorId, payload, taskCardId, target) {
    // Collect context diagnostics before attempt
    var plan = getCurrentActionPlan();
    var step = resolveCurrentActionStep(plan);
    var handoffData = step ? getExecutionInboxHandoffSurfaceData(step) : null;
    var localInboxTaskCardId = (handoffData && handoffData.entry) ? (handoffData.entry.taskCardId || "") : "";
    var localInboxTarget = (handoffData && handoffData.entry) ? (handoffData.entry.target || "") : "";
    var contextMatched = handoffData ? handoffData.contextMatched : false;

    // Block if handoff context is not current
    if (handoffData && !handoffData.current) {
      terminalActionState = {
        attempted: true,
        actionType: "fill_executor_terminal",
        executor: executorId || "",
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/fill",
        swMessageType: "ACB_BRIDGE_TERMINAL_FILL",
        result: "blocked",
        resultDetail: "inbox_context_mismatch",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      setUnifiedActionFeedback("Terminal Fill", "当前浏览器任务与 VS Code 收件箱任务不一致，已阻止填入。", "error", "inbox_context_mismatch");
      renderActionStepsSection();
      return;
    }

    if (!executorId || !payload) {
      terminalActionState = {
        attempted: true,
        actionType: "fill_executor_terminal",
        executor: executorId || "",
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/fill",
        swMessageType: "ACB_BRIDGE_TERMINAL_FILL",
        result: "error",
        resultDetail: !executorId ? "target_missing" : "payload_missing",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      renderActionStepsSection();
      return;
    }
    setUnifiedActionFeedback("Terminal Fill", "正在填入目标终端（不回车）...", "info", "executorId=" + executorId);
    try {
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_TERMINAL_FILL",
        timeout: 10000,
        executorId: executorId,
        payload: payload,
        taskCardId: taskCardId || "",
        expectedTarget: target || executorId
      });
      var data = (result && result.data) || {};
      var filled = data.filled === true;
      var termResolveStatus = data.fill_status || "";

      // Populate terminalStatusCache from fill response.
      // terminal_status tracks the resolver outcome; if the resolver provides no
      // terminal identity after a successful fill, record that explicitly.
      if (!data.bridge_status && result && result.ok !== undefined) {
        data.bridge_status = result.ok ? "connected" : "request_failed";
      }
      if (!data.terminal_status) {
        data.terminal_status = data.fill_status
          || (filled ? "unknown_after_fill_success" : "missing");
      }
      var cacheTerminalFound = data.terminal_status === "terminal_found" || filled;
      terminalStatusCache = {
        bridge_status: data.bridge_status || (result && result.error ? "request_failed" : "connected"),
        terminal_status: data.terminal_status || "missing",
        terminal_found: cacheTerminalFound,
        terminal_name: data.terminal_name || "",
        executor_id: executorId
      };

      // resultDetail: report fill acceptance first; only treat as rejected when
      // the bridge explicitly returned an error or filled===false with a known block reason.
      var fillResultDetail;
      if (filled) {
        fillResultDetail = (termResolveStatus && termResolveStatus !== "terminal_found")
          ? "fill_ok_terminal_status_unresolved"
          : "fill_ok";
      } else {
        fillResultDetail = normalizeTerminalResultDetail(termResolveStatus || data.error,
          "fill_executor_terminal", false);
      }

      terminalActionState = {
        attempted: true,
        actionType: "fill_executor_terminal",
        executor: executorId,
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/fill",
        swMessageType: "ACB_BRIDGE_TERMINAL_FILL",
        result: filled ? "success" : "blocked",
        resultDetail: fillResultDetail,
        terminalName: data.terminal_name || "",
        bridgeResponseStatus: result ? result.status : null,
        bridgeResponseOk: result ? Boolean(result.ok) : null,
        fillAccepted: filled,
        payloadSent: filled,
        terminalResolverStatus: termResolveStatus || (data.terminal_status || ""),
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      if (filled) {
        setUnifiedActionFeedback("Terminal Fill", "已填入终端。ACB 未回车、未执行。请人工检查后自行决定是否回车。", "success", "terminal=" + (data.terminal_name || ""));
      } else {
        setUnifiedActionFeedback("Terminal Fill", "填入失败：" + (data.detail || data.error || data.fill_status || "unknown"), "error", "");
      }
    } catch (err) {
      terminalStatusCache = { bridge_status: "disconnected", terminal_status: "unknown_after_query_failed", terminal_found: false, terminal_name: "", executor_id: executorId };
      terminalActionState = {
        attempted: true,
        actionType: "fill_executor_terminal",
        executor: executorId,
        taskCardId: taskCardId || "",
        localInboxTaskCardId: localInboxTaskCardId,
        localInboxTarget: localInboxTarget,
        contextMatched: contextMatched,
        endpointPath: "/acb/v1/terminal/fill",
        swMessageType: "ACB_BRIDGE_TERMINAL_FILL",
        result: "error",
        resultDetail: "service_worker_error",
        at: new Date().toISOString(),
        noAutoEnter: true,
        noExecution: true
      };
      setUnifiedActionFeedback("Terminal Fill", "填入失败。", "error", err.message || String(err));
    }
    renderActionStepsSection();
  }

  // --- Terminal Action: Render Surface ---
  function renderTerminalActionSurface(step) {
    if (!step) { return null; }

    var data = getExecutionInboxHandoffSurfaceData(step);
    if (!data.current || !data.entry) { return null; }
    var entry = data.entry;
    var executorId = (entry.target || step.target || "").trim();
    if (!executorId) { return null; }

    var displayName = getActionTargetLabel(executorId);
    var terminalName = getTerminalNameForExecutor(executorId);
    var hasPayload = data.payloadAvailable && data.payload;
    var isDebugMode = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG;

    var box = document.createElement("div");
    box.style.cssText = "margin:0 0 8px 0;padding:8px;border:1px solid #c7d2fe;border-radius:6px;background:#eef2ff;";

    // Header
    var title = document.createElement("p");
    title.style.cssText = "margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#4338ca;";
    title.textContent = "目标终端操作";
    box.appendChild(title);

    // Info lines
    var infoLine = document.createElement("p");
    infoLine.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.4;";
    infoLine.textContent = "执行端: " + displayName + " | 终端: " + terminalName +
      " | 桥状态: " + (terminalStatusCache ? (terminalStatusCache.bridge_status || "connected") : "查询中");
    box.appendChild(infoLine);

    // Terminal status from cache
    if (terminalStatusCache) {
      var statusLine = document.createElement("p");
      statusLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:" +
        (terminalStatusCache.terminal_found ? "#047857" : "#b45309") + ";line-height:1.4;";
      statusLine.textContent = "终端状态: " + getTerminalStatusDisplayText(terminalStatusCache.terminal_status) +
        (terminalStatusCache.terminal_found ? "（可填入）" : "");
      box.appendChild(statusLine);
    }

    // Previous action state
    if (terminalActionState && terminalActionState.attempted) {
      var prevLine = document.createElement("p");
      prevLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:" +
        (terminalActionState.result === "success" ? "#047857" : "#b45309") + ";line-height:1.4;";
      var actionLabel = "操作";
      if (terminalActionState.actionType === "launch_executor_terminal") { actionLabel = "启动终端"; }
      else if (terminalActionState.actionType === "fill_executor_terminal") { actionLabel = "填入终端"; }
      else if (terminalActionState.actionType === "status_executor_terminal") { actionLabel = "查询终端"; }
      prevLine.textContent = "最近操作: " + actionLabel +
        " → " + (terminalActionState.result === "success" ? "成功" : "失败") +
        (terminalActionState.resultDetail ? "（" + terminalActionState.resultDetail + "）" : "") +
        " | 未回车 | 未执行";
      box.appendChild(prevLine);
    }

    // Safety banner
    var safetyBanner = document.createElement("p");
    safetyBanner.style.cssText = "margin:4px 0 6px 0;padding:5px 7px;border:1px solid #fde68a;border-radius:4px;background:#fffbeb;font-size:11px;color:#92400e;line-height:1.4;";
    safetyBanner.textContent = "ACB 不会回车，不会执行。请人工检查后自行决定是否回车。";
    box.appendChild(safetyBanner);

    // Actions
    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;";

    // Query status button
    var statusBtn = document.createElement("button");
    statusBtn.type = "button";
    statusBtn.textContent = "查询终端状态";
    statusBtn.style.cssText = "padding:3px 10px;border:1px solid #6366f1;border-radius:3px;background:#fff;color:#6366f1;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
    var hasCurrentTask = Boolean(entry.taskCardId && entry.target);
    if (!hasCurrentTask) {
      statusBtn.disabled = true;
      statusBtn.style.cssText = "padding:3px 10px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      statusBtn.title = "缺少当前任务或目标，无法查询。";
    }
    statusBtn.addEventListener("click", (function (eid, tcid, tgt) {
      return function () {
        terminalActionDebug.lastClicked = "status";
        terminalActionDebug.handlerEntered = true;
        terminalActionDebug.handlerError = "";
        queryTargetTerminalStatus(eid, tcid, tgt).then(function () { renderActionStepsSection(); }).catch(function (_err) {
          if (!terminalActionState || !terminalActionState.attempted) {
            terminalActionState = {
              attempted: true,
              actionType: "status_executor_terminal",
              executor: eid || "",
              taskCardId: tcid || "",
              endpointPath: "/acb/v1/terminal/status",
              swMessageType: "ACB_BRIDGE_TERMINAL_STATUS",
              result: "error",
              resultDetail: "browser_handler_exception",
              at: new Date().toISOString(),
              noAutoEnter: true,
              noExecution: true
            };
          }
          terminalActionDebug.handlerError = _err ? (_err.message || String(_err)) : "";
          renderActionStepsSection();
        });
      };
    })(executorId, entry.taskCardId || "", entry.target || ""));
    actions.appendChild(statusBtn);

    // Launch button (only when terminal is missing and launch is configured)
    var canLaunch = !terminalStatusCache || (terminalStatusCache.terminal_status === "terminal_missing" && terminalStatusCache.can_launch) ||
      (!terminalStatusCache); // always show if we haven't checked yet
    var launchBtn = document.createElement("button");
    launchBtn.type = "button";
    launchBtn.textContent = "启动 " + displayName + " 终端";
    launchBtn.style.cssText = canLaunch
      ? "padding:3px 10px;border:1px solid #7c3aed;border-radius:3px;background:#7c3aed;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
      : "padding:3px 10px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
    launchBtn.disabled = !canLaunch;
    launchBtn.style.display = canLaunch ? "inline-block" : (isDebugMode ? "inline-block" : "none");
    launchBtn.title = canLaunch ? "启动目标终端，仅发送启动命令，不填入任务 Payload。" : "终端已存在或启动命令未配置。";
    launchBtn.addEventListener("click", (function (eid, tcid, tgt) {
      return function () {
        terminalActionDebug.lastClicked = "launch";
        terminalActionDebug.handlerEntered = true;
        terminalActionDebug.handlerError = "";
        launchTargetTerminal(eid, tcid, tgt).catch(function (_err) {
          if (!terminalActionState || !terminalActionState.attempted) {
            terminalActionState = {
              attempted: true,
              actionType: "launch_executor_terminal",
              executor: eid || "",
              taskCardId: tcid || "",
              endpointPath: "/acb/v1/terminal/launch",
              swMessageType: "ACB_BRIDGE_TERMINAL_LAUNCH",
              result: "error",
              resultDetail: "browser_handler_exception",
              at: new Date().toISOString(),
              noAutoEnter: true,
              noExecution: true
            };
          }
          terminalActionDebug.handlerError = _err ? (_err.message || String(_err)) : "";
          renderActionStepsSection();
        });
      };
    })(executorId, entry.taskCardId || "", entry.target || ""));
    actions.appendChild(launchBtn);

    // Fill button
    var canFill = hasPayload;
    var fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.textContent = "填入 " + displayName + " 终端（不回车）";
    fillBtn.style.cssText = canFill
      ? "padding:3px 10px;border:1px solid #15803d;border-radius:3px;background:#fff;color:#15803d;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
      : "padding:3px 10px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
    fillBtn.disabled = !canFill;
    fillBtn.style.display = canFill ? "inline-block" : (isDebugMode ? "inline-block" : "none");
    fillBtn.title = canFill ? "填入目标终端（不回车）。ACB 不会执行。" : "当前没有可填入的 Payload。";
    fillBtn.addEventListener("click", (function (eid, pl, tcid, tgt) {
      return function () {
        terminalActionDebug.lastClicked = "fill";
        terminalActionDebug.handlerEntered = true;
        terminalActionDebug.handlerError = "";
        fillTargetTerminal(eid, pl, tcid, tgt).catch(function (_err) {
          if (!terminalActionState || !terminalActionState.attempted) {
            terminalActionState = {
              attempted: true,
              actionType: "fill_executor_terminal",
              executor: eid || "",
              taskCardId: tcid || "",
              endpointPath: "/acb/v1/terminal/fill",
              swMessageType: "ACB_BRIDGE_TERMINAL_FILL",
              result: "error",
              resultDetail: "browser_handler_exception",
              at: new Date().toISOString(),
              noAutoEnter: true,
              noExecution: true
            };
          }
          terminalActionDebug.handlerError = _err ? (_err.message || String(_err)) : "";
          renderActionStepsSection();
        });
      };
    })(executorId, data.payload, entry.taskCardId || "", entry.target || ""));
    actions.appendChild(fillBtn);

    box.appendChild(actions);

    // Debug-mode context diagnostics
    var debugDiv = document.createElement("div");
    debugDiv.setAttribute("data-acb-mode", "debug");
    debugDiv.style.cssText = "margin-top:6px;padding:5px 7px;border:1px dashed #6b7280;border-radius:4px;background:#f9fafb;font-size:10px;font-family:monospace;color:#374151;line-height:1.5;";
    var handoffDiag = step ? getExecutionInboxHandoffSurfaceData(step) : null;
    var diagLines = [];
    diagLines.push("contextMatched: " + String(Boolean(handoffDiag && handoffDiag.contextMatched)));
    diagLines.push("browserTaskCardId: " + (entry.taskCardId || ""));
    diagLines.push("browserTarget: " + (entry.target || ""));
    diagLines.push("localInboxTaskCardId: " + (handoffDiag && handoffDiag.entry ? (handoffDiag.entry.taskCardId || "") : ""));
    diagLines.push("localInboxTarget: " + (handoffDiag && handoffDiag.entry ? (handoffDiag.entry.target || "") : ""));
    diagLines.push("bridgeStatus: " + (terminalStatusCache ? (terminalStatusCache.bridge_status || "unknown") : "not_queried"));
    diagLines.push("terminalStatus: " + (terminalStatusCache ? (terminalStatusCache.terminal_status || "unknown") : "not_queried"));
    if (terminalActionState && terminalActionState.attempted) {
      diagLines.push("endpointPath: " + (terminalActionState.endpointPath || ""));
      diagLines.push("swMessageType: " + (terminalActionState.swMessageType || ""));
      diagLines.push("bridgeResponseStatus: " + (terminalActionState.bridgeResponseStatus != null ? String(terminalActionState.bridgeResponseStatus) : ""));
      diagLines.push("resultDetail: " + (terminalActionState.resultDetail || ""));
    }
    debugDiv.textContent = diagLines.join("\n");
    box.appendChild(debugDiv);

    terminalActionDebug.rendered = true;
    return box;
  }

  function getTerminalNameForExecutor(executorId) {
    var normalized = (executorId || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (normalized === "codex") { return "ACB Codex"; }
    if (normalized === "claude-code") { return "ACB Claude Code"; }
    if (normalized === "deepseek") { return "ACB DeepSeek"; }
    return "ACB " + (executorId || "Unknown");
  }

  function getTerminalStatusDisplayText(status) {
    if (status === "terminal_found") { return "已找到目标终端"; }
    if (status === "terminal_missing") { return "目标终端未打开"; }
    if (status === "ambiguous_terminal") { return "目标终端名称重复"; }
    if (status === "launch_command_not_configured") { return "启动命令未配置"; }
    if (status === "unsupported_executor") { return "暂不支持 profile"; }
    return String(status || "未知");
  }

  function renderActionStepsSection() {
    var wrapper = document.getElementById("acb-action-steps-box");
    var tipEl = document.getElementById("acb-action-steps-tip");
    var generateBtn = document.getElementById("acb-action-steps-generate-btn");
    var listEl = document.getElementById("acb-action-steps-list");
    var actionFeedbackPanel = document.getElementById("acb-action-feedback-panel");
    var isDebugMode = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG;
    function syncGenerateButtonState(enabled, title) {
      generateBtn.style.display = enabled || isDebugMode ? "inline-block" : "none";
      generateBtn.disabled = !enabled;
      if (title) {
        generateBtn.title = title;
      }
    }

    if (!wrapper || !tipEl || !generateBtn || !listEl) {
      return;
    }

    listEl.innerHTML = "";
    terminalActionDebug.rendered = false;

    var feedback = getSelectedFeedback();
    var classification = getCurrentClassification();

    if (!feedback || !classification) {
      currentActionPlanKey = null;
      currentActionStepId = null;
      tipEl.textContent = "未选择反馈。";
      syncGenerateButtonState(false, "鍏堥€夋嫨鍙嶉鍐嶇敓鎴愬姩浣滄楠?;");
      setText("acb-action-steps-plan-status", "none");
      setActionStepsStatus("", false);
      setPayloadDetailPlaceholder("请选择一个任务卡查看详情。");
      if (actionFeedbackPanel) {
        wrapper.appendChild(actionFeedbackPanel);
      }
      renderUnifiedActionFeedback();
      return;
    }

    currentActionPlanKey = buildClassificationKey(feedback);
    if (!currentActionPlanKey) {
      currentActionStepId = null;
      tipEl.textContent = "动作计划 key 无效。";
      syncGenerateButtonState(false, "鍔ㄤ綔璁″垝 key 鏃犳晥");
      setText("acb-action-steps-plan-status", "none");
      setPayloadDetailPlaceholder("当前反馈无法建立任务详情视图。");
      if (actionFeedbackPanel) {
        wrapper.appendChild(actionFeedbackPanel);
      }
      renderUnifiedActionFeedback();
      return;
    }

    var enabled = canGenerateActionSteps(classification);
    if (!enabled) {
      currentActionStepId = null;
      tipEl.textContent = "当前反馈不需要执行，未生成动作步骤。";
      syncGenerateButtonState(false, "褰撳墠鍙嶉涓嶉渶瑕佹墽琛?;");
      setText("acb-action-steps-plan-status", "none");
      setActionStepsStatus("", false);
      setPayloadDetailPlaceholder("当前反馈不需要执行，暂无任务卡详情。");
      if (actionFeedbackPanel) {
        wrapper.appendChild(actionFeedbackPanel);
      }
      renderUnifiedActionFeedback();
      return;
    }

    syncGenerateButtonState(true, "鐢熸垚褰撳墠浠诲姟鍗¤涓虹");

    var plan = getCurrentActionPlan();
    if (!plan) {
      var previewPlan = buildActionPlanFromFeedback(feedback, classification);
      if (previewPlan && Array.isArray(previewPlan.steps) && previewPlan.steps.length > 0) {
        plan = previewPlan;
        floatingActionPlans[currentActionPlanKey] = previewPlan;
        tipEl.textContent = "已自动构建当前任务卡预览（未落盘），可先检查可发送状态。";
        setActionStepsStatus("已自动构建当前任务卡预览，点击“生成动作步骤”可保存草稿。", false);
      } else {
        currentActionStepId = null;
        tipEl.textContent = "该反馈需要执行，可生成本地动作步骤草稿。";
        setText("acb-action-steps-plan-status", floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? "draft" : "");
        setPayloadDetailPlaceholder("尚未生成 Action Steps，点击“生成动作步骤”后可查看详情。");
        if (actionFeedbackPanel) {
          wrapper.appendChild(actionFeedbackPanel);
        }
        renderUnifiedActionFeedback();
        return;
      }
    }

    tipEl.textContent = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? "动作步骤（草稿）" : "当前任务卡";
    setText("acb-action-steps-plan-status", floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? (plan.status || "draft") : "");
    var currentStep = resolveCurrentActionStep(plan);
    var displaySteps = [];
    if (currentStep) {
      displaySteps.push(currentStep);
    }
    for (var di = 0; di < plan.steps.length; di += 1) {
      var displayCandidate = plan.steps[di];
      if (!displayCandidate || (currentStep && displayCandidate.id === currentStep.id)) {
        continue;
      }
      displaySteps.push(displayCandidate);
    }

    for (var i = 0; i < displaySteps.length; i += 1) {
      var step = displaySteps[i];
      var pv = step.payloadValidation || {};
      var stepNum = String(step.order || (i + 1));
      var targetLabel = getActionTargetLabel(step.target);
      var targetColor = getTargetBadgeColor(step.target);
      var psLabel = getPayloadStatusLabel(step.payloadStatus);
      var psColor = getPayloadStatusBadgeColor(step.payloadStatus);
      var routeGate = applyRouteResultEligibility(step);
      var canSend = routeGate.canSendToAgent === true;
      var isController = step.target === "controller";
      var isCurrentStep = Boolean(currentStep && step.id === currentStep.id);
      var sendAvailability = evaluateStepSendAvailability(step);

      // --- Compact summary card ---
      var card = document.createElement("div");
      card.style.cssText = "border:1px solid " + (isCurrentStep ? "#2563eb" : "#e5e7eb") + ";border-radius:8px;background:#fff;margin-top:8px;padding:10px;box-shadow:" + (isCurrentStep ? "0 0 0 2px rgba(37,99,235,0.12)" : "none") + ";";

      // Header row: step number + badges
      var headerRow = document.createElement("div");
      headerRow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;";

      var numSpan = document.createElement("span");
      numSpan.style.cssText = "font-size:12px;font-weight:bold;color:#374151;";
      numSpan.textContent = "第 " + stepNum + " 步";
      headerRow.appendChild(numSpan);
      if (isCurrentStep) {
        var currentTag = document.createElement("span");
        currentTag.style.cssText = "display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#1d4ed8;background:#dbeafe;font-weight:bold;";
        currentTag.textContent = "当前任务卡";
        headerRow.appendChild(currentTag);
      }

      // Target badge
      var targetBadge = document.createElement("span");
      targetBadge.style.cssText = "display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#fff;background:" + targetColor + ";";
      targetBadge.textContent = targetLabel;
      headerRow.appendChild(targetBadge);

      // Payload status badge
      var psBadge = document.createElement("span");
      psBadge.style.cssText = "display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#fff;background:" + psColor + ";";
      psBadge.textContent = psLabel;
      headerRow.appendChild(psBadge);

      // Can send badge
      var sendBadge = document.createElement("span");
      sendBadge.style.cssText = "display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#fff;background:" + (canSend ? "#16a34a" : "#6b7280") + ";";
      sendBadge.textContent = canSend ? "可发送" : (isController ? "总控审查" : "不可发送");
      headerRow.appendChild(sendBadge);

      card.appendChild(headerRow);

      // Title line
      var titleLine = document.createElement("p");
      titleLine.style.cssText = "margin:0 0 8px 0;font-size:12px;color:#374151;";
      titleLine.textContent = step.title || "(无标题)";
      card.appendChild(titleLine);
      if (isCurrentStep) {
        var taskMetaLine = document.createElement("p");
        taskMetaLine.style.cssText = "margin:0 0 8px 0;font-size:11px;color:#334155;line-height:1.4;";
        taskMetaLine.textContent = "元数据: 执行任务 · target=" + (step.target || "controller") +
          " · " + (step.payloadStatus === "complete" ? "完整" : psLabel) +
          " · " + (canSend ? "可发送" : "不可发送");
        card.appendChild(taskMetaLine);
      }
      var summaryModel = buildTaskCardSummaryModel(step);
      var summaryList = document.createElement("div");
      summaryList.style.cssText = "display:flex;flex-direction:column;gap:4px;margin:0 0 8px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;";
      for (var sli = 0; sli < summaryModel.lines.length; sli += 1) {
        var summaryLine = document.createElement("p");
        summaryLine.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.45;";
        summaryLine.textContent = summaryModel.lines[sli];
        summaryList.appendChild(summaryLine);
      }
      card.appendChild(summaryList);

      var stepOriginalIndex = i;
      if (plan && Array.isArray(plan.steps)) {
        for (var oi = 0; oi < plan.steps.length; oi += 1) {
          if (plan.steps[oi] && plan.steps[oi].id === step.id) {
            stepOriginalIndex = oi;
            break;
          }
        }
      }
      var sourceMeta = buildSourceMetadataForStep(step, stepOriginalIndex);
      var sourceWarning = sourceMeta.sourceConversationId === "unknown" || sourceMeta.sourceMessageHash === "unknown";
      var sourceLine = document.createElement("p");
      sourceLine.style.cssText = "margin:0 0 4px 0;font-size:11px;color:" + (sourceWarning ? "#b45309" : "#4b5563") + ";";
      sourceLine.textContent = "来源: " + sourceMeta.sourceDisplayName +
        (floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? (" | channelId: " + sourceMeta.sourceChannelId) : "") +
        (floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? (" | sourceConversationId: " + sourceMeta.sourceConversationId) : "");
      sourceLine.dataset.acbMode = "debug";
      card.appendChild(sourceLine);

      var sourceLine2 = document.createElement("p");
      sourceLine2.style.cssText = "margin:0 0 6px 0;font-size:11px;color:#4b5563;";
      sourceLine2.textContent = "hash: " + shortHash(sourceMeta.sourceMessageHash) +
        " | capturedAt: " + sourceMeta.sourceCapturedAt +
        " | step: " + sourceMeta.sourceActionStepIndex +
        " | taskCardId: " + (sourceMeta.taskCardId || "unknown");
      sourceLine2.dataset.acbMode = "debug";
      card.appendChild(sourceLine2);

      var preflightStatus = "not_run";
      if (floatingPreflightLatest && floatingPreflightLatest.data && floatingPreflightLatest.data.preflight) {
        preflightStatus = floatingPreflightLatest.data.preflight.status || "unknown";
      }
      var readinessStatus = "not_run";
      if (floatingReadinessLatest && floatingReadinessLatest.data && floatingReadinessLatest.data.readiness) {
        readinessStatus = floatingReadinessLatest.data.readiness.status || "unknown";
      }
      var sendStatus = "none";
      if (floatingTaskCardReviewLatest) {
        var matchedSend = floatingTaskCardReviewLatest.taskCardId && sourceMeta.taskCardId && floatingTaskCardReviewLatest.taskCardId === sourceMeta.taskCardId;
        sendStatus = matchedSend
          ? (floatingTaskCardReviewLatest.status || (floatingTaskCardReviewLatest.accepted ? "accepted" : floatingTaskCardReviewLatest.error ? "error" : "attempted"))
          : "none";
      }
      var statusLine = document.createElement("p");
      statusLine.style.cssText = "margin:0 0 8px 0;font-size:11px;color:#1f2937;";
      statusLine.textContent = "payloadStatus: " + (step.payloadStatus || "not_applicable") +
        " | originalCanSendToAgent: " + String(Boolean(pv.canSendToAgent)) +
        " | routeGatedCanSendToAgent: " + String(Boolean(canSend)) +
        " | preflightStatus: " + preflightStatus +
        " | readinessStatus: " + readinessStatus +
        " | sendStatus: " + sendStatus;
      statusLine.dataset.acbMode = "debug";
      card.appendChild(statusLine);

      var deliveryPlan = buildDeliveryPlan(step);
      var preparePreview = document.createElement("div");
      preparePreview.style.cssText = "margin:0 0 6px 0;padding:6px 7px;border:1px solid " +
        (deliveryPlan.canPrepare ? "#bfdbfe" : "#fed7aa") +
        ";border-radius:6px;background:" + (deliveryPlan.canPrepare ? "#eff6ff" : "#fff7ed") + ";";
      var prepareTitle = document.createElement("p");
      prepareTitle.style.cssText = "margin:0 0 2px 0;font-size:11px;font-weight:bold;color:" +
        (deliveryPlan.canPrepare ? "#1d4ed8" : "#b45309") + ";";
      prepareTitle.textContent = "Prepare Execution Preview: " + deliveryPlan.status;
      preparePreview.appendChild(prepareTitle);
      // Normal mode: compact prepare summary
      var prepareNormLine = document.createElement("p");
      prepareNormLine.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.4;";
      prepareNormLine.textContent = "Executor: " + deliveryPlan.defaultRoute.displayName +
        " | Handoff: " + deliveryPlan.defaultRoute.handoffMode +
        " | Prepare: " + deliveryPlan.status;
      preparePreview.appendChild(prepareNormLine);
      if (deliveryPlan.blockingReasons.length > 0) {
        var prepareNormReason = document.createElement("p");
        prepareNormReason.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#b45309;line-height:1.4;";
        prepareNormReason.textContent = "Blocked: " + deliveryPlan.blockingReasons.slice(0, 2).join(", ") +
          (deliveryPlan.blockingReasons.length > 2 ? " (+" + (deliveryPlan.blockingReasons.length - 2) + " more)" : "");
        preparePreview.appendChild(prepareNormReason);
      }

      // Debug mode: full diagnostic lines
      var prepareRouteLine = document.createElement("p");
      prepareRouteLine.dataset.acbMode = "debug";
      prepareRouteLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;line-height:1.4;";
      prepareRouteLine.textContent = "defaultTarget=" + deliveryPlan.defaultRoute.target +
        " | executor=" + deliveryPlan.defaultRoute.displayName +
        " | executorId=" + (deliveryPlan.defaultRoute.executorId || "unresolved") +
        " | commandName=" + (deliveryPlan.defaultRoute.commandName || "-");
      preparePreview.appendChild(prepareRouteLine);
      var prepareModeLine = document.createElement("p");
      prepareModeLine.dataset.acbMode = "debug";
      prepareModeLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;line-height:1.4;";
      prepareModeLine.textContent = "permissionMode=" + deliveryPlan.defaultRoute.permissionMode +
        " | handoffMode=" + deliveryPlan.defaultRoute.handoffMode +
        " | routeOverride=" + (deliveryPlan.routeOverride.enabled ? "enabled" : "disabled") +
        " | ccRoutes=" + String(deliveryPlan.ccRoutes.length);
      preparePreview.appendChild(prepareModeLine);
      if (deliveryPlan.blockingReasons.length > 0 || deliveryPlan.warningReasons.length > 0) {
        var prepareReasonLine = document.createElement("p");
        prepareReasonLine.dataset.acbMode = "debug";
        prepareReasonLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:" +
          (deliveryPlan.blockingReasons.length > 0 ? "#b45309" : "#4b5563") + ";line-height:1.4;";
        prepareReasonLine.textContent = (deliveryPlan.blockingReasons.length > 0
          ? ("blocking=" + deliveryPlan.blockingReasons.join(", "))
          : ("warnings=" + deliveryPlan.warningReasons.join(", ")));
        preparePreview.appendChild(prepareReasonLine);
      }
      card.appendChild(preparePreview);

      var preExecutionPackage = buildPreExecutionPackage(step);
      ensurePreExecutionHandoffPassiveEvent(preExecutionPackage);
      var packageHandoffLatest = getPreExecutionHandoffStatusForPackage(preExecutionPackage);
      var packagePreview = document.createElement("div");
      var prepareStatusColor = getPrepareStatusColor(preExecutionPackage.prepareStatus);
      packagePreview.style.cssText = "margin:0 0 6px 0;padding:6px 7px;border:1px solid " +
        getPrepareStatusBorder(preExecutionPackage.prepareStatus) +
        ";border-radius:6px;background:" + getPrepareStatusBackground(preExecutionPackage.prepareStatus) + ";";
      var packageTitle = document.createElement("p");
      packageTitle.style.cssText = "margin:0 0 2px 0;font-size:11px;font-weight:bold;color:" + prepareStatusColor + ";";
      packageTitle.textContent = "投递准备状态：" + preExecutionPackage.prepareStatusLabel;
      packagePreview.appendChild(packageTitle);
      // Normal mode: compact prepare status summary
      var packageNormLine = document.createElement("p");
      packageNormLine.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.4;";
      packageNormLine.textContent = "Executor: " + preExecutionPackage.resolvedExecutorDisplayName +
        " | Role: " + preExecutionPackage.executorRole +
        " | Copyable: " + (preExecutionPackage.copyablePayloadAvailable ? "available" : "unavailable") +
        " | Auto: " + (preExecutionPackage.canAutoExecute ? "true" : "false");
      packagePreview.appendChild(packageNormLine);
      if (preExecutionPackage.blockingReasons.length > 0) {
        var packageNormReason = document.createElement("p");
        packageNormReason.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#b91c1c;line-height:1.4;";
        packageNormReason.textContent = "Blocked: " + preExecutionPackage.blockingReasons.slice(0, 2).join(", ") +
          (preExecutionPackage.blockingReasons.length > 2 ? " (+" + (preExecutionPackage.blockingReasons.length - 2) + " more)" : "");
        packagePreview.appendChild(packageNormReason);
      }

      // Debug mode: full diagnostic lines
      var packageRouteLine = document.createElement("p");
      packageRouteLine.dataset.acbMode = "debug";
      packageRouteLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;line-height:1.4;";
      packageRouteLine.textContent = "executor=" + preExecutionPackage.resolvedExecutorDisplayName +
        " | executorId=" + (preExecutionPackage.resolvedExecutorId || "unresolved") +
        " | role=" + preExecutionPackage.executorRole +
        " | commandName=" + (preExecutionPackage.commandName || "-") +
        " | launchPreview=" + (preExecutionPackage.launchCommandPreview || "-");
      packagePreview.appendChild(packageRouteLine);
      var packageModeLine = document.createElement("p");
      packageModeLine.dataset.acbMode = "debug";
      packageModeLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;line-height:1.4;";
      packageModeLine.textContent = "permissionMode=" + preExecutionPackage.permissionMode +
        " | handoffMode=" + preExecutionPackage.handoffMode +
        " | roleCompatible=" + String(Boolean(preExecutionPackage.roleCompatible)) +
        " | copyablePayload=" + (preExecutionPackage.copyablePayloadAvailable ? "available" : "unavailable") +
        " | canAutoExecute=" + String(Boolean(preExecutionPackage.canAutoExecute));
      packagePreview.appendChild(packageModeLine);
      var packageHandoffLine = document.createElement("p");
      packageHandoffLine.dataset.acbMode = "debug";
      packageHandoffLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;line-height:1.4;";
      packageHandoffLine.textContent = "handoffStatus=" + (packageHandoffLatest ? (packageHandoffLatest.handoffStatus || "-") : "-") +
        " | eventType=" + (packageHandoffLatest ? (packageHandoffLatest.eventType || "-") : "-") +
        " | eventAt=" + (packageHandoffLatest ? (packageHandoffLatest.eventAt || "-") : "-");
      packagePreview.appendChild(packageHandoffLine);
      if (preExecutionPackage.blockingReasons.length > 0 || preExecutionPackage.warnings.length > 0) {
        var packageReasonLine = document.createElement("p");
        packageReasonLine.dataset.acbMode = "debug";
        packageReasonLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:" +
          (preExecutionPackage.blockingReasons.length > 0 ? "#b91c1c" : "#4b5563") + ";line-height:1.4;";
        packageReasonLine.textContent = preExecutionPackage.blockingReasons.length > 0
          ? ("blocking=" + preExecutionPackage.blockingReasons.join(", "))
          : ("warnings=" + preExecutionPackage.warnings.join(", "));
        packagePreview.appendChild(packageReasonLine);
      }
      card.appendChild(packagePreview);

      var executionInboxData = getExecutionInboxHandoffSurfaceData(step);
      var actionWorkspacePanel = document.createElement("div");
      actionWorkspacePanel.style.cssText = "margin:0 0 6px 0;padding:6px 7px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;";
      var actionWorkspaceTitle = document.createElement("p");
      actionWorkspaceTitle.style.cssText = "margin:0 0 2px 0;font-size:11px;font-weight:bold;color:#334155;";
      actionWorkspaceTitle.textContent = "Current Action Workspace / 当前动作工作区";
      actionWorkspacePanel.appendChild(actionWorkspaceTitle);

      var routePayloadComplete = Boolean(routeGate && routeGate.routeResult && routeGate.routeResult.payloadStatus === "complete");
      var currentPayloadComplete = step.payloadStatus === "complete" || routePayloadComplete;
      var preparePayloadReady = Boolean(preExecutionPackage.canPrepare || preExecutionPackage.copyablePayloadAvailable);
      var workspacePayloadReady = Boolean(currentPayloadComplete || preparePayloadReady);
      var inboxEntry = executionInboxData.entry || {};
      var currentInboxRejected = Boolean(executionInboxData.detected && executionInboxData.contextMatched && inboxEntry.accepted !== true);
      var inboxRejectReason = Array.isArray(inboxEntry.rejectReasons) && inboxEntry.rejectReasons.length > 0
        ? inboxEntry.rejectReasons.slice(0, 2).join(", ")
        : (inboxEntry.error || "rejected");
      var inboxStateText = executionInboxData.current
        ? "sent / accepted"
        : (currentInboxRejected ? ("rejected: " + inboxRejectReason) : (workspacePayloadReady && canSend ? "not sent / ready to send" : "not sent"));
      var payloadStateText = workspacePayloadReady ? (currentPayloadComplete ? "complete / ready" : "ready") : "not ready";
      var terminalStateText = terminalStatusCache ? getTerminalStatusDisplayText(terminalStatusCache.terminal_status) : "not queried yet";
      var terminalLaunchText = !terminalStatusCache
        ? "launch unknown"
        : (terminalStatusCache.terminal_status === "terminal_missing" && terminalStatusCache.can_launch ? "launch available" : "launch gated");
      var hasWorkspaceWarning = Boolean(
        (deliveryPlan.warningReasons && deliveryPlan.warningReasons.length > 0) ||
        (preExecutionPackage.warnings && preExecutionPackage.warnings.length > 0)
      );
      var nextActionText = "Capture or select a complete task card.";
      if (workspacePayloadReady && !executionInboxData.current) {
        nextActionText = hasWorkspaceWarning
          ? "Check warning, then send to Execution Inbox."
          : "Send to Execution Inbox.";
      } else if (executionInboxData.current) {
        if (terminalStatusCache && terminalStatusCache.terminal_found && executionInboxData.payloadAvailable) {
          nextActionText = "Fill the target terminal, then inspect manually.";
        } else if (terminalStatusCache && terminalStatusCache.terminal_status === "terminal_missing" && terminalStatusCache.can_launch) {
          nextActionText = "Launch the target terminal, then fill it.";
        } else {
          nextActionText = "Query terminal status, then fill if available.";
        }
      }

      var workspaceLine1 = document.createElement("p");
      workspaceLine1.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.35;";
      workspaceLine1.textContent = "Executor: " + preExecutionPackage.resolvedExecutorDisplayName +
        " | Payload: " + payloadStateText +
        " | Inbox: " + inboxStateText +
        " | Terminal: " + terminalStateText +
        " | " + terminalLaunchText;
      actionWorkspacePanel.appendChild(workspaceLine1);

      var workspaceLine2 = document.createElement("p");
      workspaceLine2.style.cssText = "margin:2px 0 0 0;padding:4px 6px;border:1px solid #dbeafe;border-radius:5px;background:#eff6ff;font-size:11px;color:#1e3a8a;line-height:1.35;";
      workspaceLine2.textContent = "Next: " + nextActionText +
        " | Safety: no Enter, no execution, no auto dispatch.";
      actionWorkspacePanel.appendChild(workspaceLine2);

      card.appendChild(actionWorkspacePanel);

      var executionInboxHandoffSurface = renderExecutionInboxHandoffSurface(step);
      if (executionInboxHandoffSurface) {
        card.appendChild(executionInboxHandoffSurface);
      }

      // Terminal action surface (only for non-controller executor steps)
      if (!isController) {
        var terminalActionSurface = renderTerminalActionSurface(step);
        if (terminalActionSurface) {
          card.appendChild(terminalActionSurface);
        }
      }

      var manualReportLatest = getManualExecutionReportForPackage(preExecutionPackage);
      var manualReportEligibility = evaluateManualExecutionReportEligibility(step, preExecutionPackage, packageHandoffLatest);
      var manualReportPanel = document.createElement("div");
      manualReportPanel.style.cssText = "margin:0 0 8px 0;padding:7px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;";
      // Normal mode: compact report status
      var manualReportTitle = document.createElement("p");
      manualReportTitle.style.cssText = "margin:0 0 3px 0;font-size:11px;font-weight:bold;color:#334155;";
      manualReportTitle.textContent = "Local Report / 执行端回报";
      manualReportPanel.appendChild(manualReportTitle);
      var manualReportStatusLine = document.createElement("p");
      manualReportStatusLine.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.4;";
      manualReportStatusLine.textContent = "Detected: " + (manualReportLatest ? "yes" : "no") +
        " | Status: " + (manualReportLatest ? (manualReportLatest.reportStatus || "none") : "none") +
        " | Waiting Review: " + (manualReportLatest && manualReportLatest.waitingControllerReview ? "yes" : "no");
      manualReportPanel.appendChild(manualReportStatusLine);
      if (!manualReportLatest) {
        var manualReportNoReport = document.createElement("p");
        manualReportNoReport.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#6b7280;";
        manualReportNoReport.textContent = "尚未读取到 Local Report。执行端完成后，点击“读取 Local Report”导入。";
        manualReportPanel.appendChild(manualReportNoReport);
      }
      if (!manualReportEligibility.canSave) {
        var manualReportNormBlock = document.createElement("p");
        manualReportNormBlock.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#b91c1c;line-height:1.4;";
        manualReportNormBlock.textContent = "Blocked: " + manualReportEligibility.blockingReasons.slice(0, 2).join(", ") +
          (manualReportEligibility.blockingReasons.length > 2 ? " (+" + (manualReportEligibility.blockingReasons.length - 2) + " more)" : "");
        manualReportPanel.appendChild(manualReportNormBlock);
      }

      // Debug mode: full diagnostic lines
      var manualReportDebugLine1 = document.createElement("p");
      manualReportDebugLine1.dataset.acbMode = "debug";
      manualReportDebugLine1.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;line-height:1.4;";
      manualReportDebugLine1.textContent = "Report ID=" + (manualReportLatest ? (manualReportLatest.reportId || "-") : "-") +
        " | Source Task Card ID=" + (manualReportLatest ? (manualReportLatest.sourceTaskCardId || "-") : (preExecutionPackage.sourceTaskCardId || "-")) +
        " | Received At=" + (manualReportLatest ? (manualReportLatest.reportReceivedAt || "-") : "-");
      manualReportPanel.appendChild(manualReportDebugLine1);
      if (!manualReportEligibility.canSave || manualReportEligibility.warningReasons.length > 0) {
        var manualReportReasonLine = document.createElement("p");
        manualReportReasonLine.dataset.acbMode = "debug";
        manualReportReasonLine.style.cssText = "margin:2px 0 0 0;font-size:11px;color:" +
          (!manualReportEligibility.canSave ? "#b91c1c" : "#b45309") + ";line-height:1.4;";
        manualReportReasonLine.textContent = !manualReportEligibility.canSave
          ? ("blocking=" + manualReportEligibility.blockingReasons.join(", "))
          : ("warnings=" + manualReportEligibility.warningReasons.join(", "));
        manualReportPanel.appendChild(manualReportReasonLine);
      }
      var manualReportInput = document.createElement("textarea");
      manualReportInput.id = "acb-manual-execution-report-input-" + stepOriginalIndex;
      manualReportInput.placeholder = "也可以手动粘贴执行端回报。ACB 不会自动审查或自动执行。";
      manualReportInput.rows = 3;
      manualReportInput.disabled = !manualReportEligibility.canSave;
      manualReportInput.style.cssText = "margin:6px 0 0 0;width:100%;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:11px;font-family:Arial,sans-serif;resize:vertical;";
      manualReportInput.dataset.acbMode = "debug";
      manualReportPanel.appendChild(manualReportInput);
      var manualReportBtn = document.createElement("button");
      manualReportBtn.type = "button";
      manualReportBtn.textContent = "保存手动回报";
      manualReportBtn.disabled = !manualReportEligibility.canSave;
      manualReportBtn.style.cssText = manualReportEligibility.canSave
        ? "margin-top:6px;padding:3px 12px;border:1px solid #334155;border-radius:3px;background:#fff;color:#334155;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
        : "margin-top:6px;padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      manualReportBtn.dataset.acbMode = "debug";
      manualReportBtn.title = manualReportEligibility.canSave
        ? "只保存回报，进入等待总控审查；不会自动审查或执行。"
        : manualReportEligibility.blockingReasons.join(", ");
      if (manualReportEligibility.canSave) {
        manualReportBtn.addEventListener("click", (function (s, inputEl) {
          return function () {
            saveManualExecutionReport(s, inputEl.value || "").catch(function (err) {
              console.error("[ACB][manual-execution-report] save failed", err);
              setUnifiedActionFeedback("Manual Execution Report", "Save failed.", "error", err.message || String(err));
            });
          };
        })(step, manualReportInput));
      }
      manualReportPanel.appendChild(manualReportBtn);

      var localReportReadBtn = document.createElement("button");
      localReportReadBtn.type = "button";
      localReportReadBtn.textContent = "读取 Local Report";
      var hasTaskCardId = Boolean(preExecutionPackage && preExecutionPackage.sourceTaskCardId);
      localReportReadBtn.disabled = !hasTaskCardId;
      localReportReadBtn.style.cssText = hasTaskCardId
        ? "margin-top:4px;margin-left:6px;padding:3px 12px;border:1px solid #0f766e;border-radius:3px;background:#fff;color:#0f766e;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
        : "margin-top:4px;margin-left:6px;padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      localReportReadBtn.title = hasTaskCardId
        ? "从 .ai-control/reports/inbox/<taskCardId>.md 读取回报；不会自动审查或执行。"
        : "No taskCardId available for this step.";
      if (hasTaskCardId) {
        localReportReadBtn.addEventListener("click", (function (s) {
          return function () {
            readLocalExecutionReport(s).catch(function (err) {
              console.error("[ACB][local-execution-report] read failed", err);
              setUnifiedActionFeedback("Local Execution Report", "Read failed.", "error", err.message || String(err));
            });
          };
        })(step));
      }
      manualReportPanel.appendChild(localReportReadBtn);

      card.appendChild(manualReportPanel);

      var taskLifecycle = deriveTaskLifecycleStatus({
        step: step,
        routeGate: applyRouteResultEligibility(step),
        preExecutionPackage: preExecutionPackage,
        handoffLatest: packageHandoffLatest,
        manualReportLatest: manualReportLatest,
        hasFeedback: Boolean(getSelectedFeedback()),
        hasClassification: Boolean(getCurrentClassification())
      });
      var lifecycleLine = document.createElement("p");
      lifecycleLine.style.cssText = "margin:0 0 8px 0;padding:5px 7px;border:1px solid #dbeafe;border-radius:5px;background:#eff6ff;font-size:11px;color:#1e3a8a;line-height:1.4;";
      lifecycleLine.textContent = "Lifecycle: " + taskLifecycle.label +
        (taskLifecycle.reason ? " — " + taskLifecycle.reason : "");
      card.appendChild(lifecycleLine);
      // Debug: full lifecycle details
      var lifecycleDebugLine = document.createElement("p");
      lifecycleDebugLine.dataset.acbMode = "debug";
      lifecycleDebugLine.style.cssText = "margin:0 0 8px 0;font-size:11px;color:#1e3a8a;line-height:1.4;";
      lifecycleDebugLine.textContent = "Task Lifecycle Status=" + taskLifecycle.status +
        " | Task Lifecycle Label=" + taskLifecycle.label +
        " | Source=" + taskLifecycle.source +
        " | Reason=" + taskLifecycle.reason;
      card.appendChild(lifecycleDebugLine);

      // Long task card capture incomplete warning
      if (pv.longTaskCardCaptureIncomplete) {
        var longCardWarn = document.createElement("p");
        longCardWarn.style.cssText = "margin:0 0 6px 0;padding:6px 8px;border:1px solid #f59e0b;border-radius:4px;background:#fffbeb;font-size:11px;color:#92400e;line-height:1.4;";
        longCardWarn.textContent = "Long task card capture incomplete — start marker found but end marker missing. The assistant message may be too long for DOM capture (" + (pv.assistantMessageLength || "?") + " chars captured). Try re-capturing or reloading the conversation.";
        card.appendChild(longCardWarn);
      }

      // Missing fields hint
      var missingList = Array.isArray(pv.requiredFieldsMissing) ? pv.requiredFieldsMissing : [];
      if (step.payloadStatus === "incomplete" && missingList.length > 0) {
        var missingHint = document.createElement("p");
        missingHint.style.cssText = "margin:0 0 6px 0;font-size:11px;color:#dc2626;";
        missingHint.textContent = "缺失必要字段: " + missingList.join(", ");
        card.appendChild(missingHint);
      }

      // Incomplete reason for non-long-card cases
      if (step.payloadStatus === "incomplete" && pv.incompleteReason && !pv.longTaskCardCaptureIncomplete) {
        var incReasonHint = document.createElement("p");
        incReasonHint.style.cssText = "margin:0 0 6px 0;font-size:11px;color:#b45309;";
        incReasonHint.textContent = "Incomplete reason: " + pv.incompleteReason;
        card.appendChild(incReasonHint);
      }

      // Action buttons row
      var actionRow = document.createElement("div");
      actionRow.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";

      var isDebugMode = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG;
      var canSendToVSCode = sendAvailability.canSend;
      var inboxAvailability = evaluateExecutionInboxSendEligibility(step);
      var canSendToExecutionInbox = inboxAvailability.enabled === true;
      var inboxDisabledReason = getExecutionInboxRejectReasonText(inboxAvailability.rejectReasons);
      var sendDisabledReason = sendAvailability.reason || "当前步骤未通过发送条件检查";

      if (!isController) {
        var unifiedBtn = document.createElement("button");
        unifiedBtn.type = "button";
        unifiedBtn.textContent = "检查可发送状态";
        unifiedBtn.style.cssText = isCurrentStep
          ? "padding:5px 16px;border:1px solid #1d4ed8;border-radius:4px;background:#1d4ed8;color:#fff;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;font-weight:bold;"
          : "padding:3px 12px;border:1px solid #4338ca;border-radius:3px;background:#4338ca;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;font-weight:bold;";
        unifiedBtn.addEventListener("click", (function (s) {
          return function () {
            runUnifiedSendabilityCheck(s).catch(function (err) {
              console.error("[ACB][unified-check] failed", err);
              setUnifiedActionFeedback("检查可发送状态", "检查失败。", "error", err.message || String(err));
            });
          };
        })(step));
        actionRow.appendChild(unifiedBtn);
      }

      if (isDebugMode) {
        if (canSend) {
          var preflightBtn = document.createElement("button");
          preflightBtn.type = "button";
          preflightBtn.textContent = "Payload Preflight";
          preflightBtn.style.cssText = "padding:3px 12px;border:1px solid #6366f1;border-radius:3px;background:#6366f1;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
          preflightBtn.dataset.acbMode = "debug";
          preflightBtn.addEventListener("click", (function (s) {
            return function () {
              var stepCtx = getExecutionContextForStep(s);
              setUnifiedActionFeedback("Payload Preflight", "正在执行预检...", "info", "contextId=" + stepCtx.contextId);
              testPreflightPayload(s, stepCtx).then(function () {
                setUnifiedActionFeedback("Payload Preflight", "预检完成。", "success", "可在调试区查看详细结果");
              }).catch(function (err) {
                console.error("[ACB][preflight] test failed", err);
                setUnifiedActionFeedback("Payload Preflight", "预检失败。", "error", err.message || String(err));
              });
            };
          })(step));
          actionRow.appendChild(preflightBtn);
        } else if (!isController) {
          var disabledPfBtn = document.createElement("button");
          disabledPfBtn.type = "button";
          disabledPfBtn.textContent = "Payload Preflight";
          disabledPfBtn.disabled = true;
          disabledPfBtn.style.cssText = "padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
          disabledPfBtn.dataset.acbMode = "debug";
          disabledPfBtn.title = "当前步骤无完整任务卡，无法进行本地预检。";
          actionRow.appendChild(disabledPfBtn);
        }

        if (!isController) {
          var readinessBtn = document.createElement("button");
          readinessBtn.type = "button";
          readinessBtn.textContent = "Readiness Gate";
          readinessBtn.disabled = !canSend;
          readinessBtn.style.cssText = canSend
            ? "padding:3px 12px;border:1px solid #a16207;border-radius:3px;background:#fef9c3;color:#a16207;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
            : "padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
          readinessBtn.dataset.acbMode = "debug";
          readinessBtn.title = canSend ? "执行准备检查" : "请先准备完整任务卡并执行预检";
          if (canSend) {
            readinessBtn.addEventListener("click", (function (s) {
              return function () {
                var stepCtx = getExecutionContextForStep(s);
                setUnifiedActionFeedback("Readiness Gate", "正在检查执行准备状态...", "info", "contextId=" + stepCtx.contextId);
                testReadinessGate(stepCtx).then(function () {
                  setUnifiedActionFeedback("Readiness Gate", "Readiness 检查完成。", "success", "可在调试区查看详细结果");
                }).catch(function (err) {
                  console.error("[ACB][readiness] test failed", err);
                  setUnifiedActionFeedback("Readiness Gate", "Readiness 检查失败。", "error", err.message || String(err));
                });
              };
            })(step));
          }
          actionRow.appendChild(readinessBtn);
        }
      }

      var sendToVSCodeBtn = document.createElement("button");
      sendToVSCodeBtn.type = "button";
      sendToVSCodeBtn.textContent = "发送到 VS Code 查看端";
      sendToVSCodeBtn.disabled = !canSendToVSCode;
      sendToVSCodeBtn.style.cssText = canSendToVSCode
        ? "padding:3px 12px;border:1px solid #0f766e;border-radius:3px;background:#0f766e;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
        : "padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      sendToVSCodeBtn.dataset.acbMode = "debug";
      sendToVSCodeBtn.title = canSendToVSCode ? "发送到 VS Code 查看端" : sendDisabledReason;
      if (canSendToVSCode) {
        sendToVSCodeBtn.addEventListener("click", (function (s) {
          return function () {
            sendStepToVSCodeViewer(s).catch(function (err) {
              console.error("[ACB][task-card-review] per-step send failed", err);
              setUnifiedActionFeedback("发送到 VS Code 查看端", "发送失败。", "error", err.message || String(err));
            });
          };
        })(step));
      }
      actionRow.appendChild(sendToVSCodeBtn);
      var stepStatusSpan = document.createElement("span");
      stepStatusSpan.id = "acb-task-card-review-step-status-" + i;
      stepStatusSpan.style.cssText = "margin-left:6px;font-size:11px;font-family:Arial,sans-serif;";
      actionRow.appendChild(stepStatusSpan);

      var sendToExecutionInboxBtn = document.createElement("button");
      sendToExecutionInboxBtn.type = "button";
      sendToExecutionInboxBtn.textContent = "\u53d1\u9001\u5230\u6267\u884c\u7aef\u6536\u4ef6\u7bb1";
      sendToExecutionInboxBtn.disabled = !canSendToExecutionInbox;
      sendToExecutionInboxBtn.style.cssText = canSendToExecutionInbox
        ? "padding:3px 12px;border:1px solid #7c3aed;border-radius:3px;background:#7c3aed;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
        : "padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      sendToExecutionInboxBtn.title = canSendToExecutionInbox ? "\u53d1\u9001\u5230\u6267\u884c\u7aef\u6536\u4ef6\u7bb1" : inboxDisabledReason;
      if (canSendToExecutionInbox) {
        sendToExecutionInboxBtn.addEventListener("click", (function (s) {
          return function () {
            sendStepToExecutionInbox(s).catch(function (err) {
              console.error("[ACB][execution-inbox] per-step send failed", err);
              setUnifiedActionFeedback("Execution Inbox", "Send failed.", "error", err.message || String(err));
            });
          };
        })(step));
      }
      actionRow.appendChild(sendToExecutionInboxBtn);
      var executionInboxStatusSpan = document.createElement("span");
      executionInboxStatusSpan.id = "acb-execution-inbox-step-status-" + stepOriginalIndex;
      executionInboxStatusSpan.style.cssText = "margin-left:6px;font-size:11px;font-family:Arial,sans-serif;";
      actionRow.appendChild(executionInboxStatusSpan);

      if (canSend) {
        var copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = getCopyButtonLabel(step.target);
        copyBtn.style.cssText = "padding:3px 12px;border:1px solid #16a34a;border-radius:3px;background:#16a34a;color:#fff;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
        copyBtn.dataset.acbMode = "debug";
        copyBtn.addEventListener("click", (function (s) {
          return function () { copyFullTaskCardToClipboard(s); };
        })(step));
        actionRow.appendChild(copyBtn);
      } else if (!isController) {
        var reasonSpan2 = document.createElement("span");
        reasonSpan2.style.cssText = "font-size:11px;color:#dc2626;";
        reasonSpan2.textContent = sendDisabledReason;
        actionRow.appendChild(reasonSpan2);
      } else {
        var reasonSpan = document.createElement("span");
        reasonSpan.style.cssText = "font-size:11px;color:#6b7280;";
        reasonSpan.textContent = "controller 审查步骤，不作为执行端 payload";
        actionRow.appendChild(reasonSpan);
      }

      var copyPreExecutionBtn = document.createElement("button");
      copyPreExecutionBtn.type = "button";
      copyPreExecutionBtn.textContent = "复制准备投递 Payload";
      copyPreExecutionBtn.disabled = !preExecutionPackage.canPrepare;
      copyPreExecutionBtn.style.cssText = preExecutionPackage.canPrepare
        ? "padding:3px 12px;border:1px solid #15803d;border-radius:3px;background:#fff;color:#15803d;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
        : "padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      copyPreExecutionBtn.dataset.acbMode = "debug";
      copyPreExecutionBtn.title = preExecutionPackage.canPrepare
        ? "仅复制手动投递 Payload；不会自动执行。"
        : (preExecutionPackage.copyablePayloadUnavailableReason || "Pre-Execution Package blocked.");
      if (preExecutionPackage.canPrepare) {
        copyPreExecutionBtn.addEventListener("click", (function (s) {
          return function () {
            copyPreExecutionPayloadToClipboard(s);
          };
        })(step));
      }
      actionRow.appendChild(copyPreExecutionBtn);

      var markManualHandoffBtn = document.createElement("button");
      markManualHandoffBtn.type = "button";
      markManualHandoffBtn.textContent = "标记已手动交接";
      markManualHandoffBtn.disabled = !preExecutionPackage.canPrepare;
      markManualHandoffBtn.style.cssText = preExecutionPackage.canPrepare
        ? "padding:3px 12px;border:1px solid #0369a1;border-radius:3px;background:#fff;color:#0369a1;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;"
        : "padding:3px 12px;border:1px solid #9ca3af;border-radius:3px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;font-family:Arial,sans-serif;opacity:0.7;";
      markManualHandoffBtn.dataset.acbMode = "debug";
      markManualHandoffBtn.title = preExecutionPackage.canPrepare
        ? "只记录手动交接状态；不会自动执行。"
        : "Manual handoff mark is unavailable for Blocked / Review Only.";
      if (preExecutionPackage.canPrepare) {
        markManualHandoffBtn.addEventListener("click", (function (s) {
          return function () {
            markPreExecutionManualHandoff(s);
          };
        })(step));
      }
      actionRow.appendChild(markManualHandoffBtn);

      var cancelPrepareBtn = document.createElement("button");
      cancelPrepareBtn.type = "button";
      cancelPrepareBtn.textContent = "Cancel Prepare";
      cancelPrepareBtn.style.cssText = "padding:3px 12px;border:1px solid #b45309;border-radius:3px;background:#fff;color:#b45309;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
      cancelPrepareBtn.dataset.acbMode = "debug";
      cancelPrepareBtn.title = "Record handoff_cancelled only. No auto execution.";
      cancelPrepareBtn.addEventListener("click", (function (s) {
        return function () {
          cancelPreExecutionHandoff(s);
        };
      })(step));
      actionRow.appendChild(cancelPrepareBtn);

      var viewTaskCardBtn = document.createElement("button");
      viewTaskCardBtn.type = "button";
      viewTaskCardBtn.textContent = "\u67e5\u770b\u4efb\u52a1\u5361";
      viewTaskCardBtn.style.cssText = "padding:3px 12px;border:1px solid #0f766e;border-radius:3px;background:#fff;color:#0f766e;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
      viewTaskCardBtn.dataset.acbMode = "debug";
      viewTaskCardBtn.disabled = !step.fullTaskCard;
      viewTaskCardBtn.style.opacity = step.fullTaskCard ? "1" : "0.6";
      viewTaskCardBtn.style.cursor = step.fullTaskCard ? "pointer" : "not-allowed";
      if (step.fullTaskCard) {
        viewTaskCardBtn.addEventListener("click", (function (s) {
          return function () {
            var panel = document.getElementById("acb-payload-detail-panel");
            if (panel && panel.style.display === "flex" && _payloadDetailStepRef && _payloadDetailStepRef.id === s.id) {
              closePayloadDetailViewer();
            } else {
              openFullTaskCardViewer(s);
            }
          };
        })(step));
      } else {
        viewTaskCardBtn.title = "\u5f53\u524d\u6b65\u9aa4\u6ca1\u6709\u5b8c\u6574\u4efb\u52a1\u5361\u3002";
      }
      actionRow.appendChild(viewTaskCardBtn);

      // "生成审查草稿" button
      if (isCurrentStep) {
        var draftBtn = document.createElement("button");
        draftBtn.type = "button";
        draftBtn.textContent = "生成审查草稿";
        draftBtn.style.cssText = "padding:3px 12px;border:1px solid #7c3aed;border-radius:3px;background:#fff;color:#7c3aed;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
        draftBtn.dataset.acbMode = "debug";
        draftBtn.addEventListener("click", function () {
          var draftText = buildReviewDraftText(step);
          showReviewDraftPreview(draftText);
        });
        actionRow.appendChild(draftBtn);
      }

      if (!isCurrentStep) {
        var setCurrentBtn = document.createElement("button");
        setCurrentBtn.type = "button";
        setCurrentBtn.textContent = "设为当前任务";
        setCurrentBtn.style.cssText = "padding:3px 10px;border:1px solid #2563eb;border-radius:3px;background:#fff;color:#1d4ed8;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;";
        setCurrentBtn.dataset.acbMode = "debug";
        setCurrentBtn.addEventListener("click", (function (sid) {
          return function () {
            currentActionStepId = sid;
            renderActionStepsSection();
          };
        })(step.id));
        actionRow.appendChild(setCurrentBtn);
      }

      card.appendChild(actionRow);
      if (isCurrentStep && actionFeedbackPanel) {
        actionFeedbackPanel.style.marginTop = "8px";
        actionFeedbackPanel.style.borderStyle = "solid";
        card.appendChild(actionFeedbackPanel);
      }

      // --- Editor controls (collapsed by default) ---
      var editorDetails = document.createElement("details");
      editorDetails.dataset.acbMode = "debug";
      editorDetails.style.cssText = "margin-top:8px;border-top:1px solid #e5e7eb;padding-top:6px;";

      var editorSummary = document.createElement("summary");
      editorSummary.style.cssText = "cursor:pointer;font-size:11px;color:#6b7280;";
      editorSummary.textContent = "编辑步骤属性";
      editorDetails.appendChild(editorSummary);

      var editorBody = document.createElement("div");
      editorBody.style.cssText = "margin-top:6px;display:flex;flex-direction:column;gap:6px;";

      var summaryP = document.createElement("p");
      summaryP.style.cssText = "margin:0;font-size:12px;color:#374151;";
      summaryP.textContent = "摘要: " + (step.summary || "-");
      editorBody.appendChild(summaryP);

      var detailP = document.createElement("pre");
      detailP.style.cssText = "margin:0;padding:6px;border:1px solid #e5e7eb;border-radius:4px;background:#f9fafb;font-size:11px;white-space:pre-wrap;word-break:break-word;";
      detailP.textContent = step.detail || "";
      editorBody.appendChild(detailP);

      var tLabel = document.createElement("label");
      tLabel.style.cssText = "font-size:12px;";
      tLabel.textContent = "目标 (target)";
      editorBody.appendChild(tLabel);
      var tSelect = document.createElement("select");
      tSelect.style.cssText = "padding:6px;border:1px solid #d1d5db;border-radius:4px;";
      addSelectOptions(tSelect, ACTION_STEP_TARGETS.map(function (t) {
        return { value: t, label: getActionTargetLabel(t) + " (" + t + ")" };
      }));
      tSelect.value = normalizeEnum(step.target, ACTION_STEP_TARGETS, "controller");
      editorBody.appendChild(tSelect);

      var sLabel = document.createElement("label");
      sLabel.style.cssText = "font-size:12px;";
      sLabel.textContent = "状态 (status)";
      editorBody.appendChild(sLabel);
      var sSelect = document.createElement("select");
      sSelect.style.cssText = "padding:6px;border:1px solid #d1d5db;border-radius:4px;";
      addSelectOptions(sSelect, ACTION_STEP_STATUSES.map(function (st) {
        return { value: st, label: st };
      }));
      sSelect.value = normalizeEnum(step.status, ACTION_STEP_STATUSES, "pending");
      editorBody.appendChild(sSelect);

      var tlLabel = document.createElement("label");
      tlLabel.style.cssText = "font-size:12px;";
      tlLabel.textContent = "标题 (title)";
      editorBody.appendChild(tlLabel);
      var tlInput = document.createElement("input");
      tlInput.type = "text";
      tlInput.value = step.title || "";
      tlInput.style.cssText = "padding:6px;border:1px solid #d1d5db;border-radius:4px;";
      editorBody.appendChild(tlInput);

      var smLabel = document.createElement("label");
      smLabel.style.cssText = "font-size:12px;";
      smLabel.textContent = "摘要 (summary)";
      editorBody.appendChild(smLabel);
      var smInput = document.createElement("textarea");
      smInput.rows = 2;
      smInput.value = step.summary || "";
      smInput.style.cssText = "padding:6px;border:1px solid #d1d5db;border-radius:4px;resize:vertical;";
      editorBody.appendChild(smInput);

      var dLabel = document.createElement("label");
      dLabel.style.cssText = "font-size:12px;";
      dLabel.textContent = "详情 (detail)";
      editorBody.appendChild(dLabel);
      var dInput = document.createElement("textarea");
      dInput.rows = 3;
      dInput.value = step.detail || "";
      dInput.style.cssText = "padding:6px;border:1px solid #d1d5db;border-radius:4px;resize:vertical;";
      editorBody.appendChild(dInput);

      var saveEditorBtn = makeActionBtn("保存步骤", (function (sid, tSel, sSel, tiIn, smIn, dIn) {
        return function () {
          updateActionStepInPlan(sid, {
            target: tSel.value,
            status: sSel.value,
            title: tiIn.value,
            summary: smIn.value,
            detail: dIn.value
          }).catch(function (err) {
            console.error("[ACB][action-steps] step save failed", err);
            setActionStepsStatus("步骤保存失败。", true);
          });
        };
      })(step.id, tSelect, sSelect, tlInput, smInput, dInput));
      editorBody.appendChild(saveEditorBtn);

      editorDetails.appendChild(editorBody);
      card.appendChild(editorDetails);

      listEl.appendChild(card);
    }

    if (actionFeedbackPanel && !actionFeedbackPanel.parentElement) {
      wrapper.appendChild(actionFeedbackPanel);
    }
    renderUnifiedActionFeedback();
    syncPreflightCardButton();
    syncTaskCardReviewBridgeButton();
    applyConsoleDisplayMode();
  }

  function renderLegacyCardsSection() {
    var stats = getLegacyCardStats();
    setText("acb-legacy-cards-count", String(stats.total));
    setText("acb-legacy-cards-new-count", String(stats.newCount));
    setText("acb-legacy-cards-pending-count", String(stats.pendingCount));
    setText("acb-legacy-cards-done-count", String(stats.doneCount));
    setText("acb-legacy-cards-archived-count", String(stats.archivedCount));
  }

  /**
   * Build the route metadata object for review drafts.
   * Shared between draft text builder and UI route preview.
   * @returns {Object}
   */
  function buildRouteMeta() {
    return {
      from: "execution",
      to: "controller",
      messageKind: "review_request",
      deliveryMode: "fillCurrentComposer",
      requiresUserConfirm: true,
      autoSend: false,
      taskCard: false
    };
  }

  /**
   * Build the controller review draft text from current feedback/step/status data.
   * @param {Object} step - Current action step
   * @returns {string}
   */
  function buildReviewDraftText(step) {
    var lines = [];

    // Route semantics metadata
    var routeMeta = buildRouteMeta();

    lines.push("messageType: execution");
    lines.push("messageKind: review_request");
    lines.push("");
    lines.push("请审查以下执行端/工具端回报，并判断：");
    lines.push("1. 是否可以收口；");
    lines.push("2. 是否需要补测；");
    lines.push("3. 是否需要继续派发任务；");
    lines.push("4. 是否需要写入阶段记录。");
    lines.push("");

    // Source info
    var feedback = getSelectedFeedback();
    var channel = getChannelById(floatingSelectedChannelId);
    var plan = getCurrentActionPlan();
    var stepIndex = 0;
    if (plan && Array.isArray(plan.steps)) {
      for (var si = 0; si < plan.steps.length; si += 1) {
        if (plan.steps[si] && plan.steps[si].id === step.id) { stepIndex = si; break; }
      }
    }
    var sourceMeta = buildSourceMetadataForStep(step, stepIndex);
    var ns = normalizeProjectStatusResponse(floatingProjectStatusLatest && floatingProjectStatusLatest.data ? floatingProjectStatusLatest.data : null);
    var ps = ns.projectStatus || {};
    var shortCommit = (ps.currentCommit) ? ps.currentCommit : ((ps.git && ps.git.commitHash) ? ps.git.commitHash : "unknown");

    lines.push("【来源信息】");
    lines.push("- Channel: " + (sourceMeta.sourceDisplayName || "unknown"));
    lines.push("- Source Message Hash: " + (sourceMeta.sourceMessageHash || "unknown"));
    lines.push("- Captured At: " + (sourceMeta.sourceCapturedAt || "unknown"));
    lines.push("- Action Step Index: " + (sourceMeta.sourceActionStepIndex || "unknown"));
    lines.push("- Current Project: " + (ps.projectPath || ps.workspacePath || ps.workspaceName || "unknown"));
    lines.push("- Current Commit: " + shortCommit);
    lines.push("");

    // Status summary
    lines.push("【当前状态摘要】");
    var bridgeStatus = "unknown";
    if (floatingBridgeLatest && floatingBridgeLatest.data) {
      bridgeStatus = floatingBridgeLatest.data.status || floatingBridgeLatest.data.bridge || "connected/unknown";
    }
    lines.push("- Local Bridge: " + bridgeStatus);
    var workingTree = (ps.workingTree) ? ps.workingTree : ((ps.git && ps.git.clean !== undefined) ? (ps.git.clean ? "clean" : "dirty") : "unknown");
    var changedFiles = (ps.changedFiles !== undefined) ? ps.changedFiles : ((ps.git && ps.git.changes !== undefined) ? ps.git.changes : "unknown");
    var untrackedFiles = (ps.untrackedFiles !== undefined) ? ps.untrackedFiles : ((ps.git && ps.git.untracked !== undefined) ? ps.git.untracked : "unknown");
    lines.push("- Project Status: workingTree=" + workingTree + " changedFiles=" + changedFiles + " untrackedFiles=" + untrackedFiles);
    var preflightSummary = "not_run";
    if (floatingPreflightLatest && floatingPreflightLatest.data && floatingPreflightLatest.data.preflight) {
      preflightSummary = floatingPreflightLatest.data.preflight.status || "unknown";
    }
    lines.push("- Payload Preflight: " + preflightSummary);
    var readinessSummary = "not_run";
    if (floatingReadinessLatest && floatingReadinessLatest.data) {
      readinessSummary = floatingReadinessLatest.data.status || floatingReadinessLatest.data.readinessStatus || "unknown";
    }
    lines.push("- Execution Readiness: " + readinessSummary);
    lines.push("");

    // Delivery note (abbreviated — full route info shown in console preview UI)
    lines.push("【投递说明】");
    lines.push("此消息由 ACB 生成，用于提交给执行总控审查；当前不会自动执行或自动发送。");
    lines.push("完整路由以控制台路由预览为准。");
    lines.push("");

    // Current feedback body (with ACB_TASK_CARD sanitization)
    lines.push("【回报正文】");
    if (feedback) {
      var rawBody = feedback.assistantMessage || feedback.userMessage || feedback.text || "";
      var hasTaskCardOpen = rawBody.indexOf("<ACB_TASK_CARD") !== -1;
      var hasTaskCardClose = rawBody.indexOf("<ACB_TASK_CARD_END") !== -1;

      if (hasTaskCardOpen || hasTaskCardClose) {
        // Extract task card metadata for review summary
        var tcMatch = rawBody.match(/<ACB_TASK_CARD[^>]*>/);
        var tcTag = tcMatch ? tcMatch[0] : "";
        var tcExtract = function (attr) {
          var re = new RegExp(attr + '="([^"]*)"');
          var m = tcTag.match(re);
          return m ? m[1] : "unknown";
        };
        var tcBodyStart = rawBody.indexOf("<ACB_TASK_CARD");
        var tcBodyEnd = rawBody.lastIndexOf("<ACB_TASK_CARD_END");
        var tcContentLen = tcBodyEnd > tcBodyStart ? tcBodyEnd - tcBodyStart : rawBody.length;

        lines.push("[原始任务卡标签已屏蔽，避免误识别为可执行任务卡]");
        lines.push("- Detected Task Card ID: " + tcExtract("id"));
        lines.push("- Target: " + tcExtract("target"));
        lines.push("- Project Dir: " + tcExtract("projectDir"));
        lines.push("- Current Commit: " + tcExtract("currentCommit"));
        lines.push("- 原始内容长度: " + rawBody.length + " 字符");
        lines.push("- 是否截断: " + (rawBody.length > 2000 ? "是（超过2000字符）" : "否"));
        lines.push("- 屏蔽原因: 审查草稿不是执行任务卡，不应原样包含 ACB_TASK_CARD 起止标签");
        lines.push("");
        lines.push("--- 屏蔽后回报正文摘要 ---");
        var sanitized = rawBody.replace(/<ACB_TASK_CARD[\s\S]*?<ACB_TASK_CARD_END[^>]*>/g, "[ACB_TASK_CARD 已屏蔽]");
        if (sanitized.length > 2000) {
          sanitized = sanitized.substring(0, 2000) + "\n... [截断，总长度 " + sanitized.length + " 字符]";
        }
        lines.push(sanitized);
      } else {
        var body = rawBody;
        if (body.length > 2000) {
          body = body.substring(0, 2000) + "\n... [截断，总长度 " + body.length + " 字符]";
        }
        lines.push(body);
      }
    } else {
      lines.push("（当前无选中反馈/回报）");
    }
    lines.push("");

    lines.push("【我希望总控输出】");
    lines.push("请给出：");
    lines.push("- 审查结论；");
    lines.push("- 是否通过；");
    lines.push("- 风险点；");
    lines.push("- 下一步建议；");
    lines.push("- 如需继续执行，请生成下一张任务卡。");

    return lines.join("\n");
  }

  /**
   * Show the controller draft preview panel with copy/fill/close actions.
   * @param {string} draftText
   */
  function showReviewDraftPreview(draftText) {
    closeReviewDraftPreview();

    var overlay = document.createElement("div");
    overlay.id = "acb-draft-preview-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:99990;display:flex;align-items:center;justify-content:center;";

    var panel = document.createElement("div");
    panel.id = "acb-draft-preview-panel";
    panel.style.cssText = "background:#fff;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,0.25);max-width:620px;width:90vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;font-family:Arial,sans-serif;";

    // Header
    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;";

    var headerLeft = document.createElement("div");
    headerLeft.style.cssText = "display:flex;flex-direction:column;";
    var title = document.createElement("h3");
    title.textContent = "总控审查草稿";
    title.style.cssText = "margin:0;font-size:14px;color:#1f2937;";
    headerLeft.appendChild(title);

    var capabilityNote = document.createElement("p");
    capabilityNote.textContent = "当前为手动草稿模式：需人工复制/填入 ChatGPT 发送审查，不会自动路由或自动发送。";
    capabilityNote.style.cssText = "margin:4px 0 0;font-size:11px;color:#9ca3af;";
    headerLeft.appendChild(capabilityNote);

    header.appendChild(headerLeft);
    panel.appendChild(header);

    // Route preview card
    var routeMeta = buildRouteMeta();
    var routeCard = document.createElement("div");
    routeCard.style.cssText = "margin:8px 16px;padding:10px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;font-size:11px;font-family:Arial,sans-serif;color:#0c4a6e;line-height:1.7;";
    var routeLabelMap = {
      from: "来源",
      to: "目标",
      messageKind: "消息类型",
      deliveryMode: "投递方式",
      requiresUserConfirm: "需要人工确认",
      autoSend: "自动发送",
      taskCard: "任务卡"
    };
    var routeValueMap = {
      from: { execution: "当前执行端/工具端" },
      to: { controller: "执行总控" },
      messageKind: { review_request: "审查请求" },
      deliveryMode: { fillCurrentComposer: "填入当前输入框" },
      requiresUserConfirm: { true: "是", false: "否" },
      autoSend: { true: "是", false: "否" },
      taskCard: { true: "是", false: "否" }
    };
    var routeTitle = document.createElement("div");
    routeTitle.textContent = "路由预览";
    routeTitle.style.cssText = "font-weight:600;margin-bottom:6px;font-size:12px;color:#0369a1;";
    routeCard.appendChild(routeTitle);
    var routeGrid = document.createElement("div");
    routeGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;";
    var routeFields = ["from", "to", "messageKind", "deliveryMode", "requiresUserConfirm", "autoSend", "taskCard"];
    for (var rf = 0; rf < routeFields.length; rf += 1) {
      var key = routeFields[rf];
      var val = routeMeta[key];
      var displayVal = (routeValueMap[key] && routeValueMap[key][val]) ? routeValueMap[key][val] : String(val);
      var row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;";
      row.innerHTML = "<span style='color:#64748b;'>" + routeLabelMap[key] + "</span><span style='font-weight:500;'>" + displayVal + "</span>";
      routeGrid.appendChild(row);
    }
    routeCard.appendChild(routeGrid);
    panel.appendChild(routeCard);

    // Body with textarea
    var body = document.createElement("div");
    body.style.cssText = "flex:1;overflow-y:auto;padding:12px 16px;";
    var textarea = document.createElement("textarea");
    textarea.id = "acb-draft-preview-textarea";
    textarea.value = draftText;
    textarea.readOnly = false;
    textarea.style.cssText = "width:100%;min-height:280px;border:1px solid #d1d5db;border-radius:4px;padding:10px;font-size:12px;font-family:Consolas,monospace;line-height:1.5;resize:vertical;box-sizing:border-box;color:#1f2937;background:#f9fafb;";
    body.appendChild(textarea);
    panel.appendChild(body);

    // Footer with actions
    var footer = document.createElement("div");
    footer.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid #e5e7eb;background:#fafafa;flex-wrap:wrap;";

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "复制草稿";
    copyBtn.style.cssText = "padding:6px 18px;border:1px solid #16a34a;border-radius:4px;background:#16a34a;color:#fff;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;";
    copyBtn.addEventListener("click", function () {
      var ta = document.getElementById("acb-draft-preview-textarea");
      if (!ta) return;
      var text = ta.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showDraftToast("草稿已复制。");
        }).catch(function () {
          fallbackCopyDraft(text);
        });
      } else {
        fallbackCopyDraft(text);
      }
    });
    footer.appendChild(copyBtn);

    var fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.textContent = "填入当前 ChatGPT 输入框";
    fillBtn.style.cssText = "padding:6px 18px;border:1px solid #7c3aed;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;";
    fillBtn.addEventListener("click", function () {
      var ta = document.getElementById("acb-draft-preview-textarea");
      if (!ta) return;
      var text = ta.value;
      var filled = fillChatGPTInput(text);
      if (filled) {
        showDraftToast("草稿已填入输入框，请人工检查后发送（当前不会自动路由或自动发送）。");
      } else {
        showDraftToast("未找到 ChatGPT 输入框，已保留草稿，可手动复制。");
      }
    });
    footer.appendChild(fillBtn);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "关闭草稿";
    closeBtn.style.cssText = "padding:6px 18px;border:1px solid #d1d5db;border-radius:4px;background:#fff;color:#374151;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;";
    closeBtn.addEventListener("click", function () {
      closeReviewDraftPreview();
    });
    footer.appendChild(closeBtn);

    // Toast container
    var toast = document.createElement("span");
    toast.id = "acb-draft-toast";
    toast.style.cssText = "margin-left:auto;font-size:11px;color:#16a34a;";
    footer.appendChild(toast);

    panel.appendChild(footer);
    overlay.appendChild(panel);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeReviewDraftPreview();
      }
    });
    document.body.appendChild(overlay);
  }

  function closeReviewDraftPreview() {
    var overlay = document.getElementById("acb-draft-preview-overlay");
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function showDraftToast(msg) {
    var el = document.getElementById("acb-draft-toast");
    if (el) {
      el.textContent = msg;
      el.style.color = "#16a34a";
      setTimeout(function () {
        if (el) { el.textContent = ""; }
      }, 3000);
    }
  }

  function fallbackCopyDraft(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showDraftToast("草稿已复制。");
    } catch (_e) {
      showDraftToast("复制失败，请手动全选复制。");
    }
    document.body.removeChild(ta);
  }

  /**
   * Attempt to fill the ChatGPT input box with text.
   * Supports textarea, contenteditable, ProseMirror editors.
   * Does NOT auto-send.
   * @param {string} text
   * @returns {boolean} true if an input was found and filled
   */
  function fillChatGPTInput(text) {
    // Strategy 1: ChatGPT's standard textarea (ProseMirror editor uses a hidden textarea or contenteditable)
    // Strategy 2: contenteditable div
    // Strategy 3: ProseMirror editor (ChatGPT's current composer)
    // Strategy 4: generic textarea

    // ChatGPT ProseMirror: the editor is a div with contenteditable, inside #composer-background or similar
    var pmEditor = document.querySelector("#prompt-textarea, [data-id=\"root\"] .ProseMirror, .ProseMirror[contenteditable=\"true\"]");
    if (pmEditor) {
      // ProseMirror contenteditable
      pmEditor.focus();
      pmEditor.innerHTML = "";
      var lines = text.split("\n");
      for (var l = 0; l < lines.length; l += 1) {
        var p = document.createElement("p");
        p.textContent = lines[l] || " ";
        pmEditor.appendChild(p);
      }
      // Dispatch input event so React/ProseMirror picks up the change
      pmEditor.dispatchEvent(new Event("input", { bubbles: true }));
      pmEditor.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // Generic contenteditable
    var editable = document.querySelector("[contenteditable=\"true\"][role=\"textbox\"], [contenteditable=\"true\"].msg-composer");
    if (editable) {
      editable.focus();
      editable.innerHTML = "";
      var eslines = text.split("\n");
      for (var el = 0; el < eslines.length; el += 1) {
        var ep = document.createElement("div");
        ep.textContent = eslines[el] || " ";
        editable.appendChild(ep);
      }
      editable.dispatchEvent(new Event("input", { bubbles: true }));
      editable.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // Fallback: any visible textarea
    var textareas = document.querySelectorAll("textarea");
    for (var ti = 0; ti < textareas.length; ti += 1) {
      var ta = textareas[ti];
      if (ta.offsetParent !== null) {
        ta.focus();
        ta.value = text;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    return false;
  }

  function buildSourceMetadataForStep(step, stepIndex) {
    var feedback = getSelectedFeedback();
    var channel = getChannelById(floatingSelectedChannelId);
    return {
      sourceChannelId: (step && step.sourceChannelId) || (feedback && feedback.channelId) || channel.id || "unknown",
      sourceDisplayName: (step && step.sourceChannelName) || (feedback && feedback.channelName) || channel.name || "unknown",
      sourceConversationId: getFeedbackConversationId(feedback) || "unknown",
      sourceMessageHash: (feedback && feedback.hash) || "unknown",
      sourceCapturedAt: (feedback && feedback.capturedAt) || "unknown",
      sourceActionStepIndex: (step && step.order) || (stepIndex + 1),
      taskCardId: (step && step.taskCardId) || "unknown",
      target: (step && step.target) || "unknown"
    };
  }

  function createRouteId(input) {
    var source = input && input.sourceMetadata ? input.sourceMetadata : {};
    var step = input && input.actionStep ? input.actionStep : {};
    var pv = step.payloadValidation || {};
    var taskCardId = step.taskCardId || pv.taskCardId || source.taskCardId || "no-task-card";
    var hash = source.sourceMessageHash || (input && input.feedback ? input.feedback.hash : "") || "no-message";
    var stepIndex = source.sourceActionStepIndex || (input && input.actionStepIndex >= 0 ? input.actionStepIndex + 1 : "none");
    return ["route", shortHash(hash), taskCardId || "unknown", String(stepIndex)].join("::");
  }

  function getRouteInputText(input) {
    var feedback = input && input.feedback ? input.feedback : null;
    var step = input && input.actionStep ? input.actionStep : null;
    return [
      feedback ? (feedback.assistantMessage || "") : "",
      step ? (step.fullTaskCard || "") : "",
      step ? (step.detail || "") : ""
    ].join("\n");
  }

  function textHasRouteFlag(text, key) {
    var re = new RegExp("(^|\\n)\\s*" + key + "\\s*:\\s*true\\b", "i");
    return re.test(String(text || ""));
  }

  function detectProtocolType(input) {
    var step = input && input.actionStep ? input.actionStep : {};
    var text = getRouteInputText(input);
    var hasTaskCard = text.indexOf("<ACB_TASK_CARD") !== -1 || step.payloadStatus === "complete" || step.payloadStatus === "incomplete" || step.payloadStatus === "missing";
    var hasCardMeta = text.indexOf("<ACB_CARD_META>") !== -1;
    var hasRoleMessage = text.indexOf("<ACB_ROLE_MESSAGE") !== -1;
    var protocolCount = (hasTaskCard ? 1 : 0) + (hasCardMeta ? 1 : 0) + (hasRoleMessage ? 1 : 0);

    if (step.payloadValidation && step.payloadValidation.multipleTaskCardsDetected) {
      return "mixed";
    }
    if (step.payloadValidation && step.payloadValidation.truncatedSuspected) {
      return "invalid";
    }
    if (hasTaskCard) {
      return "acb_task_card";
    }
    if (protocolCount > 1) {
      return "mixed";
    }
    if (hasCardMeta) {
      return "acb_card_meta";
    }
    if (hasRoleMessage) {
      return "acb_role_message";
    }
    return "none";
  }

  function deriveDetectedMessageType(input) {
    var classification = input && input.classification ? input.classification : null;
    var cardMeta = input && input.cardMeta ? input.cardMeta : null;
    var step = input && input.actionStep ? input.actionStep : null;
    if (cardMeta && cardMeta.feedbackType) {
      return cardMeta.feedbackType;
    }
    if (classification && classification.feedbackType) {
      return classification.feedbackType;
    }
    if (step && step.payloadStatus && step.payloadStatus !== "not_applicable") {
      return "execution";
    }
    return "unknown";
  }

  function deriveSourceRoleType(input) {
    var feedback = input && input.feedback ? input.feedback : null;
    var channelType = (feedback && feedback.channelType) || (input && input.channel ? input.channel.type : "") || "";
    var channelId = (feedback && feedback.channelId) || (input && input.channel ? input.channel.id : "") || "";
    var channelName = (feedback && feedback.channelName) || (input && input.channel ? input.channel.name : "") || "";
    var combined = (channelType + " " + channelId + " " + channelName).toLowerCase();

    if (combined.indexOf("controller") !== -1) {
      return "controller";
    }
    if (combined.indexOf("advisor") !== -1) {
      return "advisor";
    }
    if (combined.indexOf("sample") !== -1) {
      return "sample";
    }
    if (combined.indexOf("agent") !== -1 || combined.indexOf("codex") !== -1 || combined.indexOf("deepseek") !== -1 || combined.indexOf("claude") !== -1) {
      return "agent";
    }
    return "unknown";
  }

  function deriveTargetRole(input) {
    var step = input && input.actionStep ? input.actionStep : {};
    var classification = input && input.classification ? input.classification : null;
    var target = normalizeExecutorTargetAlias(step.target || "");
    if (target === "controller") {
      return "controller";
    }
    if (PRE_EXECUTION_TARGET_ALIAS_MAP[target] ||
      target === "codex" || target === "openai-codex" || target === "codex-cli" ||
      target === "claude" || target === "claude-code" || target === "cloud" || target === "cloudcode" ||
      target === "deepseek" || target === "powershell" || target === "git" || target === "docs") {
      return "agent";
    }
    if (classification && classification.feedbackType === "recommendation" && classification.suggestedNextAction === "send_to_controller_for_review") {
      return "controller";
    }
    return target ? "agent" : "unknown";
  }

  function deriveSampleFlags(input) {
    var step = input && input.actionStep ? input.actionStep : {};
    var flags = getExplicitDispatchBlockFlagsFromTaskCard(step.fullTaskCard || "");
    return flags;
  }

  function deriveRouteResult(input) {
    var step = input && input.actionStep ? input.actionStep : {};
    var pv = step.payloadValidation || {};
    var sourceMetadata = input && input.sourceMetadata ? input.sourceMetadata : {};
    var reviewMetadata = input && input.reviewMetadata ? input.reviewMetadata : {};
    var classification = input && input.classification ? input.classification : null;
    var payloadStatus = step.payloadStatus || "not_applicable";
    var protocolType = detectProtocolType(input);
    var detectedMessageType = deriveDetectedMessageType(input);
    var sourceRoleType = deriveSourceRoleType(input);
    var targetRole = deriveTargetRole(input);
    var sampleFlags = deriveSampleFlags(input);
    var blockingReasons = [];
    var warningReasons = [];
    var canGenerateActionStep = Boolean(step.id || (classification && (classification.needsExecution || classification.feedbackType === "execution")));
    var canGenerateTaskCard = payloadStatus === "complete";
    var canSendToAgent = Boolean(pv.canSendToAgent);
    var terminalState = "ROUTE-NO-ACTION";
    var fallbackRoute = "ROUTE-NO-ACTION";
    var uiCardType = "route_status";

    if (payloadStatus === "missing") {
      blockingReasons.push("payload_missing");
    }
    if (payloadStatus === "incomplete") {
      var incReason = (pv.incompleteReason) ? pv.incompleteReason : "payload_incomplete";
      blockingReasons.push(incReason);
      if (pv.longTaskCardCaptureIncomplete) {
        blockingReasons.push("long_task_card_capture_incomplete: end marker missing, possible DOM truncation");
      }
    }
    if (protocolType === "invalid") {
      blockingReasons.push("payload_invalid");
    }
    if (protocolType === "mixed") {
      blockingReasons.push("protocol_mixed");
    }
    if (targetRole === "controller") {
      blockingReasons.push("target_controller_not_agent");
    }
    if (sampleFlags.sampleOnly) {
      blockingReasons.push("sample_only_cannot_dispatch");
    }
    if (sampleFlags.cannotDispatch) {
      blockingReasons.push("cannot_dispatch");
    }
    if (input && input.preflightStatus === "fail") {
      blockingReasons.push("preflight_failed");
    }
    if (input && input.readinessStatus === "blocked") {
      blockingReasons.push("readiness_blocked");
    }
    if (input && input.preflightStatus === "warn") {
      warningReasons.push("preflight_warning");
    }
    if (input && input.readinessStatus === "warning") {
      warningReasons.push("readiness_warning");
    }
    if (!sourceMetadata.sourceMessageHash || sourceMetadata.sourceMessageHash === "unknown") {
      warningReasons.push("source_metadata_missing");
    }
    if (protocolType === "none") {
      warningReasons.push("protocol_defaulted");
    }
    if (targetRole === "unknown") {
      warningReasons.push("target_unknown");
    }

    blockingReasons.push("locked_readonly_execution_disabled");

    if (sampleFlags.sampleOnly || sampleFlags.cannotDispatch || targetRole === "controller" || payloadStatus !== "complete") {
      canSendToAgent = false;
    }
    if (payloadStatus === "complete" && targetRole !== "controller" && !sampleFlags.sampleOnly && !sampleFlags.cannotDispatch) {
      terminalState = "ROUTE-TASK-CARD-READY";
      fallbackRoute = "ROUTE-TASK-CARD-READY";
      uiCardType = "task_card";
    } else if (sampleFlags.sampleOnly || sampleFlags.cannotDispatch) {
      terminalState = "ROUTE-SAMPLE-ACCEPTED";
      fallbackRoute = "ROUTE-SAMPLE-ACCEPTED";
      uiCardType = "sample_card";
    } else if (payloadStatus === "missing" || payloadStatus === "incomplete" || protocolType === "invalid" || protocolType === "mixed") {
      terminalState = "ROUTE-TASK-CARD-BLOCKED";
      fallbackRoute = "ROUTE-TASK-CARD-BLOCKED";
      uiCardType = "task_card_blocked";
    } else if (targetRole === "controller") {
      terminalState = detectedMessageType === "strategy" || detectedMessageType === "decision" ? "ROUTE-OWNER-REVIEW" : "ROUTE-EXECUTION-REVIEW";
      fallbackRoute = terminalState;
      uiCardType = "review_card";
    } else if (detectedMessageType === "unknown") {
      terminalState = "ROUTE-CLARIFICATION";
      fallbackRoute = "ROUTE-CLARIFICATION";
      uiCardType = "clarification_card";
    }

    return {
      routeId: createRouteId(input),
      createdAt: sourceMetadata.sourceCapturedAt && sourceMetadata.sourceCapturedAt !== "unknown" ? sourceMetadata.sourceCapturedAt : new Date().toISOString(),
      sourceRoleType: sourceRoleType,
      detectedMessageType: detectedMessageType,
      protocolType: protocolType,
      targetRole: targetRole,
      uiCardType: uiCardType,
      terminalState: terminalState,
      fallbackRoute: fallbackRoute,
      payloadStatus: payloadStatus,
      canGenerateActionStep: canGenerateActionStep,
      canGenerateTaskCard: canGenerateTaskCard,
      canSendToAgent: canSendToAgent,
      canTriggerExecution: false,
      sampleOnly: sampleFlags.sampleOnly,
      cannotDispatch: sampleFlags.cannotDispatch,
      dispatchBlockFlagMatched: sampleFlags.dispatchBlockFlagMatched,
      dispatchBlockFlagSource: sampleFlags.dispatchBlockFlagSource,
      routeReason: terminalState + " via " + protocolType,
      blockingReasons: uniqueStrings(blockingReasons),
      warningReasons: uniqueStrings(warningReasons),
      sourceMetadata: sourceMetadata,
      reviewMetadata: reviewMetadata
    };
  }

  function uniqueStrings(values) {
    var seen = {};
    var output = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (!value || seen[value]) {
        continue;
      }
      seen[value] = true;
      output.push(value);
    }
    return output;
  }

  function getRouteStatusFromLatest(preflightLatest, readinessLatest, taskCardReviewLatest, ctx) {
    var preflightStatus = "not_run";
    var readinessStatus = "not_run";
    var reviewMetadata = {};

    if (preflightLatest && preflightLatest.data && preflightLatest.data.preflight && preflightMatchesContext(preflightLatest, ctx)) {
      preflightStatus = preflightLatest.data.preflight.status || "unknown";
    }
    if (readinessLatest && readinessLatest.data && readinessLatest.data.readiness) {
      var rd = readinessLatest.data.readiness;
      if (rd.requestContextId && ctx && rd.requestContextId === ctx.contextId) {
        readinessStatus = rd.status || "unknown";
      }
    }
    if (taskCardReviewLatest) {
      reviewMetadata = {
        taskCardId: taskCardReviewLatest.taskCardId || "",
        target: taskCardReviewLatest.target || "",
        contextId: taskCardReviewLatest.contextId || "",
        actionStepIndex: taskCardReviewLatest.actionStepIndex,
        payloadStatus: taskCardReviewLatest.payloadStatus || ""
      };
    }
    return {
      preflightStatus: preflightStatus,
      readinessStatus: readinessStatus,
      reviewMetadata: reviewMetadata
    };
  }

  function buildRouteResultInput(feedback, classification, channel, step, stepIndex, preflightLatest, readinessLatest, taskCardReviewLatest, ctx) {
    var sourceMetadata = {
      sourceChannelId: (step && step.sourceChannelId) || (feedback && feedback.channelId) || (channel && channel.id) || "unknown",
      sourceDisplayName: (step && step.sourceChannelName) || (feedback && feedback.channelName) || (channel && channel.name) || "unknown",
      sourceConversationId: getFeedbackConversationId(feedback) || "unknown",
      sourceMessageHash: (feedback && feedback.hash) || "unknown",
      sourceCapturedAt: (feedback && feedback.capturedAt) || "unknown",
      sourceActionStepIndex: (step && step.order) || (stepIndex + 1),
      taskCardId: (step && step.taskCardId) || "unknown",
      target: (step && step.target) || "unknown"
    };
    var routeStatus = getRouteStatusFromLatest(preflightLatest, readinessLatest, taskCardReviewLatest, ctx || getExecutionContextForStep(step));
    return {
      feedback: feedback,
      classification: classification,
      cardMeta: parseAcbCardMeta(feedback ? (feedback.assistantMessage || "") : ""),
      channel: channel,
      actionStep: step,
      actionStepIndex: stepIndex,
      sourceMetadata: sourceMetadata,
      preflightStatus: routeStatus.preflightStatus,
      readinessStatus: routeStatus.readinessStatus,
      reviewMetadata: routeStatus.reviewMetadata
    };
  }

  function refreshActionStepRouteResult(step, stepIndex, options) {
    if (!step) {
      return null;
    }
    var opts = options || {};
    var feedback = opts.feedback || getSelectedFeedback();
    var channel = opts.channel || getChannelById((feedback && feedback.channelId) || floatingSelectedChannelId);
    var classification = opts.classification || getCurrentClassification();
    var ctx = opts.context || getExecutionContextForStep(step);
    var routeResult = deriveRouteResult(buildRouteResultInput(
      feedback,
      classification,
      channel,
      step,
      stepIndex,
      opts.preflightLatest || null,
      opts.readinessLatest || null,
      opts.taskCardReviewLatest || null,
      ctx
    ));
    step.routeResult = routeResult;
    return routeResult;
  }

  function appendRouteResultReportLines(lines, routeResult) {
    lines.push("--- Route Result ---");
    if (!routeResult) {
      lines.push("Route Result Detected: false");
      return;
    }
    lines.push("Route Result Detected: true");
    lines.push("Route ID: " + routeResult.routeId);
    lines.push("Protocol Type: " + routeResult.protocolType);
    lines.push("Detected Message Type: " + routeResult.detectedMessageType);
    lines.push("Source Role Type: " + routeResult.sourceRoleType);
    lines.push("Target Role: " + routeResult.targetRole);
    lines.push("UI Card Type: " + routeResult.uiCardType);
    lines.push("Terminal State: " + routeResult.terminalState);
    lines.push("Fallback Route: " + routeResult.fallbackRoute);
    lines.push("Payload Status: " + routeResult.payloadStatus);
    lines.push("Can Generate Action Step: " + String(routeResult.canGenerateActionStep));
    lines.push("Can Generate Task Card: " + String(routeResult.canGenerateTaskCard));
    lines.push("Can Send To Agent: " + String(routeResult.canSendToAgent));
    lines.push("Can Trigger Execution: " + String(routeResult.canTriggerExecution));
    lines.push("Sample Only: " + String(routeResult.sampleOnly));
    lines.push("Cannot Dispatch: " + String(routeResult.cannotDispatch));
    lines.push("Dispatch Block Flag Matched: " + String(Boolean(routeResult.dispatchBlockFlagMatched)));
    lines.push("Dispatch Block Flag Source: " + (routeResult.dispatchBlockFlagSource || "none"));
    lines.push("Blocking Reasons: " + (routeResult.blockingReasons.length > 0 ? routeResult.blockingReasons.join(", ") : "none"));
    lines.push("Warning Reasons: " + (routeResult.warningReasons.length > 0 ? routeResult.warningReasons.join(", ") : "none"));
    lines.push("Route Reason: " + routeResult.routeReason);
  }

  function renderTopOverview() {
    var channel = getChannelById(floatingSelectedChannelId);
    var feedback = getSelectedFeedback();
    var status = getEffectiveChannelStatus(floatingSelectedChannelId) || "seen";
    var bridgeUiState = deriveBridgeUiState();
    var ns = normalizeProjectStatusResponse(floatingProjectStatusLatest && floatingProjectStatusLatest.data ? floatingProjectStatusLatest.data : null);
    var ps = ns.projectStatus || null;
    var branch = (ps && ps.branch) ? ps.branch : "unknown";
    var shortCommitValue = (ps && ps.currentCommit) ? shortText(ps.currentCommit, 10) : "unknown";
    var gitVersion = branch === "unknown" ? "unknown" : (branch + "@" + shortCommitValue);
    var projectName = (ps && ps.workspaceName) ? ps.workspaceName : ((ps && ps.projectPath) ? shortText(ps.projectPath, 28) : "ACB Workspace");

    setText("acb-top-project-name", projectName);
    setText("acb-top-bridge-status", bridgeUiState.chipText);
    setText("acb-top-git-version", gitVersion);
    setText("acb-top-branch", branch);
    setText("acb-top-commit", shortCommitValue);
    setText("acb-top-working-tree", (ps && ps.workingTree) ? ps.workingTree : "unknown");
    setText("acb-top-safety-mode", "locked_readonly / 只读锁定");
    setText("acb-top-safety-lock-state", "locked_readonly / 只读锁定");
    setText("acb-top-safety-flags", "Exec=false · Agent=false · Cmd=false · Git=false");
    setText("acb-top-project-path", (ps && ps.projectPath) ? ps.projectPath : "unknown");
    setText("acb-top-git-root", (ps && ps.gitRoot) ? ps.gitRoot : "unknown");
    setText("acb-top-selected-channel", channel.name + " (" + channel.id + ")");
    setText("acb-top-selected-status", status);
    setText("acb-top-selected-hash", feedback ? shortHash(feedback.hash || "") : "none");
    setText("acb-top-layout-version", "M3-UI.2-B.1 runtime");
    var psFreshness = deriveProjectStatusFreshness(ps);
    setText("acb-top-generated-at", floatingProjectStatusLatest && floatingProjectStatusLatest.fetchedAt ? floatingProjectStatusLatest.fetchedAt : "unknown");
    setText("acb-top-ps-fresh", psFreshness.fresh ? "fresh" : "stale");
    if (!psFreshness.fresh) {
      setText("acb-top-ps-stale-reason", psFreshness.reason);
    }

    var preflightSummary = "not_run";
    var ctx = getActiveExecutionContext();
    if (floatingPreflightLatest && floatingPreflightLatest.data && floatingPreflightLatest.data.preflight) {
      preflightSummary = preflightMatchesContext(floatingPreflightLatest, ctx)
        ? (floatingPreflightLatest.data.preflight.status || "unknown")
        : "stale";
    }
    setText("acb-top-preflight-status", preflightSummary);

    var readinessSummary = "not_run";
    if (floatingReadinessLatest && floatingReadinessLatest.data && floatingReadinessLatest.data.readiness) {
      var rd = floatingReadinessLatest.data.readiness;
      var matched = Boolean(ctx && rd.requestContextId && rd.requestContextId === ctx.contextId);
      readinessSummary = matched ? (rd.status || "unknown") : "stale";
    }
    setText("acb-top-readiness-status", readinessSummary);

    var reviewSummary = "not_sent";
    if (floatingTaskCardReviewLatest) {
      reviewSummary = floatingTaskCardReviewLatest.status || (floatingTaskCardReviewLatest.accepted ? "accepted" : (floatingTaskCardReviewLatest.error ? "error" : "attempted"));
    }
    setText("acb-top-review-status", reviewSummary);
  }

  function buildExecutorToolEntry(displayName, executorId) {
    var profile = getExecutorProfileById(executorId);
    if (profile) {
      var hasUnread = Boolean(executorUnreadDots[executorId]);
      return {
        displayName: profile.displayName,
        executorId: profile.executorId,
        toolType: "agent",
        connectionStatus: profile.defaultHandoffMode || "manual/copyable",
        canReceiveTaskCard: false,
        attention: hasUnread ? "#f97316" : "#9ca3af",
        note: profile.defaultPermissionMode || "manual_confirmed",
        normalModeBadge: "手动交互执行端",
        hasProfile: true,
        executorType: profile.executorType,
        roleIdentity: profile.roleIdentity || "execution-agent",
        isActive: selectedExecutorId === executorId
      };
    }
    return {
      displayName: displayName,
      executorId: executorId,
      toolType: "agent",
      connectionStatus: "未接入",
      canReceiveTaskCard: false,
      attention: "#9ca3af",
      note: "手动复制 / 待配置",
      normalModeBadge: "未开放",
      hasProfile: false,
      isActive: false
    };
  }

  function renderToolEndpointCards() {
    var listEl = document.getElementById("acb-tool-endpoint-list");
    if (!listEl) {
      return;
    }
    listEl.innerHTML = "";

    var isDebugMode = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG;
    var bridgeUiState = deriveBridgeUiState();
    var bridgeConnected = Boolean(floatingBridgeLatest && floatingBridgeLatest.ok);
    var reviewAccepted = Boolean(floatingTaskCardReviewLatest && floatingTaskCardReviewLatest.accepted);
    var bridgeStatusText = bridgeConnected ? "已连接" : (floatingBridgeLatest ? "未连接" : "未知");
    var bridgeAttention = bridgeConnected ? "#16a34a" : "#9ca3af";
    var tools = [
      { displayName: "VS Code Bridge", toolType: "bridge", connectionStatus: bridgeStatusText, canReceiveTaskCard: bridgeConnected, attention: bridgeAttention, note: reviewAccepted ? "最近一次任务卡审查已接受" : "仅支持任务卡查看端审查", normalModeBadge: bridgeConnected ? "查看端" : "未连接" },
      buildExecutorToolEntry("DeepSeek", "deepseek"),
      buildExecutorToolEntry("Codex", "codex"),
      buildExecutorToolEntry("Claude Code", "claude-code"),
      { displayName: "PowerShell", toolType: "terminal", connectionStatus: "未接入", canReceiveTaskCard: false, attention: "#9ca3af", note: "手动执行 / 待配置", normalModeBadge: "不执行" },
      { displayName: "Git", toolType: "scm", connectionStatus: "只读", canReceiveTaskCard: false, attention: "#9ca3af", note: "禁止自动写入", normalModeBadge: "只读" },
      { displayName: "Build / Check", toolType: "qa", connectionStatus: "只读", canReceiveTaskCard: false, attention: "#9ca3af", note: "仅展示状态", normalModeBadge: "只读" }
    ];

    tools[0].connectionStatus = bridgeUiState.connectionText;
    tools[0].canReceiveTaskCard = bridgeUiState.connected;
    tools[0].attention = bridgeUiState.attention;
    tools[0].note = reviewAccepted ? "\u6700\u8fd1\u4e00\u6b21\u4efb\u52a1\u5361\u5ba1\u67e5\u5df2\u63a5\u53d7" : bridgeUiState.note;
    tools[0].normalModeBadge = bridgeUiState.badgeText;

    for (var i = 0; i < tools.length; i += 1) {
      var tool = tools[i];
      var isExecutorCard = Boolean(tool.hasProfile);
      var isPrimaryBridgeCard = tool.displayName === "VS Code Bridge";
      var card = document.createElement("div");
      if (isExecutorCard) {
        card.style.cssText = tool.isActive
          ? "border:1px solid #0f766e;border-radius:8px;padding:8px;background:#f0fdfa;margin-bottom:8px;cursor:pointer;"
          : "border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;margin-bottom:8px;cursor:pointer;";
      } else if (isPrimaryBridgeCard) {
        card.style.cssText = "border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:#fff;margin-bottom:8px;";
      } else {
        card.style.cssText = "border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;background:#fff;margin-bottom:6px;";
      }
      var title = document.createElement("p");
      title.style.cssText = isExecutorCard || isPrimaryBridgeCard
        ? "margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#111827;display:flex;align-items:center;gap:6px;"
        : "margin:0;font-size:11px;font-weight:bold;color:#111827;display:flex;align-items:center;gap:6px;";
      title.textContent = tool.displayName;
      var dot = document.createElement("span");
      var dotColor = (isExecutorCard && executorUnreadDots[tool.executorId]) ? "#f97316" : tool.attention;
      dot.style.cssText = "display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:" + dotColor + ";";
      title.prepend(dot);
      card.appendChild(title);

      if (isExecutorCard) {
        var execSummary = document.createElement("p");
        var hasUnread = Boolean(executorUnreadDots[tool.executorId]);
        execSummary.style.cssText = hasUnread
          ? "margin:2px 0 0 0;font-size:11px;color:#f97316;font-weight:bold;"
          : "margin:2px 0 0 0;font-size:11px;color:#64748b;";
        execSummary.textContent = tool.note + " · " + tool.normalModeBadge + " · " + tool.roleIdentity;
        if (hasUnread) {
          execSummary.textContent += " · ● Report";
        }
        card.appendChild(execSummary);

        if (!isDebugMode) {
          (function (executorId) {
            card.addEventListener("click", function () {
              if (selectedExecutorId === executorId) {
                selectedExecutorId = null;
              } else {
                selectedExecutorId = executorId;
                executorUnreadDots[executorId] = false;
              }
              renderFloatingFeedback();
              renderToolEndpointCards();
            });
          })(tool.executorId);
          listEl.appendChild(card);
          continue;
        }

        var execDetail = document.createElement("p");
        execDetail.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#4b5563;";
        execDetail.textContent = "executorId: " + tool.executorId + " | handoff: " + tool.connectionStatus + " | role: " + tool.roleIdentity;
        card.appendChild(execDetail);

        (function (executorId) {
          card.addEventListener("click", function () {
            if (selectedExecutorId === executorId) {
              selectedExecutorId = null;
            } else {
              selectedExecutorId = executorId;
              executorUnreadDots[executorId] = false;
            }
            renderFloatingFeedback();
            renderToolEndpointCards();
          });
        })(tool.executorId);
        listEl.appendChild(card);
        continue;
      }

      if (!isDebugMode && !isPrimaryBridgeCard) {
        var summary = document.createElement("p");
        summary.style.cssText = "margin:2px 0 0 14px;font-size:11px;color:#64748b;";
        summary.textContent = tool.connectionStatus + " · " + tool.normalModeBadge;
        card.appendChild(summary);
        listEl.appendChild(card);
        continue;
      }

      var detail = document.createElement("p");
      detail.style.cssText = "margin:0 0 3px 0;font-size:11px;color:#4b5563;";
      detail.textContent = "类型: " + tool.toolType + " | 状态: " + tool.connectionStatus;
      card.appendChild(detail);

      if (isPrimaryBridgeCard || isDebugMode) {
        var receive = document.createElement("p");
        receive.style.cssText = "margin:0 0 3px 0;font-size:11px;color:#4b5563;";
        receive.textContent = "可接收任务卡: " + (tool.canReceiveTaskCard ? "true" : "false");
        card.appendChild(receive);

        var safety = document.createElement("p");
        safety.style.cssText = "margin:0 0 3px 0;font-size:11px;color:#4b5563;";
        safety.textContent = "自动执行: false | 需确认: true";
        card.appendChild(safety);

        var note = document.createElement("p");
        note.style.cssText = "margin:0;font-size:11px;color:#6b7280;";
        note.textContent = tool.note;
        card.appendChild(note);
      }

      listEl.appendChild(card);
    }
  }

  function renderExecutorReportSection() {
    var section = document.getElementById("acb-executor-report-section");
    var actionStepsBox = document.getElementById("acb-action-steps-box");
    if (!section) return;

    if (!selectedExecutorId) {
      section.style.display = "none";
      if (actionStepsBox) actionStepsBox.style.display = "";
      return;
    }

    // Hide action steps box, show executor report workspace
    if (actionStepsBox) actionStepsBox.style.display = "none";
    section.style.display = "";
    section.innerHTML = "";

    var profile = getExecutorProfileById(selectedExecutorId);
    var headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";

    var headerLeft = document.createElement("div");
    var title = document.createElement("p");
    title.style.cssText = "margin:0;font-size:13px;font-weight:bold;color:#0f766e;";
    title.textContent = "Executor Report Workspace: " + (profile ? profile.displayName : selectedExecutorId);
    headerLeft.appendChild(title);
    var sub = document.createElement("p");
    sub.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#64748b;";
    sub.textContent = "executorId: " + selectedExecutorId +
      (profile ? " | handoff: " + (profile.defaultHandoffMode || "-") + " | permission: " + (profile.defaultPermissionMode || "-") : "");
    headerLeft.appendChild(sub);
    headerRow.appendChild(headerLeft);

    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.textContent = "← 返回任务步骤";
    backBtn.style.cssText = "padding:4px 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;color:#334155;cursor:pointer;font-size:11px;white-space:nowrap;";
    backBtn.addEventListener("click", function () {
      selectedExecutorId = null;
      renderFloatingFeedback();
      renderToolEndpointCards();
    });
    headerRow.appendChild(backBtn);
    section.appendChild(headerRow);

    var report = floatingManualExecutionReportLatest;
    var reportExecId = report ? resolveExecutorIdFromReport(report) : null;
    var reportForExecutor = report && reportExecId === selectedExecutorId;
    var hasAnyReport = Boolean(report);

    if (!hasAnyReport) {
      var noReport = document.createElement("p");
      noReport.style.cssText = "margin:12px 0;padding:12px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;font-size:12px;color:#64748b;text-align:center;";
      noReport.textContent = "当前执行端还没有回报。请先在任务步骤里点击“读取 Local Report”导入。";
      section.appendChild(noReport);

      var noReportActions = document.createElement("div");
      noReportActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;";
      var disabledDraftBtn = document.createElement("button");
      disabledDraftBtn.type = "button";
      disabledDraftBtn.textContent = "生成总控审查草稿（尚无回报）";
      disabledDraftBtn.disabled = true;
      disabledDraftBtn.style.cssText = "padding:5px 14px;border:1px solid #9ca3af;border-radius:4px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:11px;opacity:0.7;";
      disabledDraftBtn.title = "还没有导入回报，请先在任务步骤里使用“读取 Local Report”。";
      noReportActions.appendChild(disabledDraftBtn);
      section.appendChild(noReportActions);
      return;
    }

    var reportCard = document.createElement("div");
    reportCard.style.cssText = "border:1px solid #cbd5e1;border-radius:6px;background:#fff;padding:10px;margin-bottom:10px;";

    if (!reportForExecutor) {
      var mismatchWarn = document.createElement("p");
      mismatchWarn.style.cssText = "margin:0 0 10px 0;padding:8px;border:1px solid #f59e0b;border-radius:4px;background:#fffbeb;font-size:11px;color:#92400e;line-height:1.4;";
      mismatchWarn.textContent = "WARNING: This report targets executor '" + (reportExecId || "unknown") + "' but the selected executor is '" + selectedExecutorId + "'. The controller review draft will include this mismatch warning. Controller must verify executor identity before making a decision.";
      reportCard.appendChild(mismatchWarn);
    }

    var reportMeta = document.createElement("div");
    reportMeta.style.cssText = "margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;";
    var metaFields = [
      { label: "Task Card ID", value: report.sourceTaskCardId || "-" },
      { label: "Executor", value: report.resolvedExecutorId || report.target || "-" },
      { label: "Target", value: report.target || "-" },
      { label: "Report Status", value: report.reportStatus || "-" },
      { label: "Received At", value: report.reportReceivedAt || report.localReportReadAt || "-" },
      { label: "Waiting Controller Review", value: String(Boolean(report.waitingControllerReview)) },
      { label: "Can Auto Review", value: String(Boolean(report.canAutoReview)) },
      { label: "Can Auto Execute", value: String(Boolean(report.canAutoExecute)) },
      { label: "Source Path", value: report.localReportSourcePath || "-" }
    ];
    for (var mi = 0; mi < metaFields.length; mi += 1) {
      var mf = metaFields[mi];
      var metaLine = document.createElement("p");
      metaLine.style.cssText = "margin:2px 0;font-size:11px;color:#334155;line-height:1.4;";
      metaLine.textContent = mf.label + ": " + mf.value;
      reportMeta.appendChild(metaLine);
    }
    reportCard.appendChild(reportMeta);

    var reportBody = document.createElement("div");
    reportBody.style.cssText = "max-height:400px;overflow:auto;padding:8px;border:1px solid #e5e7eb;border-radius:4px;background:#fafafa;margin-bottom:8px;";
    var reportBodyPre = document.createElement("pre");
    reportBodyPre.style.cssText = "margin:0;font-size:11px;color:#1f2937;white-space:pre-wrap;word-break:break-word;font-family:Consolas,monospace;line-height:1.5;";
    var reportText = report.reportText || "";
    if (reportText.length > 8000) {
      reportText = reportText.substring(0, 8000) + "\n... [truncated, total " + report.reportText.length + " chars]";
    }
    reportBodyPre.textContent = reportText;
    reportBody.appendChild(reportBodyPre);
    reportCard.appendChild(reportBody);

    var reportActions = document.createElement("div");
    reportActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

    var draftBtn = document.createElement("button");
    draftBtn.type = "button";
    draftBtn.textContent = "生成总控审查草稿";
    draftBtn.style.cssText = "padding:5px 14px;border:1px solid #0f766e;border-radius:4px;background:#fff;color:#0f766e;cursor:pointer;font-size:11px;";
    draftBtn.addEventListener("click", function () {
      var draftText = buildExecutorReportReviewDraft(selectedExecutorId, report);
      showReviewDraftPreview(draftText);
    });
    reportActions.appendChild(draftBtn);

    reportCard.appendChild(reportActions);
    section.appendChild(reportCard);
  }

  function extractReportSection(reportText, sectionName) {
    if (!reportText || !sectionName) return null;

    var patterns = [
      new RegExp("(?:^|\\n)##?\\s*\\d*\\.?\\s*" + sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*\\n([\\s\\S]*?)(?=\\n##?\\s|\\n---|\\n\\n(?:Files Changed|Checks|Safety|Git|Evidence|Issues|Next|Recommendation|Summary)|$)", "i"),
      new RegExp("(?:^|\\n)" + sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[：:]\\s*\\n?([\\s\\S]*?)(?=\\n##?\\s|\\n---|\\n\\n(?:Files Changed|Checks|Safety|Git|Evidence|Issues|Next|Recommendation|Summary)|$)", "i"),
      new RegExp("(?:^|\\n)" + sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*\\n([\\s\\S]*?)(?=\\n##?\\s|\\n---|$)", "i")
    ];

    for (var p = 0; p < patterns.length; p += 1) {
      var match = reportText.match(patterns[p]);
      if (match) {
        var content = match[1].trim();
        if (content.length > 2000) {
          content = content.substring(0, 2000) + "\n... [truncated]";
        }
        return content;
      }
    }
    return null;
  }

  function buildExecutorReportReviewDraft(executorId, report) {
    var lines = [];
    var profile = getExecutorProfileById(executorId);
    var reportText = report ? (report.reportText || "") : "";
    var reportExecId = report ? resolveExecutorIdFromReport(report) : null;
    var executorMismatch = executorId && reportExecId && reportExecId !== executorId;

    // === Structured header fields ===
    lines.push("messageType: execution_report_review_request");
    lines.push("source: ACB Executor Report Workspace");
    lines.push("taskCardId: " + (report ? (report.sourceTaskCardId || "unknown") : "no_report"));
    lines.push("sourceExecutor: " + (executorId || "unknown"));
    lines.push("target: " + (report ? (report.target || "unknown") : "unknown"));
    lines.push("resolvedExecutorId: " + (reportExecId || "unknown"));
    if (executorMismatch) {
      lines.push("WARNING: selectedExecutor (" + executorId + ") does not match report resolvedExecutor (" + reportExecId + ") — controller must verify");
    }
    lines.push("reportStatus: " + (report ? (report.reportStatus || "unknown") : "no_report"));
    lines.push("lifecycleStatus: waiting_controller_review");
    lines.push("waitingControllerReview: " + String(Boolean(report && report.waitingControllerReview)));
    lines.push("localReportSourcePath: " + (report ? (report.localReportSourcePath || "not provided") : "not provided"));
    lines.push("localReportReadAt: " + (report ? (report.localReportReadAt || report.reportReceivedAt || "unknown") : "unknown"));
    lines.push("localReportCommitHash: " + (report ? (report.localReportCommitHash || "not provided") : "not provided"));
    lines.push("");

    // === Safety flags ===
    lines.push("canAutoReview: " + String(Boolean(report && report.canAutoReview)));
    lines.push("canAutoExecute: " + String(Boolean(report && report.canAutoExecute)));
    lines.push("noAutoDispatch: true");
    lines.push("noCommandExecution: true");
    lines.push("executionAllowed: false");
    lines.push("agentDispatchAllowed: false");
    lines.push("gitWriteAllowed: false");
    lines.push("");

    // === Section 1: Summary ===
    lines.push("==== 1. Summary ====");
    var summarySection = extractReportSection(reportText, "Summary");
    if (summarySection) {
      lines.push(summarySection);
    } else if (report) {
      lines.push("Summary (auto-extracted from report metadata):");
      lines.push("- reportId: " + (report.reportId || "unknown"));
      lines.push("- sourceTaskCardId: " + (report.sourceTaskCardId || "unknown"));
      lines.push("- reportStatus: " + (report.reportStatus || "unknown"));
      lines.push("- waitingControllerReview: " + String(Boolean(report.waitingControllerReview)));
    } else {
      lines.push("not detected in report text (no report available)");
    }
    lines.push("");

    // === Section 2: Files Changed ===
    lines.push("==== 2. Files Changed ====");
    var filesSection = extractReportSection(reportText, "Files Changed");
    if (filesSection) {
      lines.push(filesSection);
    } else {
      lines.push("not detected in report text");
    }
    lines.push("");

    // === Section 3: Checks ===
    lines.push("==== 3. Checks ====");
    var checksSection = extractReportSection(reportText, "Checks");
    if (checksSection) {
      lines.push(checksSection);
    } else {
      lines.push("not detected in report text");
    }
    lines.push("");

    // === Section 4: Safety Confirmation ===
    lines.push("==== 4. Safety Confirmation ====");
    var safetySection = extractReportSection(reportText, "Safety Confirmation") || extractReportSection(reportText, "Safety Flags") || extractReportSection(reportText, "Safety");
    if (safetySection) {
      lines.push(safetySection);
    } else {
      lines.push("not detected in report text");
      lines.push("ACB safety defaults: executionAllowed=false, agentDispatchAllowed=false, gitWriteAllowed=false, noAutoDispatch=true, noCommandExecution=true");
    }
    lines.push("");

    // === Section 5: Caveats / Open Questions ===
    lines.push("==== 5. Caveats / Open Questions ====");
    var caveatsSection = extractReportSection(reportText, "Caveats") || extractReportSection(reportText, "Open Questions") || extractReportSection(reportText, "Issues / Blockers") || extractReportSection(reportText, "Known Limitations");
    if (caveatsSection) {
      lines.push(caveatsSection);
    } else {
      lines.push("not detected in report text");
    }
    if (executorMismatch) {
      lines.push("CAVEAT: selectedExecutor=" + executorId + " but report resolvedExecutor=" + reportExecId + " — controller must manually verify executor identity before deciding accepted/rework/continue/closeout.");
    }
    lines.push("");

    // === Recommendation / Next from report ===
    var nextSection = extractReportSection(reportText, "Next Recommendation") || extractReportSection(reportText, "Recommendation");
    if (nextSection) {
      lines.push("==== Report Recommendation (for reference) ====");
      lines.push(nextSection);
      lines.push("");
    }

    // === Section 6: Requested Controller Decision ===
    lines.push("==== 6. Requested Controller Decision ====");
    lines.push("请总控审查此执行回报，并输出明确判断：");
    lines.push("- accepted: 回报合格，任务可收口，可写入阶段记录；");
    lines.push("- rework: 回报需要返工，需生成新任务卡并重新执行；");
    lines.push("- continue: 执行可继续，需生成下一步任务卡；");
    lines.push("- closeout: 本次工作周期结束，roll up 所有回报并总结。");
    lines.push("");
    lines.push("决策时请至少给出：");
    lines.push("- 审查结论 (accepted / rework / continue / closeout)；");
    lines.push("- 理由（至少一句话）；");
    lines.push("- 下一步动作（生成新任务卡 / 归档 / 继续等）；");
    lines.push("- 风险点（如有）。");
    lines.push("");
    lines.push("---");
    lines.push("本草稿由 ACB Executor Report Workspace 生成。不会自动发送、自动粘贴、自动回车、自动标记 accepted/approved/closed。");
    lines.push("使用者需手动复制本 draft 并粘贴到 ChatGPT controller conversation 中。");
    lines.push("");
    lines.push("decisionRequested: accepted / rework / continue / closeout");

    return lines.join("\n");
  }

  function renderBindingSection() {
    var panel = document.getElementById("acb-binding-context-bar");
    var line1El = document.getElementById("acb-binding-context-line1");
    var hintEl = document.getElementById("acb-binding-context-hint");
    var actionsEl = document.getElementById("acb-binding-context-actions");
    var bindingCurrent = document.getElementById("acb-float-binding-current");
    if (panel && line1El && hintEl && actionsEl) {
      if (currentMode !== MODE_CHATGPT) {
        panel.style.display = "none";
        return;
      }

      panel.style.display = "";
      var channel = getChannelById(floatingSelectedChannelId);
      var feedback = getSelectedFeedback();
      var context = getChannelBindingContext(channel, feedback, { forBindingBar: true });
      line1El.textContent = context.pageLabel + " · " + channel.name + " · " + context.bindingLabel + " · " + (context.allowCapture ? "可继续采集" : (context.canBind ? "可绑定" : "不可采集"));
      hintEl.dataset.acbMode = "debug";
      hintEl.textContent = context.icon + " " + context.hint;
      hintEl.style.color = context.hintColor;
      panel.style.borderLeftColor = context.accent;
      panel.style.background = context.softBackground;
      if (bindingCurrent) {
        bindingCurrent.dataset.acbMode = "debug";
        bindingCurrent.textContent = currentPageBinding
          ? ("\u5df2\u7ed1\u5b9a\uff1a" + currentPageBinding.channelId + " (" + (currentPageBinding.boundAt || "") + ")")
          : "\u5c1a\u672a\u7ed1\u5b9a";
      }

      actionsEl.innerHTML = "";
      function makeBindingBtn(label, onClick, tone) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.style.cssText = "padding:3px 10px;border:1px solid " + (tone.border || "#cbd5e1") + ";border-radius:999px;background:" + (tone.background || "#fff") + ";color:" + (tone.color || "#1f2937") + ";cursor:pointer;font-size:11px;white-space:nowrap;";
        bindButtonWithoutCardSelection(btn, onClick);
        return btn;
      }

      if (context.showOpenOriginal) {
        actionsEl.appendChild(makeBindingBtn("\u6253\u5f00\u539f\u5bf9\u8bdd", function () {
          openConversationUrl(context.originalUrl);
        }, { border: "#cbd5e1", background: "#fff", color: "#475569" }));
      }

      if (context.canBind) {
        actionsEl.appendChild(makeBindingBtn(context.buttonLabel, function () {
          bindCurrentPageToSelectedIdentity().catch(function (err) {
            console.error("[ACB][floating-console] bind current page failed", err);
            setStatus("\u7ed1\u5b9a\u5f53\u524d\u9875\u9762\u5931\u8d25");
          });
        }, { border: context.accent, background: context.accent, color: "#fff" }));
      } else if (context.showDisabledBind) {
        var disabledBtn = document.createElement("button");
        disabledBtn.type = "button";
        disabledBtn.textContent = context.disabledActionLabel;
        disabledBtn.disabled = true;
        disabledBtn.style.cssText = "padding:3px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#e2e8f0;color:#64748b;cursor:not-allowed;font-size:11px;white-space:nowrap;opacity:0.85;";
        actionsEl.appendChild(disabledBtn);
      }

      var debugBindingMeta = document.createElement("div");
      debugBindingMeta.dataset.acbMode = "debug";
      debugBindingMeta.style.cssText = "display:flex;flex-direction:column;gap:2px;margin-top:6px;font-size:11px;color:#64748b;";
      var debugPageId = document.createElement("p");
      debugPageId.style.cssText = "margin:0;";
      debugPageId.textContent = "pageConversationId: " + (context.pageConversationId || "unknown");
      var debugBoundId = document.createElement("p");
      debugBoundId.style.cssText = "margin:0;";
      debugBoundId.textContent = "boundConversationId: " + (context.boundConversationId || "none");
      debugBindingMeta.appendChild(debugPageId);
      debugBindingMeta.appendChild(debugBoundId);
      var bindingCtxBar = document.getElementById("acb-binding-context-bar");
      if (bindingCtxBar) { bindingCtxBar.appendChild(debugBindingMeta); }

      updateCaptureActionState(context);
      return;
    }

    if (currentMode !== MODE_CHATGPT) {
      return;
    }

    var selectEl = document.getElementById("acb-float-page-binding-select");
    if (!selectEl) {
      return;
    }

    if (!selectEl.options.length) {
      for (var i = 0; i < CHANNELS.length; i += 1) {
        var option = document.createElement("option");
        option.value = CHANNELS[i].id;
        option.textContent = CHANNELS[i].name;
        selectEl.appendChild(option);
      }
    }

    if (currentPageBinding && currentPageBinding.channelId) {
      selectEl.value = currentPageBinding.channelId;
    }

    setText(
      "acb-float-binding-current",
      currentPageBinding
        ? "已绑定: " + currentPageBinding.channelId + " (" + (currentPageBinding.boundAt || "") + ")"
        : "未绑定，请选择通道并保存。"
    );
  }

  function renderFloatingChannelList() {
    var listEl = document.getElementById("acb-float-channel-list");
    if (!listEl) {
      return;
    }

    listEl.innerHTML = "";

    for (var i = 0; i < CHANNELS.length; i += 1) {
      var channel = CHANNELS[i];
      var feedback = getChannelFeedback(channel.id);
      var status = getEffectiveChannelStatus(channel.id) || "seen";
      var isSelected = channel.id === floatingSelectedChannelId;
      var context = getChannelBindingContext(channel, feedback);
      var dotColor = context.accent;
      var cardInsetColor = channel.pinned ? "#dc2626" : (isSelected ? "#2563eb" : "");
      if (context.state === "idle" && status !== "seen") {
        dotColor = getStatusColor(status);
      }

      var card = document.createElement("div");
      card.style.cssText = [
        "border:1px solid " + (isSelected ? "#2563eb" : (context.state === "idle" ? "#d1d5db" : context.accent)),
        "border-radius:12px",
        "padding:7px 8px 6px",
        "margin-bottom:7px",
        "cursor:" + (isSelected ? "default" : "pointer"),
        "transition:border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
        "background:" + (isSelected ? "#eff6ff" : context.softBackground),
        isSelected ? "box-shadow:0 0 0 1px #bfdbfe, inset 4px 0 0 #2563eb" : (cardInsetColor ? "box-shadow:inset 3px 0 0 " + cardInsetColor : "")
      ].join(";");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
      card.addEventListener("click", (function (channelId, selected) {
        return function () {
          if (selected) {
            return;
          }
          floatingSelectedChannelId = channelId;
          renderFloatingChannelList();
          renderFloatingFeedback();
          renderTopOverview();
          syncPreflightCardButton();
          syncTaskCardReviewBridgeButton();
          var selectedChannel = getChannelById(floatingSelectedChannelId);
          setStatus("\u5df2\u5207\u6362\u8eab\u4efd\u5361: " + selectedChannel.name + " (" + selectedChannel.id + ")");
        };
      })(channel.id, isSelected));
      card.addEventListener("keydown", (function (channelId, selected) {
        return function (event) {
          if (selected || !event || (event.key !== "Enter" && event.key !== " ")) {
            return;
          }
          event.preventDefault();
          floatingSelectedChannelId = channelId;
          renderFloatingChannelList();
          renderFloatingFeedback();
          renderTopOverview();
          syncPreflightCardButton();
          syncTaskCardReviewBridgeButton();
          var selectedChannel = getChannelById(floatingSelectedChannelId);
          setStatus("\u5df2\u5207\u6362\u8eab\u4efd\u5361: " + selectedChannel.name + " (" + selectedChannel.id + ")");
        };
      })(channel.id, isSelected));

      var headRow = document.createElement("div");
      headRow.style.cssText = "display:flex;align-items:flex-start;gap:8px;min-width:0;";
      var stateBadge = document.createElement("span");
      stateBadge.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "width:18px",
        "height:18px",
        "border-radius:999px",
        "background:" + dotColor,
        "color:#fff",
        "font-size:10px",
        "font-weight:bold",
        "flex-shrink:0"
      ].join(";");
      stateBadge.textContent = context.icon;

      var titleWrap = document.createElement("div");
      titleWrap.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex:1;flex-wrap:wrap;";
      var title = document.createElement("strong");
      title.style.cssText = "font-size:12px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;";
      title.textContent = channel.name;
      var typeBadge = document.createElement("span");
      typeBadge.style.cssText = "display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:10px;flex-shrink:0;white-space:nowrap;";
      typeBadge.textContent = channel.type || "unknown";
      titleWrap.appendChild(title);
      titleWrap.appendChild(typeBadge);
      if (isSelected) {
        var selectedTag = document.createElement("span");
        selectedTag.style.cssText = "display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;flex-shrink:0;white-space:nowrap;";
        selectedTag.textContent = "\u5f53\u524d";
        titleWrap.appendChild(selectedTag);
      }

      headRow.appendChild(stateBadge);
      headRow.appendChild(titleWrap);
      card.appendChild(headRow);

      if (context.cardNotice && !context.showOpenOriginal) {
        var notice = document.createElement("p");
        notice.style.cssText = "margin:5px 0 0 0;font-size:11px;line-height:1.35;color:" + context.hintColor + ";";
        notice.textContent = context.cardNotice;
        card.appendChild(notice);
      }

      if (context.showOpenOriginal) {
        var actionRow = document.createElement("div");
        actionRow.style.cssText = "display:flex;gap:6px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:4px;";
        var actionNote = document.createElement("span");
        actionNote.style.cssText = "font-size:11px;line-height:1.35;color:" + (context.requiresRebind ? "#b45309" : context.hintColor) + ";flex:1;min-width:0;";
        actionNote.textContent = context.hint;
        actionRow.appendChild(actionNote);
        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.textContent = "\u6253\u5f00\u539f\u5bf9\u8bdd";
        openBtn.style.cssText = [
          "padding:3px 9px",
          "border:1px solid " + (isSelected ? "#cbd5e1" : "#e5e7eb"),
          "border-radius:999px",
          "background:" + (isSelected ? "#fff" : "#f8fafc"),
          "color:" + (isSelected ? "#334155" : "#64748b"),
          "cursor:pointer",
          "font-size:10px",
          "font-weight:600"
        ].join(";");
        bindButtonWithoutCardSelection(openBtn, (function (url) {
          return function () {
            openConversationUrl(url);
          };
        })(context.originalUrl));
        if (!isSelected) {
          openBtn.style.opacity = "0.88";
        }
        actionRow.appendChild(openBtn);
        card.appendChild(actionRow);
      } else if (!context.showOpenOriginal && context.state !== "ok" && context.hint && context.hint !== context.cardNotice) {
        var extraHint = document.createElement("p");
        extraHint.style.cssText = "margin:4px 0 0 0;font-size:11px;line-height:1.35;color:" + context.hintColor + ";";
        extraHint.textContent = context.hint;
        card.appendChild(extraHint);
      }

      var debugMeta = document.createElement("div");
      debugMeta.dataset.acbMode = "debug";
      debugMeta.style.cssText = "display:flex;flex-direction:column;gap:2px;margin-top:5px;font-size:11px;color:#64748b;";
      var captured = document.createElement("p");
      captured.style.cssText = "margin:0;";
      captured.textContent = "lastCapturedAt: " + (feedback ? (feedback.capturedAt || "unknown") : "unknown");
      var hash = document.createElement("p");
      hash.style.cssText = "margin:0;";
      hash.textContent = "sourceMessageHash: " + (feedback ? shortHash(feedback.hash || "") : "unknown");
      var source = document.createElement("p");
      source.style.cssText = "margin:0;";
      source.textContent = "sourceConversationId: " + (context.boundConversationId || "\u672a\u7ed1\u5b9a");
      var contextId = document.createElement("p");
      contextId.style.cssText = "margin:0;";
      contextId.textContent = "contextId: " + (feedback && feedback.contextId ? feedback.contextId : "unknown");
      debugMeta.appendChild(captured);
      debugMeta.appendChild(hash);
      debugMeta.appendChild(source);
      debugMeta.appendChild(contextId);
      card.appendChild(debugMeta);

      listEl.appendChild(card);
    }

    applyConsoleDisplayMode();

    return;

    listEl.innerHTML = "";

    for (var i = 0; i < CHANNELS.length; i += 1) {
      var channel = CHANNELS[i];
      var feedback = floatingFeedbacks[channel.id] || null;
      var status = getEffectiveChannelStatus(channel.id) || "seen";
      var hasDot = status !== "seen";
      var conversationId = getFeedbackConversationId(feedback);
      var boundOnCurrentPage = Boolean(currentPageBinding && currentPageBinding.channelId === channel.id);

      var card = document.createElement("div");
      card.style.cssText = [
        "border:1px solid #d1d5db",
        "border-radius:6px",
        "padding:8px",
        "margin-bottom:8px",
        "background:#fff",
        channel.id === floatingSelectedChannelId ? "border-color:#2563eb;background:#eff6ff" : "",
        channel.pinned ? "box-shadow:inset 3px 0 0 #dc2626" : ""
      ].join(";");

      var headRow = document.createElement("div");
      headRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
      var title = document.createElement("strong");
      title.style.cssText = "font-size:12px;color:#111827;";
      title.textContent = channel.name;
      var dot = document.createElement("span");
      dot.style.cssText = [
        "display:inline-block",
        "width:8px",
        "height:8px",
        "border-radius:50%",
        "background:" + (hasDot ? getStatusColor(status) : "#d1d5db")
      ].join(";");
      headRow.appendChild(title);
      headRow.appendChild(dot);

      var role = document.createElement("p");
      role.style.cssText = "margin:6px 0 2px 0;font-size:11px;color:#4b5563;";
      role.textContent = "roleType: " + (channel.type || "unknown");
      var bind = document.createElement("p");
      bind.style.cssText = "margin:0 0 2px 0;font-size:11px;color:#4b5563;";
      bind.textContent = "binding: " + (boundOnCurrentPage ? "当前页面已绑定" : "未绑定");
      var captured = document.createElement("p");
      captured.style.cssText = "margin:0 0 2px 0;font-size:11px;color:#4b5563;";
      captured.textContent = "lastCapturedAt: " + (feedback ? (feedback.capturedAt || "unknown") : "unknown");
      var hash = document.createElement("p");
      hash.style.cssText = "margin:0 0 2px 0;font-size:11px;color:#4b5563;";
      hash.textContent = "hash: " + (feedback ? shortHash(feedback.hash || "") : "unknown");
      var source = document.createElement("p");
      source.style.cssText = "margin:0 0 8px 0;font-size:11px;color:#4b5563;";
      source.textContent = "sourceConversationId: " + (conversationId || "未绑定");

      var selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.dataset.channelId = channel.id;
      selectBtn.textContent = channel.id === floatingSelectedChannelId ? "当前已选中" : "选择此身份卡";
      selectBtn.style.cssText = "padding:4px 10px;border:1px solid #2563eb;border-radius:4px;background:#fff;color:#2563eb;cursor:pointer;font-size:11px;";
      selectBtn.addEventListener("click", function (event) {
        floatingSelectedChannelId = event.currentTarget.dataset.channelId;
        renderFloatingChannelList();
        renderFloatingFeedback();
        renderTopOverview();
        syncPreflightCardButton();
        syncTaskCardReviewBridgeButton();
        var selected = getChannelById(floatingSelectedChannelId);
        setStatus("已切换身份卡: " + selected.name + " (" + selected.id + ")");
      });

      card.appendChild(headRow);
      card.appendChild(role);
      card.appendChild(bind);
      card.appendChild(captured);
      card.appendChild(hash);
      card.appendChild(source);
      card.appendChild(selectBtn);
      listEl.appendChild(card);
    }
  }

  function renderFloatingFeedback() {
    var channel = getChannelById(floatingSelectedChannelId);
    var feedback = getSelectedFeedback();
    var hasFeedback = Boolean(feedback);
    var effectiveStatus = getEffectiveChannelStatus(floatingSelectedChannelId);
    var conversationId = getFeedbackConversationId(feedback) || "未绑定";

    setText("acb-float-channel-id", channel.id);
    setText("acb-float-channel-name", channel.name);
    setText("acb-float-channel-type", channel.type);
    setText("acb-float-has-feedback", hasFeedback ? "true" : "false");
    setText("acb-float-channel-status", effectiveStatus || "none");
    setText("acb-float-captured-at", feedback ? feedback.capturedAt || "-" : "-");
    setText("acb-float-hash", feedback ? feedback.hash || "-" : "-");
    setText("acb-float-last-user", feedback ? feedback.lastUserMessage || "" : "暂无捕获消息");
    setText("acb-float-assistant", feedback ? feedback.assistantMessage || "" : "暂无捕获消息");
    setText("acb-float-conversation-id", conversationId);
    setText("acb-float-source-url", feedback && feedback.pageUrl ? feedback.pageUrl : "unknown");
    setText("acb-float-message-preview", feedback ? shortText(feedback.assistantMessage || "", 140) : "暂无捕获消息");

    var statusActions = document.getElementById("acb-float-status-actions");
    if (statusActions) {
      statusActions.style.display = hasFeedback ? "flex" : "none";
    }

    renderBindingSection();
    renderClassificationDisplay();
    renderClassificationEditor();
    updateExecutorUnreadDots();
    renderActionStepsSection();
    renderExecutorReportSection();
    syncTaskCardReviewBridgeButton();
    renderLegacyCardsSection();
    renderTopOverview();
    renderToolEndpointCards();
    applyConsoleDisplayMode();
  }

  async function handleChannelStatusAction(status) {
    await globalThis.AcbStorage.setChannelStatus(floatingSelectedChannelId, status);
    floatingChannelStates = await globalThis.AcbStorage.getAllChannelStates();
    renderFloatingChannelList();
    renderFloatingFeedback();
  }

  async function loadCurrentPageBinding() {
    if (currentMode !== MODE_CHATGPT) {
      return;
    }

    currentPageBinding = await globalThis.AcbStorage.getPageBinding(pageBindingKey());
    if (currentPageBinding && currentPageBinding.channelId) {
      floatingSelectedChannelId = currentPageBinding.channelId;
    }
  }

  async function saveCurrentPageBinding() {
    var selectEl = document.getElementById("acb-float-page-binding-select");
    if (!selectEl) {
      return;
    }

    var channel = getChannelById(selectEl.value);
    currentPageBinding = {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      boundAt: new Date().toISOString(),
      pageUrl: location.href
    };

    await globalThis.AcbStorage.setPageBinding(pageBindingKey(), currentPageBinding);
    floatingSelectedChannelId = channel.id;
    await refreshFloatingConsole();
    setStatus("页面绑定已保存");
    setCaptureStatus("", false);
  }

  async function saveManualClassification() {
    var feedback = getSelectedFeedback();
    if (!feedback || !currentClassificationKey) {
      setClassificationStatus("当前无可保存的反馈分类。", true);
      return;
    }

    var current = getCurrentClassification();
    if (!current) {
      setClassificationStatus("分类尚未初始化。", true);
      return;
    }

    var typeSelect = document.getElementById("acb-feedback-type-select");
    var titleInput = document.getElementById("acb-feedback-title-input");
    var summaryInput = document.getElementById("acb-feedback-summary-input");
    var behaviorSelect = document.getElementById("acb-feedback-default-behavior-select");
    var statusSelect = document.getElementById("acb-feedback-recommended-status-select");
    var attentionSelect = document.getElementById("acb-feedback-attention-level-select");
    var executionSelect = document.getElementById("acb-feedback-needs-execution-select");
    var nextActionInput = document.getElementById("acb-feedback-next-action-input");
    var confidenceSelect = document.getElementById("acb-feedback-confidence-select");

    var now = new Date().toISOString();
    var manual = Object.assign({}, current, {
      feedbackType: normalizeEnum(typeSelect ? typeSelect.value : current.feedbackType, FEEDBACK_TYPES, "content"),
      title: normalizeText(titleInput ? titleInput.value : current.title) || current.title,
      summary: normalizeText(summaryInput ? summaryInput.value : current.summary) || current.summary,
      defaultBehavior: normalizeEnum(behaviorSelect ? behaviorSelect.value : current.defaultBehavior, DEFAULT_BEHAVIORS, "autoRead"),
      recommendedStatus: normalizeEnum(statusSelect ? statusSelect.value : current.recommendedStatus, RECOMMENDED_STATUSES, "seen"),
      attentionLevel: normalizeEnum(attentionSelect ? attentionSelect.value : current.attentionLevel, ATTENTION_LEVELS, "low"),
      needsExecution: normalizeBoolean(executionSelect ? executionSelect.value : current.needsExecution, false),
      suggestedNextAction: normalizeText(nextActionInput ? nextActionInput.value : current.suggestedNextAction),
      confidence: normalizeEnum(confidenceSelect ? confidenceSelect.value : current.confidence, CONFIDENCE_LEVELS, "low"),
      metaSource: "manual",
      userEdited: true,
      updatedAt: now
    });

    floatingFeedbackClassifications[currentClassificationKey] = manual;
    await globalThis.AcbStorage.setFeedbackClassification(currentClassificationKey, manual);
    classificationDraftKey = currentClassificationKey;
    renderFloatingFeedback();
    setClassificationStatus("分类已保存。", false);
    setStatus("已保存当前反馈分类");
  }

  async function resetClassificationToAuto() {
    var feedback = getSelectedFeedback();
    if (!feedback) {
      setClassificationStatus("当前无反馈可重置。", true);
      return;
    }

    var key = buildClassificationKey(feedback);
    if (!key) {
      setClassificationStatus("分类 key 无效，无法重置。", true);
      return;
    }

    await globalThis.AcbStorage.deleteFeedbackClassification(key);
    delete floatingFeedbackClassifications[key];
    classificationDraftKey = null;
    currentClassificationKey = key;
    await ensureSelectedFeedbackClassification();
    renderFloatingFeedback();
    setClassificationStatus("已重置为自动识别。", false);
    setStatus("已重置当前反馈分类");
  }

  function buildFloatingReport(bridgeLatest, projectStatusLatest, preflightLatest, readinessLatest, taskCardReviewLatest, executionInboxLatest, manualExecutionReportLatest) {
    var channel = getChannelById(floatingSelectedChannelId);
    var feedback = getSelectedFeedback();
    var hasFeedback = Boolean(feedback);
    var selectedStatus = getEffectiveChannelStatus(floatingSelectedChannelId) || "none";
    var reportNow = new Date();
    var isChatGptMode = currentMode === MODE_CHATGPT;
    var legacyCardStats = getLegacyCardStats();
    var classification = getCurrentClassification();
    var hasClassification = Boolean(classification);
    var actionPlan = getCurrentActionPlan();
    var hasActionPlan = Boolean(actionPlan && Array.isArray(actionPlan.steps));
    var actionSteps = hasActionPlan ? actionPlan.steps : [];
    var cardMeta = parseAcbCardMeta(feedback ? (feedback.assistantMessage || "") : "");
    var hasCardMeta = Boolean(cardMeta);
    var ctx = getActiveExecutionContext();
    var sourceConversationId = getFeedbackConversationId(feedback) || "unknown";
    var sourceMessageHash = hasFeedback ? (feedback.hash || "unknown") : "unknown";
    var sourceActionStepIndex = ctx && ctx.actionStepIndex >= 0 ? String(ctx.actionStepIndex + 1) : "none";
    var sourceMetadataPresent = Boolean(hasFeedback && feedback.hash && feedback.capturedAt);

    var title = isChatGptMode
      ? "ACB Console Test Report"
      : "ACB Console Test Report (Mock)";

    var lines = [
      title,
      "",
      "GeneratedAt: " + new Date().toISOString(),
      "Report Module: M2-B Action Step Payload",
      "Report Capability: ChatGPT Page Capture / Action Step / Payload Validation / Copy",
      "Capture Foundation: M1-C ChatGPT Page Capture",
      "Implementation Stage: M2-B.2 Action Step Payload Viewer & Copy",
      "Storage Key: acb.latestFeedbacks",
      "Selected Channel ID: " + channel.id,
      "Selected Channel Name: " + channel.name,
      "Selected Channel Type: " + channel.type,
      "Selected Channel Status: " + selectedStatus,
      "Source Conversation ID: " + sourceConversationId,
      "Source Message Hash: " + sourceMessageHash,
      "Context ID: " + (hasFeedback ? (feedback.contextId || "unknown") : "unknown"),
      "Source Action Step Index: " + sourceActionStepIndex,
      "Source Metadata Present: " + String(sourceMetadataPresent),
      "Capture Selected Message Strategy: " + (hasFeedback ? (feedback.captureSelectedMessageStrategy || "unknown") : "unknown"),
      "Latest Assistant Message Detected: " + String(Boolean(hasFeedback && feedback.latestAssistantMessageDetected)),
      "Selected Assistant Message Index: " + (hasFeedback ? String(feedback.selectedAssistantMessageIndex || 0) : "0"),
      "Captured Assistant Message Hash: " + (hasFeedback ? (feedback.capturedAssistantMessageHash || feedback.hash || "unknown") : "unknown"),
      "Captured Assistant Contains Task Card: " + String(Boolean(hasFeedback && feedback.capturedAssistantContainsTaskCard))
    ];

    if (isChatGptMode) {
      lines.push("Page URL: " + location.href);
      lines.push("Page Binding Channel ID: " + (currentPageBinding ? currentPageBinding.channelId : ""));
      lines.push("Capture Source: chatgpt-page");
      lines.push("Capture Mode: manual");
    } else {
      lines.push("Test Scope: mock-chatgpt only (floating console)");
    }

    lines.push("");
    lines.push("hasFeedback: " + String(hasFeedback));
    lines.push("capturedAt: " + (hasFeedback ? feedback.capturedAt || "" : ""));
    lines.push("hash: " + (hasFeedback ? feedback.hash || "" : ""));
    lines.push("lastUserMessage:");
    lines.push(hasFeedback ? feedback.lastUserMessage || "" : "");
    lines.push("");
    lines.push("assistantMessage:");
    lines.push(hasFeedback ? feedback.assistantMessage || "" : "");
    lines.push("");

    lines.push("Feedback Classification Detected: " + String(hasClassification));
    lines.push("Feedback Type: " + (hasClassification ? classification.feedbackType || "" : ""));
    lines.push("Feedback Classification Title: " + (hasClassification ? classification.title || "" : ""));
    lines.push("Feedback Classification Summary: " + (hasClassification ? classification.summary || "" : ""));
    lines.push("Default Behavior: " + (hasClassification ? classification.defaultBehavior || "" : ""));
    lines.push("Recommended Status: " + (hasClassification ? classification.recommendedStatus || "" : ""));
    lines.push("Attention Level: " + (hasClassification ? classification.attentionLevel || "" : ""));
    lines.push("Needs Execution: " + (hasClassification ? String(Boolean(classification.needsExecution)) : "false"));
    lines.push("Suggested Next Action: " + (hasClassification ? classification.suggestedNextAction || "" : ""));
    lines.push("Classification Confidence: " + (hasClassification ? classification.confidence || "" : ""));
    lines.push("Classification Source: " + (hasClassification ? classification.metaSource || "" : ""));
    lines.push("User Edited Classification: " + (hasClassification ? String(Boolean(classification.userEdited)) : "false"));
    lines.push("");

    lines.push("执行计划已检测 (Action Plan Detected): " + String(hasActionPlan));
    lines.push("执行计划状态 (Action Plan Status): " + (hasActionPlan ? (actionPlan.status || "draft") : "none"));
    lines.push("动作步骤数量 (Action Steps Count): " + String(actionSteps.length));
    if (actionSteps.length > 0) {
      for (var i = 0; i < actionSteps.length; i += 1) {
        var step = actionSteps[i];
        var pv = step.payloadValidation || {};
        lines.push(
          "Action Step " + String(step.order || (i + 1)) +
          ": target=" + (step.target || "controller") +
          ", status=" + (step.status || "pending") +
          ", title=" + (step.title || "")
        );
        lines.push("Action Step " + String(step.order || (i + 1)) + " 载荷类型 (Payload Type): " + (step.payloadType || "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 载荷状态 (Payload Status): " + (step.payloadStatus || "not_applicable"));
        var stepRouteGate = applyRouteResultEligibility(step);
        var stepExecutionInboxGate = evaluateExecutionInboxSendEligibility(step);
        var stepDeliveryPlan = buildDeliveryPlan(step);
        var stepPreExecutionPackage = buildPreExecutionPackage(step);
        var stepHandoffLatest = getPreExecutionHandoffStatusForPackage(stepPreExecutionPackage);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Original Can Send To Agent: " + String(Boolean(stepRouteGate.originalCanSendToAgent)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Route Gated Can Send To Agent: " + String(Boolean(stepRouteGate.canSendToAgent)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Can Send To Execution Inbox: " + String(Boolean(stepExecutionInboxGate.enabled)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Execution Inbox Blocking Reasons: " + (stepExecutionInboxGate.rejectReasons.length > 0 ? stepExecutionInboxGate.rejectReasons.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Execution Status: " + stepDeliveryPlan.status);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Can Prepare Execution: " + String(Boolean(stepDeliveryPlan.canPrepare)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Default Target: " + stepDeliveryPlan.defaultRoute.target);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Executor: " + stepDeliveryPlan.defaultRoute.displayName);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Executor ID: " + (stepDeliveryPlan.defaultRoute.executorId || ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare CommandName: " + (stepDeliveryPlan.defaultRoute.commandName || ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare PermissionMode: " + stepDeliveryPlan.defaultRoute.permissionMode);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare HandoffMode: " + stepDeliveryPlan.defaultRoute.handoffMode);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare RouteOverride Enabled: " + String(Boolean(stepDeliveryPlan.routeOverride.enabled)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare CCRoutes Count: " + String(stepDeliveryPlan.ccRoutes.length));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Blocking Reasons: " + (stepDeliveryPlan.blockingReasons.length > 0 ? stepDeliveryPlan.blockingReasons.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Warning Reasons: " + (stepDeliveryPlan.warningReasons.length > 0 ? stepDeliveryPlan.warningReasons.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Safety No Auto Dispatch: " + String(Boolean(stepDeliveryPlan.safety.noAutoDispatch)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Safety Can Trigger Execution: " + String(Boolean(stepDeliveryPlan.safety.canTriggerExecution)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Package ID: " + stepPreExecutionPackage.packageId);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Status: " + stepPreExecutionPackage.prepareStatus);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Prepare Status Label: " + stepPreExecutionPackage.prepareStatusLabel);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Package Can Prepare: " + String(Boolean(stepPreExecutionPackage.canPrepare)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Package Can Auto Execute: " + String(Boolean(stepPreExecutionPackage.canAutoExecute)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Role Required: " + stepPreExecutionPackage.requiredRole);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Role Inferred Required: " + stepPreExecutionPackage.inferredRequiredRole);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Executor Role: " + stepPreExecutionPackage.executorRole);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Role Compatible: " + String(Boolean(stepPreExecutionPackage.roleCompatible)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Role Compatibility Status: " + stepPreExecutionPackage.roleCompatibilityStatus);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Role Blocking Reasons: " + (stepPreExecutionPackage.roleBlockingReasons.length > 0 ? stepPreExecutionPackage.roleBlockingReasons.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Executor Profile Resolved: " + String(Boolean(stepPreExecutionPackage.resolvedExecutorId)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Executor ID: " + stepPreExecutionPackage.resolvedExecutorId);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Resolved Executor: " + stepPreExecutionPackage.resolvedExecutorDisplayName);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution CommandName: " + (stepPreExecutionPackage.commandName || ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution PermissionMode: " + stepPreExecutionPackage.permissionMode);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution HandoffMode: " + stepPreExecutionPackage.handoffMode);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Launch Command Preview: " + (stepPreExecutionPackage.launchCommandPreview || ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Copyable Payload Available: " + String(Boolean(stepPreExecutionPackage.copyablePayloadAvailable)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Copyable Payload Length: " + String(stepPreExecutionPackage.copyablePayload ? stepPreExecutionPackage.copyablePayload.length : 0));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Blocking Reasons: " + (stepPreExecutionPackage.blockingReasons.length > 0 ? stepPreExecutionPackage.blockingReasons.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Pre-Execution Warnings: " + (stepPreExecutionPackage.warnings.length > 0 ? stepPreExecutionPackage.warnings.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Handoff Log Detected: " + String(Boolean(stepHandoffLatest)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Handoff Status: " + (stepHandoffLatest ? (stepHandoffLatest.handoffStatus || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Handoff Event Type: " + (stepHandoffLatest ? (stepHandoffLatest.eventType || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Handoff Event At: " + (stepHandoffLatest ? (stepHandoffLatest.eventAt || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Handoff Actor: " + (stepHandoffLatest ? (stepHandoffLatest.actor || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Handoff Can Auto Execute: " + String(Boolean(stepHandoffLatest && stepHandoffLatest.canAutoExecute)));
        var stepManualReportLatest = getManualExecutionReportForPackage(stepPreExecutionPackage);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Manual Report Detected: " + String(Boolean(stepManualReportLatest)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Manual Report Status: " + (stepManualReportLatest ? (stepManualReportLatest.reportStatus || "none") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Manual Report ID: " + (stepManualReportLatest ? (stepManualReportLatest.reportId || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Manual Report Source Task Card ID: " + (stepManualReportLatest ? (stepManualReportLatest.sourceTaskCardId || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Manual Report Received At: " + (stepManualReportLatest ? (stepManualReportLatest.reportReceivedAt || "") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Manual Report Waiting Controller Review: " + String(Boolean(stepManualReportLatest && stepManualReportLatest.waitingControllerReview)));
        var stepLifecycle = deriveTaskLifecycleStatus({
          step: step,
          routeGate: stepRouteGate,
          preExecutionPackage: stepPreExecutionPackage,
          handoffLatest: stepHandoffLatest,
          manualReportLatest: stepManualReportLatest,
          hasFeedback: hasFeedback,
          hasClassification: hasClassification
        });
        lines.push("Action Step " + String(step.order || (i + 1)) + " Task Lifecycle Status: " + stepLifecycle.status);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Task Lifecycle Label: " + stepLifecycle.label);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Task Lifecycle Source: " + stepLifecycle.source);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Task Lifecycle Current Result: " + String(Boolean(stepLifecycle.currentResult)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Task Lifecycle Reason: " + stepLifecycle.reason);
        lines.push("Action Step " + String(step.order || (i + 1)) + " Route Gate Applied: " + String(Boolean(stepRouteGate.routeGateApplied)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " Route Gate Blocking Reasons: " + (stepRouteGate.blockingReasons.length > 0 ? stepRouteGate.blockingReasons.join(", ") : "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 可发送给 Agent (Can Send To Agent): " + String(Boolean(stepRouteGate.canSendToAgent)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 已检测到任务卡起始标记 (Task Card Start Detected): " + String(Boolean(pv.hasStartMarker)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 已检测到任务卡结束标记 (Task Card End Detected): " + String(Boolean(pv.hasEndMarker)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 任务卡 ID 匹配 (Task Card ID Matched): " + String(Boolean(pv.taskCardIdMatched)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 目标匹配 (Target Matched): " + String(Boolean(pv.targetMatched)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 缺失必要字段 (Required Fields Missing): " + (Array.isArray(pv.requiredFieldsMissing) ? pv.requiredFieldsMissing.join(", ") : ""));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 捕获助手消息长度 (Captured Assistant Message Length): " + String(pv.assistantMessageLength || 0));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 提取任务卡长度 (Extracted Task Card Length): " + String(pv.extractedTaskCardLength || 0));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 长任务卡捕获不完整 (Long Task Card Capture Incomplete): " + String(Boolean(pv.longTaskCardCaptureIncomplete)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 捕获不完全原因 (Incomplete Reason): " + (pv.incompleteReason || "none"));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 可能截断 (Truncated Suspected): " + String(Boolean(pv.truncatedSuspected)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 任务卡字段拼合检测 (Task Card Flattened Detected): " + String(Boolean(pv.taskCardFlattenedDetected)));
        lines.push("Action Step " + String(step.order || (i + 1)) + " 字段边界已保留 (Field Boundary Preserved): " + String(Boolean(pv.fieldBoundaryPreserved)));
      }
    }
    lines.push("");

    var routeStepIndex = ctx && ctx.actionStepIndex >= 0 ? ctx.actionStepIndex : 0;
    var routeStep = actionSteps.length > 0 ? actionSteps[Math.min(routeStepIndex, actionSteps.length - 1)] : null;
    var routeResult = null;
    if (routeStep) {
      routeResult = refreshActionStepRouteResult(routeStep, routeStepIndex, {
        feedback: feedback,
        classification: classification,
        channel: channel,
        preflightLatest: preflightLatest,
        readinessLatest: readinessLatest,
        taskCardReviewLatest: taskCardReviewLatest,
        context: getExecutionContextForStep(routeStep)
      });
    } else if (hasFeedback) {
      routeResult = deriveRouteResult(buildRouteResultInput(
        feedback,
        classification,
        channel,
        {
          order: 0,
          target: "controller",
          payloadStatus: "not_applicable",
          payloadValidation: { canSendToAgent: false }
        },
        -1,
        preflightLatest,
        readinessLatest,
        taskCardReviewLatest,
        ctx
      ));
    }
    appendRouteResultReportLines(lines, routeResult);
    lines.push("Route Result Strategy: current action step if available, otherwise selected feedback fallback.");
    var currentLifecycle = deriveTaskLifecycleStatus({
      step: routeStep,
      routeGate: routeStep ? applyRouteResultEligibility(routeStep) : null,
      routeResult: routeResult,
      preExecutionPackage: routeStep ? buildPreExecutionPackage(routeStep) : null,
      handoffLatest: routeStep ? getPreExecutionHandoffStatusForPackage(buildPreExecutionPackage(routeStep)) : null,
      manualReportLatest: routeStep ? getManualExecutionReportForPackage(buildPreExecutionPackage(routeStep)) : null,
      hasFeedback: hasFeedback,
      hasClassification: hasClassification
    });
    lines.push("Task Lifecycle Status: " + currentLifecycle.status);
    lines.push("Task Lifecycle Label: " + currentLifecycle.label);
    lines.push("Task Lifecycle Source: " + currentLifecycle.source);
    lines.push("Task Lifecycle Current Result: " + String(Boolean(currentLifecycle.currentResult)));
    lines.push("Task Lifecycle Reason: " + currentLifecycle.reason);
    lines.push("");

    var currentDeliveryPlan = routeStep ? buildDeliveryPlan(routeStep) : null;
    var routeBlockingLevel = routeResult && Array.isArray(routeResult.blockingReasons) && routeResult.blockingReasons.length > 0
      ? "blocked"
      : (routeResult && Array.isArray(routeResult.warningReasons) && routeResult.warningReasons.length > 0 ? "warning" : "clear");
    var routeBlockingSource = routeResult && Array.isArray(routeResult.blockingReasons) && routeResult.blockingReasons.length > 0
      ? routeResult.blockingReasons[0]
      : (routeResult && routeResult.routeReason ? routeResult.routeReason : "none");
    var prepareBlockingLevel = currentDeliveryPlan && Array.isArray(currentDeliveryPlan.blockingReasons) && currentDeliveryPlan.blockingReasons.length > 0
      ? "blocked"
      : (currentDeliveryPlan && Array.isArray(currentDeliveryPlan.warningReasons) && currentDeliveryPlan.warningReasons.length > 0 ? "warning" : "clear");
    var prepareBlockingSource = currentDeliveryPlan && Array.isArray(currentDeliveryPlan.blockingReasons) && currentDeliveryPlan.blockingReasons.length > 0
      ? currentDeliveryPlan.blockingReasons[0]
      : (currentDeliveryPlan && Array.isArray(currentDeliveryPlan.warningReasons) && currentDeliveryPlan.warningReasons.length > 0 ? currentDeliveryPlan.warningReasons[0] : "none");
    var currentContextMatched = Boolean(routeStep && ctx && routeStepIndex === ctx.actionStepIndex);
    lines.push("Route Blocking Level: " + routeBlockingLevel);
    lines.push("Route Blocking Source: " + routeBlockingSource);
    lines.push("Prepare Blocking Level: " + prepareBlockingLevel);
    lines.push("Prepare Blocking Source: " + prepareBlockingSource);
    lines.push("Current Task Card ID: " + (ctx.taskCardId || "none"));
    lines.push("Current Context Matched: " + String(currentContextMatched));
    lines.push("Bridge Current Result: " + (bridgeLatest ? (bridgeLatest.ok ? "connected" : "disconnected") : "not_run"));
    lines.push("Report Export Ok: true");
    lines.push("");

    lines.push("ACB Card Meta Detected: " + String(hasCardMeta));
    lines.push("ACB Card Meta Type: " + (hasCardMeta ? (cardMeta.feedbackType || cardMeta.cardType || "") : ""));
    lines.push("ACB Card Meta Title: " + (hasCardMeta ? cardMeta.title || "" : ""));
    lines.push("ACB Card Meta Confidence: " + (hasCardMeta ? cardMeta.confidence || "" : ""));
    lines.push("");

    lines.push("Cards Count: " + String(legacyCardStats.total));
    lines.push("New Cards Count: " + String(legacyCardStats.newCount));
    lines.push("Pending Cards Count: " + String(legacyCardStats.pendingCount));
    lines.push("Done Cards Count: " + String(legacyCardStats.doneCount));
    lines.push("Archived Cards Count: " + String(legacyCardStats.archivedCount));
    lines.push("Selected Card ID: none");
    lines.push("Selected Card Type: none");
    lines.push("Selected Card Status: none");
    lines.push("");

    lines.push("Basic Result:");
    lines.push("- floatingConsoleLoaded: true");
    lines.push("- feedbackLoaded: " + String(hasFeedback));
    lines.push("- classificationLoaded: " + String(hasClassification));
    lines.push("- actionStepsGenerated: " + String(hasActionPlan));
    lines.push("- noAutoDispatch (未自动派发): true");
    lines.push("- noCommandExecution (未执行命令): true");
    lines.push("");
    lines.push("Notes:");
    lines.push(
      hasFeedback
        ? "Selected feedback is available."
        : "No latest feedback on selected channel."
    );

    // Local Bridge section
    if (bridgeLatest) {
      lines.push("");
      lines.push("--- Local Bridge ---");
      lines.push("Local Bridge Detected: true");
      lines.push("Local Bridge Status: " + (bridgeLatest.ok ? "connected" : "disconnected"));
      if (bridgeLatest.data) {
        lines.push("bridge: " + (bridgeLatest.data.bridge || ""));
        lines.push("version: " + (bridgeLatest.data.version || ""));
        lines.push("noAutoDispatch: " + String(bridgeLatest.data.noAutoDispatch));
        lines.push("noCommandExecution: " + String(bridgeLatest.data.noCommandExecution));
        lines.push("generatedAt: " + (bridgeLatest.data.generatedAt || ""));
      }
      if (bridgeLatest.error) {
        lines.push("error: " + bridgeLatest.error);
      }
      lines.push("bridgeTimestamp: " + (bridgeLatest.timestamp || ""));
    }

    lines.push("");
    lines.push("--- Task Card Review Bridge ---");
    var trAttempted = Boolean(taskCardReviewLatest && (taskCardReviewLatest.attempted === true || taskCardReviewLatest.ok !== undefined));
    var trContextMatched = taskCardReviewMatchesContext(taskCardReviewLatest, ctx);
    var trCurrent = Boolean(taskCardReviewLatest && trContextMatched && ctx.canSendToAgent === true);
    lines.push("Task Card Review Send Attempted: " + String(trAttempted));
    lines.push("Task Card Review Context Matched: " + String(trContextMatched));
    lines.push("Task Card Review Current Result: " + String(trCurrent));
    lines.push("Task Card Review Accepted: " + String(Boolean(trCurrent && taskCardReviewLatest && taskCardReviewLatest.accepted)));
    lines.push("Task Card Review Send Status: " + (trCurrent && taskCardReviewLatest ? (taskCardReviewLatest.status || (taskCardReviewLatest.ok ? "ok" : taskCardReviewLatest.error ? "error" : "-")) : (taskCardReviewLatest ? "stale_or_route_blocked_ignored" : "-")));
    lines.push("Task Card Review Action Step Index: " + (taskCardReviewLatest ? String(taskCardReviewLatest.actionStepIndex !== undefined ? taskCardReviewLatest.actionStepIndex : "-") : "-"));
    lines.push("Task Card Review TaskCardId: " + (taskCardReviewLatest ? (taskCardReviewLatest.taskCardId || "") : ""));
    lines.push("Task Card Review Target: " + (taskCardReviewLatest ? (taskCardReviewLatest.target || "") : ""));
    lines.push("Task Card Review Context ID: " + (taskCardReviewLatest ? (taskCardReviewLatest.contextId || "") : ""));
    lines.push("Task Card Review Error if rejected: " + (taskCardReviewLatest ? (taskCardReviewLatest.error || "") : ""));
    lines.push("Executable Payload Present: " + String(ctx.hasCompleteTaskCard));
    lines.push("Review Metadata Present: " + String(Boolean(trCurrent && taskCardReviewLatest)));
    if (taskCardReviewLatest && !trCurrent) {
      lines.push("Stale Task Card Review Ignored: true");
      lines.push("Stale Task Card Review Reason: " + (!trContextMatched ? "context_mismatch" : "route_gated_can_send_false"));
    }
    lines.push("Local Bridge Endpoint: /acb/v1/task-card-review");
    lines.push("noAutoDispatch: true");
    lines.push("noCommandExecution: true");
    lines.push("executionAllowed=false");
    lines.push("agentDispatchAllowed=false");
    lines.push("gitWriteAllowed=false");
    lines.push("Safety Lock State: locked_readonly");
    lines.push("Tool Endpoint Summary: VSCodeBridge=" + (floatingBridgeLatest && floatingBridgeLatest.ok ? "connected" : "disconnected_or_unknown") + ", Others=manual_or_pending");

    // Local Project Status section — always present
    lines.push("");
    lines.push("--- Execution Inbox ---");
    var eiAttempted = Boolean(executionInboxLatest && executionInboxLatest.attempted === true);
    var eiContextMatched = executionInboxMatchesContext(executionInboxLatest, ctx);
    var eiStaleIgnored = Boolean(executionInboxLatest && (executionInboxLatest.staleContextIgnored === true || (executionInboxLatest.contextId && ctx.contextId && executionInboxLatest.contextId !== ctx.contextId)));
    var eiCurrent = Boolean(executionInboxLatest && eiContextMatched && ctx.canSendToAgent === true);
    var handoffSurface = routeStep ? getExecutionInboxHandoffSurfaceData(routeStep) : null;
    lines.push("Execution Inbox Detected: " + String(Boolean(executionInboxLatest)));
    lines.push("Execution Inbox Send Attempted: " + String(eiAttempted));
    lines.push("Execution Inbox Accepted: " + String(Boolean(eiCurrent && executionInboxLatest && executionInboxLatest.accepted)));
    lines.push("Execution Inbox Item ID: " + (executionInboxLatest ? (executionInboxLatest.inboxItemId || "") : ""));
    lines.push("Execution Inbox Status: " + (executionInboxLatest ? (executionInboxLatest.status || "-") : "-"));
    lines.push("Execution Inbox Context ID: " + (executionInboxLatest ? (executionInboxLatest.contextId || "") : ""));
    lines.push("Execution Inbox TaskCardId: " + (executionInboxLatest ? (executionInboxLatest.taskCardId || "") : ""));
    lines.push("Execution Inbox Target: " + (executionInboxLatest ? (executionInboxLatest.target || "") : ""));
    lines.push("Execution Inbox Error if rejected: " + (executionInboxLatest ? (executionInboxLatest.error || "") : ""));
    lines.push("Execution Inbox Reject Reasons: " + (executionInboxLatest && Array.isArray(executionInboxLatest.rejectReasons) && executionInboxLatest.rejectReasons.length > 0 ? executionInboxLatest.rejectReasons.join(", ") : "none"));
    lines.push("Execution Inbox Stale Context Ignored: " + String(eiStaleIgnored));
    lines.push("Execution Inbox Handoff Surface Detected: " + String(Boolean(handoffSurface && handoffSurface.detected)));
    lines.push("Handoff Surface Current Context Matched: " + String(Boolean(handoffSurface && handoffSurface.current)));
    lines.push("Handoff Surface Item ID: " + (handoffSurface && handoffSurface.entry ? (handoffSurface.entry.inboxItemId || "") : ""));
    lines.push("Handoff Surface TaskCardId: " + (handoffSurface && handoffSurface.entry ? (handoffSurface.entry.taskCardId || "") : ""));
    lines.push("Handoff Surface Target: " + (handoffSurface && handoffSurface.entry ? (handoffSurface.entry.target || "") : ""));
    lines.push("Handoff Payload Available: " + String(Boolean(handoffSurface && handoffSurface.payloadAvailable)));
    lines.push("Handoff Payload Source: " + (handoffSurface ? handoffSurface.payloadSource : ""));
    lines.push("Handoff Copied State: " + (handoffSurface && handoffSurface.state ? (handoffSurface.state.copiedState || "not_copied") : "not_copied"));
    lines.push("Handoff Manually Delivered State: " + (handoffSurface && handoffSurface.state ? (handoffSurface.state.deliveredState || "not_delivered") : "not_delivered"));
    lines.push("Stale Inbox Item Hidden Or Marked: " + String(Boolean(handoffSurface && handoffSurface.stale)));
    lines.push("Task Card Payload Present: " + String(Boolean(ctx.hasCompleteTaskCard)));
    lines.push("Local Bridge Endpoint: /acb/v1/execution-inbox");

    // Terminal Action diagnostics
    var ta = terminalActionState || {};
    lines.push("");
    lines.push("--- Terminal Action ---");
    lines.push("Terminal Action Attempted: " + String(Boolean(ta.attempted)));
    lines.push("Terminal Action Type: " + (ta.actionType || "none"));
    lines.push("Terminal Action TaskCardId: " + (ta.taskCardId || ""));
    lines.push("Terminal Action Executor: " + (ta.executor || ""));
    lines.push("Terminal Action Terminal Name: " + (ta.terminalName || ""));
    lines.push("Terminal Action Result: " + (ta.result || "none"));
    lines.push("Terminal Action Result Detail: " + (ta.resultDetail || ""));
    lines.push("Terminal Action At: " + (ta.at || ""));
    lines.push("Terminal Action No Auto Enter: " + String(ta.noAutoEnter !== false));
    lines.push("Terminal Action No Execution: " + String(ta.noExecution !== false));
    lines.push("Terminal Action Bridge Status: " + (terminalStatusCache ? (terminalStatusCache.bridge_status || "unknown") : "not_queried"));
    lines.push("Terminal Action Terminal Found: " + String(Boolean(terminalStatusCache && terminalStatusCache.terminal_found)));
    lines.push("Terminal Action Terminal Status: " + (terminalStatusCache ? (terminalStatusCache.terminal_status || "unknown") : "not_queried"));
    lines.push("Terminal Action Local Inbox TaskCardId: " + (ta.localInboxTaskCardId || ""));
    lines.push("Terminal Action Local Inbox Target: " + (ta.localInboxTarget || ""));
    lines.push("Terminal Action Context Matched: " + String(Boolean(ta.contextMatched)));
    lines.push("Terminal Action Endpoint Path: " + (ta.endpointPath || ""));
    lines.push("Terminal Action SW Message Type: " + (ta.swMessageType || ""));
    lines.push("Terminal Action Bridge Response Status: " + (ta.bridgeResponseStatus != null ? String(ta.bridgeResponseStatus) : ""));
    lines.push("Terminal Action Bridge Response OK: " + (ta.bridgeResponseOk != null ? String(Boolean(ta.bridgeResponseOk)) : ""));
    // Fill-specific diagnostics (undefined for non-fill actions)
    lines.push("Terminal Action Fill Accepted: " + (ta.fillAccepted != null ? String(Boolean(ta.fillAccepted)) : ""));
    lines.push("Terminal Action Payload Sent: " + (ta.payloadSent != null ? String(Boolean(ta.payloadSent)) : ""));
    lines.push("Terminal Action Terminal Resolver Status: " + (ta.terminalResolverStatus || ""));
    // Terminal Status Cache (post-action snapshot, may differ from action result)
    lines.push("Terminal Status Cache Executor: " + (terminalStatusCache ? (terminalStatusCache.executor_id || "") : ""));
    lines.push("Terminal Status Cache Bridge Status: " + (terminalStatusCache ? (terminalStatusCache.bridge_status || "unknown") : "not_queried"));
    lines.push("Terminal Status Cache Terminal Found: " + String(Boolean(terminalStatusCache && terminalStatusCache.terminal_found)));
    lines.push("Terminal Status Cache Terminal Status: " + (terminalStatusCache ? (terminalStatusCache.terminal_status || "unknown") : "not_queried"));
    lines.push("Terminal Status Cache Terminal Name: " + (terminalStatusCache ? (terminalStatusCache.terminal_name || "") : ""));
    // Terminal button debug trace
    var tdbg = terminalActionDebug || {};
    lines.push("Terminal Button Rendered: " + String(Boolean(tdbg.rendered)));
    lines.push("Terminal Button Last Clicked: " + (tdbg.lastClicked || ""));
    lines.push("Terminal Handler Entered: " + String(Boolean(tdbg.handlerEntered)));
    lines.push("Terminal Handler Error Detail: " + (tdbg.handlerError || ""));

    lines.push("executionAllowed=false");
    lines.push("agentDispatchAllowed=false");
    lines.push("gitWriteAllowed=false");
    lines.push("noAutoDispatch=true");
    lines.push("noCommandExecution=true");
    lines.push("canTriggerExecution=false");

    lines.push("");
    lines.push("--- Manual Execution Report ---");
    var mer = manualExecutionReportLatest || floatingManualExecutionReportLatest || null;
    var merContextMatched = Boolean(mer && ctx && mer.sourceContextId && ctx.contextId && mer.sourceContextId === ctx.contextId);
    var merTaskMatched = Boolean(mer && ctx && mer.sourceTaskCardId && ctx.taskCardId && mer.sourceTaskCardId === ctx.taskCardId);
    var merCurrent = Boolean(mer && (merContextMatched || merTaskMatched) && mer.associationStatus === "linked");
    lines.push("Manual Report Detected: " + String(Boolean(mer)));
    lines.push("Manual Report Current Result: " + String(merCurrent));
    lines.push("Report Status: " + (mer ? (mer.reportStatus || "none") : "none"));
    lines.push("Report ID: " + (mer ? (mer.reportId || "") : ""));
    lines.push("Source Task Card ID: " + (mer ? (mer.sourceTaskCardId || "") : ""));
    lines.push("Source Context ID: " + (mer ? (mer.sourceContextId || "") : ""));
    lines.push("Target: " + (mer ? (mer.target || "") : ""));
    lines.push("Resolved Executor ID: " + (mer ? (mer.resolvedExecutorId || "") : ""));
    lines.push("Handoff Status: " + (mer ? (mer.handoffStatus || "") : ""));
    lines.push("Report Received At: " + (mer ? (mer.reportReceivedAt || "") : ""));
    lines.push("Waiting Controller Review: " + String(Boolean(mer && mer.waitingControllerReview)));
    lines.push("Association Status: " + (mer ? (mer.associationStatus || "") : ""));
    lines.push("Warning Reasons: " + (mer && Array.isArray(mer.warningReasons) && mer.warningReasons.length > 0 ? mer.warningReasons.join(", ") : "none"));
    lines.push("Can Auto Review: " + String(Boolean(mer && mer.canAutoReview)));
    lines.push("Can Auto Execute: " + String(Boolean(mer && mer.canAutoExecute)));
    lines.push("Manual Report Text Present: " + String(Boolean(mer && mer.reportText)));
    if (mer && !merCurrent) {
      lines.push("Stale Manual Report Ignored: true");
      lines.push("Stale Manual Report Reason: " + (!merContextMatched && !merTaskMatched ? "context_mismatch" : "association_not_linked"));
    }
    lines.push("noAutoDispatch=true");
    lines.push("noCommandExecution=true");
    lines.push("executionAllowed=false");
    lines.push("agentDispatchAllowed=false");
    lines.push("gitWriteAllowed=false");
    lines.push("");

    lines.push("--- Local Execution Report Import ---");
    var ler = floatingLocalReportReadResult || null;
    var lerDetected = Boolean(ler);
    var lerCurrent = Boolean(ler && ler.ok && ler.taskCardId && ctx && ler.taskCardId === (ctx.taskCardId || ""));
    var lerImportedToManual = Boolean(mer && mer.localReportReadAt);
    var lerStaleContext = Boolean(ler && !lerCurrent && ler.taskCardId && ctx && ctx.taskCardId && ler.taskCardId !== ctx.taskCardId);
    lines.push("Local Report Import Detected: " + String(lerDetected));
    lines.push("Local Report Current Result: " + String(lerCurrent));
    lines.push("Local Report Read Status: " + (ler ? (ler.ok ? "ok" : "failed") : "not_read"));
    lines.push("Local Report TaskCardId: " + (ler ? (ler.taskCardId || "") : ""));
    lines.push("Local Report Source Path: " + (ler ? (ler.sourcePath || "") : ""));
    lines.push("Local Report File TaskCardId: " + (ler ? (ler.fileTaskCardId || "") : ""));
    lines.push("Local Report TaskCardId Conflict: " + String(Boolean(ler && ler.taskCardIdConflict)));
    if (ler && ler.taskCardIdConflict) {
      lines.push("Local Report TaskCardId Warning: " + (ler.taskCardIdWarning || ""));
    }
    lines.push("Local Report Imported To Manual Report: " + String(lerImportedToManual));
    if (mer && mer.localReportReadAt) {
      lines.push("Local Report Read At: " + (mer.localReportReadAt || ""));
    }
    if (mer && mer.localReportSourcePath) {
      lines.push("Local Report Import Source Path: " + (mer.localReportSourcePath || ""));
    }
    if (mer && mer.localReportCommitHash) {
      lines.push("Local Report Commit Hash: " + (mer.localReportCommitHash || ""));
    }
    lines.push("Waiting Controller Review: " + String(Boolean(mer && mer.waitingControllerReview)));
    lines.push("Can Auto Review: " + String(Boolean(mer && mer.canAutoReview)));
    lines.push("Can Auto Execute: " + String(Boolean(mer && mer.canAutoExecute)));
    if (lerStaleContext) {
      lines.push("Stale Local Report Ignored: true");
      lines.push("Stale Local Report Reason: context_mismatch");
    }
    lines.push("noAutoDispatch=true");
    lines.push("noCommandExecution=true");
    lines.push("executionAllowed=false");
    lines.push("agentDispatchAllowed=false");
    lines.push("gitWriteAllowed=false");
    lines.push("");

    lines.push("--- Local Project Status ---");
    var psData = projectStatusLatest ? (projectStatusLatest.data || null) : null;
    var psNormalized = psData ? normalizeProjectStatusResponse(psData) : normalizeProjectStatusResponse(null);
    lines.push("Project Status Detected: " + String(psNormalized.detected));
    lines.push("Project Status Result: " + psNormalized.result);
    if (psNormalized.detected && psNormalized.projectStatus) {
      var ps = psNormalized.projectStatus;
      lines.push("Project Path: " + (ps.projectPath || ""));
      lines.push("Workspace Name: " + (ps.workspaceName || ""));
      lines.push("Git Root: " + (ps.gitRoot || ""));
      lines.push("Git Available: " + String(ps.gitAvailable));
      lines.push("Branch: " + (ps.branch || ""));
      lines.push("Current Commit: " + (ps.currentCommit || ""));
      lines.push("Latest Commit: " + (ps.latestCommit || ""));
      lines.push("Working Tree: " + (ps.workingTree || ""));
      lines.push("Changed Files: " + String(ps.changedFiles || 0));
      lines.push("Staged Files: " + String(ps.stagedFiles || 0));
      lines.push("Untracked Files: " + String(ps.untrackedFiles || 0));
      lines.push("Project Status GeneratedAt: " + (ps.generatedAt || ""));
      // Commit source diagnostics
      var psDiag = psNormalized.diagnostics || {};
      lines.push("Current Commit Source: " + (psDiag.currentCommitSource || "unknown"));
      if (psDiag.commitSourceMismatch) {
        lines.push("Commit Source Mismatch: " + String(psDiag.commitSourceMismatch));
        lines.push("Git API Commit: " + (psDiag.cliVerifyApiCommitHash || "N/A"));
        lines.push("CLI HEAD: " + (psDiag.cliVerifyHead || "N/A"));
      }
      if (psDiag.cliVerifyAttempted) {
        lines.push("CLI Verify Attempted: " + String(psDiag.cliVerifyAttempted));
      }
      var psFreshness = deriveProjectStatusFreshness(ps, reportNow);
      lines.push("Project Status Fresh: " + String(psFreshness.fresh));
      lines.push("Project Status Stale: " + String(psFreshness.stale));
      lines.push("Project Status Stale Reason: " + psFreshness.reason);
      if (psFreshness.ageMs != null) {
        lines.push("Project Status Age (ms): " + String(psFreshness.ageMs));
      }
    } else {
      lines.push("Project Status Fresh: false");
      lines.push("Project Status Stale: true");
      lines.push("Project Status Stale Reason: project_status_not_detected");
    }
    lines.push("Safety noAutoDispatch: " + String(psNormalized.safety.noAutoDispatch));
    lines.push("Safety noCommandExecution: " + String(psNormalized.safety.noCommandExecution));
    if (psNormalized.generatedAt) {
      lines.push("Bridge GeneratedAt: " + psNormalized.generatedAt);
    }
    if (psNormalized.error) {
      lines.push("Error: " + psNormalized.error);
    }
    if (projectStatusLatest && !projectStatusLatest.ok && projectStatusLatest.error) {
      lines.push("Fetch Error: " + projectStatusLatest.error);
    }

    // Payload Preflight section — always present, context-aware
    lines.push("");
    lines.push("--- Payload Preflight ---");
    var ctx = getActiveExecutionContext();
    var hasCurrentPayload = ctx.hasCompleteTaskCard;
    var hasPreflight = Boolean(preflightLatest && preflightLatest.data);
    var preflightMatches = hasPreflight && hasCurrentPayload && preflightMatchesContext(preflightLatest, ctx);
    var hasStalePreflight = hasPreflight && !preflightMatches;

    lines.push("Context ID: " + ctx.contextId);
    lines.push("Current Payload Status: " + ctx.payloadStatus);
    lines.push("Current Task Card ID: " + (ctx.taskCardId || "none"));
    lines.push("Current Target: " + (ctx.target || "none"));
    lines.push("Current Can Send To Agent: " + String(ctx.canSendToAgent));
    lines.push("Has Complete Task Card: " + String(ctx.hasCompleteTaskCard));
    lines.push("Reason: " + ctx.reason);
    lines.push("Payload Preflight Detected (matching context): " + String(preflightMatches));

    if (!hasCurrentPayload) {
      // No complete task card in current context
      lines.push("Payload Preflight Status: not_run");
      lines.push("Reason: no_current_complete_payload");
    } else if (!preflightMatches) {
      // Has complete task card but no matching preflight
      lines.push("Payload Preflight Status: not_run");
      lines.push("Reason: current_payload_not_preflighted");
      lines.push("Task Card ID (needs preflight): " + ctx.taskCardId);
      lines.push("Target: " + ctx.target);
    } else {
      // Matching preflight exists
      var pf = preflightLatest.data.preflight;
      lines.push("Payload Preflight Status: " + (pf.status || "unknown"));
      lines.push("Task Card ID: " + (pf.taskCardId || ""));
      lines.push("Target: " + (pf.target || ""));
      lines.push("Task Card Start Detected: " + String(pf.taskCardStartDetected));
      lines.push("Task Card End Detected: " + String(pf.taskCardEndDetected));
      lines.push("Task Card ID Matched: " + String(pf.taskCardIdMatched));
      lines.push("Target Matched: " + String(pf.targetMatched));
      lines.push("Required Fields Present: " + String(pf.requiredFieldsPresent));
      lines.push("Required Fields Missing: " + (pf.requiredFieldsMissing && pf.requiredFieldsMissing.length > 0 ? pf.requiredFieldsMissing.join(", ") : "none"));
      lines.push("Multiple Task Cards Detected: " + String(pf.multipleTaskCardsDetected));
      lines.push("Truncated Suspected: " + String(pf.truncatedSuspected));
      lines.push("Long Task Card Capture Incomplete: " + String(Boolean(pf.longTaskCardCaptureIncomplete)));
      lines.push("Incomplete Reason: " + (pf.incompleteReason || "none"));
      lines.push("Captured Message Length: " + String(pf.assistantMessageLength || 0));
      lines.push("Extracted Task Card Length: " + String(pf.extractedTaskCardLength || 0));
      lines.push("Task Card Flattened Detected: " + String(Boolean(pf.taskCardFlattenedDetected)));
      lines.push("Field Boundary Preserved: " + String(Boolean(pf.fieldBoundaryPreserved)));
    }

    if (hasStalePreflight) {
      lines.push("Stale Preflight Ignored: true");
      lines.push("Stale Task Card ID: " + ((preflightLatest.data && preflightLatest.data.preflight) ? preflightLatest.data.preflight.taskCardId || "" : ""));
    }

    if (preflightMatches && preflightLatest.data && preflightLatest.data.projectComparison) {
      var pc = preflightLatest.data.projectComparison;
      var psForPfFreshness = psNormalized.detected ? psNormalized.projectStatus : null;
      var psPfFreshness = deriveProjectStatusFreshness(psForPfFreshness, reportNow);
      lines.push("Project Status Available: " + String(pc.projectStatusAvailable));
      lines.push("Task Project Dir: " + (pc.taskProjectDir || ""));
      lines.push("Local Project Path: " + (pc.localProjectPath || ""));
      lines.push("Project Dir Matched: " + String(pc.projectDirMatched));
      lines.push("Task Branch: " + (pc.taskBranch || ""));
      lines.push("Local Branch: " + (pc.localBranch || ""));
      lines.push("Branch Matched: " + String(pc.branchMatched));
      lines.push("Task Current Commit: " + (pc.taskCurrentCommit || ""));
      lines.push("Local Current Commit: " + (pc.localCurrentCommit || ""));
      // Degrade commit match when project status is stale
      if (psPfFreshness.stale && !pc.currentCommitMatched) {
        lines.push("Current Commit Matched: unknown (project_status_stale)");
        lines.push("Current Commit Match Warning: Project Status is stale (reason=" + psPfFreshness.reason + "). Commit comparison may be misleading. Refresh Project Status and re-run preflight.");
      } else {
        lines.push("Current Commit Matched: " + String(pc.currentCommitMatched));
      }
      lines.push("Working Tree: " + (pc.workingTree || ""));
      lines.push("Changed Files: " + String(pc.changedFiles || 0));
    }
    if (preflightMatches && preflightLatest.data && preflightLatest.data.safety) {
      var sf = preflightLatest.data.safety;
      lines.push("noAutoDispatch: " + String(sf.noAutoDispatch));
      lines.push("noCommandExecution: " + String(sf.noCommandExecution));
      lines.push("executionAllowed: " + String(sf.executionAllowed));
      lines.push("agentDispatchAllowed: " + String(sf.agentDispatchAllowed));
      lines.push("gitWriteAllowed: " + String(sf.gitWriteAllowed));
    }
    if (preflightMatches && preflightLatest.data && preflightLatest.data.generatedAt) {
      lines.push("generatedAt: " + preflightLatest.data.generatedAt);
    }
    if (preflightMatches && preflightLatest.data && preflightLatest.data.error) {
      lines.push("error: " + preflightLatest.data.error);
    }
    if (preflightLatest && !preflightLatest.ok && preflightLatest.error && preflightMatches) {
      lines.push("fetch_error: " + preflightLatest.error);
    }

    // Execution Readiness Gate section — always present, context-aware
    lines.push("");
    lines.push("--- Execution Readiness Gate ---");
    var hasReadiness = Boolean(readinessLatest && readinessLatest.data);
    var rdOk = readinessLatest ? readinessLatest.ok : false;

    // Use the same activeContext computed above — no separate getActiveExecutionContext() call
    var rdCtx = ctx;
    lines.push("Current Context ID: " + rdCtx.contextId);
    lines.push("Current Payload Status: " + rdCtx.payloadStatus);
    lines.push("Current Task Card ID: " + (rdCtx.taskCardId || "none"));
    lines.push("Current Target: " + (rdCtx.target || "none"));
    lines.push("Current Can Send To Agent: " + String(rdCtx.canSendToAgent));
    lines.push("Has Complete Task Card: " + String(rdCtx.hasCompleteTaskCard));

    // Check if cached readiness matches current context
    var rdCachedCtxId = "";
    if (hasReadiness && readinessLatest.data && readinessLatest.data.readiness) {
      rdCachedCtxId = readinessLatest.data.readiness.requestContextId || "";
    }
    var rdContextMatches = rdCachedCtxId && rdCtx.contextId && rdCachedCtxId === rdCtx.contextId;

    lines.push("Readiness Detected: " + String(hasReadiness));
    lines.push("Readiness Context Matched: " + String(rdContextMatches));

    if (!rdCtx.hasCompleteTaskCard) {
      // No complete task card in current context → always blocked
      lines.push("Readiness Status: blocked");
      lines.push("Readiness Summary: Execution blocked. No complete task card in current context.");
      lines.push("Preflight Available: false");
      lines.push("Preflight Status: not_run");
      lines.push("Blocking Reason: 当前无完整任务卡，不能进入执行准备检查。");
      if (hasReadiness && !rdContextMatches) {
        lines.push("Stale Readiness Ignored: true");
        lines.push("Cached Readiness Context ID: " + (rdCachedCtxId || "none"));
      }
    } else if (!hasReadiness || !rdContextMatches) {
      if (hasReadiness && !rdContextMatches) {
        lines.push("Stale Readiness Ignored: true");
        lines.push("Cached Readiness Context ID: " + (rdCachedCtxId || "none"));
      }
      lines.push("Readiness Status: not_run");
      if (!rdContextMatches) {
        lines.push("Reason: current_payload_readiness_not_checked");
        lines.push("Task Card ID (needs readiness): " + rdCtx.taskCardId);
      }
    } else if (hasReadiness && readinessLatest.data && readinessLatest.data.readiness) {
      var rd = readinessLatest.data.readiness;
      lines.push("Readiness Status: " + (rd.status || "unknown"));
      lines.push("Readiness Summary: " + (rd.summary || ""));
      lines.push("Preflight Context Mismatch: " + String(rd.preflightContextMismatch || false));
      lines.push("Bridge Connected: " + String(rd.bridgeConnected));
      lines.push("Project Status Available: " + String(rd.projectStatusAvailable));
      lines.push("Preflight Available: " + String(rd.preflightAvailable));
      lines.push("Preflight Status: " + (rd.preflightStatus || "not_run"));
      lines.push("TaskCardId: " + (rd.taskCardId || ""));
      lines.push("Target: " + (rd.target || ""));
      lines.push("Required Fields Present: " + String(rd.requiredFieldsPresent));
      if (rd.blockingReasons && rd.blockingReasons.length > 0) {
        for (var bi = 0; bi < rd.blockingReasons.length; bi += 1) {
          lines.push("Blocking Reason: " + rd.blockingReasons[bi]);
        }
      } else {
        lines.push("Blocking Reasons: none");
      }
      if (rd.warningReasons && rd.warningReasons.length > 0) {
        for (var wi = 0; wi < rd.warningReasons.length; wi += 1) {
          lines.push("Warning Reason: " + rd.warningReasons[wi]);
        }
      } else {
        lines.push("Warning Reasons: none");
      }
      if (rd.projectComparison) {
        var pc = rd.projectComparison;
        var psForRdFreshness = psNormalized.detected ? psNormalized.projectStatus : null;
        var psRdFreshness = deriveProjectStatusFreshness(psForRdFreshness, reportNow);
        lines.push("Project Dir Matched: " + String(pc.projectDirMatched));
        lines.push("Branch Matched: " + String(pc.branchMatched));
        if (psRdFreshness.stale && !pc.currentCommitMatched) {
          lines.push("Current Commit Matched: unknown (project_status_stale)");
          lines.push("Current Commit Match Warning: Project Status is stale (reason=" + psRdFreshness.reason + "). Refresh Project Status and re-run readiness.");
        } else {
          lines.push("Current Commit Matched: " + String(pc.currentCommitMatched));
        }
        lines.push("Working Tree: " + (pc.workingTree || "unknown") + " (changed: " + String(pc.changedFiles || 0) + ")");
      }
      if (rd.checks) {
        for (var ci = 0; ci < rd.checks.length; ci += 1) {
          var ck = rd.checks[ci];
          lines.push("Check: " + ck.name + "=" + ck.status + " — " + ck.message);
        }
      }
    } else {
      lines.push("Readiness Status: not_run");
    }
    if (hasReadiness && rdContextMatches && readinessLatest.data && readinessLatest.data.safety) {
      var rsf = readinessLatest.data.safety;
      lines.push("executionAllowed: " + String(rsf.executionAllowed));
      lines.push("agentDispatchAllowed: " + String(rsf.agentDispatchAllowed));
      lines.push("gitWriteAllowed: " + String(rsf.gitWriteAllowed));
      lines.push("noAutoDispatch: " + String(rsf.noAutoDispatch));
      lines.push("noCommandExecution: " + String(rsf.noCommandExecution));
    }
    if (hasReadiness && rdContextMatches && readinessLatest.data && readinessLatest.data.generatedAt) {
      lines.push("generatedAt: " + readinessLatest.data.generatedAt);
    }
    if (hasReadiness && rdContextMatches && readinessLatest.data && readinessLatest.data.error) {
      lines.push("error: " + readinessLatest.data.error);
    }
    if (readinessLatest && !readinessLatest.ok && readinessLatest.error) {
      lines.push("fetch_error: " + readinessLatest.error);
    }

    return lines.join("\n");
  }

  async function exportFloatingTestReport() {
    var bridgeLatest = null;
    var projectStatusLatest = null;
    var preflightLatest = null;
    var readinessLatest = null;
    var taskCardReviewLatest = null;
    var executionInboxLatest = null;
    var manualExecutionReportLatest = null;
    try {
      bridgeLatest = await globalThis.AcbStorage.getLocalBridgeLatest();
    } catch (_e) {
      // Ignore — bridge section will be omitted
    }
    try {
      projectStatusLatest = await globalThis.AcbStorage.getLocalBridgeProjectStatusLatest();
    } catch (_e) {
      // Ignore — project status section will be omitted
    }
    try {
      preflightLatest = await globalThis.AcbStorage.getLocalBridgePreflightLatest();
    } catch (_e) {
      // Ignore — preflight section will be omitted
    }
    try {
      readinessLatest = await globalThis.AcbStorage.getLocalBridgeReadinessLatest();
    } catch (_e) {
      // Ignore — readiness section will be omitted
    }
    try {
      taskCardReviewLatest = await globalThis.AcbStorage.getLocalBridgeTaskCardReviewLatest();
    } catch (_e) {
      // Ignore.
    }
    try {
      executionInboxLatest = await globalThis.AcbStorage.getLocalBridgeExecutionInboxLatest();
    } catch (_e) {
      // Ignore.
    }
    try {
      floatingPreExecutionHandoffLatest = await globalThis.AcbStorage.getLocalBridgePreExecutionHandoffLatest();
      preExecutionHandoffStorageLoaded = true;
    } catch (_e) {
      // Ignore.
    }
    try {
      manualExecutionReportLatest = await globalThis.AcbStorage.getLocalBridgeManualExecutionReportLatest();
      floatingManualExecutionReportLatest = manualExecutionReportLatest || null;
    } catch (_e) {
      // Ignore.
    }
    var reportText = buildFloatingReport(bridgeLatest, projectStatusLatest, preflightLatest, readinessLatest, taskCardReviewLatest, executionInboxLatest, manualExecutionReportLatest);
    var reportOutputEl = document.getElementById("acb-float-report-output");

    if (reportOutputEl) {
      reportOutputEl.value = reportText;
      reportOutputEl.focus();
      reportOutputEl.select();
    }

    try {
      await navigator.clipboard.writeText(reportText);
      setCopyStatus("已复制到剪贴板", "#2e7d32");
      setStatus("测试报告已生成并复制到剪贴板");
    } catch (_err) {
      setCopyStatus("自动复制失败，请从文本区域手动复制", "#c62828");
      setStatus("测试报告已生成，自动复制失败");
    }
  }

  function getBoundChannelMeta() {
    if (!currentPageBinding || !currentPageBinding.channelId) {
      return null;
    }
    var channel = getChannelById(currentPageBinding.channelId);
    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type
    };
  }

  async function captureCurrentConversation() {
    var channelMeta = getBoundChannelMeta();
    if (!channelMeta) {
      setCaptureStatus("请先绑定当前页面通道", true);
      setStatus("采集被阻止：未绑定通道");
      return;
    }

    var latest = getLatestChatGptConversation();
    if (!latest) {
      setCaptureStatus("未能检测到最新的用户/助手消息", true);
      setStatus("采集失败");
      return;
    }

    var result = await persistFeedback(
      channelMeta,
      latest.lastUserMessage,
      latest.assistantMessage,
      SOURCE_CHATGPT,
      location.href,
      Object.assign({}, latest.assistantCapture || {}, {
        contextId: getCurrentPageConversationId() || extractConversationIdFromUrl(location.href) || ""
      })
    );

    currentClassificationKey = null;
    classificationDraftKey = null;
    currentActionPlanKey = null;
    currentActionStepId = null;

    if (result.updated) {
      setCaptureStatus("已采集当前对话", false);
      setStatus("采集成功");
    } else if (result.reason === "same-hash") {
      setCaptureStatus("与上次采集一致，无变更", false);
      setStatus("采集完成（无变化）");
    } else {
      setCaptureStatus("采集未产生新反馈", true);
      setStatus("采集未更新反馈");
    }

    await refreshFloatingConsole();
  }

  async function refreshFloatingConsole() {
    setStatus("读取中...");
    try {
      await loadFloatingConsoleDisplayMode();
      floatingFeedbacks = await globalThis.AcbStorage.getAllLatestFeedbacks().catch(function () { return []; });
      floatingChannelStates = await globalThis.AcbStorage.getAllChannelStates().catch(function () { return []; });
      floatingCards = await globalThis.AcbStorage.getAllCards().catch(function () { return []; });
      floatingFeedbackClassifications = await globalThis.AcbStorage.getAllFeedbackClassifications().catch(function () { return []; });
      floatingActionPlans = await globalThis.AcbStorage.getAllActionSteps().catch(function () { return []; });
      floatingBridgeLatest = await globalThis.AcbStorage.getLocalBridgeLatest().catch(function () { return null; });
      floatingProjectStatusLatest = await globalThis.AcbStorage.getLocalBridgeProjectStatusLatest().catch(function () { return null; });
      floatingPreflightLatest = await globalThis.AcbStorage.getLocalBridgePreflightLatest().catch(function () { return null; });
      floatingReadinessLatest = await globalThis.AcbStorage.getLocalBridgeReadinessLatest().catch(function () { return null; });
      floatingTaskCardReviewLatest = await globalThis.AcbStorage.getLocalBridgeTaskCardReviewLatest().catch(function () { return null; });
      floatingExecutionInboxLatest = await globalThis.AcbStorage.getLocalBridgeExecutionInboxLatest().catch(function () { return null; });
      floatingManualExecutionReportLatest = await globalThis.AcbStorage.getLocalBridgeManualExecutionReportLatest().catch(function () { return null; });

      if (currentMode === MODE_CHATGPT) {
        await loadCurrentPageBinding().catch(function () { /* context may be invalidated */ });
      }

      await ensureSelectedFeedbackClassification().catch(function () { /* context may be invalidated */ });
      setStatus("已刷新");
    } catch (error) {
      var msg = error && error.message ? error.message : String(error);
      if (msg.indexOf("Extension context invalidated") !== -1) {
        setStatus("扩展上下文已失效，请刷新页面");
      } else {
        setStatus("刷新失败");
      }
      console.error("[ACB][floating-console] refresh failed", error);
    }

    // Always render with whatever data we loaded, even on partial failure
    try {
      renderFloatingChannelList();
      renderFloatingFeedback();
      loadBridgeStatusFromStorage();
      loadTaskCardReviewFromStorage();
      loadExecutionInboxFromStorage();
      loadPreExecutionHandoffFromStorage();
      loadManualExecutionReportFromStorage();
      loadProjectStatusFromStorage();
      loadReadinessFromStorage();
    } catch (_renderErr) {
      // Silently ignore render errors during degraded state
    }
  }

  async function testLocalBridge() {
    console.log("[ACB Bridge] button clicked — sending ACB_BRIDGE_HEALTH");
    setUnifiedActionFeedback("Bridge 刷新", "Bridge 刷新中...", "info", "正在检测本地 Bridge 健康状态");
    setBridgeStatus("检测中...", "#6b7280");
    setBridgeTimestamp("-");
    setBridgeDetail("");
    clearBridgeDataFields();
    var detailPre = document.getElementById("acb-bridge-detail-pre");
    if (detailPre) { detailPre.style.display = "none"; }

    try {
      var result = await chrome.runtime.sendMessage({ type: "ACB_BRIDGE_HEALTH", timeout: 5000 });
      console.log("[ACB Bridge] response received ok=" + result.ok + " status=" + result.status);
      setBridgeTimestamp(new Date().toISOString());

      if (result.ok) {
        setBridgeStatus("已连接", "#16a34a");
        setBridgeDetail(JSON.stringify(result.data, null, 2));
        setBridgeDataFields(result.data);
        setUnifiedActionFeedback("Bridge 刷新", "Bridge 状态已刷新。", "success", "已连接");
      } else {
        setBridgeStatus("连接失败", "#dc2626");
        setBridgeDetail((result.error || "Unknown error") + (result.detail ? "\n" + result.detail : ""));
        clearBridgeDataFields();
        setUnifiedActionFeedback("Bridge 刷新", "Bridge 刷新失败。", "error", result.error || "Unknown error");
      }

      var entry = {
        timestamp: new Date().toISOString(),
        ok: result.ok,
        status: result.status,
        error: result.error || null,
        data: result.data || null
      };
      await globalThis.AcbStorage.setLocalBridgeLatest(entry);
      floatingBridgeLatest = entry;
      renderTopOverview();
      renderToolEndpointCards();
    } catch (err) {
      console.error("[ACB Bridge] sendMessage failed: " + (err.message || String(err)));
      setBridgeTimestamp(new Date().toISOString());
      setBridgeStatus("错误", "#dc2626");
      setBridgeDetail(err.message || String(err));
      clearBridgeDataFields();
      setUnifiedActionFeedback("Bridge 刷新", "Bridge 刷新失败。", "error", err.message || String(err));
      var errEntry = {
        timestamp: new Date().toISOString(),
        ok: false,
        error: err.message || String(err),
        data: null
      };
      await globalThis.AcbStorage.setLocalBridgeLatest(errEntry);
      floatingBridgeLatest = errEntry;
      renderTopOverview();
      renderToolEndpointCards();
    }
  }

  function loadBridgeStatusFromStorage() {
    globalThis.AcbStorage.getLocalBridgeLatest().then(function (entry) {
      floatingBridgeLatest = entry || null;
      if (!entry) {
        setBridgeStatus("未检测", "#6b7280");
        setBridgeTimestamp("-");
        renderTopOverview();
        renderToolEndpointCards();
        return;
      }
      setBridgeTimestamp(entry.timestamp || "-");
      if (entry.ok) {
        setBridgeStatus("已连接", "#16a34a");
        setBridgeDetail(entry.data ? JSON.stringify(entry.data, null, 2) : "");
        setBridgeDataFields(entry.data);
      } else {
        setBridgeStatus("未连接", "#dc2626");
        setBridgeDetail(entry.error || "");
        clearBridgeDataFields();
      }
      renderTopOverview();
      renderToolEndpointCards();
    }).catch(function () {
      floatingBridgeLatest = null;
      setBridgeStatus("未检测", "#6b7280");
      setBridgeTimestamp("-");
      renderTopOverview();
      renderToolEndpointCards();
    });
  }

  function loadTaskCardReviewFromStorage() {
    globalThis.AcbStorage.getLocalBridgeTaskCardReviewLatest().then(function (entry) {
      floatingTaskCardReviewLatest = entry || null;
      if (!entry) {
        setEl("acb-task-card-review-accepted", "false");
        setEl("acb-task-card-review-task-card-id", "-");
        setEl("acb-task-card-review-target", "-");
        setEl("acb-task-card-review-context-id", "-");
        setEl("acb-task-card-review-error", "-");
        setEl("acb-task-card-review-sent-at", "-");
        setTaskCardReviewBridgeStatus("尚未发送任务卡审查数据。", "#6b7280");
        renderToolEndpointCards();
        return;
      }

      setEl("acb-task-card-review-accepted", String(Boolean(entry.accepted)));
      setEl("acb-task-card-review-task-card-id", entry.taskCardId || "-");
      setEl("acb-task-card-review-target", entry.target || "-");
      setEl("acb-task-card-review-context-id", entry.contextId || "-");
      setEl("acb-task-card-review-error", entry.error || "-");
      setEl("acb-task-card-review-sent-at", entry.timestamp || "-");

      if (entry.ok && entry.accepted) {
        setTaskCardReviewBridgeStatus("最近一次发送成功。", "#16a34a");
      } else if (!entry.ok) {
        setTaskCardReviewBridgeStatus("最近一次发送失败。", "#dc2626");
      } else {
        setTaskCardReviewBridgeStatus("最近一次发送未被接受。", "#ea580c");
      }
      renderToolEndpointCards();
    }).catch(function () {
      floatingTaskCardReviewLatest = null;
      setTaskCardReviewBridgeStatus("任务卡审查发送状态读取失败。", "#dc2626");
      renderToolEndpointCards();
    });
  }

  function loadExecutionInboxFromStorage() {
    globalThis.AcbStorage.getLocalBridgeExecutionInboxLatest().then(function (entry) {
      floatingExecutionInboxLatest = entry || null;
      if (!entry) {
        setEl("acb-execution-inbox-accepted", "false");
        setEl("acb-execution-inbox-item-id", "-");
        setEl("acb-execution-inbox-task-card-id", "-");
        setEl("acb-execution-inbox-target", "-");
        setEl("acb-execution-inbox-context-id", "-");
        setEl("acb-execution-inbox-status", "-");
        setEl("acb-execution-inbox-error", "-");
        setEl("acb-execution-inbox-sent-at", "-");
        renderToolEndpointCards();
        renderActionStepsSection();
        return;
      }

      setEl("acb-execution-inbox-accepted", String(Boolean(entry.accepted)));
      setEl("acb-execution-inbox-item-id", entry.inboxItemId || "-");
      setEl("acb-execution-inbox-task-card-id", entry.taskCardId || "-");
      setEl("acb-execution-inbox-target", entry.target || "-");
      setEl("acb-execution-inbox-context-id", entry.contextId || "-");
      setEl("acb-execution-inbox-status", entry.status || "-");
      setEl("acb-execution-inbox-error", entry.error || (Array.isArray(entry.rejectReasons) ? entry.rejectReasons.join(", ") : "-"));
      setEl("acb-execution-inbox-sent-at", entry.timestamp || "-");
      renderToolEndpointCards();
      renderActionStepsSection();
    }).catch(function () {
      floatingExecutionInboxLatest = null;
      setEl("acb-execution-inbox-status", "read_failed");
      renderToolEndpointCards();
      renderActionStepsSection();
    });
  }

  function loadPreExecutionHandoffFromStorage() {
    if (!globalThis.AcbStorage || !globalThis.AcbStorage.getLocalBridgePreExecutionHandoffLatest) {
      preExecutionHandoffStorageLoaded = true;
      floatingPreExecutionHandoffLatest = null;
      return;
    }
    globalThis.AcbStorage.getLocalBridgePreExecutionHandoffLatest().then(function (entry) {
      floatingPreExecutionHandoffLatest = entry || null;
      preExecutionHandoffStorageLoaded = true;
      renderActionStepsSection();
    }).catch(function () {
      floatingPreExecutionHandoffLatest = null;
      preExecutionHandoffStorageLoaded = true;
    });
  }

  function loadManualExecutionReportFromStorage() {
    if (!globalThis.AcbStorage || !globalThis.AcbStorage.getLocalBridgeManualExecutionReportLatest) {
      floatingManualExecutionReportLatest = null;
      return;
    }
    globalThis.AcbStorage.getLocalBridgeManualExecutionReportLatest().then(function (entry) {
      floatingManualExecutionReportLatest = entry || null;
      renderActionStepsSection();
    }).catch(function () {
      floatingManualExecutionReportLatest = null;
    });
  }

  function setBridgeStatus(text, color) {
    var el = document.getElementById("acb-bridge-status");
    if (el) { el.textContent = text; el.style.color = color; }
  }

  function setBridgeTimestamp(text) {
    var el = document.getElementById("acb-bridge-timestamp");
    if (el) { el.textContent = text; }
  }

  function setBridgeDetail(text) {
    var el = document.getElementById("acb-bridge-detail");
    var pre = document.getElementById("acb-bridge-detail-pre");
    if (el) {
      el.textContent = text ? (text.length > 120 ? text.substring(0, 120) + "..." : text) : "-";
    }
    if (pre) {
      if (text) {
        pre.textContent = text;
        pre.style.display = "block";
      } else {
        pre.style.display = "none";
      }
    }
  }

  function setBridgeDataFields(data) {
    if (data && typeof data === "object") {
      setEl("acb-bridge-version", data.version || "-");
      setEl("acb-bridge-no-auto-dispatch", String(data.noAutoDispatch));
      setEl("acb-bridge-no-command-exec", String(data.noCommandExecution));
    } else {
      clearBridgeDataFields();
    }
  }

  function clearBridgeDataFields() {
    setEl("acb-bridge-version", "-");
    setEl("acb-bridge-no-auto-dispatch", "-");
    setEl("acb-bridge-no-command-exec", "-");
  }

  // --- Local Project Status ---

  function normalizeProjectStatusResponse(bridgeJson) {
    // bridgeJson is the raw response from GET /acb/v1/project-status.
    // Normalize into a consistent internal shape regardless of nesting.
    var normalized = {
      detected: false,
      ok: false,
      result: "missing",
      bridge: null,
      safety: { noAutoDispatch: true, noCommandExecution: true },
      projectStatus: null,
      diagnostics: null,
      error: "",
      generatedAt: ""
    };

    if (!bridgeJson || typeof bridgeJson !== "object") {
      return normalized;
    }

    // Shape A: { ok: true, bridge: {...}, safety: {...}, projectStatus: {...}, ... }
    // Shape C: { ok: false, bridge: {...}, safety: {...}, projectStatus: null, error: "...", ... }
    // Shape B: { status: "ok", projectStatus: {...}, noAutoDispatch: true, noCommandExecution: true, ... }
    var innerOk = bridgeJson.ok;
    if (typeof innerOk !== "boolean") {
      innerOk = bridgeJson.status === "ok";
    }

    normalized.bridge = bridgeJson.bridge || null;
    normalized.generatedAt = bridgeJson.generatedAt || "";
    normalized.error = bridgeJson.error || "";
    normalized.diagnostics = bridgeJson.diagnostics || null;

    // Safety fields
    if (bridgeJson.safety && typeof bridgeJson.safety === "object") {
      normalized.safety.noAutoDispatch = bridgeJson.safety.noAutoDispatch === true;
      normalized.safety.noCommandExecution = bridgeJson.safety.noCommandExecution === true;
    } else if (typeof bridgeJson.noAutoDispatch === "boolean") {
      normalized.safety.noAutoDispatch = bridgeJson.noAutoDispatch === true;
      normalized.safety.noCommandExecution = bridgeJson.noCommandExecution === true;
    }

    if (innerOk && bridgeJson.projectStatus && typeof bridgeJson.projectStatus === "object") {
      normalized.detected = true;
      normalized.ok = true;
      normalized.result = "ok";
      normalized.projectStatus = bridgeJson.projectStatus;
    } else if (!innerOk || !bridgeJson.projectStatus) {
      normalized.detected = false;
      normalized.ok = false;
      normalized.result = bridgeJson.error ? "error" : "missing";
    }

    return normalized;
  }

  function parseTimestamp(value) {
    if (!value || typeof value !== "string") { return null; }
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) { return null; }
      return d;
    } catch (_) {
      return null;
    }
  }

  /**
   * ProjectStatus is stale when:
   *  - missing generatedAt
   *  - generatedAt cannot be parsed
   *  - generatedAt is older than FRESHNESS_WINDOW_MS (default 10 min) relative to now
   *  - projectStatus itself is null/undefined
   */
  var PROJECT_STATUS_FRESHNESS_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  function deriveProjectStatusFreshness(projectStatus, now) {
    now = now || new Date();
    if (!projectStatus) {
      return { fresh: false, stale: true, reason: "project_status_missing", generatedAt: null, generatedAtParsed: null, ageMs: null };
    }
    var raw = projectStatus.generatedAt;
    if (!raw || typeof raw !== "string") {
      return { fresh: false, stale: true, reason: "generated_at_missing", generatedAt: raw || null, generatedAtParsed: null, ageMs: null };
    }
    var ts = parseTimestamp(raw);
    if (!ts) {
      return { fresh: false, stale: true, reason: "generated_at_unparseable", generatedAt: raw, generatedAtParsed: null, ageMs: null };
    }
    var ageMs = now.getTime() - ts.getTime();
    var stale = ageMs > PROJECT_STATUS_FRESHNESS_WINDOW_MS;
    return {
      fresh: !stale,
      stale: stale,
      reason: stale ? "generated_at_exceeds_freshness_window" : "fresh",
      generatedAt: raw,
      generatedAtParsed: ts.toISOString(),
      ageMs: ageMs
    };
  }

  function isProjectStatusStale(projectStatus, now) {
    return deriveProjectStatusFreshness(projectStatus, now).stale;
  }

  async function testProjectStatus() {
    console.log("[ACB Bridge] project status button clicked — sending ACB_BRIDGE_PROJECT_STATUS");
    setProjectStatusResult("检测中...", "#6b7280");
    clearProjectStatusFields();

    try {
      var result = await chrome.runtime.sendMessage({ type: "ACB_BRIDGE_PROJECT_STATUS", timeout: 5000 });
      console.log("[ACB Bridge] project status response received ok=" + result.ok + " status=" + result.status);

      if (!result.ok) {
        setProjectStatusResult("获取失败", "#dc2626");
        setProjectStatusError(result.error || "Unknown error");
        return;
      }

      var bridgeJson = result.data || result;
      var ns = normalizeProjectStatusResponse(bridgeJson);
      floatingProjectStatusLatest = {
        timestamp: new Date().toISOString(),
        ok: result.ok,
        status: result.status,
        error: result.error || null,
        data: bridgeJson
      };
      renderNormalizedProjectStatus(ns);
      renderTopOverview();
      // Clear loading state after successful render
      if (ns.detected && ns.ok) {
        setProjectStatusResult("正常", "#16a34a");
      } else {
        setProjectStatusResult("获取失败", "#dc2626");
        if (ns.error) {
          setProjectStatusError(ns.error);
        }
      }
    } catch (err) {
      console.error("[ACB Bridge] project status sendMessage failed: " + (err.message || String(err)));
      setProjectStatusResult("错误", "#dc2626");
      setProjectStatusError(err.message || String(err));
    }
  }

  function loadProjectStatusFromStorage() {
    globalThis.AcbStorage.getLocalBridgeProjectStatusLatest().then(function (entry) {
      floatingProjectStatusLatest = entry || null;
      if (!entry || !entry.data) {
        setProjectStatusResult("未检测", "#6b7280");
        clearProjectStatusFields();
        renderTopOverview();
        return;
      }

      var bridgeJson = entry.data;
      var ns = normalizeProjectStatusResponse(bridgeJson);
      if (ns.detected) {
        setProjectStatusResult("已缓存", "#16a34a");
      } else if (ns.result === "error") {
        setProjectStatusResult("获取失败", "#dc2626");
      } else {
        setProjectStatusResult("未检测", "#6b7280");
      }
      renderNormalizedProjectStatus(ns);
      renderTopOverview();
    }).catch(function () {
      floatingProjectStatusLatest = null;
      setProjectStatusResult("未检测", "#6b7280");
      clearProjectStatusFields();
      renderTopOverview();
    });
  }

  function setProjectStatusResult(text, color) {
    var el = document.getElementById("acb-project-status-result");
    if (el) { el.textContent = text; el.style.color = color; }
  }

  function renderNormalizedProjectStatus(ns) {
    if (!ns) {
      clearProjectStatusFields();
      return;
    }

    if (ns.detected && ns.projectStatus) {
      var ps = ns.projectStatus;
      setEl("acb-project-status-path", ps.projectPath || "-");
      setEl("acb-project-status-workspace-name", ps.workspaceName || "-");
      setEl("acb-project-status-git-root", ps.gitRoot || "-");
      setEl("acb-project-status-git-available", String(ps.gitAvailable));
      setEl("acb-project-status-branch", ps.branch || "-");
      setEl("acb-project-status-commit", ps.currentCommit || "-");
      setEl("acb-project-status-latest-commit", ps.latestCommit || "-");
      setEl("acb-project-status-working-tree", ps.workingTree || "-");
      setEl("acb-project-status-changed-files", String(ps.changedFiles || 0));
      setEl("acb-project-status-staged-files", String(ps.stagedFiles || 0));
      setEl("acb-project-status-untracked-files", String(ps.untrackedFiles || 0));
      setEl("acb-project-status-generated-at", ps.generatedAt || "-");
      setEl("acb-project-status-bridge-generated-at", ns.generatedAt || "-");
      setEl("acb-project-status-safety-no-auto", String(ns.safety.noAutoDispatch));
      setEl("acb-project-status-safety-no-cmd", String(ns.safety.noCommandExecution));
      var errEl = document.getElementById("acb-project-status-error");
      if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
    } else {
      clearProjectStatusFields();
      setProjectStatusError(ns.error || (ns.result === "missing" ? "项目状态数据不可用。" : ""));
      setEl("acb-project-status-bridge-generated-at", ns.generatedAt || "-");
      setEl("acb-project-status-safety-no-auto", String(ns.safety.noAutoDispatch));
      setEl("acb-project-status-safety-no-cmd", String(ns.safety.noCommandExecution));
    }
  }

  function setProjectStatusError(errorText) {
    var errEl = document.getElementById("acb-project-status-error");
    if (errEl) {
      errEl.textContent = errorText || "";
      errEl.style.display = errorText ? "block" : "none";
    }
  }

  function clearProjectStatusFields() {
    setEl("acb-project-status-path", "-");
    setEl("acb-project-status-workspace-name", "-");
    setEl("acb-project-status-git-root", "-");
    setEl("acb-project-status-git-available", "-");
    setEl("acb-project-status-branch", "-");
    setEl("acb-project-status-commit", "-");
    setEl("acb-project-status-latest-commit", "-");
    setEl("acb-project-status-working-tree", "-");
    setEl("acb-project-status-changed-files", "-");
    setEl("acb-project-status-staged-files", "-");
    setEl("acb-project-status-untracked-files", "-");
    setEl("acb-project-status-generated-at", "-");
    setEl("acb-project-status-bridge-generated-at", "-");
    setEl("acb-project-status-safety-no-auto", "-");
    setEl("acb-project-status-safety-no-cmd", "-");
    var errEl = document.getElementById("acb-project-status-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.style.display = "none";
    }
  }

  // --- Preflight Payload ---

  async function testPreflightPayload(step, contextOverride) {
    if (!step || !step.fullTaskCard || step.payloadStatus !== "complete") {
      setPreflightHint("当前步骤无完整任务卡，无法进行本地预检。");
      clearPreflightFields();
      var preflightNone = document.getElementById("acb-preflight-last-checked");
      if (preflightNone) {
        preflightNone.textContent = "最近检查: 未运行";
      }
      return;
    }

    console.log("[ACB Bridge] preflight button clicked for step, target=" + (step.target || "unknown"));
    setPreflightButtonBusy(true);
    setPreflightStatus("检测中...", "#6b7280");
    clearPreflightFields();
    setPreflightHint("");
    var checkedAt = new Date().toISOString();

    try {
      var ctx = contextOverride || getActiveExecutionContext();
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_PREFLIGHT_PAYLOAD",
        timeout: 10000,
        targetAgent: step.target || "unknown",
        fullTaskCard: step.fullTaskCard,
        selectedStep: {
          stepIndex: step.order || 1,
          target: step.target || "unknown",
          payloadStatus: step.payloadStatus || "not_applicable"
        },
        // Context metadata for context binding
        contextId: ctx.contextId,
        feedbackHash: ctx.feedbackHash,
        channelId: ctx.channelId,
        actionStepIndex: ctx.actionStepIndex,
        taskCardId: ctx.taskCardId || (step.payloadValidation ? step.payloadValidation.taskCardId || "" : ""),
        target: ctx.target || step.target || ""
      });

      console.log("[ACB Bridge] preflight response received ok=" + result.ok);

      if (result.ok && result.data) {
        floatingPreflightLatest = {
          ok: true,
          data: result.data,
          timestamp: new Date().toISOString(),
          contextId: ctx.contextId,
          taskCardId: ctx.taskCardId
        };
        setPreflightFields(result.data, ctx);
      } else {
        floatingPreflightLatest = {
          ok: false,
          error: result.error || "Unknown error",
          data: result.data || null,
          timestamp: new Date().toISOString(),
          contextId: ctx.contextId,
          taskCardId: ctx.taskCardId
        };
        var errMsg = (result.data && result.data.preflight && result.data.preflight.checks)
          ? result.data.preflight.checks.filter(function (c) { return c.status === "fail"; }).map(function (c) { return c.message; }).join("; ")
          : (result.error || "Unknown error");
        setPreflightStatus("失败", "#dc2626");
        setPreflightHint("预检失败: " + errMsg);
      }
    } catch (err) {
      console.error("[ACB Bridge] preflight sendMessage failed: " + (err.message || String(err)));
      floatingPreflightLatest = { ok: false, error: err.message || String(err), timestamp: new Date().toISOString() };
      setPreflightStatus("错误", "#dc2626");
      setPreflightHint(err.message || String(err));
    } finally {
      setPreflightButtonBusy(false);
      var checkedEl = document.getElementById("acb-preflight-last-checked");
      if (checkedEl) {
        checkedEl.textContent = "最近检查: " + checkedAt;
      }
      renderTopOverview();
      syncPreflightCardButton();
    }
  }

  async function runUnifiedSendabilityCheck(step) {
    if (!step) {
      setUnifiedActionFeedback("检查可发送状态", "未找到当前步骤。", "error", "请先生成并选择任务步骤。");
      return;
    }
    var stepCtx = getExecutionContextForStep(step);
    if (!stepCtx.hasCompleteTaskCard) {
      setUnifiedActionFeedback(
        "检查可发送状态",
        "不可发送：当前步骤缺少完整任务卡或载荷未完成。",
        "error",
        "payloadStatus=" + (step.payloadStatus || "unknown") + "，reason=" + (stepCtx.reason || "unknown")
      );
      return;
    }

    setUnifiedActionFeedback("检查可发送状态", "正在预检任务卡...", "info", "步骤 " + (step.order || "?") + " · target=" + (step.target || "unknown"));
    await testPreflightPayload(step, stepCtx);

    setUnifiedActionFeedback("检查可发送状态", "正在检查本地项目与安全状态...", "info", "contextId=" + stepCtx.contextId);
    await testReadinessGate(stepCtx);

    var preflightStatus = "not_run";
    var preflightMatched = false;
    if (floatingPreflightLatest && floatingPreflightLatest.data && floatingPreflightLatest.data.preflight) {
      preflightMatched = preflightMatchesContext(floatingPreflightLatest, stepCtx);
      preflightStatus = preflightMatched ? (floatingPreflightLatest.data.preflight.status || "unknown") : "stale";
    }

    var readinessStatus = "not_run";
    var readinessMatched = false;
    var blockingReasons = [];
    var warningReasons = [];
    if (floatingReadinessLatest && floatingReadinessLatest.data && floatingReadinessLatest.data.readiness) {
      var rd = floatingReadinessLatest.data.readiness;
      readinessStatus = rd.status || "unknown";
      readinessMatched = Boolean(stepCtx.contextId && rd.requestContextId && rd.requestContextId === stepCtx.contextId);
      blockingReasons = Array.isArray(rd.blockingReasons) ? rd.blockingReasons : [];
      warningReasons = Array.isArray(rd.warningReasons) ? rd.warningReasons : [];
    }

    var hardBlocks = [];
    var softWarnings = [];
    if (!preflightMatched) {
      softWarnings.push("预检结果与当前上下文不匹配");
    } else if (preflightStatus === "fail" || preflightStatus === "error") {
      hardBlocks.push("任务卡预检未通过");
    }
    if (!readinessMatched) {
      softWarnings.push("readiness 结果与当前上下文不匹配");
    } else if (readinessStatus === "blocked" || readinessStatus === "error" || readinessStatus === "not_run") {
      hardBlocks.push("执行准备状态未通过");
    }
    if (blockingReasons.length > 0) {
      hardBlocks = hardBlocks.concat(blockingReasons);
    }

    if (hardBlocks.length > 0) {
      setUnifiedActionFeedback(
        "检查可发送状态",
        "不可发送：存在阻断项。",
        "error",
        hardBlocks.join("；")
      );
      return;
    }

    var warns = [];
    if (preflightStatus === "warn") {
      warns.push("任务卡预检存在警告");
    }
    if (readinessStatus === "warning") {
      warns.push("readiness 存在警告");
    }
    if (warningReasons.length > 0) {
      warns = warns.concat(warningReasons);
    }

    if (warns.length > 0) {
      setUnifiedActionFeedback(
        "检查可发送状态",
        "警告：建议检查后再发送。",
        "warning",
        warns.join("；")
      );
      return;
    }

    if (softWarnings.length > 0) {
      setUnifiedActionFeedback(
        "检查可发送状态",
        "警告：当前使用的是过期缓存结果，请刷新后再检查。",
        "warning",
        softWarnings.join("；")
      );
      return;
    }

    setUnifiedActionFeedback(
      "检查可发送状态",
      "可发送到 VS Code 查看端：任务卡完整、上下文匹配且安全锁保持只读。",
      "success",
      "preflight=pass，readiness=ready"
    );
  }

  function setPreflightFields(data, ctxOverride) {
    var pf = data.preflight || {};
    var pc = data.projectComparison;
    var sf = data.safety || {};

    var statusLabel = pf.status || "unknown";
    var statusColor = statusLabel === "pass" ? "#16a34a" : (statusLabel === "warn" ? "#ea580c" : "#dc2626");
    setPreflightStatus(statusLabel, statusColor);

    setEl("acb-preflight-task-card-id", pf.taskCardId || "-");
    setEl("acb-preflight-target", pf.target || "-");
    setEl("acb-preflight-start-detected", String(pf.taskCardStartDetected));
    setEl("acb-preflight-end-detected", String(pf.taskCardEndDetected));
    setEl("acb-preflight-id-matched", String(pf.taskCardIdMatched));
    setEl("acb-preflight-target-matched", String(pf.targetMatched));
    setEl("acb-preflight-missing-fields", pf.requiredFieldsMissing && pf.requiredFieldsMissing.length > 0 ? pf.requiredFieldsMissing.join(", ") : "无");
    setEl("acb-preflight-exec-allowed", String(sf.executionAllowed));
    setEl("acb-preflight-agent-allowed", String(sf.agentDispatchAllowed));
    setEl("acb-preflight-git-allowed", String(sf.gitWriteAllowed));
    setEl("acb-preflight-generated-at", data.generatedAt || "-");

    if (pc) {
      var psForPf = normalizeProjectStatusResponse(floatingProjectStatusLatest && floatingProjectStatusLatest.data ? floatingProjectStatusLatest.data : null);
      var psPfFresh = deriveProjectStatusFreshness(psForPf.projectStatus);
      setEl("acb-preflight-dir-matched", String(pc.projectDirMatched));
      setEl("acb-preflight-branch-matched", String(pc.branchMatched));
      if (psPfFresh.stale && !pc.currentCommitMatched) {
        setEl("acb-preflight-commit-matched", "unknown (ps_stale)");
        setEl("acb-preflight-commit-match-note", "Project Status is stale. Refresh and re-run preflight.");
      } else {
        setEl("acb-preflight-commit-matched", String(pc.currentCommitMatched));
        setEl("acb-preflight-commit-match-note", "");
      }
      setEl("acb-preflight-working-tree", (pc.workingTree || "") + " (changed: " + String(pc.changedFiles || 0) + ")");
    } else {
      setEl("acb-preflight-dir-matched", "-");
      setEl("acb-preflight-branch-matched", "-");
      setEl("acb-preflight-commit-matched", "-");
      setEl("acb-preflight-working-tree", "-");
    }

    // Context binding fields
    var ctx = getActiveExecutionContext();
    setEl("acb-preflight-context-matched", String(true));  // just set from active preflight call
    setEl("acb-preflight-stale-ignored", "false");
    setEl("acb-preflight-ctx-task-card-id", ctx.taskCardId || "无");
    setEl("acb-preflight-ctx-payload-status", ctx.payloadStatus);

    var hint = "";
    if (statusLabel === "fail") {
      var failChecks = pf.checks ? pf.checks.filter(function (c) { return c.status === "fail"; }) : [];
      hint = "预检失败: " + failChecks.map(function (c) { return c.message; }).join("; ");
    } else if (statusLabel === "warn") {
      var warnMsgs = [];
      if (pc && Array.isArray(pc.warnings)) { warnMsgs = pc.warnings; }
      hint = "预检通过但有警告: " + (warnMsgs.length > 0 ? warnMsgs.join("; ") : "project comparison mismatch");
    } else {
      hint = "预检通过。任务卡结构完整，项目状态匹配。";
    }
    setPreflightHint(hint);
  }

  function setPreflightStatus(text, color) {
    var el = document.getElementById("acb-preflight-status");
    if (el) { el.textContent = text; el.style.color = color; }
  }

  function setPreflightHint(text) {
    var el = document.getElementById("acb-preflight-hint");
    if (el) { el.textContent = text; }
  }

  function clearPreflightFields() {
    setEl("acb-preflight-status", "-");
    setEl("acb-preflight-task-card-id", "-");
    setEl("acb-preflight-target", "-");
    setEl("acb-preflight-start-detected", "-");
    setEl("acb-preflight-end-detected", "-");
    setEl("acb-preflight-id-matched", "-");
    setEl("acb-preflight-target-matched", "-");
    setEl("acb-preflight-missing-fields", "-");
    setEl("acb-preflight-dir-matched", "-");
    setEl("acb-preflight-branch-matched", "-");
    setEl("acb-preflight-commit-matched", "-");
    setEl("acb-preflight-working-tree", "-");
    setEl("acb-preflight-exec-allowed", "false");
    setEl("acb-preflight-agent-allowed", "false");
    setEl("acb-preflight-git-allowed", "false");
    setEl("acb-preflight-generated-at", "-");
    setEl("acb-preflight-context-matched", "-");
    setEl("acb-preflight-stale-ignored", "-");
    setEl("acb-preflight-ctx-task-card-id", "-");
    setEl("acb-preflight-ctx-payload-status", "-");
    var statusEl = document.getElementById("acb-preflight-status");
    if (statusEl) { statusEl.style.color = "#6b7280"; }
  }

  // ─── Readiness Gate ────────────────────────────────────────────────

  async function testReadinessGate(contextOverride) {
    console.log("[ACB Bridge] readiness gate button clicked — sending ACB_BRIDGE_READINESS_GATE");
    setReadinessButtonBusy(true);
    setReadinessStatus("检测中...", "#6b7280");
    clearReadinessFields();
    setReadinessHint("");
    var checkedAt = new Date().toISOString();

    var ctx = contextOverride || getActiveExecutionContext();
    console.log("[ACB Bridge] readiness context: contextId=" + ctx.contextId + " taskCardId=" + ctx.taskCardId + " hasCompleteTaskCard=" + ctx.hasCompleteTaskCard);
    if (!floatingPreflightLatest || !floatingPreflightLatest.data || !floatingPreflightLatest.data.preflight) {
      setReadinessHint("当前上下文尚未执行 Payload Preflight，建议先执行预检。");
    } else if (!preflightMatchesContext(floatingPreflightLatest, ctx)) {
      setReadinessHint("当前上下文的预检结果已过期，请先重新执行 Payload Preflight。");
    }

    try {
      var result = await chrome.runtime.sendMessage({
        type: "ACB_BRIDGE_READINESS_GATE",
        timeout: 5000,
        contextId: ctx.contextId,
        taskCardId: ctx.taskCardId,
        hasCurrentPayload: ctx.hasCompleteTaskCard
      });
      console.log("[ACB Bridge] readiness response received ok=" + result.ok);

      if (result.ok && result.data) {
        floatingReadinessLatest = {
          ok: true,
          data: result.data,
          timestamp: new Date().toISOString(),
          contextId: ctx.contextId,
          taskCardId: ctx.taskCardId
        };
        setReadinessFields(result.data, ctx);
      } else {
        floatingReadinessLatest = {
          ok: false,
          error: result.error || "Unknown error",
          timestamp: new Date().toISOString(),
          contextId: ctx.contextId,
          taskCardId: ctx.taskCardId
        };
        setReadinessStatus("错误", "#dc2626");
        setReadinessHint((result.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[ACB Bridge] readiness sendMessage failed: " + (err.message || String(err)));
      floatingReadinessLatest = {
        ok: false,
        error: err.message || String(err),
        timestamp: new Date().toISOString(),
        contextId: ctx.contextId,
        taskCardId: ctx.taskCardId
      };
      setReadinessStatus("错误", "#dc2626");
      setReadinessHint(err.message || String(err));
    } finally {
      setReadinessButtonBusy(false);
      var checkedEl = document.getElementById("acb-readiness-last-checked");
      if (checkedEl) {
        checkedEl.textContent = "最近检查: " + checkedAt;
      }
      renderTopOverview();
    }
  }

  function loadReadinessFromStorage() {
    globalThis.AcbStorage.getLocalBridgeReadinessLatest().then(function (entry) {
      floatingReadinessLatest = entry || null;
      var ctx = getActiveExecutionContext();
      if (!entry || !entry.data) {
        if (!ctx.hasCompleteTaskCard) {
          // No complete task card → blocked
          setNoTaskCardBlockedReadiness();
        } else {
          setReadinessStatus("未检测", "#6b7280");
          clearReadinessFields();
        }
        return;
      }
      if (entry.ok && entry.data) {
        // Check if cached readiness matches current context
        var rd = entry.data.readiness || {};
        var cachedCtxId = rd.requestContextId || "";
        var currentCtxId = ctx.contextId;
        if (cachedCtxId && currentCtxId && cachedCtxId !== currentCtxId) {
          if (!ctx.hasCompleteTaskCard) {
            // Stale readiness + no complete task card → blocked
            setNoTaskCardBlockedReadiness();
            setReadinessHint("(来自缓存 — 上下文已变更，当前无完整任务卡)");
          } else {
            setReadinessStatus("未检测", "#6b7280");
            clearReadinessFields();
            setReadinessHint("(来自缓存 — 上下文已变更，请重新检查)");
          }
          return;
        }
        setReadinessFields(entry.data, ctx);
        setReadinessHint("(来自缓存)");
      } else {
        setReadinessStatus("获取失败", "#dc2626");
        clearReadinessFields();
      }
    }).catch(function () {
      floatingReadinessLatest = null;
      var ctx = getActiveExecutionContext();
      if (!ctx.hasCompleteTaskCard) {
        setNoTaskCardBlockedReadiness();
      } else {
        setReadinessStatus("未检测", "#6b7280");
        clearReadinessFields();
      }
    });
  }

  function setNoTaskCardBlockedReadiness() {
    setReadinessStatus("blocked", "#dc2626");
    setEl("acb-readiness-summary", "Execution blocked. No complete task card in current context.");
    setEl("acb-readiness-blocking", "当前无完整任务卡，不能进入执行准备检查。");
    setEl("acb-readiness-warnings", "无");
    setEl("acb-readiness-bridge-connected", "-");
    setEl("acb-readiness-ps-available", "-");
    setEl("acb-readiness-pf-available", "false");
    setEl("acb-readiness-pf-status", "not_run");
    setEl("acb-readiness-task-card-id", "-");
    setEl("acb-readiness-target", "-");
    setEl("acb-readiness-fields-present", "-");
    setEl("acb-readiness-dir-matched", "-");
    setEl("acb-readiness-branch-matched", "-");
    setEl("acb-readiness-commit-matched", "-");
    setEl("acb-readiness-working-tree", "-");
    setEl("acb-readiness-changed-files", "-");
    setEl("acb-readiness-ctx-id", "-");
    setEl("acb-readiness-ctx-task-card-id", "none");
    setEl("acb-readiness-ctx-payload-status", "unknown");
    setEl("acb-readiness-has-current-payload", "false");
    setEl("acb-readiness-ctx-matched", "false");
    setEl("acb-readiness-exec-allowed", "false");
    setEl("acb-readiness-agent-allowed", "false");
    setEl("acb-readiness-git-allowed", "false");
    setEl("acb-readiness-no-auto", "true");
    setEl("acb-readiness-no-cmd", "true");
    setEl("acb-readiness-generated-at", "-");
    setReadinessHint("阻断: 当前无完整任务卡，不能进入执行准备检查。");
  }

  function setReadinessFields(data, ctx) {
    var rd = data.readiness || {};
    var sf = data.safety || {};
    var pc = rd.projectComparison;

    var statusLabel = rd.status || "unknown";
    var statusColor = statusLabel === "ready" ? "#16a34a" : (statusLabel === "warning" ? "#ea580c" : "#dc2626");
    setReadinessStatus(statusLabel, statusColor);

    // Context binding fields
    if (ctx) {
      setEl("acb-readiness-ctx-id", ctx.contextId);
      setEl("acb-readiness-ctx-task-card-id", ctx.taskCardId || "none");
      setEl("acb-readiness-ctx-payload-status", ctx.payloadStatus);
      setEl("acb-readiness-has-current-payload", String(ctx.hasCompleteTaskCard));
      var ctxMatched = !rd.preflightContextMismatch && rd.preflightAvailable;
      setEl("acb-readiness-ctx-matched", String(ctxMatched));
    }

    setEl("acb-readiness-summary", rd.summary || "-");
    setEl("acb-readiness-blocking", rd.blockingReasons && rd.blockingReasons.length > 0 ? rd.blockingReasons.join("; ") : "无");
    setEl("acb-readiness-warnings", rd.warningReasons && rd.warningReasons.length > 0 ? rd.warningReasons.join("; ") : "无");
    setEl("acb-readiness-bridge-connected", String(rd.bridgeConnected));
    setEl("acb-readiness-ps-available", String(rd.projectStatusAvailable));
    setEl("acb-readiness-pf-available", String(rd.preflightAvailable));
    setEl("acb-readiness-pf-status", rd.preflightStatus || "-");
    setEl("acb-readiness-task-card-id", rd.taskCardId || "-");
    setEl("acb-readiness-target", rd.target || "-");
    setEl("acb-readiness-fields-present", String(rd.requiredFieldsPresent));
    setEl("acb-readiness-exec-allowed", String(sf.executionAllowed));
    setEl("acb-readiness-agent-allowed", String(sf.agentDispatchAllowed));
    setEl("acb-readiness-git-allowed", String(sf.gitWriteAllowed));
    setEl("acb-readiness-no-auto", String(sf.noAutoDispatch));
    setEl("acb-readiness-no-cmd", String(sf.noCommandExecution));
    setEl("acb-readiness-generated-at", data.generatedAt || "-");

    if (pc) {
      var psForRd = normalizeProjectStatusResponse(floatingProjectStatusLatest && floatingProjectStatusLatest.data ? floatingProjectStatusLatest.data : null);
      var psRdFresh = deriveProjectStatusFreshness(psForRd.projectStatus);
      setEl("acb-readiness-dir-matched", String(pc.projectDirMatched));
      setEl("acb-readiness-branch-matched", String(pc.branchMatched));
      if (psRdFresh.stale && !pc.currentCommitMatched) {
        setEl("acb-readiness-commit-matched", "unknown (ps_stale)");
        setEl("acb-readiness-commit-match-note", "Project Status is stale. Refresh and re-run readiness.");
      } else {
        setEl("acb-readiness-commit-matched", String(pc.currentCommitMatched));
        setEl("acb-readiness-commit-match-note", "");
      }
      setEl("acb-readiness-working-tree", (pc.workingTree || "") + " (changed: " + String(pc.changedFiles || 0) + ")");
      setEl("acb-readiness-changed-files", String(pc.changedFiles || 0));
    } else {
      setEl("acb-readiness-dir-matched", "-");
      setEl("acb-readiness-branch-matched", "-");
      setEl("acb-readiness-commit-matched", "-");
      setEl("acb-readiness-working-tree", "-");
      setEl("acb-readiness-changed-files", "-");
    }

    var hint = "";
    if (statusLabel === "blocked") {
      hint = "阻断: " + (rd.blockingReasons && rd.blockingReasons.length > 0 ? rd.blockingReasons.join("; ") : "未知原因");
    } else if (statusLabel === "warning") {
      hint = "警告: " + (rd.warningReasons && rd.warningReasons.length > 0 ? rd.warningReasons.join("; ") : "项目状态不匹配");
    } else if (statusLabel === "ready") {
      hint = "所有检查通过，任务卡结构完整且项目状态匹配。";
    }
    setReadinessHint(hint);
  }

  function setReadinessStatus(text, color) {
    var el = document.getElementById("acb-readiness-status");
    if (el) { el.textContent = text; el.style.color = color; }
  }

  function setReadinessHint(text) {
    var el = document.getElementById("acb-readiness-hint");
    if (el) { el.textContent = text; }
  }

  function clearReadinessFields() {
    setEl("acb-readiness-status", "-");
    setEl("acb-readiness-summary", "-");
    setEl("acb-readiness-blocking", "-");
    setEl("acb-readiness-warnings", "-");
    setEl("acb-readiness-bridge-connected", "-");
    setEl("acb-readiness-ps-available", "-");
    setEl("acb-readiness-pf-available", "-");
    setEl("acb-readiness-pf-status", "-");
    setEl("acb-readiness-task-card-id", "-");
    setEl("acb-readiness-target", "-");
    setEl("acb-readiness-fields-present", "-");
    setEl("acb-readiness-dir-matched", "-");
    setEl("acb-readiness-branch-matched", "-");
    setEl("acb-readiness-commit-matched", "-");
    setEl("acb-readiness-working-tree", "-");
    setEl("acb-readiness-changed-files", "-");
    setEl("acb-readiness-ctx-id", "-");
    setEl("acb-readiness-ctx-task-card-id", "-");
    setEl("acb-readiness-ctx-payload-status", "-");
    setEl("acb-readiness-has-current-payload", "-");
    setEl("acb-readiness-ctx-matched", "-");
    setEl("acb-readiness-exec-allowed", "false");
    setEl("acb-readiness-agent-allowed", "false");
    setEl("acb-readiness-git-allowed", "false");
    setEl("acb-readiness-no-auto", "true");
    setEl("acb-readiness-no-cmd", "true");
    setEl("acb-readiness-generated-at", "-");
    var statusEl = document.getElementById("acb-readiness-status");
    if (statusEl) { statusEl.style.color = "#6b7280"; }
  }

  function setEl(id, text) {
    var el = document.getElementById(id);
    if (el) { el.textContent = text; }
  }

  function makeActionBtn(text, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.style.cssText = [
      "padding:6px 14px",
      "border:1px solid #bbb",
      "border-radius:4px",
      "background:#fff",
      "cursor:pointer",
      "font-size:12px",
      "font-family:Arial,sans-serif"
    ].join(";");
    btn.addEventListener("click", onClick);
    return btn;
  }

  function addFeedbackRow(container, label, id, mode) {
    var row = document.createElement("p");
    if (mode) {
      row.dataset.acbMode = mode;
    }
    row.style.cssText = "margin:0 0 4px 0;font-size:12px;line-height:1.5;";
    var strong = document.createElement("strong");
    strong.textContent = label + ": ";
    var span = document.createElement("span");
    span.id = id;
    span.textContent = "-";
    row.appendChild(strong);
    row.appendChild(span);
    container.appendChild(row);
  }

  function addSelectOptions(selectEl, pairs) {
    for (var i = 0; i < pairs.length; i += 1) {
      var option = document.createElement("option");
      option.value = pairs[i].value;
      option.textContent = pairs[i].label;
      selectEl.appendChild(option);
    }
  }

  function openReadonlySnapshot() {
    var sourceConsole = document.getElementById("acb-floating-console");
    if (!sourceConsole) {
      alert("ACB 控制台未加载，请先打开控制台。");
      return;
    }

    applyConsoleDisplayMode();

    var clone = sourceConsole.cloneNode(true);

    clone.style.display = "flex";
    clone.style.position = "relative";
    clone.style.right = "auto";
    clone.style.top = "auto";
    clone.style.left = "auto";
    clone.style.width = "min(1280px, 100%)";
    clone.style.height = "auto";
    clone.style.maxHeight = "none";
    clone.style.overflow = "visible";
    clone.style.margin = "0 auto";
    clone.style.zIndex = "auto";
    clone.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
    clone.style.border = "2px solid #64748b";

    var allDetails = clone.querySelectorAll("details");
    for (var d = 0; d < allDetails.length; d += 1) {
      allDetails[d].open = true;
    }

    var allDivs = clone.querySelectorAll("div");
    for (var i = 0; i < allDivs.length; i += 1) {
      var ov = allDivs[i].style.overflow;
      if (ov === "hidden") {
        allDivs[i].style.overflow = "visible";
      }
      var ovx = allDivs[i].style.overflowX;
      if (ovx === "hidden") {
        allDivs[i].style.overflowX = "visible";
      }
      var ovy = allDivs[i].style.overflowY;
      if (ovy === "hidden") {
        allDivs[i].style.overflowY = "visible";
      }
      if (allDivs[i].style.minHeight === "0px" || allDivs[i].style.minHeight === "0") {
        allDivs[i].style.minHeight = "auto";
      }
    }

    var isDebugMode = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG;
    var debugSection = clone.querySelector("#acb-debug-section");
    var bridgeDetails = clone.querySelector("#acb-bridge-details");
    var runtimeDetails = clone.querySelector("#acb-runtime-details");
    var legacySection = clone.querySelector("#acb-legacy-section");
    var safetyFlagsLine = clone.querySelector("#acb-top-safety-flags-line");
    var debugHint = clone.querySelector("#acb-console-mode-debug-hint");

    if (debugSection) { debugSection.style.display = isDebugMode ? "" : "none"; }
    if (bridgeDetails) { bridgeDetails.style.display = isDebugMode ? "" : "none"; }
    if (runtimeDetails) { runtimeDetails.style.display = isDebugMode ? "" : "none"; }
    if (legacySection) { legacySection.style.display = isDebugMode ? "" : "none"; }
    if (safetyFlagsLine) { safetyFlagsLine.style.display = isDebugMode ? "" : "none"; }
    if (debugHint) { debugHint.style.display = isDebugMode ? "" : "none"; }

    var debugOnlyRows = clone.querySelectorAll("[data-acb-mode='debug']");
    for (var dr = 0; dr < debugOnlyRows.length; dr += 1) {
      debugOnlyRows[dr].style.display = isDebugMode ? "" : "none";
    }

    var debugFieldIds = [
      "acb-float-conversation-id", "acb-float-source-url", "acb-float-hash",
      "acb-top-selected-hash", "acb-top-selected-channel", "acb-top-layout-version",
      "acb-top-generated-at", "acb-top-project-path", "acb-top-git-root",
      "acb-top-preflight-status", "acb-top-readiness-status", "acb-top-review-status",
      "acb-float-last-user", "acb-float-assistant"
    ];
    for (var df = 0; df < debugFieldIds.length; df += 1) {
      var fieldSpan = clone.querySelector("#" + debugFieldIds[df]);
      if (fieldSpan && fieldSpan.parentElement) {
        fieldSpan.parentElement.style.display = isDebugMode ? "" : "none";
      }
    }

    var normalBtn = clone.querySelector("#acb-console-mode-normal-btn");
    var debugBtn = clone.querySelector("#acb-console-mode-debug-btn");
    if (normalBtn) {
      normalBtn.style.background = isDebugMode ? "#fff" : "#2563eb";
      normalBtn.style.color = isDebugMode ? "#2563eb" : "#fff";
      normalBtn.style.borderColor = "#2563eb";
      normalBtn.disabled = true;
      normalBtn.style.cursor = "not-allowed";
      normalBtn.style.opacity = "0.7";
    }
    if (debugBtn) {
      debugBtn.style.background = isDebugMode ? "#2563eb" : "#fff";
      debugBtn.style.color = isDebugMode ? "#fff" : "#2563eb";
      debugBtn.style.borderColor = "#2563eb";
      debugBtn.disabled = true;
      debugBtn.style.cursor = "not-allowed";
      debugBtn.style.opacity = "0.7";
    }

    var buttons = clone.querySelectorAll("button");
    for (var b = 0; b < buttons.length; b += 1) {
      buttons[b].disabled = true;
      buttons[b].style.cursor = "not-allowed";
      if (!buttons[b].style.opacity || buttons[b].style.opacity === "1") {
        buttons[b].style.opacity = "0.65";
      }
    }

    var inputs = clone.querySelectorAll("input");
    for (var inp = 0; inp < inputs.length; inp += 1) {
      inputs[inp].disabled = true;
      inputs[inp].readOnly = true;
      inputs[inp].style.cursor = "default";
    }

    var selects = clone.querySelectorAll("select");
    for (var s = 0; s < selects.length; s += 1) {
      selects[s].disabled = true;
      selects[s].style.cursor = "default";
    }

    var textareas = clone.querySelectorAll("textarea");
    for (var ta = 0; ta < textareas.length; ta += 1) {
      textareas[ta].disabled = true;
      textareas[ta].readOnly = true;
      textareas[ta].style.cursor = "default";
    }

    var allElements = clone.querySelectorAll("*");
    for (var ae = 0; ae < allElements.length; ae += 1) {
      allElements[ae].removeAttribute("onclick");
      allElements[ae].removeAttribute("onchange");
      allElements[ae].removeAttribute("onsubmit");
      allElements[ae].removeAttribute("oninput");
      allElements[ae].removeAttribute("onkeydown");
      allElements[ae].removeAttribute("onkeyup");
    }

    var modeOverlay = document.createElement("div");
    modeOverlay.style.cssText = "padding:6px 12px;background:" + (isDebugMode ? "#fef3c7" : "#dbeafe") + ";color:" + (isDebugMode ? "#92400e" : "#1e40af") + ";font-size:11px;text-align:center;border-bottom:1px solid " + (isDebugMode ? "#fcd34d" : "#93c5fd") + ";";
    modeOverlay.textContent = isDebugMode ? "调试模式 (只读快照)" : "普通模式 (只读快照)";
    clone.insertBefore(modeOverlay, clone.firstChild);

    var snapshotHtml = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>ACB Console Readonly Snapshot — " + (isDebugMode ? "Debug" : "Normal") + " Mode</title>\n";
    snapshotHtml += "<style>\n";
    snapshotHtml += "  #acb-floating-console.acb-display-mode-normal [data-acb-mode=\"debug\"] { display: none !important; }\n";
    snapshotHtml += "  #acb-floating-console.acb-display-mode-debug [data-acb-mode=\"normal-hidden\"] { display: none !important; }\n";
    snapshotHtml += "  * { box-sizing: border-box; }\n";
    snapshotHtml += "  body {\n";
    snapshotHtml += "    margin: 0;\n";
    snapshotHtml += "    padding: 24px;\n";
    snapshotHtml += "    font-family: Arial, \"Microsoft YaHei\", sans-serif;\n";
    snapshotHtml += "    font-size: 13px;\n";
    snapshotHtml += "    color: #222;\n";
    snapshotHtml += "    background: #f1f5f9;\n";
    snapshotHtml += "    overflow-y: auto;\n";
    snapshotHtml += "    overflow-x: auto;\n";
    snapshotHtml += "  }\n";
    snapshotHtml += "  button[disabled] { cursor: not-allowed !important; opacity: 0.55 !important; }\n";
    snapshotHtml += "  input[disabled], select[disabled], textarea[disabled] { cursor: default !important; opacity: 0.7 !important; }\n";
    snapshotHtml += "  .snapshot-watermark {\n";
    snapshotHtml += "    position: fixed;\n";
    snapshotHtml += "    bottom: 16px;\n";
    snapshotHtml += "    right: 24px;\n";
    snapshotHtml += "    font-size: 11px;\n";
    snapshotHtml += "    color: #94a3b8;\n";
    snapshotHtml += "    font-style: italic;\n";
    snapshotHtml += "    z-index: 99999;\n";
    snapshotHtml += "    pointer-events: none;\n";
    snapshotHtml += "    user-select: none;\n";
    snapshotHtml += "  }\n";
    snapshotHtml += "  .snapshot-watermark::before { content: \"READONLY SNAPSHOT — NO LIVE EXECUTION — \"; }\n";
    snapshotHtml += "  .snapshot-watermark::after { content: \"" + new Date().toISOString() + "\"; }\n";
    snapshotHtml += "</style>\n</head>\n<body>\n";
    snapshotHtml += "<div class=\"snapshot-watermark\"></div>\n";
    snapshotHtml += clone.outerHTML;
    snapshotHtml += "\n</body>\n</html>";

    var snapshotWindow = window.open("", "_blank", "width=1320,height=900,scrollbars=yes,resizable=yes");
    if (!snapshotWindow) {
      alert("无法打开快照窗口，请检查浏览器弹窗设置。");
      return;
    }

    snapshotWindow.document.write(snapshotHtml);
    snapshotWindow.document.close();

    setStatus("只读快照已在新窗口生成 (" + (isDebugMode ? "调试" : "普通") + "模式)。");
  }

  function injectFloatingConsole() {
    if (document.getElementById("acb-floating-console")) {
      return;
    }

    ensureConsoleDisplayModeStyle();

    var panel = document.createElement("div");
    panel.id = "acb-floating-console";
    panel.dataset.acbDisplayMode = CONSOLE_DISPLAY_MODE_NORMAL;
    panel.classList.add("acb-display-mode-normal");
    panel.style.cssText = [
      "display:none",
      "position:fixed",
      "right:16px",
      "top:72px",
      "width:min(1280px, calc(100vw - 32px))",
      "height:calc(100vh - 84px)",
      "z-index:2147483646",
      "background:#fff",
      "border:1px solid #d0d0d0",
      "border-radius:8px",
      "box-shadow:0 4px 24px rgba(0,0,0,0.18)",
      "font-family:Arial,sans-serif",
      "font-size:13px",
      "color:#222",
      "flex-direction:column",
      "overflow:hidden"
    ].join(";");

    var header = document.createElement("div");
    header.style.cssText = [
      "display:flex",
      "justify-content:space-between",
      "align-items:center",
      "padding:10px 16px",
      "background:#333",
      "color:#fff",
      "flex-shrink:0"
    ].join(";");
    var title = document.createElement("span");
    title.textContent = "ACB 控制台 / M3-UI.0";
    title.style.cssText = "font-size:15px;font-weight:bold;";
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "X";
    closeBtn.style.cssText = "background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:2px 6px;";
    closeBtn.addEventListener("click", toggleFloatingConsole);
    header.appendChild(title);
    header.appendChild(closeBtn);

    var actionBar = document.createElement("div");
    actionBar.style.cssText = "display:flex;gap:6px;padding:6px 12px;border-bottom:1px solid #e0e0e0;flex-wrap:wrap;justify-content:flex-end;align-items:center;background:#fafafa;";
    actionBar.appendChild(makeActionBtn("刷新", function () {
      refreshFloatingConsole().catch(function (err) {
        console.error("[ACB][floating-console] refresh error", err);
      });
    }));
    actionBar.appendChild(makeActionBtn("导出测试报告", function () {
      exportFloatingTestReport().catch(function (err) {
        console.error("[ACB][floating-console] export error", err);
      });
    }));
    actionBar.appendChild(makeActionBtn("测试本地 Bridge", function () {
      testLocalBridge().catch(function (err) {
        console.error("[ACB][floating-console] bridge test error", err);
      });
    }));
    actionBar.appendChild(makeActionBtn("刷新本地项目状态", function () {
      testProjectStatus().catch(function (err) {
        console.error("[ACB][floating-console] project status test error", err);
      });
    }));
    actionBar.appendChild(makeActionBtn("检查执行准备状态", function () {
      testReadinessGate().catch(function (err) {
        console.error("[ACB][floating-console] readiness gate error", err);
      });
    }));
    actionBar.appendChild(makeActionBtn("生成只读快照", function () {
      openReadonlySnapshot();
    }));
    if (currentMode === MODE_CHATGPT) {
      actionBar.appendChild(makeActionBtn("采集当前对话", function () {
        captureCurrentConversation().catch(function (err) {
          console.error("[ACB][floating-console] capture error", err);
          setCaptureStatus("采集失败", true);
        });
      }));
    }

    var modeSwitchWrap = document.createElement("div");
    modeSwitchWrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-left:auto;";
    var modeLabel = document.createElement("span");
    modeLabel.style.cssText = "font-size:12px;color:#475569;";
    modeLabel.textContent = "显示模式:";
    var normalModeBtn = document.createElement("button");
    normalModeBtn.id = "acb-console-mode-normal-btn";
    normalModeBtn.type = "button";
    normalModeBtn.textContent = "普通模式";
    normalModeBtn.style.cssText = "padding:3px 8px;border:1px solid #2563eb;border-radius:4px;background:#2563eb;color:#fff;cursor:pointer;font-size:11px;";
    normalModeBtn.addEventListener("click", function () {
      persistFloatingConsoleDisplayMode(CONSOLE_DISPLAY_MODE_NORMAL).then(function () {
        renderFloatingFeedback();
        applyConsoleDisplayMode();
      });
    });
    var debugModeBtn = document.createElement("button");
    debugModeBtn.id = "acb-console-mode-debug-btn";
    debugModeBtn.type = "button";
    debugModeBtn.textContent = "调试模式";
    debugModeBtn.style.cssText = "padding:3px 8px;border:1px solid #2563eb;border-radius:4px;background:#fff;color:#2563eb;cursor:pointer;font-size:11px;";
    debugModeBtn.addEventListener("click", function () {
      persistFloatingConsoleDisplayMode(CONSOLE_DISPLAY_MODE_DEBUG).then(function () {
        renderFloatingFeedback();
        applyConsoleDisplayMode();
      });
    });
    var debugHint = document.createElement("span");
    debugHint.id = "acb-console-mode-debug-hint";
    debugHint.style.cssText = "font-size:11px;color:#b45309;display:none;";
    debugHint.textContent = "调试信息已展开";
    modeSwitchWrap.appendChild(modeLabel);
    modeSwitchWrap.appendChild(normalModeBtn);
    modeSwitchWrap.appendChild(debugModeBtn);
    modeSwitchWrap.appendChild(debugHint);
    actionBar.appendChild(modeSwitchWrap);
    var actionBarButtons = actionBar.querySelectorAll("button");
    for (var abi = 0; abi < actionBarButtons.length; abi += 1) {
      var actionBtn = actionBarButtons[abi];
      if (actionBtn.id === "acb-console-mode-normal-btn" || actionBtn.id === "acb-console-mode-debug-btn") {
        continue;
      }
      actionBtn.style.padding = "3px 9px";
      actionBtn.style.fontSize = "11px";
      actionBtn.style.borderRadius = "999px";
    }

    var statusEl = document.createElement("p");
    statusEl.id = "acb-float-status";
    statusEl.style.cssText = "margin:0;padding:4px 16px;font-size:11px;color:#888;";
    statusEl.textContent = "就绪";

    var body = document.createElement("div");
    body.style.cssText = "flex:1;display:flex;flex-direction:column;gap:10px;overflow:hidden;padding:10px 12px;background:#f8fafc;";

    var topOverview = document.createElement("div");
    topOverview.style.cssText = "padding:6px 8px;border:1px solid #dbeafe;background:#eff6ff;border-radius:6px;flex-shrink:0;";
    var topHeading = document.createElement("h3");
    topHeading.textContent = "项目状态";
    topHeading.style.cssText = "display:none;margin:0 0 6px 0;font-size:12px;color:#1d4ed8;";
    topOverview.appendChild(topHeading);

    var topStrip = document.createElement("div");
    topStrip.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;";
    function appendTopChip(label, valueId, tone) {
      var chip = document.createElement("span");
      chip.style.cssText = "display:inline-flex;gap:4px;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;background:" + (tone || "#dbeafe") + ";color:#0f172a;";
      chip.innerHTML = label + ": <strong id=\"" + valueId + "\">unknown</strong>";
      topStrip.appendChild(chip);
      return chip;
    }
    appendTopChip("项目", "acb-top-project-name", "#dbeafe");
    var bridgeChip = appendTopChip("Bridge", "acb-top-bridge-status", "#dcfce7");
    var bridgeRefreshBtn = document.createElement("button");
    bridgeRefreshBtn.id = "acb-top-bridge-refresh-btn";
    bridgeRefreshBtn.type = "button";
    bridgeRefreshBtn.textContent = "刷新";
    bridgeRefreshBtn.title = "刷新 Bridge 状态";
    bridgeRefreshBtn.style.cssText = "margin-left:4px;padding:1px 6px;border:1px solid #86efac;border-radius:999px;background:#f0fdf4;color:#166534;font-size:10px;cursor:pointer;line-height:1.2;";
    bridgeRefreshBtn.addEventListener("click", function () {
      testLocalBridge().catch(function (err) {
        console.error("[ACB][floating-console] top refresh bridge error", err);
      });
    });
    bridgeChip.appendChild(bridgeRefreshBtn);
    appendTopChip("分支", "acb-top-branch", "#ede9fe");
    appendTopChip("Commit", "acb-top-commit", "#f5f3ff");
    appendTopChip("工作树", "acb-top-working-tree", "#fef3c7");
    appendTopChip("安全", "acb-top-safety-mode", "#fee2e2");
    appendTopChip("预检", "acb-top-preflight-status", "#ede9fe");
    appendTopChip("就绪", "acb-top-readiness-status", "#fef3c7");
    appendTopChip("审查", "acb-top-review-status", "#ccfbf1");
    topOverview.appendChild(topStrip);

    var safetyFlagsLine = document.createElement("p");
    safetyFlagsLine.id = "acb-top-safety-flags-line";
    safetyFlagsLine.style.cssText = "margin:6px 0 0 0;font-size:11px;color:#475569;";
    safetyFlagsLine.innerHTML = "安全状态: <strong id=\"acb-top-safety-lock-state\">locked_readonly / 只读锁定</strong> · <span id=\"acb-top-safety-flags\">Exec=false · Agent=false · Cmd=false · Git=false</span>";
    topOverview.appendChild(safetyFlagsLine);

    var compactDetails = document.createElement("details");
    compactDetails.style.cssText = "margin-top:4px;";
    var compactSummary = document.createElement("summary");
    compactSummary.textContent = "更多项目信息";
    compactSummary.style.cssText = "display:none;cursor:pointer;font-size:11px;color:#334155;";
    compactDetails.appendChild(compactSummary);
    var compactBody = document.createElement("div");
    compactBody.style.cssText = "margin-top:6px;";
    addFeedbackRow(compactBody, "项目路径", "acb-top-project-path");
    addFeedbackRow(compactBody, "Git Root", "acb-top-git-root");
    addFeedbackRow(compactBody, "Selected Channel", "acb-top-selected-channel");
    addFeedbackRow(compactBody, "Selected Status", "acb-top-selected-status");
    addFeedbackRow(compactBody, "Selected Hash", "acb-top-selected-hash");
    addFeedbackRow(compactBody, "Layout Version", "acb-top-layout-version");
    addFeedbackRow(compactBody, "刷新时间", "acb-top-generated-at");
    compactDetails.appendChild(compactBody);
    topOverview.appendChild(compactDetails);

    var readonlyBanner = document.createElement("div");
    readonlyBanner.id = "acb-readonly-safety-banner";
    readonlyBanner.style.cssText = "display:flex;align-items:center;gap:8px;min-height:30px;padding:6px 10px;border-left:4px solid #dc2626;border-radius:6px;background:#fef2f2;color:#991b1b;font-size:12px;font-weight:bold;flex-shrink:0;";
    var readonlyMarker = document.createElement("span");
    readonlyMarker.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:bold;flex-shrink:0;";
    readonlyMarker.textContent = "锁";
    var readonlyText = document.createElement("span");
    readonlyText.id = "acb-readonly-safety-banner-text";
    readonlyText.textContent = "只读锁定 · 不执行命令 · 不派发 Agent · 不写入 Git";
    readonlyBanner.appendChild(readonlyMarker);
    readonlyBanner.appendChild(readonlyText);

    var topActions = document.createElement("div");
    topActions.style.cssText = "display:flex;gap:5px;flex-wrap:nowrap;align-items:center;margin-left:auto;white-space:nowrap;";
    topActions.appendChild(makeActionBtn("刷新项目状态", function () {
      testProjectStatus().catch(function (err) {
        console.error("[ACB][floating-console] top refresh project status error", err);
      });
    }));
    var settingsPlaceholderBtn = makeActionBtn("设置（未开放）", function () {});
    settingsPlaceholderBtn.disabled = true;
    settingsPlaceholderBtn.style.cursor = "not-allowed";
    settingsPlaceholderBtn.style.opacity = "0.6";
    topActions.appendChild(settingsPlaceholderBtn);
    var safetyEntryBtn = makeActionBtn("只读锁定入口", function () {});
    safetyEntryBtn.disabled = true;
    safetyEntryBtn.style.cursor = "not-allowed";
    safetyEntryBtn.style.opacity = "0.6";
    safetyEntryBtn.title = "当前仅显示只读锁定状态，暂不支持解锁";
    topActions.appendChild(safetyEntryBtn);
    var moreInfoBtn = makeActionBtn("更多信息", function () {
      compactDetails.open = !compactDetails.open;
    });
    topActions.appendChild(moreInfoBtn);
    var topActionButtons = topActions.querySelectorAll("button");
    for (var ta = 0; ta < topActionButtons.length; ta += 1) {
      topActionButtons[ta].style.padding = "2px 8px";
      topActionButtons[ta].style.fontSize = "11px";
      topActionButtons[ta].style.borderRadius = "999px";
    }
    topStrip.appendChild(topActions);

    var middleWrap = document.createElement("div");
    middleWrap.style.cssText = "display:grid;grid-template-columns:minmax(240px, 26%) minmax(420px, 48%) minmax(240px, 26%);gap:10px;flex:1;min-height:0;";
    var leftCol = document.createElement("div");
    leftCol.style.cssText = "min-height:0;overflow:auto;padding-right:2px;";
    var centerCol = document.createElement("div");
    centerCol.style.cssText = "min-height:0;overflow:auto;padding-right:2px;";
    var rightCol = document.createElement("div");
    rightCol.style.cssText = "min-height:0;overflow:auto;padding-right:2px;";

    if (currentMode === MODE_CHATGPT) {
      var bindingSection = document.createElement("div");
      bindingSection.style.cssText = "margin-bottom:14px;padding:10px;background:#f8f8f8;border-radius:4px;border:1px solid #e8e8e8;";
      var bindingHeading = document.createElement("h3");
      bindingHeading.textContent = "当前页面绑定";
      bindingHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#555;";
      var bindingRow = document.createElement("div");
      bindingRow.style.cssText = "display:flex;gap:8px;align-items:center;";
      var bindingSelect = document.createElement("select");
      bindingSelect.id = "acb-float-page-binding-select";
      bindingSelect.style.cssText = "flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;";
      bindingRow.appendChild(bindingSelect);
      bindingRow.appendChild(makeActionBtn("保存绑定", function () {
        saveCurrentPageBinding().catch(function (err) {
          console.error("[ACB][floating-console] save binding failed", err);
          setStatus("保存绑定失败");
        });
      }));
      var bindingCurrent = document.createElement("p");
      bindingCurrent.id = "acb-float-binding-current";
      bindingCurrent.style.cssText = "margin:8px 0 0 0;font-size:11px;color:#666;";
      var captureStatus = document.createElement("p");
      captureStatus.id = "acb-float-capture-status";
      captureStatus.style.cssText = "margin:6px 0 0 0;font-size:11px;min-height:14px;";
      bindingSection.appendChild(bindingHeading);
      bindingSection.appendChild(bindingRow);
      bindingSection.appendChild(bindingCurrent);
      bindingSection.appendChild(captureStatus);
      bindingSection.style.display = "none";
      leftCol.appendChild(bindingSection);
    }

    var channelSection = document.createElement("div");
    channelSection.style.cssText = "margin-bottom:14px;";
    var channelHeading = document.createElement("h3");
    channelHeading.textContent = "GPT 身份卡";
    channelHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#555;";
    var channelList = document.createElement("div");
    channelList.id = "acb-float-channel-list";
    channelSection.appendChild(channelHeading);
    channelSection.appendChild(channelList);
    var identityControls = document.createElement("div");
    identityControls.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 0 0;";
    var newIdentityBtn = makeActionBtn("新建身份卡（未开放）", function () {});
    newIdentityBtn.disabled = true;
    newIdentityBtn.style.cursor = "not-allowed";
    newIdentityBtn.style.opacity = "0.6";
    var bindIdentityBtn = makeActionBtn("绑定当前页面到此卡", function () {
      if (currentMode !== MODE_CHATGPT) {
        setStatus("仅 ChatGPT 页面支持绑定当前页面");
        return;
      }
      saveCurrentPageBinding().catch(function (err) {
        console.error("[ACB][floating-console] bind current page failed", err);
        setStatus("绑定当前页面失败");
      });
    });
    var openSourceBtn = makeActionBtn("打开原对话", function () {
      openSelectedConversation();
    });
    identityControls.appendChild(newIdentityBtn);
    identityControls.appendChild(bindIdentityBtn);
    identityControls.appendChild(openSourceBtn);
    identityControls.style.display = "none";
    channelSection.appendChild(identityControls);

    if (currentMode === MODE_CHATGPT) {
      var bindingContextBar = document.createElement("div");
      bindingContextBar.id = "acb-binding-context-bar";
      bindingContextBar.style.cssText = "margin-bottom:8px;padding:8px 10px;border:1px solid #dbeafe;border-left:4px solid #94a3b8;border-radius:8px;background:#f8fafc;";
      var bindingContextLine1 = document.createElement("p");
      bindingContextLine1.id = "acb-binding-context-line1";
      bindingContextLine1.style.cssText = "margin:0;font-size:11px;color:#334155;line-height:1.4;";
      var bindingContextHint = document.createElement("p");
      bindingContextHint.id = "acb-binding-context-hint";
      bindingContextHint.style.cssText = "margin:3px 0 0 0;font-size:11px;line-height:1.4;";
      var bindingContextActions = document.createElement("div");
      bindingContextActions.id = "acb-binding-context-actions";
      bindingContextActions.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;";
      bindingContextBar.appendChild(bindingContextLine1);
      bindingContextBar.appendChild(bindingContextHint);
      bindingContextBar.appendChild(bindingContextActions);
      centerCol.appendChild(bindingContextBar);
    }

    var feedbackSection = document.createElement("div");
    feedbackSection.style.cssText = "margin-bottom:14px;padding:10px;background:#f8f8f8;border-radius:4px;border:1px solid #e8e8e8;";
    var feedbackHeading = document.createElement("h3");
    feedbackHeading.textContent = "当前消息 / 任务卡";
    feedbackHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#555;";
    feedbackSection.appendChild(feedbackHeading);
    addFeedbackRow(feedbackSection, "通道 ID", "acb-float-channel-id");
    addFeedbackRow(feedbackSection, "通道名称", "acb-float-channel-name");
    addFeedbackRow(feedbackSection, "通道类型", "acb-float-channel-type");
    addFeedbackRow(feedbackSection, "是否有反馈", "acb-float-has-feedback");
    addFeedbackRow(feedbackSection, "通道状态", "acb-float-channel-status");
    addFeedbackRow(feedbackSection, "sourceConversationId", "acb-float-conversation-id", "debug");
    addFeedbackRow(feedbackSection, "sourceUrl", "acb-float-source-url", "debug");
    addFeedbackRow(feedbackSection, "消息预览", "acb-float-message-preview");

    var statusActions = document.createElement("div");
    statusActions.id = "acb-float-status-actions";
    statusActions.style.cssText = "display:none;gap:6px;margin:4px 0 8px 0;flex-wrap:wrap;";
    function makeStatusBtn(label, status, color) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "padding:3px 10px;border:1px solid #ccc;border-radius:3px;background:" + color + ";color:#fff;cursor:pointer;font-size:11px;";
      b.addEventListener("click", function () {
        handleChannelStatusAction(status).catch(function (err) {
          console.error("[ACB][floating-console] status action failed", err);
        });
      });
      return b;
    }
    statusActions.appendChild(makeStatusBtn("标为已读", "seen", "#6b7280"));
    statusActions.appendChild(makeStatusBtn("标为挂起", "pending", "#f59e0b"));
    statusActions.appendChild(makeStatusBtn("标为完成", "done", "#10b981"));
    feedbackSection.appendChild(statusActions);

    var feedbackActions = document.createElement("div");
    feedbackActions.style.cssText = "display:flex;gap:6px;margin:4px 0 8px 0;flex-wrap:wrap;";
    feedbackActions.appendChild(makeActionBtn("打开原对话", function () {
      openSelectedConversation();
    }));
    feedbackActions.appendChild(makeActionBtn("重新采集到此卡", function () {
      if (currentMode !== MODE_CHATGPT) {
        setStatus("当前模式不支持页面采集");
        return;
      }
      captureCurrentConversation().catch(function (err) {
        console.error("[ACB][floating-console] capture current conversation failed", err);
        setCaptureStatus("采集失败", true);
      });
    }));
    feedbackSection.appendChild(feedbackActions);
    if (feedbackActions.children[0]) {
      feedbackActions.children[0].id = "acb-feedback-open-source-btn";
    }
    if (feedbackActions.children[1]) {
      feedbackActions.children[1].id = "acb-feedback-recapture-btn";
    }

    addFeedbackRow(feedbackSection, "采集时间", "acb-float-captured-at", "debug");
    addFeedbackRow(feedbackSection, "哈希值", "acb-float-hash", "debug");
    var userLabel = document.createElement("p");
    userLabel.style.cssText = "margin:6px 0 2px 0;font-size:12px;";
    userLabel.innerHTML = "<strong>最新用户消息:</strong>";
    var userPre = document.createElement("pre");
    userPre.id = "acb-float-last-user";
    userPre.style.cssText = "margin:0 0 6px 0;padding:6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:11px;max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;";
    var asstLabel = document.createElement("p");
    asstLabel.style.cssText = "margin:6px 0 2px 0;font-size:12px;";
    asstLabel.innerHTML = "<strong>最新助手消息:</strong>";
    var asstPre = document.createElement("pre");
    asstPre.id = "acb-float-assistant";
    asstPre.style.cssText = "margin:0;padding:6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:11px;max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;";
    feedbackSection.appendChild(userLabel);
    feedbackSection.appendChild(userPre);
    feedbackSection.appendChild(asstLabel);
    feedbackSection.appendChild(asstPre);

    var classSection = document.createElement("div");
    classSection.id = "acb-feedback-type-box";
    classSection.style.cssText = "margin-bottom:14px;padding:10px;background:#f8fafc;border-radius:4px;border:1px solid #cbd5e1;";
    var classHeading = document.createElement("h3");
    classHeading.textContent = "当前反馈类型";
    classHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#555;";
    classSection.appendChild(classHeading);
    var classCompactLine = document.createElement("p");
    classCompactLine.id = "acb-feedback-class-compact";
    classCompactLine.style.cssText = "margin:0 0 6px 0;font-size:11px;color:#334155;line-height:1.4;";
    classCompactLine.textContent = "反馈: -";
    classSection.appendChild(classCompactLine);

    addFeedbackRow(classSection, "分类检测到", "acb-feedback-class-detected", "debug");
    addFeedbackRow(classSection, "类型", "acb-feedback-class-type", "debug");
    addFeedbackRow(classSection, "标题", "acb-feedback-class-title", "debug");
    addFeedbackRow(classSection, "摘要", "acb-feedback-class-summary", "debug");
    addFeedbackRow(classSection, "默认浏览行为", "acb-feedback-class-default-behavior", "debug");
    addFeedbackRow(classSection, "推荐状态", "acb-feedback-class-recommended-status", "debug");
    addFeedbackRow(classSection, "关注级别", "acb-feedback-class-attention-level", "debug");
    addFeedbackRow(classSection, "是否需要执行", "acb-feedback-class-needs-execution", "debug");
    addFeedbackRow(classSection, "建议下一步", "acb-feedback-class-next-action", "debug");
    addFeedbackRow(classSection, "置信度", "acb-feedback-class-confidence", "debug");
    addFeedbackRow(classSection, "来源", "acb-feedback-class-source", "debug");
    addFeedbackRow(classSection, "用户已编辑", "acb-feedback-class-user-edited", "debug");

    var editHeading = document.createElement("h4");
    editHeading.dataset.acbMode = "debug";
    editHeading.textContent = "编辑分类";
    editHeading.style.cssText = "margin:10px 0 8px 0;font-size:12px;color:#555;";
    classSection.appendChild(editHeading);

    function addFormLabel(container, text) {
      var l = document.createElement("label");
      l.dataset.acbMode = "debug";
      l.textContent = text;
      l.style.cssText = "display:block;font-size:12px;margin:6px 0 4px 0;";
      container.appendChild(l);
    }

    addFormLabel(classSection, "反馈类型 (feedbackType)");
    var typeSelect = document.createElement("select");
    typeSelect.id = "acb-feedback-type-select";
    typeSelect.dataset.acbMode = "debug";
    typeSelect.style.cssText = "width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;";
    addSelectOptions(typeSelect, [
      { value: "content", label: "内容 content" },
      { value: "decision", label: "判断 decision" },
      { value: "strategy", label: "战略 strategy" },
      { value: "recommendation", label: "建议 recommendation" },
      { value: "execution", label: "执行 execution" }
    ]);
    classSection.appendChild(typeSelect);

    addFormLabel(classSection, "标题 (title)");
    var titleInput = document.createElement("input");
    titleInput.id = "acb-feedback-title-input";
    titleInput.dataset.acbMode = "debug";
    titleInput.type = "text";
    titleInput.style.cssText = "width:100%;box-sizing:border-box;padding:6px;border:1px solid #ccc;border-radius:4px;";
    classSection.appendChild(titleInput);

    addFormLabel(classSection, "摘要 (summary)");
    var summaryInput = document.createElement("textarea");
    summaryInput.id = "acb-feedback-summary-input";
    summaryInput.dataset.acbMode = "debug";
    summaryInput.rows = 3;
    summaryInput.style.cssText = "width:100%;box-sizing:border-box;padding:6px;border:1px solid #ccc;border-radius:4px;resize:vertical;";
    classSection.appendChild(summaryInput);

    addFormLabel(classSection, "默认行为 (defaultBehavior)");
    var behaviorSelect = document.createElement("select");
    behaviorSelect.id = "acb-feedback-default-behavior-select";
    behaviorSelect.dataset.acbMode = "debug";
    behaviorSelect.style.cssText = "width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;";
    addSelectOptions(behaviorSelect, [
      { value: "autoRead", label: "autoRead 浏览后已读" },
      { value: "pendingReview", label: "pendingReview 挂起待复核" },
      { value: "pendingDecision", label: "pendingDecision 挂起待决策" },
      { value: "actionRequired", label: "actionRequired 需要行动" },
      { value: "noChange", label: "noChange 不改变状态" }
    ]);
    classSection.appendChild(behaviorSelect);

    addFormLabel(classSection, "推荐状态 (recommendedStatus)");
    var statusSelect = document.createElement("select");
    statusSelect.id = "acb-feedback-recommended-status-select";
    statusSelect.dataset.acbMode = "debug";
    statusSelect.style.cssText = "width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;";
    addSelectOptions(statusSelect, [
      { value: "seen", label: "seen 已读" },
      { value: "pending", label: "pending 挂起" },
      { value: "action_required", label: "action_required 需要行动" },
      { value: "done", label: "done 已完成" },
      { value: "archived", label: "archived 已归档" }
    ]);
    classSection.appendChild(statusSelect);

    addFormLabel(classSection, "关注级别 (attentionLevel)");
    var attentionSelect = document.createElement("select");
    attentionSelect.id = "acb-feedback-attention-level-select";
    attentionSelect.dataset.acbMode = "debug";
    attentionSelect.style.cssText = "width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;";
    addSelectOptions(attentionSelect, [
      { value: "low", label: "low 低" },
      { value: "medium", label: "medium 中" },
      { value: "high", label: "high 高" },
      { value: "urgent", label: "urgent 紧急" },
      { value: "done", label: "done 完成" }
    ]);
    classSection.appendChild(attentionSelect);

    addFormLabel(classSection, "需要执行 (needsExecution)");
    var executionSelect = document.createElement("select");
    executionSelect.id = "acb-feedback-needs-execution-select";
    executionSelect.dataset.acbMode = "debug";
    executionSelect.style.cssText = "width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;";
    addSelectOptions(executionSelect, [
      { value: "false", label: "false 否" },
      { value: "true", label: "true 是" }
    ]);
    classSection.appendChild(executionSelect);

    addFormLabel(classSection, "建议下一步 (suggestedNextAction)");
    var nextActionInput = document.createElement("input");
    nextActionInput.id = "acb-feedback-next-action-input";
    nextActionInput.dataset.acbMode = "debug";
    nextActionInput.type = "text";
    nextActionInput.style.cssText = "width:100%;box-sizing:border-box;padding:6px;border:1px solid #ccc;border-radius:4px;";
    classSection.appendChild(nextActionInput);

    addFormLabel(classSection, "置信度 (confidence)");
    var confidenceSelect = document.createElement("select");
    confidenceSelect.id = "acb-feedback-confidence-select";
    confidenceSelect.dataset.acbMode = "debug";
    confidenceSelect.style.cssText = "width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;";
    addSelectOptions(confidenceSelect, [
      { value: "low", label: "low" },
      { value: "medium", label: "medium" },
      { value: "high", label: "high" }
    ]);
    classSection.appendChild(confidenceSelect);

    var editBtns = document.createElement("div");
    editBtns.dataset.acbMode = "debug";
    editBtns.style.cssText = "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;";
    var saveBtn = makeActionBtn("保存分类", function () {
      saveManualClassification().catch(function (err) {
        console.error("[ACB][classification] save failed", err);
        setClassificationStatus("保存失败。", true);
      });
    });
    saveBtn.id = "acb-feedback-save-btn";
    var resetBtn = makeActionBtn("重置为自动识别", function () {
      resetClassificationToAuto().catch(function (err) {
        console.error("[ACB][classification] reset failed", err);
        setClassificationStatus("重置失败。", true);
      });
    });
    resetBtn.id = "acb-feedback-reset-btn";
    editBtns.appendChild(saveBtn);
    editBtns.appendChild(resetBtn);
    classSection.appendChild(editBtns);

    var classStatus = document.createElement("p");
    classStatus.id = "acb-feedback-class-edit-status";
    classStatus.style.cssText = "margin:6px 0 0 0;font-size:11px;min-height:14px;";
    classSection.appendChild(classStatus);

    var classEditorSection = document.createElement("div");
    classEditorSection.dataset.acbMode = "debug";
    classEditorSection.style.cssText = "margin-top:10px;";
    var classEditorIndex = Array.prototype.indexOf.call(classSection.children, editHeading);
    while (classEditorIndex >= 0 && classSection.children.length > classEditorIndex) {
      classEditorSection.appendChild(classSection.children[classEditorIndex]);
    }
    classSection.appendChild(classEditorSection);

    var actionStepsSection = document.createElement("div");
    actionStepsSection.id = "acb-action-steps-box";
    actionStepsSection.style.cssText = "margin:10px 0;padding:10px;border:2px solid #2563eb;background:#eff6ff;border-radius:8px;box-shadow:0 0 0 2px rgba(37,99,235,0.08);";
    var actionStepsHeader = document.createElement("div");
    actionStepsHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 4px 0;";

    var actionStepsTitle = document.createElement("p");
    actionStepsTitle.style.cssText = "margin:0;font-size:12px;color:#1d4ed8;font-weight:bold;line-height:1.2;";
    actionStepsTitle.textContent = "当前任务卡 / 动作步骤";
    actionStepsHeader.appendChild(actionStepsTitle);

    var actionStepsTip = document.createElement("p");
    actionStepsTip.id = "acb-action-steps-tip";
    actionStepsTip.style.cssText = "margin:0 0 6px 0;font-size:12px;color:#1e3a8a;";
    actionStepsTip.textContent = "当前反馈不需要执行，未生成 Action Steps。";
    actionStepsSection.appendChild(actionStepsHeader);
    actionStepsSection.appendChild(actionStepsTip);

    var generateActionBtn = makeActionBtn("生成动作步骤", function () {
      generateActionStepsForCurrentFeedback().catch(function (err) {
        console.error("[ACB][action-steps] generate failed", err);
        setActionStepsStatus("生成动作步骤失败。", true);
      });
    });
    generateActionBtn.id = "acb-action-steps-generate-btn";
    generateActionBtn.style.cssText = "padding:3px 8px;border:1px solid #7c3aed;border-radius:4px;background:#fff;color:#7c3aed;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;white-space:nowrap;";
    generateActionBtn.style.display = floatingConsoleDisplayMode === CONSOLE_DISPLAY_MODE_DEBUG ? "inline-block" : "none";
    actionStepsHeader.appendChild(generateActionBtn);
    var planStatus = document.createElement("span");
    planStatus.style.cssText = "display:block;margin:0 0 6px 0;font-size:11px;color:#6b7280;";
    planStatus.innerHTML = "计划状态: <span id=\"acb-action-steps-plan-status\">none</span>";
    planStatus.dataset.acbMode = "debug";
    actionStepsSection.appendChild(planStatus);

    var actionStepsStatus = document.createElement("p");
    actionStepsStatus.id = "acb-action-steps-status";
    actionStepsStatus.style.cssText = "margin:6px 0 0 0;font-size:11px;min-height:14px;";
    actionStepsSection.appendChild(actionStepsStatus);

    var actionFeedbackPanel = document.createElement("div");
    actionFeedbackPanel.id = "acb-action-feedback-panel";
    actionFeedbackPanel.style.cssText = "margin-top:8px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#e2e8f0;";
    var actionFeedbackHeader = document.createElement("div");
    actionFeedbackHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
    var actionFeedbackTitle = document.createElement("strong");
    actionFeedbackTitle.id = "acb-action-feedback-title";
    actionFeedbackTitle.style.cssText = "font-size:12px;color:#0f172a;";
    actionFeedbackTitle.textContent = "检查与操作结果";
    var actionFeedbackLevel = document.createElement("span");
    actionFeedbackLevel.id = "acb-action-feedback-level";
    actionFeedbackLevel.style.cssText = "font-size:11px;color:#1f2937;";
    actionFeedbackLevel.textContent = "信息";
    actionFeedbackHeader.appendChild(actionFeedbackTitle);
    actionFeedbackHeader.appendChild(actionFeedbackLevel);
    actionFeedbackPanel.appendChild(actionFeedbackHeader);
    var actionFeedbackMessage = document.createElement("p");
    actionFeedbackMessage.id = "acb-action-feedback-message";
    actionFeedbackMessage.style.cssText = "margin:6px 0 2px 0;font-size:12px;color:#1f2937;";
    actionFeedbackMessage.textContent = "请先选择任务步骤。";
    actionFeedbackPanel.appendChild(actionFeedbackMessage);
    var actionFeedbackDetail = document.createElement("p");
    actionFeedbackDetail.id = "acb-action-feedback-detail";
    actionFeedbackDetail.style.cssText = "margin:0;font-size:11px;color:#475569;";
    actionFeedbackDetail.textContent = "-";
    actionFeedbackPanel.appendChild(actionFeedbackDetail);
    var actionFeedbackUserState = document.createElement("p");
    actionFeedbackUserState.style.cssText = "margin:6px 0 0 0;font-size:12px;color:#1f2937;";
    actionFeedbackUserState.innerHTML = "当前状态: <strong id=\"acb-action-feedback-user-state\">未检查</strong>";
    actionFeedbackPanel.appendChild(actionFeedbackUserState);
    var actionFeedbackUserReason = document.createElement("p");
    actionFeedbackUserReason.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#475569;";
    actionFeedbackUserReason.innerHTML = "原因: <span id=\"acb-action-feedback-user-reason\">尚未执行发送前检查。</span>";
    actionFeedbackPanel.appendChild(actionFeedbackUserReason);
    var actionFeedbackUserNext = document.createElement("p");
    actionFeedbackUserNext.style.cssText = "margin:2px 0 0 0;font-size:11px;color:#334155;";
    actionFeedbackUserNext.innerHTML = "下一步: <span id=\"acb-action-feedback-user-next\">点击“检查可发送状态”获取当前结果。</span>";
    actionFeedbackPanel.appendChild(actionFeedbackUserNext);
    var actionFeedbackTime = document.createElement("p");
    actionFeedbackTime.id = "acb-action-feedback-time";
    actionFeedbackTime.style.cssText = "margin:4px 0 0 0;font-size:11px;color:#64748b;";
    actionFeedbackTime.textContent = "时间: -";
    actionFeedbackPanel.appendChild(actionFeedbackTime);
    actionStepsSection.appendChild(actionFeedbackPanel);

    var actionStepsList = document.createElement("div");
    actionStepsList.id = "acb-action-steps-list";
    actionStepsList.style.cssText = "margin-top:8px;";
    actionStepsSection.appendChild(actionStepsList);

    classSection.appendChild(actionStepsSection);
    if (classSection.children.length > 1) {
      classSection.insertBefore(actionStepsSection, classSection.children[1]);
    }

    var executorReportSection = document.createElement("div");
    executorReportSection.id = "acb-executor-report-section";
    executorReportSection.style.cssText = "margin:10px 0;padding:10px;border:2px solid #0f766e;background:#f0fdfa;border-radius:8px;display:none;";
    classSection.appendChild(executorReportSection);

    var legacySection = document.createElement("details");
    legacySection.id = "acb-legacy-section";
    legacySection.dataset.acbMode = "debug";
    legacySection.style.cssText = "margin-bottom:14px;padding:10px;background:#f8f8f8;border-radius:4px;border:1px solid #e8e8e8;";
    var legacySummary = document.createElement("summary");
    legacySummary.textContent = "旧卡片探索数据（Legacy，非主流程）";
    legacySummary.style.cssText = "cursor:pointer;font-weight:bold;color:#555;";
    legacySection.appendChild(legacySummary);

    var legacyBody = document.createElement("div");
    legacyBody.style.cssText = "margin-top:8px;";
    addFeedbackRow(legacyBody, "Cards Count", "acb-legacy-cards-count");
    addFeedbackRow(legacyBody, "New Cards Count", "acb-legacy-cards-new-count");
    addFeedbackRow(legacyBody, "Pending Cards Count", "acb-legacy-cards-pending-count");
    addFeedbackRow(legacyBody, "Done Cards Count", "acb-legacy-cards-done-count");
    addFeedbackRow(legacyBody, "Archived Cards Count", "acb-legacy-cards-archived-count");
    legacySection.appendChild(legacyBody);

    var safetySection = document.createElement("div");
    safetySection.id = "acb-safety-section";
    safetySection.dataset.acbMode = "debug";
    safetySection.style.cssText = "margin-bottom:14px;padding:10px;background:#fff7ed;border-radius:6px;border:1px solid #fdba74;";
    var safetyHeading = document.createElement("h3");
    safetyHeading.textContent = "安全锁（只读）";
    safetyHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#9a3412;";
    safetySection.appendChild(safetyHeading);
    addFeedbackRow(safetySection, "安全锁", "acb-safety-lock-status");
    addFeedbackRow(safetySection, "执行", "acb-safety-execution");
    addFeedbackRow(safetySection, "Agent 派发", "acb-safety-agent-dispatch");
    addFeedbackRow(safetySection, "命令执行", "acb-safety-command-execution");
    addFeedbackRow(safetySection, "Git 写入", "acb-safety-git-write");
    setText("acb-safety-lock-status", "已锁定");
    setText("acb-safety-execution", "关闭");
    setText("acb-safety-agent-dispatch", "关闭");
    setText("acb-safety-command-execution", "关闭");
    setText("acb-safety-git-write", "关闭");
    var unlockBtn = makeActionBtn("解锁（后续功能）", function () {});
    unlockBtn.disabled = true;
    unlockBtn.style.opacity = "0.6";
    unlockBtn.style.cursor = "not-allowed";
    safetySection.appendChild(unlockBtn);

    var toolSection = document.createElement("div");
    toolSection.style.cssText = "margin-bottom:14px;padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e5e7eb;";
    var toolHeading = document.createElement("h3");
    toolHeading.textContent = "工具端 / 执行端";
    toolHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#374151;";
    var toolList = document.createElement("div");
    toolList.id = "acb-tool-endpoint-list";
    toolSection.appendChild(toolHeading);
    toolSection.appendChild(toolList);

    var bridgeSection = document.createElement("div");
    bridgeSection.id = "acb-bridge-section";
    bridgeSection.style.cssText = "margin-bottom:14px;padding:10px;background:#f0fdf4;border-radius:4px;border:1px solid #bbf7d0;";
    var bridgeHeading = document.createElement("h3");
    bridgeHeading.textContent = "本地 Bridge 状态";
    bridgeHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#166534;";
    bridgeSection.appendChild(bridgeHeading);
    addFeedbackRow(bridgeSection, "Bridge 状态", "acb-bridge-status");
    addFeedbackRow(bridgeSection, "响应时间", "acb-bridge-timestamp");
    addFeedbackRow(bridgeSection, "Bridge 版本", "acb-bridge-version");
    addFeedbackRow(bridgeSection, "noAutoDispatch", "acb-bridge-no-auto-dispatch");
    addFeedbackRow(bridgeSection, "noCommandExecution", "acb-bridge-no-command-exec");
    addFeedbackRow(bridgeSection, "详情", "acb-bridge-detail");
    var bridgeDetailPre = document.createElement("pre");
    bridgeDetailPre.id = "acb-bridge-detail-pre";
    bridgeDetailPre.style.cssText = "margin:8px 0 0 0;padding:6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:11px;max-height:120px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;display:none;";
    bridgeSection.appendChild(bridgeDetailPre);
    addFeedbackRow(bridgeSection, "任务卡审查已接受", "acb-task-card-review-accepted");
    addFeedbackRow(bridgeSection, "任务卡 ID", "acb-task-card-review-task-card-id");
    addFeedbackRow(bridgeSection, "任务卡目标", "acb-task-card-review-target");
    addFeedbackRow(bridgeSection, "上下文 ID", "acb-task-card-review-context-id");
    addFeedbackRow(bridgeSection, "最近发送时间", "acb-task-card-review-sent-at");
    addFeedbackRow(bridgeSection, "错误", "acb-task-card-review-error");
    // VS Code 查看端最近发送状态（被动显示，发送操作已移至 Action Step 卡片内）
    addFeedbackRow(bridgeSection, "Execution Inbox Accepted", "acb-execution-inbox-accepted");
    addFeedbackRow(bridgeSection, "Execution Inbox Item ID", "acb-execution-inbox-item-id");
    addFeedbackRow(bridgeSection, "Execution Inbox TaskCardId", "acb-execution-inbox-task-card-id");
    addFeedbackRow(bridgeSection, "Execution Inbox Target", "acb-execution-inbox-target");
    addFeedbackRow(bridgeSection, "Execution Inbox Context ID", "acb-execution-inbox-context-id");
    addFeedbackRow(bridgeSection, "Execution Inbox Status", "acb-execution-inbox-status");
    addFeedbackRow(bridgeSection, "Execution Inbox Sent At", "acb-execution-inbox-sent-at");
    addFeedbackRow(bridgeSection, "Execution Inbox Error", "acb-execution-inbox-error");

    var tcrStatus = document.createElement("p");
    tcrStatus.id = "acb-task-card-review-status";
    tcrStatus.style.cssText = "margin:6px 0 0 0;font-size:11px;color:#6b7280;";
    tcrStatus.textContent = "-";
    bridgeSection.appendChild(tcrStatus);

    var projectStatusSection = document.createElement("div");
    projectStatusSection.id = "acb-project-status-section";
    projectStatusSection.style.cssText = "margin-bottom:14px;padding:10px;background:#eff6ff;border-radius:4px;border:1px solid #bfdbfe;";
    var psHeading = document.createElement("h3");
    psHeading.textContent = "本地项目状态";
    psHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#1e40af;";
    projectStatusSection.appendChild(psHeading);
    addFeedbackRow(projectStatusSection, "状态结果", "acb-project-status-result");
    addFeedbackRow(projectStatusSection, "项目路径", "acb-project-status-path");
    addFeedbackRow(projectStatusSection, "工作区名称", "acb-project-status-workspace-name");
    addFeedbackRow(projectStatusSection, "Git 根路径", "acb-project-status-git-root");
    addFeedbackRow(projectStatusSection, "Git 可用", "acb-project-status-git-available");
    addFeedbackRow(projectStatusSection, "分支", "acb-project-status-branch");
    addFeedbackRow(projectStatusSection, "当前 Commit", "acb-project-status-commit");
    addFeedbackRow(projectStatusSection, "工作树状态", "acb-project-status-working-tree");
    addFeedbackRow(projectStatusSection, "变更文件数", "acb-project-status-changed-files");
    addFeedbackRow(projectStatusSection, "已暂存文件数", "acb-project-status-staged-files");
    addFeedbackRow(projectStatusSection, "未跟踪文件数", "acb-project-status-untracked-files");
    addFeedbackRow(projectStatusSection, "最新 Commit", "acb-project-status-latest-commit");
    addFeedbackRow(projectStatusSection, "状态生成时间", "acb-project-status-generated-at");
    addFeedbackRow(projectStatusSection, "Bridge 生成时间", "acb-project-status-bridge-generated-at");
    addFeedbackRow(projectStatusSection, "Safety noAutoDispatch", "acb-project-status-safety-no-auto");
    addFeedbackRow(projectStatusSection, "Safety noCmdExec", "acb-project-status-safety-no-cmd");
    var psError = document.createElement("p");
    psError.id = "acb-project-status-error";
    psError.style.cssText = "margin:6px 0 0 0;font-size:11px;color:#dc2626;display:none;";
    projectStatusSection.appendChild(psError);

    var preflightSection = document.createElement("div");
    preflightSection.id = "acb-preflight-section";
    preflightSection.style.cssText = "margin-bottom:14px;padding:10px;background:#faf5ff;border-radius:4px;border:1px solid #e9d5ff;";
    var pfHeading = document.createElement("h3");
    pfHeading.textContent = "本地任务卡预检";
    pfHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#7c3aed;";
    preflightSection.appendChild(pfHeading);
    addFeedbackRow(preflightSection, "预检状态", "acb-preflight-status");
    addFeedbackRow(preflightSection, "任务卡 ID", "acb-preflight-task-card-id");
    addFeedbackRow(preflightSection, "目标", "acb-preflight-target");
    addFeedbackRow(preflightSection, "起始标记", "acb-preflight-start-detected");
    addFeedbackRow(preflightSection, "结束标记", "acb-preflight-end-detected");
    addFeedbackRow(preflightSection, "ID 匹配", "acb-preflight-id-matched");
    addFeedbackRow(preflightSection, "目标匹配", "acb-preflight-target-matched");
    addFeedbackRow(preflightSection, "缺失必要字段", "acb-preflight-missing-fields");
    addFeedbackRow(preflightSection, "项目路径匹配", "acb-preflight-dir-matched");
    addFeedbackRow(preflightSection, "分支匹配", "acb-preflight-branch-matched");
    addFeedbackRow(preflightSection, "Commit 匹配", "acb-preflight-commit-matched");
    addFeedbackRow(preflightSection, "工作树", "acb-preflight-working-tree");
    addFeedbackRow(preflightSection, "执行允许", "acb-preflight-exec-allowed");
    addFeedbackRow(preflightSection, "Agent 派发允许", "acb-preflight-agent-allowed");
    addFeedbackRow(preflightSection, "Git 写入允许", "acb-preflight-git-allowed");
    addFeedbackRow(preflightSection, "生成时间", "acb-preflight-generated-at");
    addFeedbackRow(preflightSection, "上下文匹配", "acb-preflight-context-matched");
    addFeedbackRow(preflightSection, "忽略过期预检", "acb-preflight-stale-ignored");
    addFeedbackRow(preflightSection, "上下文任务卡ID", "acb-preflight-ctx-task-card-id");
    addFeedbackRow(preflightSection, "上下文Payload状态", "acb-preflight-ctx-payload-status");
    var pfActions = document.createElement("div");
    pfActions.id = "acb-preflight-actions";
    pfActions.style.cssText = "margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
    var pfActionBtn = document.createElement("button");
    pfActionBtn.id = "acb-preflight-btn";
    pfActionBtn.type = "button";
    pfActionBtn.textContent = "检查任务卡预检";
    pfActionBtn.disabled = true;
    pfActionBtn.style.cssText = "padding:4px 14px;border:1px solid #9ca3af;border-radius:4px;background:#e5e7eb;color:#6b7280;cursor:not-allowed;font-size:12px;font-family:Arial,sans-serif;opacity:0.7;";
    pfActionBtn.addEventListener("click", function () {
      var ctx = getActiveExecutionContext();
      if (!ctx.hasCompleteTaskCard) { return; }
      var plan = getCurrentActionPlan();
      if (!plan || !Array.isArray(plan.steps) || ctx.actionStepIndex < 0) { return; }
      var st = plan.steps[ctx.actionStepIndex];
      if (st) {
        testPreflightPayload(st).catch(function (err) {
          console.error("[ACB][preflight] test failed", err);
        });
      }
    });
    pfActions.appendChild(pfActionBtn);
    var pfBtnReason = document.createElement("span");
    pfBtnReason.id = "acb-preflight-btn-reason";
    pfBtnReason.style.cssText = "font-size:11px;color:#6b7280;";
    pfBtnReason.textContent = "当前未选择可预检的动作步骤。";
    pfActions.appendChild(pfBtnReason);
    preflightSection.appendChild(pfActions);
    var pfHint = document.createElement("p");
    pfHint.id = "acb-preflight-hint";
    pfHint.style.cssText = "margin:6px 0 0 0;font-size:11px;color:#6b7280;";
    pfHint.textContent = "";
    preflightSection.appendChild(pfHint);
    var pfChecked = document.createElement("p");
    pfChecked.id = "acb-preflight-last-checked";
    pfChecked.style.cssText = "margin:4px 0 0 0;font-size:11px;color:#64748b;";
    pfChecked.textContent = "最近检查: 未运行";
    preflightSection.appendChild(pfChecked);

    var readinessSection = document.createElement("div");
    readinessSection.id = "acb-readiness-section";
    readinessSection.style.cssText = "margin-bottom:14px;padding:10px;background:#fef9c3;border-radius:4px;border:1px solid #fde047;";
    var rdHeading = document.createElement("h3");
    rdHeading.textContent = "执行前只读门禁";
    rdHeading.style.cssText = "margin:0 0 8px 0;font-size:13px;color:#a16207;";
    readinessSection.appendChild(rdHeading);
    addFeedbackRow(readinessSection, "门禁状态", "acb-readiness-status");
    addFeedbackRow(readinessSection, "摘要", "acb-readiness-summary");
    addFeedbackRow(readinessSection, "阻断原因", "acb-readiness-blocking");
    addFeedbackRow(readinessSection, "警告原因", "acb-readiness-warnings");
    addFeedbackRow(readinessSection, "当前上下文 ID", "acb-readiness-ctx-id");
    addFeedbackRow(readinessSection, "上下文匹配", "acb-readiness-ctx-matched");
    addFeedbackRow(readinessSection, "当前任务卡 ID", "acb-readiness-ctx-task-card-id");
    addFeedbackRow(readinessSection, "当前 Payload 状态", "acb-readiness-ctx-payload-status");
    addFeedbackRow(readinessSection, "当前完整 Payload", "acb-readiness-has-current-payload");
    addFeedbackRow(readinessSection, "Bridge 已连接", "acb-readiness-bridge-connected");
    addFeedbackRow(readinessSection, "项目状态可用", "acb-readiness-ps-available");
    addFeedbackRow(readinessSection, "预检可用", "acb-readiness-pf-available");
    addFeedbackRow(readinessSection, "预检状态", "acb-readiness-pf-status");
    addFeedbackRow(readinessSection, "预检任务卡 ID", "acb-readiness-task-card-id");
    addFeedbackRow(readinessSection, "预检目标", "acb-readiness-target");
    addFeedbackRow(readinessSection, "必要字段齐全", "acb-readiness-fields-present");
    addFeedbackRow(readinessSection, "项目路径匹配", "acb-readiness-dir-matched");
    addFeedbackRow(readinessSection, "分支匹配", "acb-readiness-branch-matched");
    addFeedbackRow(readinessSection, "Commit 匹配", "acb-readiness-commit-matched");
    addFeedbackRow(readinessSection, "工作树状态", "acb-readiness-working-tree");
    addFeedbackRow(readinessSection, "变更文件数", "acb-readiness-changed-files");
    addFeedbackRow(readinessSection, "执行允许", "acb-readiness-exec-allowed");
    addFeedbackRow(readinessSection, "Agent 派发允许", "acb-readiness-agent-allowed");
    addFeedbackRow(readinessSection, "Git 写入允许", "acb-readiness-git-allowed");
    addFeedbackRow(readinessSection, "noAutoDispatch", "acb-readiness-no-auto");
    addFeedbackRow(readinessSection, "noCommandExecution", "acb-readiness-no-cmd");
    addFeedbackRow(readinessSection, "生成时间", "acb-readiness-generated-at");
    var rdActions = document.createElement("div");
    rdActions.id = "acb-readiness-actions";
    rdActions.style.cssText = "margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
    var rdActionBtn = document.createElement("button");
    rdActionBtn.id = "acb-readiness-btn";
    rdActionBtn.type = "button";
    rdActionBtn.textContent = "检查执行准备状态";
    rdActionBtn.style.cssText = "padding:4px 14px;border:1px solid #a16207;border-radius:4px;background:#fef9c3;color:#a16207;cursor:pointer;font-size:12px;font-family:Arial,sans-serif;";
    rdActionBtn.addEventListener("click", function () {
      testReadinessGate().catch(function (err) {
        console.error("[ACB][readiness] test failed", err);
      });
    });
    rdActions.appendChild(rdActionBtn);
    var rdHint = document.createElement("p");
    rdHint.id = "acb-readiness-hint";
    rdHint.style.cssText = "margin:6px 0 0 0;font-size:11px;color:#6b7280;";
    rdHint.textContent = "";
    readinessSection.appendChild(rdActions);
    readinessSection.appendChild(rdHint);
    var rdChecked = document.createElement("p");
    rdChecked.id = "acb-readiness-last-checked";
    rdChecked.style.cssText = "margin:4px 0 0 0;font-size:11px;color:#64748b;";
    rdChecked.textContent = "最近检查: 未运行";
    readinessSection.appendChild(rdChecked);

    var reportSection = document.createElement("div");
    reportSection.style.cssText = "margin-top:14px;";
    var reportHeading = document.createElement("h3");
    reportHeading.textContent = "测试报告";
    reportHeading.style.cssText = "margin:0 0 6px 0;font-size:13px;color:#555;";
    var reportText = document.createElement("textarea");
    reportText.id = "acb-float-report-output";
    reportText.rows = 12;
    reportText.readOnly = true;
    reportText.style.cssText = "width:100%;box-sizing:border-box;padding:8px;font-family:Consolas,monospace;font-size:11px;border:1px solid #ccc;border-radius:4px;resize:vertical;background:#fdfdfd;";
    var copyStatus = document.createElement("p");
    copyStatus.id = "acb-float-copy-status";
    copyStatus.style.cssText = "margin:4px 0 0 0;font-size:11px;min-height:14px;";
    reportSection.appendChild(reportHeading);
    reportSection.appendChild(reportText);
    reportSection.appendChild(copyStatus);

    leftCol.appendChild(channelSection);
    centerCol.appendChild(feedbackSection);
    centerCol.appendChild(classSection);
    rightCol.appendChild(safetySection);
    rightCol.appendChild(toolSection);

    var bridgeDetails = document.createElement("details");
    bridgeDetails.id = "acb-bridge-details";
    bridgeDetails.dataset.acbMode = "debug";
    bridgeDetails.style.cssText = "margin-bottom:10px;";
    var bridgeSummary = document.createElement("summary");
    bridgeSummary.textContent = "桥接与任务卡审查详情（折叠）";
    bridgeSummary.style.cssText = "cursor:pointer;font-size:12px;color:#334155;";
    bridgeDetails.appendChild(bridgeSummary);
    bridgeDetails.appendChild(bridgeSection);
    rightCol.appendChild(bridgeDetails);

    var runtimeDetails = document.createElement("details");
    runtimeDetails.id = "acb-runtime-details";
    runtimeDetails.dataset.acbMode = "debug";
    runtimeDetails.style.cssText = "margin-bottom:10px;";
    var runtimeSummary = document.createElement("summary");
    runtimeSummary.textContent = "预检 / 就绪门禁 / 项目状态（折叠）";
    runtimeSummary.style.cssText = "cursor:pointer;font-size:12px;color:#334155;";
    runtimeDetails.appendChild(runtimeSummary);
    runtimeDetails.appendChild(projectStatusSection);
    runtimeDetails.appendChild(preflightSection);
    runtimeDetails.appendChild(readinessSection);
    rightCol.appendChild(runtimeDetails);

    middleWrap.appendChild(leftCol);
    middleWrap.appendChild(centerCol);
    middleWrap.appendChild(rightCol);
    body.appendChild(topOverview);
    body.appendChild(readonlyBanner);
    body.appendChild(middleWrap);

    var inlineDetailPanel = document.createElement("div");
    inlineDetailPanel.id = "acb-payload-detail-panel";
    inlineDetailPanel.dataset.acbMode = "debug";
    inlineDetailPanel.style.cssText = "display:none;flex-direction:column;gap:8px;border:1px solid #dbeafe;border-radius:6px;background:#f8fbff;padding:8px;min-height:180px;max-height:320px;overflow:hidden;flex-shrink:0;";
    var inlineDetailHeader = document.createElement("div");
    inlineDetailHeader.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;";
    var inlineDetailTitle = document.createElement("strong");
    inlineDetailTitle.id = "acb-payload-detail-title";
    inlineDetailTitle.style.cssText = "font-size:12px;color:#1e3a8a;";
    inlineDetailTitle.textContent = "任务详情 / Payload Detail";
    var inlineDetailCloseBtn = document.createElement("button");
    inlineDetailCloseBtn.type = "button";
    inlineDetailCloseBtn.textContent = "收起";
    inlineDetailCloseBtn.style.cssText = "padding:2px 10px;border:1px solid #94a3b8;border-radius:4px;background:#fff;color:#475569;cursor:pointer;font-size:11px;";
    inlineDetailCloseBtn.addEventListener("click", closePayloadDetailViewer);
    inlineDetailHeader.appendChild(inlineDetailTitle);
    inlineDetailHeader.appendChild(inlineDetailCloseBtn);
    inlineDetailPanel.appendChild(inlineDetailHeader);

    var inlineDetailMeta = document.createElement("div");
    inlineDetailMeta.id = "acb-payload-detail-meta";
    inlineDetailMeta.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:#334155;";
    inlineDetailMeta.textContent = "请选择一个任务卡查看详情。";
    inlineDetailPanel.appendChild(inlineDetailMeta);

    var inlineDetailContent = document.createElement("pre");
    inlineDetailContent.id = "acb-payload-detail-content";
    inlineDetailContent.style.cssText = "margin:0;padding:8px;border:1px solid #dbeafe;border-radius:4px;background:#fff;font-size:11px;white-space:pre-wrap;word-break:break-word;overflow:auto;min-height:110px;";
    inlineDetailContent.textContent = "请选择一个任务卡查看详情。";
    inlineDetailPanel.appendChild(inlineDetailContent);

    var inlineDetailFooter = document.createElement("div");
    inlineDetailFooter.id = "acb-payload-detail-footer";
    inlineDetailFooter.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
    var inlineCopyBtn = document.createElement("button");
    inlineCopyBtn.id = "acb-payload-detail-copy-btn";
    inlineCopyBtn.type = "button";
    inlineCopyBtn.textContent = "复制完整任务卡";
    inlineCopyBtn.disabled = true;
    inlineCopyBtn.style.cssText = "padding:4px 12px;border:1px solid #94a3b8;border-radius:4px;background:#e2e8f0;color:#64748b;cursor:not-allowed;font-size:11px;";
    var inlineCopyStatus = document.createElement("span");
    inlineCopyStatus.id = "acb-payload-detail-copy-status";
    inlineCopyStatus.style.cssText = "font-size:11px;color:#64748b;";
    inlineDetailFooter.appendChild(inlineCopyBtn);
    inlineDetailFooter.appendChild(inlineCopyStatus);
    inlineDetailPanel.appendChild(inlineDetailFooter);
    centerCol.appendChild(inlineDetailPanel);

    var debugSection = document.createElement("details");
    debugSection.id = "acb-debug-section";
    debugSection.dataset.acbMode = "debug";
    debugSection.style.cssText = "margin-top:8px;flex-shrink:0;";
    var debugSummary = document.createElement("summary");
    debugSummary.textContent = "测试报告 / 调试信息";
    debugSummary.style.cssText = "cursor:pointer;font-size:12px;color:#334155;font-weight:bold;";
    debugSection.appendChild(debugSummary);
    debugSection.appendChild(legacySection);
    debugSection.appendChild(reportSection);
    body.appendChild(debugSection);

    panel.appendChild(header);
    panel.appendChild(actionBar);
    panel.appendChild(statusEl);
    panel.appendChild(body);

    document.body.appendChild(panel);
    applyConsoleDisplayMode();
  }

  function toggleFloatingConsole() {
    var panel = document.getElementById("acb-floating-console");
    if (!panel) {
      return;
    }

    floatingVisible = !floatingVisible;
    if (floatingVisible) {
      panel.style.display = "flex";
      applyConsoleDisplayMode();
      refreshFloatingConsole().catch(function (err) {
        console.error("[ACB][floating-console] refresh failed", err);
      });
    } else {
      panel.style.display = "none";
    }
  }

  function injectConsoleFab() {
    if (document.getElementById("acb-console-fab")) {
      return;
    }

    injectFloatingConsole();

    var DRAG_THRESHOLD = 5;
    var BUTTON_EST_WIDTH = 120;
    var BUTTON_EST_HEIGHT = 32;

    var defaultLeft = Math.max(8, window.innerWidth - BUTTON_EST_WIDTH - 24);
    var defaultTop = Math.max(8, window.innerHeight - BUTTON_EST_HEIGHT - 96);

    var btn = document.createElement("button");
    btn.id = "acb-console-fab";
    btn.textContent = "ACB 控制台";
    btn.title = "切换 ACB 控制台";
    btn.style.cssText = [
      "position:fixed",
      "left:" + defaultLeft + "px",
      "top:" + defaultTop + "px",
      "z-index:2147483647",
      "padding:8px 14px",
      "background:#333",
      "color:#fff",
      "border:none",
      "border-radius:6px",
      "cursor:grab",
      "font-size:13px",
      "font-family:Arial,sans-serif",
      "box-shadow:0 2px 8px rgba(0,0,0,0.3)",
      "user-select:none",
      "touch-action:none"
    ].join(";");

    var dragState = null;

    function clampLeft(v) {
      return Math.max(8, Math.min(v, window.innerWidth - btn.offsetWidth - 8));
    }

    function clampTop(v) {
      return Math.max(8, Math.min(v, window.innerHeight - btn.offsetHeight - 8));
    }

    function applyPosition(left, top) {
      btn.style.left = left + "px";
      btn.style.top = top + "px";
    }

    async function loadSavedPosition() {
      try {
        var state = await globalThis.AcbStorage.getUiState();
        var pos = state && state.floatingButtonPosition;
        if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
          applyPosition(clampLeft(pos.left), clampTop(pos.top));
        }
      } catch (_e) {
        // Keep default position
      }
    }

    async function savePosition(left, top) {
      try {
        await globalThis.AcbStorage.setFloatingButtonPosition({
          left: left,
          top: top
        });
      } catch (_e) {
        // Silently fail
      }
    }

    function onResize() {
      if (!btn.isConnected) {
        window.removeEventListener("resize", onResize);
        return;
      }
      var left = parseInt(btn.style.left) || defaultLeft;
      var top = parseInt(btn.style.top) || defaultTop;
      var clampedLeft = clampLeft(left);
      var clampedTop = clampTop(top);
      if (clampedLeft !== left || clampedTop !== top) {
        applyPosition(clampedLeft, clampedTop);
      }
    }

    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.style.cursor = "grabbing";

      var rect = btn.getBoundingClientRect();
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        isDragging: false
      };
    });

    btn.addEventListener("pointermove", function (e) {
      if (!dragState) {
        return;
      }

      var dx = e.clientX - dragState.startX;
      var dy = e.clientY - dragState.startY;

      if (!dragState.isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragState.isDragging = true;
      }

      if (dragState.isDragging) {
        applyPosition(
          clampLeft(dragState.startLeft + dx),
          clampTop(dragState.startTop + dy)
        );
      }
    });

    btn.addEventListener("pointerup", function (e) {
      if (!dragState) {
        return;
      }

      btn.style.cursor = "grab";

      if (dragState.isDragging) {
        savePosition(parseInt(btn.style.left), parseInt(btn.style.top));
      } else {
        toggleFloatingConsole();
      }
      dragState = null;
    });

    btn.addEventListener("pointercancel", function () {
      if (dragState) {
        btn.style.cursor = "grab";
        dragState = null;
      }
    });

    window.addEventListener("resize", onResize);

    document.body.appendChild(btn);

    loadSavedPosition();
  }

  function initMockMode() {
    currentMode = MODE_MOCK;
    startMockObserver();
    injectConsoleFab();
  }

  function initChatGptMode() {
    currentMode = MODE_CHATGPT;
    injectConsoleFab();
  }

  function onReady() {
    if (isMockPage()) {
      initMockMode();
      return;
    }
    if (isChatGptPage()) {
      initChatGptMode();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
