(function () {
  "use strict";

  var ROOT_KEY = "acb.latestFeedbacks";

  function chromeGet(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (result) {
        resolve(result || {});
      });
    });
  }

  function chromeSet(payload) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(payload, function () {
        resolve();
      });
    });
  }

  async function getAllLatestFeedbacks() {
    var result = await chromeGet([ROOT_KEY]);
    return result[ROOT_KEY] || {};
  }

  async function getLatestFeedback(channelId) {
    var all = await getAllLatestFeedbacks();
    return all[channelId] || null;
  }

  async function setLatestFeedback(channelId, feedback) {
    var all = await getAllLatestFeedbacks();
    all[channelId] = feedback;
    await chromeSet({ [ROOT_KEY]: all });
  }

  var CHANNEL_STATE_KEY = "acb.channelStates";
  var PAGE_BINDINGS_KEY = "acb.pageBindings";
  var UI_STATE_KEY = "acb.uiState";
  var CARDS_KEY = "acb.cards";
  var FEEDBACK_CLASSIFICATIONS_KEY = "acb.feedbackClassifications";
  var ACTION_STEPS_KEY = "acb.actionSteps";
  var LOCAL_BRIDGE_KEY = "acb.localBridge.latest";
  var PROJECT_STATUS_KEY = "acb.localBridge.projectStatusLatest";
  var PREFLIGHT_KEY = "acb.localBridge.preflightLatest";
  var READINESS_KEY = "acb.localBridge.readinessLatest";
  var TASK_CARD_REVIEW_KEY = "acb.localBridge.taskCardReviewLatest";
  var EXECUTION_INBOX_KEY = "acb.localBridge.executionInboxLatest";
  var PRE_EXECUTION_HANDOFF_KEY = "acb.localBridge.preExecutionHandoffLatest";
  var MANUAL_EXECUTION_REPORT_KEY = "acb.localBridge.manualExecutionReportLatest";

  async function getAllChannelStates() {
    var result = await chromeGet([CHANNEL_STATE_KEY]);
    return result[CHANNEL_STATE_KEY] || {};
  }

  async function setChannelStatus(channelId, status) {
    var all = await getAllChannelStates();
    all[channelId] = {
      status: status,
      updatedAt: new Date().toISOString()
    };
    await chromeSet({ [CHANNEL_STATE_KEY]: all });
  }

  async function getAllPageBindings() {
    var result = await chromeGet([PAGE_BINDINGS_KEY]);
    return result[PAGE_BINDINGS_KEY] || {};
  }

  async function getPageBinding(pageKey) {
    if (!pageKey) {
      return null;
    }
    var all = await getAllPageBindings();
    return all[pageKey] || null;
  }

  async function setPageBinding(pageKey, binding) {
    if (!pageKey) {
      return;
    }
    var all = await getAllPageBindings();
    all[pageKey] = binding;
    await chromeSet({ [PAGE_BINDINGS_KEY]: all });
  }

  async function getAllCards() {
    var result = await chromeGet([CARDS_KEY]);
    var cards = result[CARDS_KEY];
    return Array.isArray(cards) ? cards : [];
  }

  async function setAllCards(cards) {
    await chromeSet({ [CARDS_KEY]: Array.isArray(cards) ? cards : [] });
  }

  async function addCard(card) {
    var cards = await getAllCards();
    cards.push(card);
    await setAllCards(cards);
  }

  async function updateCard(cardId, patch) {
    if (!cardId || !patch) {
      return null;
    }

    var cards = await getAllCards();
    var updated = null;

    for (var i = 0; i < cards.length; i += 1) {
      if (cards[i].id !== cardId) {
        continue;
      }

      cards[i] = Object.assign({}, cards[i], patch, {
        updatedAt: new Date().toISOString()
      });
      updated = cards[i];
      break;
    }

    await setAllCards(cards);
    return updated;
  }

  async function getAllFeedbackClassifications() {
    var result = await chromeGet([FEEDBACK_CLASSIFICATIONS_KEY]);
    var data = result[FEEDBACK_CLASSIFICATIONS_KEY];
    return data && typeof data === "object" ? data : {};
  }

  async function setAllFeedbackClassifications(map) {
    await chromeSet({
      [FEEDBACK_CLASSIFICATIONS_KEY]: map && typeof map === "object" ? map : {}
    });
  }

  async function setFeedbackClassification(classificationKey, classification) {
    if (!classificationKey || !classification) {
      return;
    }
    var all = await getAllFeedbackClassifications();
    all[classificationKey] = classification;
    await setAllFeedbackClassifications(all);
  }

  async function deleteFeedbackClassification(classificationKey) {
    if (!classificationKey) {
      return;
    }
    var all = await getAllFeedbackClassifications();
    if (Object.prototype.hasOwnProperty.call(all, classificationKey)) {
      delete all[classificationKey];
      await setAllFeedbackClassifications(all);
    }
  }

  async function getAllActionSteps() {
    var result = await chromeGet([ACTION_STEPS_KEY]);
    var data = result[ACTION_STEPS_KEY];
    return data && typeof data === "object" ? data : {};
  }

  async function setAllActionSteps(map) {
    await chromeSet({
      [ACTION_STEPS_KEY]: map && typeof map === "object" ? map : {}
    });
  }

  async function setActionPlan(planKey, plan) {
    if (!planKey || !plan) {
      return;
    }
    var all = await getAllActionSteps();
    all[planKey] = plan;
    await setAllActionSteps(all);
  }

  async function deleteActionPlan(planKey) {
    if (!planKey) {
      return;
    }
    var all = await getAllActionSteps();
    if (Object.prototype.hasOwnProperty.call(all, planKey)) {
      delete all[planKey];
      await setAllActionSteps(all);
    }
  }

  async function getUiState() {
    var result = await chromeGet([UI_STATE_KEY]);
    return result[UI_STATE_KEY] || {};
  }

  async function getLocalBridgeLatest() {
    var result = await chromeGet([LOCAL_BRIDGE_KEY]);
    return result[LOCAL_BRIDGE_KEY] || null;
  }

  async function setLocalBridgeLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [LOCAL_BRIDGE_KEY]: entry });
  }

  async function getLocalBridgeProjectStatusLatest() {
    var result = await chromeGet([PROJECT_STATUS_KEY]);
    return result[PROJECT_STATUS_KEY] || null;
  }

  async function setLocalBridgeProjectStatusLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [PROJECT_STATUS_KEY]: entry });
  }

  async function getLocalBridgePreflightLatest() {
    var result = await chromeGet([PREFLIGHT_KEY]);
    return result[PREFLIGHT_KEY] || null;
  }

  async function setLocalBridgePreflightLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [PREFLIGHT_KEY]: entry });
  }

  async function getLocalBridgeReadinessLatest() {
    var result = await chromeGet([READINESS_KEY]);
    return result[READINESS_KEY] || null;
  }

  async function setLocalBridgeReadinessLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [READINESS_KEY]: entry });
  }

  async function getLocalBridgeTaskCardReviewLatest() {
    var result = await chromeGet([TASK_CARD_REVIEW_KEY]);
    return result[TASK_CARD_REVIEW_KEY] || null;
  }

  async function setLocalBridgeTaskCardReviewLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [TASK_CARD_REVIEW_KEY]: entry });
  }

  async function getLocalBridgeExecutionInboxLatest() {
    var result = await chromeGet([EXECUTION_INBOX_KEY]);
    return result[EXECUTION_INBOX_KEY] || null;
  }

  async function setLocalBridgeExecutionInboxLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [EXECUTION_INBOX_KEY]: entry });
  }

  async function getLocalBridgePreExecutionHandoffLatest() {
    var result = await chromeGet([PRE_EXECUTION_HANDOFF_KEY]);
    return result[PRE_EXECUTION_HANDOFF_KEY] || null;
  }

  async function setLocalBridgePreExecutionHandoffLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [PRE_EXECUTION_HANDOFF_KEY]: entry });
  }

  async function getLocalBridgeManualExecutionReportLatest() {
    var result = await chromeGet([MANUAL_EXECUTION_REPORT_KEY]);
    return result[MANUAL_EXECUTION_REPORT_KEY] || null;
  }

  async function setLocalBridgeManualExecutionReportLatest(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    await chromeSet({ [MANUAL_EXECUTION_REPORT_KEY]: entry });
  }

  async function setFloatingButtonPosition(position) {
    if (!position || typeof position.left !== "number" || typeof position.top !== "number") {
      return;
    }
    var state = await getUiState();
    state.floatingButtonPosition = {
      left: position.left,
      top: position.top,
      updatedAt: new Date().toISOString()
    };
    await chromeSet({ [UI_STATE_KEY]: state });
  }

  globalThis.AcbStorage = {
    ROOT_KEY: ROOT_KEY,
    getAllLatestFeedbacks: getAllLatestFeedbacks,
    getLatestFeedback: getLatestFeedback,
    setLatestFeedback: setLatestFeedback,
    getAllChannelStates: getAllChannelStates,
    setChannelStatus: setChannelStatus,
    PAGE_BINDINGS_KEY: PAGE_BINDINGS_KEY,
    getAllPageBindings: getAllPageBindings,
    getPageBinding: getPageBinding,
    setPageBinding: setPageBinding,
    CARDS_KEY: CARDS_KEY,
    getAllCards: getAllCards,
    setAllCards: setAllCards,
    addCard: addCard,
    updateCard: updateCard,
    FEEDBACK_CLASSIFICATIONS_KEY: FEEDBACK_CLASSIFICATIONS_KEY,
    getAllFeedbackClassifications: getAllFeedbackClassifications,
    setAllFeedbackClassifications: setAllFeedbackClassifications,
    setFeedbackClassification: setFeedbackClassification,
    deleteFeedbackClassification: deleteFeedbackClassification,
    ACTION_STEPS_KEY: ACTION_STEPS_KEY,
    getAllActionSteps: getAllActionSteps,
    setAllActionSteps: setAllActionSteps,
    setActionPlan: setActionPlan,
    deleteActionPlan: deleteActionPlan,
    LOCAL_BRIDGE_KEY: LOCAL_BRIDGE_KEY,
    getLocalBridgeLatest: getLocalBridgeLatest,
    setLocalBridgeLatest: setLocalBridgeLatest,
    PROJECT_STATUS_KEY: PROJECT_STATUS_KEY,
    getLocalBridgeProjectStatusLatest: getLocalBridgeProjectStatusLatest,
    setLocalBridgeProjectStatusLatest: setLocalBridgeProjectStatusLatest,
    PREFLIGHT_KEY: PREFLIGHT_KEY,
    getLocalBridgePreflightLatest: getLocalBridgePreflightLatest,
    setLocalBridgePreflightLatest: setLocalBridgePreflightLatest,
    READINESS_KEY: READINESS_KEY,
    getLocalBridgeReadinessLatest: getLocalBridgeReadinessLatest,
    setLocalBridgeReadinessLatest: setLocalBridgeReadinessLatest,
    TASK_CARD_REVIEW_KEY: TASK_CARD_REVIEW_KEY,
    getLocalBridgeTaskCardReviewLatest: getLocalBridgeTaskCardReviewLatest,
    setLocalBridgeTaskCardReviewLatest: setLocalBridgeTaskCardReviewLatest,
    EXECUTION_INBOX_KEY: EXECUTION_INBOX_KEY,
    getLocalBridgeExecutionInboxLatest: getLocalBridgeExecutionInboxLatest,
    setLocalBridgeExecutionInboxLatest: setLocalBridgeExecutionInboxLatest,
    PRE_EXECUTION_HANDOFF_KEY: PRE_EXECUTION_HANDOFF_KEY,
    getLocalBridgePreExecutionHandoffLatest: getLocalBridgePreExecutionHandoffLatest,
    setLocalBridgePreExecutionHandoffLatest: setLocalBridgePreExecutionHandoffLatest,
    MANUAL_EXECUTION_REPORT_KEY: MANUAL_EXECUTION_REPORT_KEY,
    getLocalBridgeManualExecutionReportLatest: getLocalBridgeManualExecutionReportLatest,
    setLocalBridgeManualExecutionReportLatest: setLocalBridgeManualExecutionReportLatest,
    UI_STATE_KEY: UI_STATE_KEY,
    getUiState: getUiState,
    setFloatingButtonPosition: setFloatingButtonPosition
  };
})();
