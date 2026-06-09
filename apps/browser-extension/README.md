# AI Control Bridge Browser Extension (M2-B)

## Scope

The extension currently supports:

1. Mock page mode (`file://.../mock/mock-chatgpt.html`)
2. Real ChatGPT page capture mode (`https://chatgpt.com/*`, `https://chat.openai.com/*`)
3. Floating console for channel review, classification, and execution step drafting

M2 product direction:

- Main workflow: current feedback classification -> execution gate -> Action Steps
- Card Inbox is legacy exploration data only (not the primary flow)

## Storage Keys

- `acb.latestFeedbacks`: latest feedback per channel
- `acb.channelStates`: per-channel status (`unread`, `seen`, `pending`, `done`)
- `acb.pageBindings`: ChatGPT page binding info
- `acb.feedbackClassifications`: current feedback classification map
- `acb.actionSteps`: execution action plan map (M2-B)
- `acb.cards`: legacy exploration data (kept for compatibility)
- `acb.uiState`: floating button position and related UI state

### `acb.feedbackClassifications`

- key: `<channelId>:<feedbackId>` (fallback `<channelId>:<feedbackHash>`)
- value fields include:
  - `feedbackType`, `title`, `summary`
  - `defaultBehavior`, `recommendedStatus`, `attentionLevel`
  - `needsExecution`, `suggestedNextAction`, `confidence`
  - `metaSource` (`acb_card_meta` / `fallback_rule` / `manual`)
  - `userEdited`

### `acb.actionSteps`

- key: `<channelId>:<feedbackId-or-hash>`
- value fields include:
  - `id`, `feedbackId`, `feedbackHash`
  - `sourceChannelId`, `sourceChannelName`, `classificationKey`
  - `createdAt`, `updatedAt`, `status`
  - `steps[]`

Plan status enum:

- `draft`, `active`, `done`, `cancelled`

Step status enum:

- `pending`, `copied`, `in_progress`, `reported`, `done`, `skipped`

Step target enum (M2-B):

- `controller`, `user`, `codex`, `claude`, `deepseek`, `powershell`, `git`, `docs`, `manual`, `unknown`

## Load in Chrome / Edge

1. Open `chrome://extensions/` or `edge://extensions/`
2. Enable **Developer mode**
3. Load unpacked folder: `<project-root>/apps/browser-extension`
4. Enable **Allow access to file URLs** (for mock mode)
5. Ensure site access includes ChatGPT pages

## Main UI (M2-B)

Open **ACB Console** (floating button):

1. Select a channel and inspect latest feedback
2. Review **当前反馈类型** block (classification)
3. Edit and save classification if needed
4. If execution is required, generate and review Action Steps draft

## Classification Input Sources

### ACB_CARD_META priority

If assistant message contains:

```xml
<ACB_CARD_META>
feedbackType: strategy
title: ...
summary: ...
defaultBehavior: pendingReview
recommendedStatus: pending
attentionLevel: high
needsExecution: false
suggestedNextAction: review_and_confirm
confidence: high
</ACB_CARD_META>
```

the console uses this metadata first.

Compatibility:

- if `feedbackType` is missing but `cardType` exists, `cardType` is used as fallback
- enum fields are validated
- `needsExecution` parses `"true"/"false"` into boolean

### Local fallback classification

When no `ACB_CARD_META` exists, conservative local rules apply:

- default: `content`, `autoRead`, `seen`, `low`, `needsExecution=false`, `confidence=low`
- title/summary are generated from assistant text prefixes
- limited keyword rules may map to `execution/recommendation/strategy/decision`
- fallback never auto-creates tasks, never auto-dispatches agents

### Manual classification

Editable fields:

- `feedbackType`
- `title`
- `summary`
- `defaultBehavior`
- `recommendedStatus`
- `attentionLevel`
- `needsExecution`
- `suggestedNextAction`
- `confidence`

Buttons:

- `保存分类`
- `重置为自动识别`

Save result:

- `metaSource = manual`
- `userEdited = true`

Reset result:

- classification goes back to `acb_card_meta` or `fallback_rule`

## M2-B Action Steps

### Execution gate

Action Steps entry appears only when:

- `feedbackType === execution`, or
- `needsExecution === true`

Otherwise the panel shows:

- `当前反馈不需要执行，未生成 Action Steps。`

### Generation behavior

Click `生成 Action Steps` to create a local draft plan.

Rules are local-only and conservative:

- controller-approved task-card style feedback can infer a non-controller target (Codex/Claude/DeepSeek/PowerShell/Git/Docs)
- advisor/proposal style feedback defaults to controller review + rewrite steps
- unclear execution intent defaults to controller confirmation step
- if `needsExecution=true` but type is not `execution`, controller confirmation step is created first

### Editing behavior

Each step supports local manual edits:

- `target`
- `status`
- `title`
- `summary`
- `detail`

The UI displays compact step rows:

- 第几步
- 发给谁
- 做什么
- 状态

No automatic dispatch is performed.

## Legacy Card Downgrade

`Create Card` / `Card Inbox` are not the primary workflow.

