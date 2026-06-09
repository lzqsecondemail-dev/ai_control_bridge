(function () {
  "use strict";

  var STORAGE_KEY = globalThis.AcbStorage.ROOT_KEY || "acb.latestFeedbacks";
  var CHANNELS = [
    { id: "execution-controller", name: "执行总控", type: "controller", pinned: true },
    { id: "engineering-advisor", name: "工程参谋", type: "advisor", pinned: false },
    { id: "test-advisor", name: "测试参谋", type: "advisor", pinned: false },
    { id: "security-advisor", name: "安全参谋", type: "advisor", pinned: false },
    { id: "ux-advisor", name: "UI/UX 参谋", type: "advisor", pinned: false }
  ];

  var statusEl = document.getElementById("status");
  var channelListEl = document.getElementById("channelList");
  var refreshBtn = document.getElementById("refresh-btn");
  var exportReportBtn = document.getElementById("export-report-btn");
  var reportOutputEl = document.getElementById("reportOutput");

  var channelNameEl = document.getElementById("channelName");
  var channelTypeEl = document.getElementById("channelType");
  var hasFeedbackEl = document.getElementById("hasFeedback");
  var capturedAtEl = document.getElementById("capturedAt");
  var hashEl = document.getElementById("hash");
  var lastUserMessageEl = document.getElementById("lastUserMessage");
  var assistantMessageEl = document.getElementById("assistantMessage");

  var selectedChannelId = CHANNELS[0].id;
  var latestFeedbacksByChannel = {};

  function getChannelById(channelId) {
    for (var i = 0; i < CHANNELS.length; i += 1) {
      if (CHANNELS[i].id === channelId) {
        return CHANNELS[i];
      }
    }
    return CHANNELS[0];
  }

  function getSelectedFeedback() {
    return latestFeedbacksByChannel[selectedChannelId] || null;
  }

  function renderFeedbackPanel() {
    var channel = getChannelById(selectedChannelId);
    var feedback = getSelectedFeedback();

    channelNameEl.textContent = channel.name;
    channelTypeEl.textContent = channel.type;
    hasFeedbackEl.textContent = feedback ? "true" : "false";
    capturedAtEl.textContent = feedback ? feedback.capturedAt || "-" : "-";
    hashEl.textContent = feedback ? feedback.hash || "-" : "-";
    lastUserMessageEl.textContent = feedback ? feedback.lastUserMessage || "" : "";
    assistantMessageEl.textContent = feedback ? feedback.assistantMessage || "" : "";
  }

  function buildChannelLabel(channel) {
    return channel.pinned ? "📌 " + channel.name : channel.name;
  }

  function renderChannelList() {
    channelListEl.innerHTML = "";

    for (var i = 0; i < CHANNELS.length; i += 1) {
      var channel = CHANNELS[i];
      var hasFeedback = Boolean(latestFeedbacksByChannel[channel.id]);

      var item = document.createElement("li");
      var button = document.createElement("button");
      var dot = document.createElement("span");

      button.type = "button";
      button.className = "channel-btn";
      if (channel.pinned) {
        button.className += " controller";
      }
      if (channel.id === selectedChannelId) {
        button.className += " active";
      }
      button.textContent = buildChannelLabel(channel);
      button.dataset.channelId = channel.id;
      button.addEventListener("click", function (event) {
        selectedChannelId = event.currentTarget.dataset.channelId;
        renderChannelList();
        renderFeedbackPanel();
      });

      dot.className = "dot";
      if (!hasFeedback) {
        dot.className += " hidden";
      }

      item.appendChild(button);
      item.appendChild(dot);
      channelListEl.appendChild(item);
    }
  }

  function getExtensionInfo() {
    var fallback = "AI Control Bridge Dev 0.1.0";
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.getManifest) {
        return fallback;
      }
      var manifest = chrome.runtime.getManifest();
      return (manifest.name || "AI Control Bridge Dev") + " " + (manifest.version || "0.1.0");
    } catch (_error) {
      return fallback;
    }
  }

  function buildReport() {
    var channel = getChannelById(selectedChannelId);
    var feedback = getSelectedFeedback();
    var hasFeedback = Boolean(feedback);

    var lines = [
      "ACB M1-B Multi-Channel Mock Test Report",
      "",
      "GeneratedAt: " + new Date().toISOString(),
      "Test Scope: mock-chatgpt only",
      "Extension: " + getExtensionInfo(),
      "Storage Key: " + STORAGE_KEY,
      "Selected Channel ID: " + channel.id,
      "Selected Channel Name: " + channel.name,
      "Selected Channel Type: " + channel.type,
      "",
      "hasFeedback: " + String(hasFeedback),
      "capturedAt: " + (hasFeedback ? feedback.capturedAt || "" : ""),
      "hash: " + (hasFeedback ? feedback.hash || "" : ""),
      "lastUserMessage:",
      hasFeedback ? feedback.lastUserMessage || "" : "",
      "",
      "assistantMessage:",
      hasFeedback ? feedback.assistantMessage || "" : "",
      "",
      "Basic Result:",
      "- consoleLoaded: true",
      "- feedbackLoaded: " + String(hasFeedback),
      "",
      "Manual Test Checklist:",
      "- extensionLoaded: [user confirm]",
      "- appendReplyTest: [user confirm]",
      "- streamingReplyTest: [user confirm]",
      "- fullReplyCaptured: [user confirm]",
      "- noVisibleError: [user confirm]",
      "",
      "Notes:",
      hasFeedback
        ? "Current selected channel has latest feedback."
        : "No latest feedback on selected channel. Trigger mock assistant update on this channel and click Refresh."
    ];

    return lines.join("\n");
  }

  async function exportReport() {
    var reportText = buildReport();
    reportOutputEl.value = reportText;
    reportOutputEl.focus();
    reportOutputEl.select();

    var copyStatusEl = document.getElementById("copyStatus");
    try {
      await navigator.clipboard.writeText(reportText);
      if (copyStatusEl) {
        copyStatusEl.textContent = "Copied to clipboard";
      }
      statusEl.textContent = "测试报告已生成，已复制到剪贴板（当前选中通道）";
    } catch (_err) {
      if (copyStatusEl) {
        copyStatusEl.textContent = "Auto copy failed, please copy from the text area manually";
      }
      statusEl.textContent = "测试报告已生成，自动复制失败，请从文本框手工复制（当前选中通道）";
    }
  }

  async function refresh() {
    statusEl.textContent = "读取中...";
    latestFeedbacksByChannel = await globalThis.AcbStorage.getAllLatestFeedbacks();
    renderChannelList();
    renderFeedbackPanel();
    statusEl.textContent = "已刷新多通道反馈";
  }

  refreshBtn.addEventListener("click", function () {
    refresh().catch(function (error) {
      statusEl.textContent = "读取失败";
      console.error("[ACB][console] refresh failed", error);
    });
  });

  exportReportBtn.addEventListener("click", function () {
    exportReport().catch(function (error) {
      statusEl.textContent = "报告导出失败";
      console.error("[ACB][console] export report failed", error);
    });
  });

  refresh().catch(function (error) {
    statusEl.textContent = "读取失败";
    console.error("[ACB][console] initial refresh failed", error);
  });
})();
