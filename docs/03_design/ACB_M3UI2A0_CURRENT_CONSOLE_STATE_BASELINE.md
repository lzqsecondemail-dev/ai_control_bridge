# M3-UI.2-A-0 当前正式控制台状态复刻 · 说明

## 目的

创建一份静态 HTML 页面，忠实复刻当前 ACB 浏览器控制台的生产代码（`apps/browser-extension/src/content/mock-listener.js`）中所呈现的 UI 状态。

这份复刻的目的仅为回答一个问题：

> 当前实现的 ACB 控制台大致长什么样？

它不回答：

> 下一版本应该长什么样？

---

## 为什么当前状态基线在前、下一版本目标在后

在 M3-UI.2 开始设计下一版本目标 UI 之前，需要先确认执行端对当前 UI 的理解是否准确。

工作流顺序：

1. **执行端阅读生产代码** → 生成当前状态静态复刻（本页）
2. **用户对照真实截图对比** → 确认复刻准确或标出偏差
3. **偏差修正** → 如果复刻不准确，先修正
4. **当前状态基线被接受** → 方可进入 M3-UI.2-A-1 下一版本目标设计
5. **M3-UI.2-B** → 生产代码实现

跳过当前状态基线直接做目标设计，可能导致目标设计建立在错误假设上。

---

## 三种页面的区别

| 页面 | 文件 | 用途 |
|------|------|------|
| **长期静态蓝图** | `acb_console_ui_blueprint.html` | 长期方向参考，不代表当前状态或下一版本目标 |
| **当前状态基线** | `ACB_M3UI2A0_CURRENT_CONSOLE_STATE_BASELINE.html` | 根据生产代码复刻当前 UI，用于校验执行端理解 |
| **下一版本目标锚点** | (尚未创建，M3-UI.2-A-1) | 用户确认的下一版本目标 UI，用于指导实现 |

三者的关系：

```text
长期静态蓝图 (参考方向)
    ↓ (不是直接基准)
当前状态基线 (M3-UI.2-A-0)  →  用户验证  →  修正  →  被接受
    ↓
下一版本目标 (M3-UI.2-A-1)  →  用户确认  →  被接受
    ↓
生产实现 (M3-UI.2-B)  →  PR  →  合并
```

---

## 如何使用本页

1. 在浏览器中打开 `ACB_M3UI2A0_CURRENT_CONSOLE_STATE_BASELINE.html`
2. 打开真实 ACB 浏览器控制台（或准备其截图）
3. 逐区域对照 HTML 页面中的 **用户对比检查清单** (Section D)
4. 对每一项标记"匹配"或"不匹配"
5. 如有不匹配，截图标注偏差位置
6. 将偏差笔记和截图发回给执行端/总控
7. 执行端修正当前状态基线，直到被接受
8. 当前状态基线被接受后，方可进入 M3-UI.2-A-1 目标设计

---

## 用户对比检查清单

参见 HTML 页面 Section D。清单涵盖：

- 顶部状态栏位置和内容
- 左栏身份卡列表和字段
- 中栏当前消息/任务卡区域
- 分类面板和编辑表单
- 动作步骤区域（含步骤卡片、操作按钮）
- 检查与操作结果面板
- 右栏安全锁面板
- 右栏工具端/执行端面板
- 右栏 Bridge/预检/就绪详情
- 右栏测试报告
- Payload Detail 面板
- 正常/调试模式字段可见性
- 整体密度

---

## 不在范围内的内容 (Not In Scope)

- 不连接 Bridge
- 不使用 Chrome Extension API
- 不 fetch localhost
- 不读取真实数据
- 不使用外部 CDN 资源
- 不修改任何生产代码
- 不实现下一版本目标 UI
- 不包含 redesign 提案
- 不开放执行能力

---

## 安全边界

本页遵守所有 ACB 安全边界：

- executionAllowed: false
- agentDispatchAllowed: false
- gitWriteAllowed: false
- noAutoDispatch: true
- noCommandExecution: true
- Safety Lock: locked_readonly
- "发送到 VS Code 查看端" = 审查查看，不是执行
- 正常模式隐藏调试字段
- sourceMetadata / reviewMetadata / contextId / hash 不混入 Agent 任务卡正文

---

## 基于代码的复刻来源

本页的结构基于对 `apps/browser-extension/src/content/mock-listener.js` 的只读审查，特别是 `injectFloatingConsole()` 函数中定义的 DOM 结构。

未使用其他来源。
