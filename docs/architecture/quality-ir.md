# Quality IR v1 原型

Quality IR 是基于某个质量 Profile 对 canonical UI-IR 做出的可重算判断，不修改 UI-IR 页面事实。

模型采用 **2 + 1 + 1**：组件知识库与系统知识库、正交的 Profile 合成层、以及后续的 Repair Coordination Layer。本原型只实现 inspect-only：Schema、Profile 合成、确定性静态检测与 `quality-findings.json`，不应用 Patch。

指南位于 `src/skill/references/guidelines/{components,systems,profiles}`。`web-base` 中受保护的 Web/A11y 硬约束不能被子 Profile 禁用或降级；Material Design 是可选 Profile，不默认覆盖品牌设计意图。

```bash
python3 -m ui_dismantler.cli.inspect_quality page.uiir.json \
  --profile web-base -o quality-findings.json
```

首批检测器覆盖 icon button 名称、表单标签、ARIA 引用、Tab/TabPanel 引用及图片 alt。

最小 Render Observation 采集器可在本地 HTML 上按 UI-IR 的显式 selector/id，针对最多 8 个 viewport 采集 geometry、可见性、viewport clipping 与受控 computed-style 白名单。它阻断 HTTP(S) 请求，不执行任意用户脚本参数，Playwright 不可用时只返回 warning：

```bash
python3 -m ui_dismantler.cli.observe_quality_render page.html page.uiir.json \
  --viewport wise:390x844 -o page.render.json
```

首批 Render Observation 规则已启用：交互目标小于 24×24 CSS px，以及可见元素超出 viewport。两者当前均为 **soft warning**：WCAG target-size 存在 spacing/inline 等例外，离屏布局也可能是有意设计；在补齐邻近元素间距、滚动容器和布局意图证据前，不自动修复。

`inspect_quality` 可合并静态与渲染证据：

```bash
python3 -m ui_dismantler.cli.inspect_quality page.uiir.json \
  --profile web-base --render page.render.json -o quality-findings.json
```

文本对比度检测现已覆盖浏览器 computed `rgb/rgba`、十六进制测试值、透明前景和纯色祖先背景合成；普通文本使用 4.5:1，大文本使用 3:1。以下情况明确记录为 `diagnostics.renderSkipped`，不生成误报：背景图片/渐变、祖先 opacity、blend mode、backdrop filter、截断的祖先链、无法解析的颜色或字体指标。该规则是受保护的 Web/A11y 硬约束，但只有证据可确定时才产生 finding。

## Focus-visible 诊断

Focus 探针在每个 viewport 中仅处理显式 UI-IR 目标，采集目标、`::before`/`::after`、两级祖先及最多 8 个直接子元素的 focus 前后样式。只有浏览器确认目标获得焦点且匹配 `:focus-visible`，同时未观察到 outline、box-shadow、border、颜色、背景、文字装饰、transform/filter/opacity 等变化时，才生成 `system.web.focus-visible` soft warning。焦点未落到目标、`:focus-visible` 未激活或样式快照不完整时写入 `diagnostics.renderSkipped`。该版本不检查更远祖先、兄弟节点或像素级截图差异，因此暂不作为自动修复硬门禁。

## 键盘可达性诊断

Render Observation 现在记录显式 UI-IR 交互目标的 `tabIndex`、是否进入顺序焦点序列，以及是否属于由方向键管理焦点的复合控件。`system.web.keyboard-reachable` 仅在目标可见、交互、非禁用且浏览器确认其不在顺序焦点序列时生成 soft warning。位于 `tablist`、`menu`、`listbox`、`tree`、`grid`、`radiogroup` 或 `toolbar` 内的 `tabIndex=-1` 子项可能采用 roving tabindex，因此写入 `diagnostics.renderSkipped` 的 `managed-composite-focus`，等待后续方向键行为观察，不直接报告违规。旧版或合成观察缺少 `keyboardContext` 时同样不推断问题。本阶段不执行 tabindex/role 自动修复。

正向 `tabindex` 会把元素提升到自然 DOM 顺序之前，并可能制造难以维护的焦点路径。`system.web.tab-order.positive` 因此对浏览器观察到的 `tabIndex > 0` 生成独立 soft warning；`tabIndex=0`、负值、禁用目标及缺少 `keyboardContext` 的旧观察不报告。该规则只能确认局部属性风险，尚不声称已重建页面完整 Tab 序列。

## 320 CSS px Reflow 诊断

默认 Render Observation 新增 `reflow:320x800` viewport，并为显式目标记录页面 `clientWidth/scrollWidth`、目标是否贡献页面级横向溢出、最多 16 层目标/祖先链内的横向滚动容器，以及有限语义例外。`system.web.reflow.horizontal-overflow` 仅在 viewport 不宽于 320 CSS px、页面确有横向溢出且该目标越出页面可视宽度时生成 soft warning。数据表格、预格式化内容、carousel、显式标记的横向滚动区以及实际受 `overflow-x:auto|scroll` 容器约束的内容进入 `diagnostics.renderSkipped`。该有界探针不尝试推断完整布局意图，也不将一般 viewport clipping 自动升级为硬错误。

## ARIA 状态一致性诊断

Render Observation 现在为每个显式目标记录 `aria-expanded`、`aria-selected`、`aria-pressed`、最多 16 个 `aria-controls` ID，以及对应目标是否存在和当前是否可见。`system.web.aria-state.token-valid` 对这三个状态属性的非法 token 生成受保护的 hard error；缺失属性不被视为非法。`system.web.controlled-state.visibility` 则保守比较初始状态：`aria-expanded=true/false` 与受控目标可见性，以及 `role=tab` 的 `aria-selected=true/false` 与受控 tabpanel 可见性。引用目标缺失或 controls 列表截断时进入 `diagnostics.renderSkipped`。本阶段只检查采样时刻，不触发点击，也不把 `aria-pressed` 与任意视觉 class 做推测性绑定。

## Trusted scenario 状态转换诊断

`observe_quality_render --scenarios` 可复用现有 runtime scenario JSON，但 Quality 路线进一步收紧：只接受无 `when` 条件、全部 action 均为 `click`、且每个 selector 与一个显式 UI-IR target 唯一对应的场景；默认最多 16 个场景、32 个动作。动作执行复用 runtime 的超时和错误脱敏边界，HTTP(S) 及越出本地 HTML 目录的 file 请求仍被阻断。点击前若目标没有 `aria-expanded`、`aria-pressed`，或目标不是带 `aria-selected` 的 Tab，动作不会执行。每个场景在独立页面中运行并记录 before/after `stateContext`。`system.web.controlled-state.transition` 对 disclosure/toggle/tab 未更新状态或更新后受控目标可见性仍矛盾生成 soft warning；动作失败、状态证据缺失和受控目标不完整进入 `diagnostics.renderSkipped`。若 trusted click 产生非法 ARIA token，复用受保护的 `system.web.aria-state.token-valid` hard rule。场景中的 assertions 当前不参与 Quality 判定，也不应用修复。


## Acceptance Gate

能力覆盖、Profile-scoped inspect readiness、真实浏览器验证状态与自动修复阻断条件见 [`quality-capability-matrix.md`](quality-capability-matrix.md)。`web-base` 当前 inspect-ready；`material-accessible` 因 spacing detector 尚未实现而 blocked。`observe_quality_render --browser chromium|webkit|firefox` 可显式选择验证引擎。两个 Profile 的 repair gate 都必须保持 blocked。