- Legacy data remains in `acb.cards`
- Console only keeps a collapsed legacy summary for compatibility/debug

## Export Test Report

Report keeps M1-B/M1-C fields and includes classification and action-step fields:

- `Feedback Classification Detected`
- `Feedback Type`
- `Feedback Classification Title`
- `Feedback Classification Summary`
- `Default Behavior`
- `Recommended Status`
- `Attention Level`
- `Needs Execution`
- `Suggested Next Action`
- `Classification Confidence`
- `Classification Source`
- `User Edited Classification`
- `Action Plan Detected`
- `Action Plan Status`
- `Action Steps Count`
- `Action Step N: target=..., status=..., title=...`

Legacy card counts remain for compatibility:

- `Cards Count`
- `New Cards Count`
- `Pending Cards Count`
- `Done Cards Count`
- `Archived Cards Count`

Clipboard behavior remains:

- success: `Copied to clipboard`
- fallback: `Auto copy failed, please copy from the text area manually`

## M2-B.1-A Task Card Payload Validation

### Core principle

Action Step UI summaries are **not** Agent execution payloads. They are compressed descriptions for human review only.

Agent payloads (for Codex, Claude, DeepSeek, PowerShell, etc.) must come from a complete task card generated by GPT/the controller, and must pass integrity checks before being copied or dispatched.

### Task card protocol

Complete task cards use strict boundary markers:

```xml
<ACB_TASK_CARD id="..." target="codex" version="1">
...
<ACB_TASK_CARD_END id="...">
```

The opening marker must include `id`, `target`, and `version` attributes.

### Validation rules

Each non-controller step is validated against the assistant message:

- Must contain start and end markers
- Start `id` must equal end `id`
- Marker `target` must match the step's `target`
- Must include all required fields (taskCardId, target, taskTitle, projectDir, currentBranch, currentCommit, objective, allowedFiles, forbiddenActions, implementationRequirements, checks, gitBoundary, reportFormat, acceptanceCriteria)

Payload status values:

- `complete`: all checks pass, can send to agent
- `incomplete`: card detected but validation failed
- `missing`: no task card found in assistant message
- `not_applicable`: step target is `controller`

### Scope

- Payload detection and reporting only
- No automatic dispatch
- No command execution
- No remote calls
- Steps that fail validation must not be used as agent payloads

## M3-Bridge.4 Task Card Review Bridge (Read-only)

### Two-layer payload model

When sending from browser console to local bridge:

- `executablePayload`: exactly one complete bounded `ACB_TASK_CARD` block
- `reviewMetadata`: review/debug/audit context only

Hard rule:

- Only `executablePayload` is future executable payload
- `reviewMetadata` is never executable payload

### Browser-side send gate

Button:

- `发送到 VS Code 查看端`

Enable only when current step passes gate:

- Non-controller target
- `payloadStatus=complete`
- `canSendToAgent=true`
- `fullTaskCard` exists
- Start/end markers detected
- Start/end ID matched
- Target matched
- Required fields present
- No multiple-task-card detection
- No truncation suspicion

### Bridge endpoint

- `POST /acb/v1/task-card-review`
- `GET /acb/v1/task-card-review/latest`

Server validation includes:

- `executablePayload` required
- Exactly one task card block
- Start marker present
- End marker present
- Marker IDs matched
- `taskCardId` field present and matched to marker ID
- `target` field present and matched to marker target
- Required fields present

Invalid payload:

- HTTP 400
- Returns diagnostics
- Does not overwrite latest accepted review object

Valid payload:

- Stored in memory only (no disk persistence)
- Returns accepted summary with safety flags locked:
  - `noAutoDispatch=true`
  - `noCommandExecution=true`
  - `executionAllowed=false`
  - `agentDispatchAllowed=false`
  - `gitWriteAllowed=false`

### VS Code viewer

Read-only viewer command implemented in extension runtime:

- `acb.showTaskCardReview`

Viewer shows:

- Review status
- Source metadata
- Task card metadata
- Local project status
- Preflight/readiness status
- Safety flags
- Full executable payload text

Read-only warning is displayed in Chinese and explicitly states no command execution, no agent dispatch, no file modification, and no Git writes.

### Export report additions

Floating console report includes:

- `--- Task Card Review Bridge ---`
- Send attempted / accepted
- TaskCardId / target / context ID
- Rejection error
- Executable payload present
- Review metadata present
- Local bridge endpoint
- Safety locks summary

## M3-UI.0 Three-Column Console (Read-only)

M3-UI.0 focuses on information architecture only. It does not add execution capability.

### Layout

- Top overview: project / bridge / git / working-tree / safety mode summary
- Left column: GPT conversation identity cards (channelId + source conversation hints)
- Center column: selected identity latest captured feedback + action/task cards
- Right column: tool endpoint cards (status-only) + folded diagnostics blocks

### Identity cards

- Treated as user-manageable conversation identities, not immutable built-in roles
- Show display name, role type, binding status, unread marker, latest capture time/hash
- Selecting an identity card updates the center panel

### Selected latest message and task cards

