# TypeScript 框架试运行

本目录新增了一套与 Python 业务层并行的 TypeScript 实现，目标不是简单换语言，而是把拆解的核心闭环固化成可复用的框架：

```text
理解页面 → 确定性分析 → Agent 产出组件库 → 9 项规范校验 → 往返等价评分 → 交互场景门禁 → 修订
```

## 目录

- `src-ts/analysis/analyzer.ts`：HTML、CSS、数据契约、视图范式、交互、A11y 的确定性分析。
- `src-ts/analysis/script-interactions.ts`：基于 Acorn AST 提取事件绑定、DOM mutation 目标和局部数据依赖；正则仅作为截断或畸形脚本的降级路径。
- `src-ts/core/css.ts`：CSS 变量、规则、媒体查询、渐变和颜色语义工具。
- `src-ts/validation/library.ts`：组件库 9 项质量校验。
- `src-ts/evaluation/roundtrip.ts`：复用现有 Node/jsdom 渲染协议，输出与 Python roundtrip 等价的结构/文本分数。
- `src-ts/evaluation/scenarios.ts`：生成并校验 `schemaVersion=1.0` 交互场景，候选场景默认不进入覆盖率门禁。
- `src-ts/workflow/pipeline.ts`：把拆解流程、阈值和最终质量门禁组合成一个 API。
- `src-ts/cli.ts`：统一 CLI 入口。

## CLI

```bash
npm run build:ts
node dist-ts/cli.js analyze benchmark/original.html --out /tmp/manifest.json
node dist-ts/cli.js validate benchmark/lib
node dist-ts/cli.js scenarios /tmp/manifest.json --out /tmp/scenarios.json
node dist-ts/cli.js roundtrip benchmark/original.html --lib benchmark/lib
node dist-ts/cli.js quality benchmark/original.html --lib benchmark/lib
```

`quality` 默认门槛：

- 9 项规范全部通过；
- 原页面和组件库都成功运行；
- overall ≥ `0.85`；
- structure composite ≥ `0.70`；
- text ≥ `0.80`；
- 如果提供正式场景文件，则每个正式场景也必须通过；
- 如果显式设置交互覆盖率阈值，则只使用 verified coverage，不计 candidate 场景。

## 保留的核心原则

### 1. Agent 负责理解和创作

TypeScript 分析器只提供事实参考，不替代 Agent 判断主题语义、页面范式、组件边界和数据建模。Agent 仍然需要：

1. 通读 HTML，理解布局、主题和交互；
2. 使用 `analyze` 结果校正事实；
3. 输出 `README.md`、`docs/设计规范.md`、`src/*.css`、`src/*.js`、`examples/*.html`；
4. 按失败结果进行修订，而不是靠模板盲生成。

### 2. 分析和评估是确定性的

manifest、场景协议、校验报告和 roundtrip 分数均为 JSON 可序列化协议。这样可以让 Python 与 TypeScript 并行对照，降低迁移风险。

### 3. 候选场景不等于已验证质量

从 manifest 自动生成的场景会带 `candidate: true`。只有人工补齐能证明状态发生的 assertions，并移除 candidate 标记后，才会进入交互覆盖率门禁。

### 4. 质量门不是单一分数

最终质量必须同时看结构、文本、类名覆盖、规范校验和交互状态。overall 只是汇总指标，不能绕过单项门槛。

## 迁移策略

当前实现有意保留 Python 版本，且共享既有 `_roundtrip_render.mjs` 协议。建议迁移顺序：

1. 用 TypeScript 版本与 Python 版本跑同一批 benchmark，比较 manifest 和 roundtrip 报告；
2. 先迁移分析、校验、场景协议和报告编排；
3. 再将渲染器从 jsdom 升级到 Playwright/Chromium，不改变上层 JSON 协议；
4. 回归稳定后再决定是否删除 Python 入口。

本次试运行验证了协议兼容性：benchmark 的静态 9/9 校验通过，DOM/text roundtrip 与 Python 版本一致（structure `0.997`、text `0.983`、overall `0.99`）。新增 Gold+ 后，benchmark 会进一步暴露 3 个实际未命中的修饰类、computed-style `0.9605` 和 pixel diff `2.3977%`，因此不再被错误判为最终全绿。

## Gold+ 视觉质量门

针对“DOM 全绿但视觉差异 15%”的问题，TypeScript 版本新增真实 Chrome 三层质量门：

```bash
node dist-ts/cli.js validate <lib-dir>
node dist-ts/cli.js roundtrip <original.html> --lib <lib-dir>
node dist-ts/cli.js quality <original.html> --lib <lib-dir> --visual-artifacts /tmp/case-visual
```

三层检查分别是：

- **第 10 项选择器实际命中**：检查渲染后的 `sg-*` DOM 类是否真的被 CSS 选择器命中，并输出 `mismatchHints`，识别 `#sg-x` / `.sg-x`、`sg-real` / `.real` 等错配。
- **计算样式**：比较 `display`、`position`、`left/top`、尺寸、背景、transform 等关键属性，能捕获执行顺序或缩放顺序错误。
- **截图像素差异**：Chrome headless 在相同 viewport 下截图，默认 pixel diff 不能超过 2%。

