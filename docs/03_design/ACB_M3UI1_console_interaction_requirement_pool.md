# ACB M3-UI.1 控制台交互优化需求池

## 1. 文档定位

- 本文档是 M3-UI.1 控制台交互优化需求池。
- 它遵循 M3-UI.0 三栏控制台基线（commit `6328f07`）。
- 它**不是**实现任务卡。
- 它是后续 M3-UI.1-A / B / C / D / E / F / G 任务的设计基础。
- M3-UI.1 的目标是改善信息层级、按钮布局、任务卡工作流、详情展示和工具侧组织，**不开放执行能力**。

---

## 2. M3-UI.0 当前基线

在 `6328f07` 手动验证确认：

- floating button 正常出现
- 控制台可以打开
- 紧凑顶部状态存在
- 左 / 中 / 右三栏存在
- 左侧 GPT 身份卡可以切换
- 中部面板跟随选中身份卡
- "打开原始对话"可用
- 完整任务卡样本可被识别为 complete payload
- "复制完整任务卡"复制 bounded ACB_TASK_CARD
- Payload Preflight 返回 warn
- Execution Readiness Gate 返回 warning
- VS Code review viewer 发送被接受
- safety 保持 locked_readonly

---

## 3. 总体原则

1. **正常使用模式与调试/测试模式分离**
   - 正常模式简洁，面向用户
   - 调试/测试模式保留 raw report、内部 ID、hash、contextId、Bridge/Project 原始状态和诊断数据

2. **信息展示层级**
   - Level 1：默认展示
   - Level 2：折叠 / hover / 抽屉
   - Level 3：仅调试/测试模式
   - 用户默认不应看到系统字段

3. **任务卡是中部面板的首要对象**，其余信息围绕任务卡组织
4. **任务详情使用抽屉式侧边栏**，而非中部底部面板
5. **全局安全锁与工具权限分离**
6. **绑定当前对话与重新捕获当前对话是不同操作**
7. **长期方向**：GPT 回复完成后自动捕获 + 红点提醒
8. **Agent 载荷必须保持纯净**：仅发送完整 bounded ACB_TASK_CARD，ACB 元数据不混入 Agent 任务内容

---

## 4. 顶部栏

### 4.1 布局

顶部应为一条紧凑水平行：

```
[刷新图标] 项目名 | Bridge 状态 | Git branch @ short commit | working tree | 全局安全锁 | More/ⓘ | 关闭
```

### 4.2 规则

- 项目名应视觉突出
- 顶部测试按钮不应作为正常模式主按钮
- 以下应移入调试模式 / More / 任务卡区域 / 相关上下文：
  - 导出测试报告
  - 测试本地 Bridge
  - 刷新本地项目状态
  - 检查就绪状态
  - 捕获当前对话
- 刷新应改为小图标
- 详细数据进入 More/ⓘ
- **全局安全锁保留在顶部**
- `locked readonly` 是正常状态
- `unlocked` / `executable` / `command` / `Git write` 状态必须红色且突出
- **当前阶段不开放安全锁解锁**

---

## 5. 左侧 GPT 身份卡

### 5.1 默认展示

身份卡默认仅显示：
- 身份名称
- 绑定的 GPT 对话名称
- 状态圆点
- 紧凑按钮

### 5.2 隐藏字段（默认不显示）

`roleType`、`channelId`、`sourceConversationId`、`hash`、`capturedAt`、`bindingStatus`、`readStatus`、`attentionLevel`

### 5.3 卡片按钮

- 打开原始对话
- 绑定当前对话
- 解除绑定
- 删除
- 更多

### 5.4 操作规则

- "打开原始对话"优先使用当前选中身份卡的绑定 GPT 对话
- "绑定当前对话"需要确认
- "解除绑定"需要确认
- "删除身份卡"需要更强的确认，并明确告知不会删除 ChatGPT 原始对话
- 绑定 / 解绑 / 删除可在后续任务中实现，不必在首次展示简化任务中完成

---

## 6. 中部面板 / 当前对象

### 6.1 概念

中部面板应概念化为"当前对象 / 当前详情"，不仅是 GPT 消息区域。

- 当前：选择左侧身份卡 → 显示身份卡 + 绑定对话 + 最新用户消息 + 最新助手消息 + 任务卡
- 未来：选择右侧工具卡 → 可显示工具状态 / Agent 报告 / 日志
- 当前 M3-UI.1 无需实现右工具→中部切换，但设计应留出空间

### 6.2 中部顶部：身份与对话信息

- 身份卡名称
- GPT 对话名称
- channel type 作为紧凑标签
- 默认不显示 `channelId` / `sourceConversationId` / `hash` / URL
- `hasFeedback` 状态转为用户语言：
  - `已捕获反馈`
  - `暂无反馈`
  - `有待处理任务`
  - `捕获失败`