- Center panel shows the selected identity card's latest captured message only
- Action step cards include source metadata short fields:
  - sourceChannelId
  - sourceDisplayName
  - sourceConversationId
  - sourceMessageHash
  - sourceCapturedAt
  - sourceActionStepIndex
  - taskCardId
  - target
- Missing source metadata is displayed as `unknown` warning text

### Tool endpoint cards

- VS Code Bridge reflects local bridge and latest review-send status
- DeepSeek / Codex / Claude Code / PowerShell / Git / Build-Check are placeholder status cards
- No automatic dispatch, no terminal launch, no command execution

### Safety lock display

- Safety lock remains read-only locked:
  - execution: off
  - agent dispatch: off
  - command execution: off
  - git write: off
- Unlock button is disabled placeholder only

## Current Limitations

- No auto task creation
- No auto queueing
- No auto agent dispatch
- No command execution
- No remote AI classification or step generation
- No user content upload
- No Action Tags
- No automatic bridge-to-agent push
- No one-click dispatch
- No VS Code command runner / executor
- No localhost execution bridge
- Task Card Review Bridge is read-only inspection only

## MVP-2.5 P0-1A Executor Profiles And Manual Handoff

Supported executor targets for manual pre-execution handoff:

- `codex` -> `executorId=codex`, `displayName=Codex`, `role=execution-agent`
- `deepseek` -> `executorId=deepseek`, `displayName=DeepSeek`, `role=execution-agent`
- `claude-code`, `claude_code`, `claude` -> `executorId=claude-code`, `displayName=Claude Code`, `role=execution-agent`

Manual handoff behavior:

- Complete non-sample `ACB_TASK_CARD` payloads can resolve an executor profile and generate a copyable handoff payload.
- The copyable payload includes the full original `ACB_TASK_CARD`, resolved executor metadata, and safety reminders.
- `sampleOnly=true` or `cannotDispatch=true` remains blocked and must not produce an executable handoff payload.
- Handoff mode is manual/copyable only; ACB does not paste, press enter, launch an executor, run terminal commands, dispatch agents, or write Git as product behavior.

Safety flags remain fixed:

- `noAutoDispatch=true`
- `noCommandExecution=true`
- `executionAllowed=false`
- `agentDispatchAllowed=false`
- `gitWriteAllowed=false`
- `canAutoExecute=false`

## MVP-2.5 P0-2.1 Local Report Protocol

Real execution handoff payloads include a short local report requirement by default.

- Protocol document: `docs/local-execution-report-example.md`
- Default report path: local report inbox under the project root
- Required envelope: local execution report start / end markers
- Reading the local report only enters `waiting_controller_review`
- Executors must not mark accepted, approved, or closed themselves
- Executors must not stage or commit private local report queues.

## M3-UI.2-B Normal Mode P0 (Task-Card First)

M3-UI.2-B implements the accepted M3-UI.2-A-1 anchor into the real floating console normal mode.

Key normal-mode behavior:
- Current task card is visually prioritized as first-screen center.
- Primary action is `检查可发送状态`.
- Button order remains: `检查可发送状态` -> `发送到 VS Code 查看端` -> `复制完整任务卡` -> `查看详情`.
- `检查与操作结果` is integrated as a continuous sub-section inside current task card logic.
- User-facing state is shown as `未检查 / 可发送 / 警告 / 不可发送`, with reason and next action.
- Detailed matching/debug fields are downshifted to debug mode.

Send gate remains read-only and safety-first:
- Send button is unavailable when payload is incomplete, bridge is disconnected, preflight/readiness not matched/passed, or safety lock is not readonly.
- `发送到 VS Code 查看端` means review/viewer only (not execution).

Safety boundaries remain unchanged:
- `noAutoDispatch=true`
- `noCommandExecution=true`
- `executionAllowed=false`
- `agentDispatchAllowed=false`
- `gitWriteAllowed=false`
- `locked_readonly / 只读锁定`

## M3-UI.2-B.1 Runtime Layout Fix

After `d879bd8`, runtime diagnosis found that task-card-first visual focus was too dependent on existing action-plan/current-step state.

M3-UI.2-B.1 adjusts runtime presentation so normal mode more consistently shows the A-1 direction:
- default current step prefers complete actionable task card
- no-plan state can render an in-memory preview task card flow
- current task card renders first and remains visually dominant
- `检查与操作结果` stays attached inside current task card
- send semantics remain review-only and safety-gated

## M3-UI.2-B.2 Right Tools And Readonly Safety Banner

M3-UI.2-B.2 is a narrow polish after B.1 UI/UX review.

Normal mode changes:
- only `VS Code Bridge` remains expanded in the right tool area
- `Codex / DeepSeek / Claude Code / PowerShell / Git / Build / Check` are reduced to one-line summaries
- detailed right-side diagnostics stay in debug or folded areas
- a compact readonly safety banner is shown below the top status strip

Readonly safety banner:
- `只读锁定`
- `不执行命令`
- `不派发 Agent`
- `不写入 Git`

Unchanged behavior:
- `检查可发送状态`
- `发送到 VS Code 查看端`
- `复制完整任务卡`
- `查看详情`
- `导出测试报告`
- `生成只读快照`