旧的 DOM/text roundtrip 仍保留作为快速诊断层，但不再被视为视觉质量的充分证明。

## 组件规划与产出前门禁

参考 `ai-website-cloner-template` 中“先写完整 spec、控制单任务复杂度、实现前执行 checklist”的有效机制，TypeScript 流程新增确定性的组件规划层。它不复制模板实现，也不替代 Agent 判断，而是把 manifest 转换为可审阅、可门禁的交付契约：

```bash
node dist-ts/cli.js plan <original.html> \
  --out /tmp/component-plan.json \
  --spec-dir /tmp/component-specs \
  --line-budget 150
```

规划产出包含：

- 每个组件的源选择器、职责和目标文件；
- interaction model 与源交互 fingerprint；
- 数据契约、设计令牌、媒体查询；
- desktop/tablet/mobile/tiny 多视口验收矩阵；
- 预计实现行数和 150 行复杂度预算；
- preflight issues。超预算、缺状态验收、缺视口矩阵或交互无证据时，命令以非零状态退出，阻止进入产出阶段。

这层解决的是“拆什么、每块做到什么程度、什么时候允许开始写”的流程质量；现有 Gold+ 继续负责“最终实现是否高保真”的结果质量。两者不可互相替代。


## AST 交互与局部依赖分析

组件规划不再只把脚本压缩成 `trigger + event`。分析器会解析 JavaScript AST，并在可静态追踪时输出：

- `mutationTargets`：handler 实际修改的 DOM selector；
- `stateMutations`：class、style、文本、属性等状态变化证据；
- `dataDependencies`：handler 使用的局部业务数据集合；
- `analysis` / `confidence`：证据来自 AST、属性、语义控件还是正则降级。

规划器按“trigger 边界优先，mutation/target 辅助”的评分分配交互，避免弹窗 mutation 抢走触发器所属组件；复杂度模型只计入组件实际使用的数据契约，不再把全部全局契约重复计入每个组件。生成的组件 spec 会列出 mutation target 与数据依赖，便于实现和场景设计审计。

### 结构化 UI 状态转换

AST 分析器还会把可观察副作用标准化为 `stateTransitions`，记录 target、kind、operation、name、静态值、置信度和源码证据。当前覆盖 classList、属性、DOM property、inline style、文本/HTML、focus/dialog 和结构增删。分析支持：

- 最多两层命名 helper 调用传播，防止无界调用图把整套应用副作用错误归给单个 handler；
- 对象方法 handler、`.bind(...)` 和返回 DOM selector 的简单 helper；
- `document.addEventListener(...)` 配合 `event.target.closest(...)` 的事件委托；
- helper 实参到形参的 selector 绑定传播。

候选场景生成器会把高置信、确定性的转换自动变成 assertion，例如 `classList.add/remove/replace`、`set/removeAttribute`、`hidden`、`display`、`value`、focus 和 dialog open/close。`toggle`、动态文本和动态样式值不会被伪装成确定断言。所有自动场景仍保留 `candidate: true`，必须人工补齐前置步骤、确认初始状态并移除 candidate 后，才能计入 verified coverage；算法优化不会降低 Gold+ 的人工审核和视觉门禁。

### 2026-07-23 application-planning refinements

- Delegated listeners now prefer direct `event.target.closest(...)` controls over the receiver container; exclusion guards such as `if (event.target.closest(".node")) return` are not treated as triggers.
- Callback-local selector bindings take precedence over same-named outer bindings, and AST evidence replaces broad semantic-control placeholders instead of merging stale evidence.
- Bounded helper propagation prunes non-trivial conditional branches for delegated call sites, reducing unrelated modal/graph mutations on navigation controls.
- Pointer/touch registrations produce unsupported review candidates with no fake click step.
- `data-view` and `.stage > .view[id]` applications yield shell, panel, graph, dialog, runtime gallery, and gesture-surface component boundaries. Nested candidates are planned recursively; gesture ownership prefers the deepest boundary while retaining the 150-line budget.

### 2026-07-23 cross-case application planning regression

- Application detection now maps `data-tab` controls to `.view[data-view]` panels and continues to support generic `[data-p]` controls with `.panel[id]` targets.
- Single-view compound graph applications are decomposed into application shell, relationship canvas, event controls, node controls/gestures, and dialog boundaries.
- Works grids, cast explorers, cast cards, story controls, scroll surfaces, and gesture surfaces are emitted as localized runtime boundaries when corresponding DOM or script evidence exists.
- Nested graph node boundaries are emitted only when pointer/touch/mousedown evidence exists, preventing static/click-only graph over-decomposition.
- Ownership prefers the deepest boundary only when both candidates have strong trigger affinity; event-type bonuses route scroll and gesture lifecycles to their respective surfaces.
- Gesture and scroll lifecycle registrations count as one implementation behavior for complexity estimation. The 150-line component budget remains unchanged.
- Seven-case planning regression result: all 7 ready, 131/131 interactions owned, zero over-budget components, zero fake pointer clicks.