- 技术数据进入 More/ⓘ

### 6.3 中部快捷操作

- 重新捕获当前对话到此卡（不改变绑定）
- 标记已读
- 标记暂停
- 标记完成
- `capturedAt` 捕获时间应保持可见，因为用户用它确认时效

### 6.4 消息预览

- 最新用户消息和助手消息各一行
- 仅用于确认是否为最新相关消息
- 显示 head + 省略号 + tail
- 助手消息尤其应显示开头和最后一句/尾句
- hover 预览应限制 300-500 字符，非全文
- 全文阅读应通过"打开原始对话"
- 推荐布局：左侧两行消息，右侧小"打开原始对话"按钮

### 6.5 一行摘要

中部应展示用户可读的一行摘要，说明 GPT 回复做了什么、有什么效果。

避免机械原始截断（如 commit log 或代码文件列表）。

摘要示例：
- 本条回复生成了 M3-UI.0 完整链路测试任务卡，可用于验证捕获、预检、readiness 和 VS Code 查看端。
- 本条回复是 Codex 回报审查，说明 UI 可用性修复已提交并通过语法检查。

分类摘要可用于生成，但应呈现为用户可读摘要。

---

## 7. 反馈分类降级

### 7.1 默认展示

分类卡片应降级。任务卡更重要。

默认紧凑展示：
```
执行｜需要行动｜置信度 medium
```

### 7.2 折叠内容

- `type` 描述应 hover 或 info 展示：
  `content / decision / strategy / recommendation / execution / other`
- `title` 和 `summary` 应合并为一行用户可读句子
- 配置字段应折叠：
  `default behavior`、`suggested next action`、`classification source`、`user edited`、`needs execution`、`attention level`、保存/重置按钮
- `confidence` 应保持可见
- 低置信度应提示"建议人工确认"

---

## 8. 动作步骤 / 任务卡

### 8.1 保留内容

- 生成动作步骤
- 编辑步骤属性
- 任务标题
- target 标签
- payloadStatus 标签
- canSendToAgent 标签
- missing / unavailable / controller-review 标签
- 查看详情

### 8.2 默认任务卡展示

- title
- target
- payloadStatus
- preflightStatus
- readinessStatus
- sendStatus
- source
- 生成/捕获时间

### 8.3 紧凑行示例

```
DeepSeek｜complete｜Preflight: warn｜Readiness: warning｜Sent: accepted
```

### 8.4 source 字段

- 默认显示人类可读的来源名称和生成时间
- `channelId` / `sourceConversationId` / `hash` / `sourceActionStepIndex` / `taskCardId` / `contextId` 折叠

### 8.5 每张任务卡的操作按钮

- 查看详情
- 复制完整任务卡
- Payload Preflight
- Execution Readiness Gate
- 发送到 VS Code 查看端

### 8.6 就绪状态规则

- readiness 应是任务卡内的 step-bound 操作，而非顶级的全局按钮
- preflight / readiness 应显示原因，不仅是状态
- **stale readiness 逻辑必须保留**

---

## 9. 复制 / 发送边界

1. "复制完整任务卡"仅复制 bounded ACB_TASK_CARD
2. `sourceMetadata` / `contextId` / `hash` / preflight / readiness / reviewMetadata 对 ACB 有用，但**不得混入 Agent 任务内容**
3. VS Code 查看端可接收 task card + metadata 用于查看和追踪
4. 实际 Agent 执行载荷应仅包含 task card 正文
5. 不在 M3-UI.1 创建"任务包"按钮（除非单独设计）
6. 不过度向 Agent prompt 添加 ACB 元数据

---

## 10. 任务详情抽屉

### 10.1 布局

- 中部底部的 Payload Detail 面板不是最终形态
- 使用右侧抽屉 / 侧面板
- 点击"查看详情"打开抽屉
- 抽屉宽度：控制台宽度的 40%-55%
- 抽屉可滚动、可关闭

### 10.2 抽屉内容

- 完整任务卡
- 源元数据
- Payload Preflight 结果
- Execution Readiness 结果
- 发送结果
- 诊断/错误信息

### 10.3 版本演进

- 第一版可用分节展示
- 后续可改为 tabs：task card / metadata / preflight / readiness / send record
- 抽屉可包含"复制完整任务卡"和"关闭"按钮
- 暂无"任务包"按钮

---

## 11. 右侧工具端点

### 11.1 定位

右侧栏应以工具端点为核心，不是全局安全锁或大块调试状态。

### 11.2 工具列表

- VS Code Bridge
- DeepSeek
- Codex
- Claude Code / CloudCode
- PowerShell
- Git
- Build / Check
- 添加工具（未来入口）

### 11.3 工具类型

`Agent / Bridge / Shell / Git / Build`

### 11.4 连接 / 访问级别

| 级别 | 含义 |
|---|---|
| `unconfigured` | 未配置 |
| `manual` | 手动模式 |
| `review` | 审核/查看模式 |
| `readonly` | 只读模式 |
| `semi-auto` | 半自动模式 |
| `execution` | 执行模式 |
| `disabled` | 已禁用 |

### 11.5 当前预期级别

| 工具 | 预期级别 |
|---|---|
| VS Code Bridge | `view` / connected |
| DeepSeek | `manual` |
| Codex | `manual` |
| Claude Code | `manual` |
| PowerShell | `disabled` / 未开放 |
| Git | `readonly` |
| Build/Check | 未连接 |

### 11.6 卡片规则

- 使用可折叠卡片
- 选中工具展开
- 未选中工具仅显示标题 / 类型 / 状态
- 未连接时不显示"可接收任务卡"
- 自动执行是设置项，默认关闭，不作为主要字段
- 权限 / 待确认状态应以状态圆点 / 红色或黄色提示显示

### 11.7 工具卡片操作

- 手动复制
- 一键配置（未来）
- "添加工具"是未来占位
- 未来想法：Bridge 辅助 Agent 授权 / 配置；不在 M3-UI.1 实现

---

## 12. 本地 / 调试状态重定位

| 原位置 | 新位置 |
|---|---|
| Bridge 状态 | 顶部栏，详情在 More |
| Project 状态 | 顶部栏，详情在 More |
| Preflight | 任务卡内 + 抽屉 |
| Readiness | 任务卡内 + 抽屉 |
| Raw report | 调试/测试模式 |

本地 Bridge 状态 / Project 状态 / Preflight / Readiness **不是**右侧栏主要内容。

---

## 13. 底部状态栏

### 13.1 定位

底部状态栏不是调试面板。它用于：
- 简短提示
- 最近操作结果
- 低成本用户引导

### 13.2 示例

- 已复制完整任务卡
- 已切换到测试参谋
- Payload Preflight 完成：warn
- 发送到 VS Code 查看端：accepted
- 当前通道暂无反馈

### 13.3 右侧小入口

Bridge / Project / Debug（紧凑）

不要填充 raw debug 字段。

---

## 14. 任务拆分与建议顺序

### 14.1 拆分

| 编号 | 任务 | 内容 |
|---|---|---|
| M3-UI.1-A | 正常/调试模式与顶部按钮整合 | normal/debug 模式分离，顶部按钮迁移 |
| M3-UI.1-B | 任务卡步骤级按钮与门禁结果展示 | step-bound 按钮，preflight/readiness 原因展示 |
| M3-UI.1-C | 任务详情抽屉 | 右侧 drawer 替换中部底部面板 |
| M3-UI.1-D | 左/中栏展示简化 | 身份卡 + 消息预览 + 摘要 + 分类降级 |
| M3-UI.1-E | 右栏工具端点组织 | 可折叠工具卡片 + 访问级别 |
| M3-UI.1-F | 绑定/解绑/删除确认流程 | 确认对话框 + 状态变更 |
| M3-UI.1-G | 自动捕获与红点提醒 | GPT 回复完成自动捕获 + 红点通知 |

### 14.2 建议顺序

1. M3-UI.1-A（normal/debug 分离稳定后续展示决策）
2. M3-UI.1-B（任务卡工作流是核心）
3. M3-UI.1-C（抽屉解决长 payload 审核问题）
4. M3-UI.1-D（左/中栏展示细化）
5. M3-UI.1-E（右栏工具组织）
6. M3-UI.1-F（绑定/解绑/删除涉及状态变更，应靠后）
7. M3-UI.1-G（自动捕获更复杂，应推迟）

---

## 15. 明确的 M3-UI.1 非目标

- ❌ 自动执行
- ❌ Agent 自动派发
- ❌ 命令执行
- ❌ Git 写入
- ❌ 安全锁解锁
- ❌ Local Task API
- ❌ Project Control Packet 生成器
- ❌ 真实工具一键配置
- ❌ Bridge 辅助 Agent 授权（暂缓）
- ❌ 任务包按钮
- ❌ ACB 元数据混入 Agent 载荷
- ❌ 复杂拖拽窗口
- ❌ 完整多项目管理

---

## 16. 未来方向（不在 M3-UI.1 范围）

以下方向已识别但不在 M3-UI.1 实现：

- **Bridge 辅助 Agent 授权 / 工具配置**：通过 Bridge 辅助用户完成 Agent 工具授权的安全配置流程
- **自动捕获 + 红点提醒**：GPT 回复完成后自动触发捕获，控制台显示红点通知

以上记录于此文档作为设计参考。
