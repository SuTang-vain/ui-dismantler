# UI-IR v2：轻量 UI 元素—组件—数据关系模型

状态：**实验性实现（2026-07-19）**
兼容来源：`manifest.json` schema v1
稳定 CLI 入口：`src/skill/scripts/manifest_v1_to_uiir.py`；核心实现：`src/ui_dismantler/uiir/`

## 1. 目标

UI-IR v2 用统一结构表达页面中的层级与跨层关系，解决 manifest v1 中 Tab、View、Modal、业务数据、交互和响应式关系分散的问题。

设计目标：

1. 主层级紧凑：页面、区域、组件、元素使用 `parentId`，不重复存储 `contains` 边。
2. 稀疏关系可查询：绑定、控制、触发、样式和引用使用类型化 edge。
3. 保留业务信息：未知领域字段继续保存在 `props`，转换阶段不做破坏性裁剪。
4. 确定性输出：相同输入生成相同节点顺序、stable key 和关系顺序。
5. 渐进迁移：当前 manifest v1、Showcase 和生成流程继续可用。
6. 多投影：同一 IR 后续可生成 compact、expanded、diff 和 manifest v1 兼容视图。

UI-IR 是生成产物；原始 HTML/CSS/JS 仍然是最高级别来源证据。

## 2. 顶层结构

```json
{
  "schemaVersion": "2.0",
  "format": "ui-ir",
  "sourceSchemaVersion": "1.0",
  "nodeTypes": ["page", "region", "component", "element", "data", "state", "token", "breakpoint"],
  "relationTypes": ["renders", "binds", "triggers", "controls", "styles", "responds", "references", "variantOf", "derivedFrom", "labels"],
  "nodes": [],
  "edges": [],
  "strings": [],
  "evidence": {},
  "diagnostics": {"warnings": []}
}
```

固定枚举同时记录在文档中，便于消费者把数字索引还原成语义名称。

## 3. 节点

节点使用四元组：

```text
[id, typeIndex, parentId, props]
```

示例：

```json
[1, 2, 0, {"key": "component:view:timeline", "kind": "timeline", "role": "view"}]
```

约束：

- `id` 必须等于节点在 `nodes` 数组中的下标。
- `typeIndex` 指向 `nodeTypes`。
- 根节点的 `parentId` 为 `null`。
- 每个节点必须有全局唯一的 `props.key`。
- 数字 `id` 是当前文档内的紧凑引用；跨版本身份使用 `props.key`。

### 节点类型

| 类型 | 用途 |
|---|---|
| `page` | 页面入口、源元信息、A11y 汇总 |
| `region` | header、hero、main、sidebar、footer 等语义区域 |
| `component` | tab、view、modal、timeline、quiz 等组件 |
| `element` | DOM 元素、selector 或暂未解析的元素引用 |
| `data` | dataset、业务记录、关系引用占位 |
| `state` | selected、open、disabled 或 interaction 状态 |
| `token` | color、gradient，后续扩展 spacing/type/radius/shadow |
| `breakpoint` | media query 与响应式变化 |

## 4. 关系边

关系使用三元组或四元组：

```text
[fromId, relationIndex, toId]
[fromId, relationIndex, toId, props]
```

示例：

```json
[2, 3, 5]
[7, 2, 9, {"event": "click", "interactionType": "modal-open"}]
```

### 关系类型

| 关系 | 语义 |
|---|---|
| `renders` | 组件渲染元素或子组件 |
| `binds` | 组件/元素绑定数据集或数据项 |
| `triggers` | 元素触发状态、交互或组件 |
| `controls` | tab、button 等控制另一个组件 |
| `styles` | token 或样式规则作用于组件/元素 |
| `responds` | breakpoint 影响组件/元素 |
| `references` | 数据实体之间的引用或业务关系 |
| `variantOf` | 组件是另一个定义的变体 |
| `derivedFrom` | 生成节点来源于另一个节点 |
| `labels` | 文本或 A11y 节点标注目标 |

## 5. manifest v1 初始映射

| manifest v1 | UI-IR v2 |
|---|---|
| `meta`、`a11y`、`structure.pattern` | page props |
| `theme.tokens`、`theme.gradients` | token nodes |
| `structure.tabs`、`views`、`modals`、`storyPanels` | component nodes |
| `views[].tabId`、`tabs[].ariaControls` | `controls` edges |
| `data.<name>` | dataset node；重复记录编码为 `fields + rows` 表 |
| 被其他记录引用的数据行 | 按需提升为轻量 data node |
| 全部包含 `from/to` 的数据数组 | `references` edges |
| `interactions` | state nodes + `triggers` edges |
| `responsive` | breakpoint nodes；可解析变化同时生成 `responds` edges |
| `warnings` | diagnostics |

当前实现会对 manifest v1 已知组件类型建立显式数据绑定，例如：

- `timeline` → `timeline` 或 `events`
- `member-grid` → `members`
- `carousel-3d` → `works`
- `graph` → `graphNodes`
- `quiz` → `quiz`

这些边会带上 `{"inferred": true}`，以便未来由更可靠的静态或运行时证据替换。

### 响应式变化解析

转换器默认读取 `meta.source` 指向的 HTML/CSS，直接解析内联 `<style>` 和本地 `<link rel="stylesheet">` 中的 `@media`。当前关系层聚焦 `grid-template-columns`、`display`、`flex`、`font-size` 四类结构/可见性/字号变化；同一 selector 的多个属性压缩进一条 `responds` edge，避免每个声明都创建节点和边。

CSS 直接解析结果示例：

```json
[12, 5, 28, {
  "changes": [
    ["display", "grid", "block"],
    ["font-size", "14px", "12px"]
  ],
  "method": "css-media-static",
  "confidence": 1.0
}]
```

CSS observation 携带原始 HTML/CSS 字符偏移 `sourceSpan`。多个内联 `<style>` 与本地 `<link rel="stylesheet">` 共享文档级默认声明上下文，因此基础规则和 media 规则分散在不同样式源时仍可计算 `from → to`。存在默认声明时 confidence 为 `1.0`；media 中新增、无法找到同 selector 默认值的声明为 `0.85`。

历史 manifest 将响应式变化保存为可读字符串，例如：

```text
nav .n font-size: 13.5px → 12.5px
```

当源 HTML/CSS 不存在、解析被禁用或没有匹配 media query 时，转换器才使用 manifest 文本兼容回退。回退模式会保留原始 `changes`，并在 breakpoint props 中附加派生字段：

```json
{
  "changesStructured": [
    {
      "index": 0,
      "target": "nav .n",
      "property": "font-size",
      "from": "13.5px",
      "to": "12.5px"
    }
  ]
}
```

两种模式都生成 `breakpoint --responds--> element`。CSS 模式按 selector 聚合属性变化；manifest 回退模式保留 `changeIndex` 并标记 `inferred`。无法可靠解析的回退条目记录在 `unparsedChangeIndexes`，但原始值不会丢失，因此 v2 → v1 仍可精确回投影。

## 6. 来源证据

`evidence` 是以 node id 为 key 的可选 sidecar。当前阶段同时记录 manifest provenance、CSS declaration、DOM 起始标签、JavaScript selector API 与事件绑定的源码区间、解析方法和置信度：

```json
{
  "strings": [
    "index.html",
    ".nav .n",
    "(max-width:520px)",
    "font-size",
    "css-media-static"
  ],
  "evidence": {
    "12": {
      "source": 0,
      "observations": [
        {
          "selector": 1,
          "sourceSpan": [13941, 13957],
          "mediaQuery": 2,
          "properties": [3],
          "method": 4,
          "confidence": 1.0
        }
      ]
    }
  }
}
```

Canonical 编码只把出现至少两次的 evidence 字符串写入顶层 `strings` 表；唯一字符串继续原样保存，避免字符串表本身产生负收益。`source`、`manifestPath`、`method`、`selector`、`mediaQuery`、`properties`、`api`、`event`、`binding`、`scope`、`variable` 和 `runtimeMatch` 中的整数均表示 `strings[index]`。旧版未 intern 的纯字符串 evidence 仍然有效。

调试或外部消费需要可读值时，可调用 `expand_uiir_evidence(document)` 无损展开引用。自定义验证器会检查字符串表去重、引用越界和错误类型；JSON Schema 允许 string 或非负 integer，并由验证器补充数组越界约束。

同一 selector 被多个断点或交互引用时，观察会合并而非覆盖。证据不进入节点主元组，也不进入 Agent compact 观察，避免普通生成承担不必要的上下文成本。

DOM/JS 静态来源提取遵循保守策略：

- HTML 使用起始标签字符区间定位 `id`、class、attribute 与内联 `on*` 事件。
- JavaScript 识别静态字符串形式的 `querySelector(All)`、`getElementById`、`getElementsByClassName`，以及常见 `addEventListener`、`.onclick`、collection `forEach` 绑定链；包括 `Array.from(querySelectorAll(...))` 与 `[...querySelectorAll(...)]` 的集合赋值。
- 本地 `<script src>` 会被读取；相对路径和 `/shared/...` 形式的站点根路径会在来源文件的最近项目祖先中解析。远程脚本和动态 selector 表达式不会被猜测。
- 后代 selector 当前以末端 compound 做候选匹配并将 confidence 降为 `0.85`；作用域对象不是 `document` 时同样降低 confidence。

源码中发现但 manifest 未记录的事件会生成 `sourceOnly` interaction state 和 `element --triggers--> state`。这些节点保留在 canonical/expanded 观察中，但兼容回投影和 compact 首轮观察会跳过它们，因此不会污染 manifest v1，也不会显著增加 Agent 首轮上下文。

可选运行时观察会在无头浏览器中记录实际注册的 `addEventListener` / `on*` property handler，并优先按 selector 精确匹配、DOM source span 重叠、selector 指纹兼容三层策略与静态 state 合并。证据使用 `browser-listener-registration`；真实动作回放或显式启用受限合成事件后，被调用的 listener 另记为 `browser-event-invocation`，并通过 `runtimeMode` 区分 `trusted-replay`、`synthetic-exercise` 或混合模式。证据同时记录注册出现的 `runtimeScenarios` 与实际触发它的 `invokedRuntimeScenarios`。无法与静态 state 合并的注册会生成 `runtimeOnly + sourceOnly` state，同样不进入 manifest v1 和 compact 投影。

运行时观察默认关闭：它会阻断远程 HTTP(S) 请求，只读取本地页面及本地资源。`--runtime-actions` 只允许 declarative click/fill/press/focus/check/uncheck/select，不接受 JavaScript/eval；每条动作必须提供 selector，可用非负 `index` 消除多元素歧义，场景数、动作数、条件/断言数、超时和动作后等待时间均受限。动作中的 fill/select 值不会复制进 diagnostics；Playwright 错误调用记录中的对应值也会脱敏。合成事件仍只覆盖安全事件白名单、跳过链接/表单提交，并有数量上限。

运行时场景采用轻量 JSON，不引入独立数据库或通用脚本语言：

- 每个场景在新的 browser context 中加载页面，路径之间不共享 localStorage、DOM 状态或 listener 计数。
- 场景级 `when` 决定路径是否适用；合法但不满足的条件令场景 `skipped`，无效或无法评估的条件令场景 `failed`。
- 动作级 `when` 可跳过单个动作；动作后的 `assertions` 验证局部状态，场景级 `assertions` 验证最终状态。
- `stopOnFailure` 可在第一个失败动作或动作断言后停止剩余动作。
- 条件与断言仅支持 `exists`、`missing`、`visible`、`hidden`、`enabled`、`disabled`、`checked`、`unchecked`、`text`、`attribute`、`count`；不执行任意 JavaScript。
- `text` 使用 `equals` / `contains`，`attribute` 使用 `name` + `equals` / `contains`，`count` 使用 `equals` / `min` / `max`。

`diagnostics.runtimeReferences.coverage` 汇总场景、动作、已执行断言、条件、交互候选和去重后 listener 注册覆盖率；同一注册在多场景出现时按 selector/event/api/source/options 合并。`failureReplay` 只保存场景、步骤、selector 和“回放到第几步”的脱敏指针，敏感输入仍须从原始场景文档取得，不生成可独立泄露输入的完整重放脚本。

运行时快照同时输出两个诊断结构：

- `candidates`：从 button、link、form control、ARIA role、inline handler 和真实 listener target 中提取有界交互候选，记录 selector、建议动作、可见/禁用状态、输入需求、敏感输入标记和导航风险；不记录元素文本或输入值。
- `stateGraph`：按 location hash、focus selector，以及候选元素的 visible/checked/disabled/expanded 集合生成 SHA-256 稳定状态 ID。节点只保存数量摘要和场景引用，边保存场景、动作、selector、状态与 `fromState/toState`，不复制页面文本或表单值。

真实 Playwright 动作产生浏览器信任事件，适合验证多条显式用户路径的可达性、DOM 状态和 listener 调用。当前会生成候选清单和已执行路径的轻量状态图，但仍不自动选择候选、填写业务输入或扩展新路径，也不推断领域业务正确性，因此场景结果是可验证补充证据，不是完整业务证明。

## 7. 兼容投影与 Agent compact 观察

Canonical UI-IR 保留完整信息并支持精确投影回 manifest v1：

```text
manifest v1 → canonical UI-IR v2 → manifest v1
```

Baseline 和混合数据测试要求结果完全相等，包括：

- 显式 `null`
- `False`、`0` 和空容器
- 标量、对象和混合数据行
- manifest 未识别的顶层、theme、structure 扩展字段
- 关系数组的顺序与 `from/to` 引用

Compact observation 是独立的有损投影，不替代 canonical UI-IR。它保留首轮页面理解所需的：

- 页面标题、pattern 和 canvas
- token 名称、值和语义角色
- 组件、dataset、状态与必要引用节点摘要
- 类型化关系边
- dataset 名称、记录数与字段契约
- breakpoint 及变化数量
- 已启用的 A11y 能力

业务数据完整行、详细响应式变化和大段来源证据不会进入 compact 观察。输出会显式包含：

```json
{"schemaVersion":"2.0-compact","lossy":true}
```

Expanded observation 面向调试、质量评估和后续 diff：它保留全部节点、关系、props、diagnostics 和 evidence，把 `typeIndex` / `relationIndex` 还原为语义名称，并展开 evidence string refs。关系同时带文档内 id 与跨版本 stable key：

```json
{
  "schemaVersion": "2.0-expanded",
  "projection": "expanded",
  "lossy": false,
  "relations": [{
    "sourceId": 12,
    "source": "breakpoint:max-width-520px",
    "relation": "responds",
    "targetId": 28,
    "target": "element:.nav-.n"
  }]
}
```

Expanded 是可读投影，不替代 canonical 存储；compact 用于低成本首轮理解，expanded 用于完整检查，两者职责分离。

Diff observation 使用 `props.key` 而不是文档内 node id 比较两个 canonical 文档。即使新增 token 导致后续节点 id 整体位移，未发生语义变化的实体和关系也不会进入 diff。输出分别列出 entity added / removed / changed 与 relation added / removed，并把 diagnostics 变化独立记录：

```json
{
  "schemaVersion": "2.0-diff",
  "projection": "diff",
  "hasChanges": true,
  "summary": {
    "entitiesAdded": 1,
    "entitiesRemoved": 0,
    "entitiesChanged": 0,
    "relationsAdded": 1,
    "relationsRemoved": 0
  }
}
```

## 8. CLI

### manifest v1 → canonical UI-IR v2

```bash
python3 src/skill/scripts/manifest_v1_to_uiir.py \
  docs/baselines/manifests/manifest_huang-yueying.json
```

默认会读取 manifest `meta.source` 指向的 HTML/CSS/本地 JS。可显式覆盖或分别禁用 CSS、DOM/JS 来源解析：

```bash
python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --source examples/cases/example/original.html

python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --no-source-css

python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --no-source-refs
```

浏览器运行时观察默认关闭；按需验证 listener/property 注册，或额外执行有界合成事件：

```bash
python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --runtime-observe

python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --runtime-exercise \
  --runtime-timeout 8000
```

`--runtime-exercise` 会隐式启用运行时观察。浏览器不可用、页面超时或脚本报错时转换不会失败，问题会写入 `diagnostics.runtimeReferences` 和 warnings。

真实浏览器路径使用 JSON 文件描述。推荐使用场景文档；根数组或 `{"actions": [...]}` 的旧动作格式仍兼容，并映射为 `default` 场景：

```json
{
  "scenarios": [
    {
      "id": "intro-to-result",
      "when": {"condition": "visible", "selector": "#start"},
      "stopOnFailure": true,
      "actions": [
        {
          "action": "click",
          "selector": "#start",
          "assertions": [{"assertion": "visible", "selector": "#form"}]
        },
        {"action": "fill", "selector": "#name", "value": "测试用户"},
        {"action": "press", "selector": "#name", "key": "Enter"},
        {
          "action": "click",
          "selector": ".choice",
          "index": 1,
          "when": {"condition": "enabled", "selector": ".choice", "index": 1},
          "afterMs": 100
        }
      ],
      "assertions": [
        {"assertion": "visible", "selector": "#result"},
        {"assertion": "count", "selector": ".result-row", "min": 1}
      ]
    }
  ]
}
```

```bash
python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --runtime-actions runtime-scenarios.json \
  --runtime-timeout 8000

# 调试时只执行一个场景
python3 src/skill/scripts/manifest_v1_to_uiir.py manifest.json \
  --runtime-actions runtime-scenarios.json \
  --runtime-scenario intro-to-result
```

`--runtime-actions` 隐式启用运行时观察。动作结果只保存 action、selector、命中数、状态和脱敏错误，不保存 fill/select 输入值。场景状态、逐步条件/断言、覆盖率和失败重放指针位于 `diagnostics.runtimeReferences`。

生成可读版本：

```bash
python3 src/skill/scripts/manifest_v1_to_uiir.py \
  docs/baselines/manifests/manifest_huang-yueying.json \
  -o /tmp/huang-yueying.uiir.json \
  --pretty
```

### canonical UI-IR v2 → manifest v1

```bash
python3 src/skill/scripts/uiir_to_manifest_v1.py \
  /tmp/huang-yueying.uiir.json \
  -o /tmp/huang-yueying.manifest.json
```

### canonical UI-IR v2 → compact observation

```bash
python3 src/skill/scripts/uiir_to_compact.py \
  /tmp/huang-yueying.uiir.json \
  -o /tmp/huang-yueying.compact.json
```

### canonical UI-IR v2 → expanded observation

```bash
python3 src/skill/scripts/uiir_to_expanded.py \
  /tmp/huang-yueying.uiir.json \
  -o /tmp/huang-yueying.expanded.json \
  --pretty
```

### canonical UI-IR v2 stable-key diff

```bash
python3 src/skill/scripts/uiir_diff.py \
  /tmp/before.uiir.json \
  /tmp/after.uiir.json \
  -o /tmp/change.diff.json \
  --pretty
```

五个 CLI 均支持 `--check`；生成 canonical、compact、expanded 和 diff 的 CLI 支持可选的可读缩进输出。

## 9. 当前结果与后续工作

当前版本完成：

- v1 → v2 确定性转换
- v2 → v1 精确兼容投影
- baseline 与混合数据语义 round-trip
- 重复业务记录的 `fields + rows` 紧凑编码
- 仅对参与关系的数据行进行稀疏节点提升
- compact Agent 首轮观察投影
- expanded 无损语义观察投影
- stable-key diff 语义变化投影
- CSS `@media` 直接解析、selector 聚合与 `responds` 关系
- manifest 文本解析兼容回退
- manifest/CSS/DOM/JS 来源路径、`sourceSpan`、解析方法与 confidence sidecar
- DOM selector 静态命中、JS selector API 和事件绑定引用链
- manifest 未记录事件的 `sourceOnly` state 与 `triggers` 关系
- evidence 重复字符串表与无损展开 helper
- 隔离运行时场景、声明式条件/断言、多路径覆盖汇总、交互候选、轻量状态图与脱敏失败重放指针
- 固定节点和关系枚举
- stable key
- parent/edge 引用完整性验证
- JSON Schema
- 单元测试

当前两个 baseline 的 compact observation 继续排除完整业务行、来源证据和细粒度 `responds` 边；具体体积由回归测试和评估脚本持续监控，目标保持低于 compact manifest v1 的 50%。

Evidence 字符串表完成后，在关闭 DOM/JS 来源解析时，两个 baseline 的 canonical JSON 仍约为 47,066 / 46,068 bytes。启用 DOM/JS 静态证据后增至约 61,985 / 77,936 bytes，换取 11 / 12 条源码事件绑定以及 62 / 192 条 DOM/JS observations；compact observation 仍保持 3,952 / 2,961 bytes。由此继续坚持：canonical 完整来源图与 Agent compact 观察是两个独立优化目标，并提供 `--no-source-refs` 作为按需降载开关。

在 2026-07-19 的本地 Chromium baseline 观察中，黄月英 / 纸上谈兵分别记录 34 / 36 条运行时注册，合并到 23 / 13 个 interaction state，其中 12 / 1 个为静态解析未覆盖的 `runtimeOnly` state；耗时约 0.73s / 0.57s，无页面错误，manifest v1 round-trip 保持精确，compact 大小仍为 3,952 / 2,961 bytes。显式合成事件测试可发现页面 handler 异常，因此其错误进入 diagnostics，而不使转换失败。

同日的隔离场景基线使用 `docs/baselines/runtime/runtime_scenarios_huang-yueying.json` 与 `docs/baselines/runtime/runtime_scenarios_zhishang-tanbing.json`。黄月英场景 4/4 动作、4/4 断言、1/1 条件通过；去重后注册 32 个、命中 3 个，覆盖率 0.0938，CLI 实测约 1.05s。纸上谈兵场景 8/8 动作、7/7 断言、1/1 条件通过；去重后注册 28 个、命中 8 个，覆盖率 0.2857，CLI 实测约 2.60s。两者均无页面错误、warning 或失败重放项。原始单场景快照中的 40 / 39 条注册包含重复注册，覆盖率分母使用跨路径去重后的注册数。

相同黄月英场景分别在 `PYTHONHASHSEED=1` 与 `777` 下生成的 canonical 文件 SHA-256 完全一致，验证了场景汇总与证据排序的确定性。动作失败、非法场景条件、重复场景 ID、条件/断言总上限和 Playwright 错误脱敏均有回归测试；运行时失败继续降级为 diagnostics，不阻断静态转换。

当前 UI-IR v2 所在全量回归套件共 192 项测试，覆盖精确往返、schema、compact/expanded/diff、CSS `@media` 直接解析、DOM/JS 静态引用、站点根相对资源、运行时注册、合成事件、交互候选、轻量状态图、隔离场景、条件/断言、覆盖率、安全边界与 CLI。

Kezhongke 页面形态回归新增 5 个可迁移页面夹具、8 条隔离场景、14 个动作和 25 条断言，覆盖认证 Tab、搜索/键盘关闭、移动目录、延迟动态列表和内容筛选。夹具位于 `tests/fixtures/kezhongke/`，去除了远程 CDN、API、身份状态和 Mermaid 依赖；原始项目仍用于静态/被动运行时抽查。该轮测试还补齐了 `Array.from(...)` / spread 集合事件绑定与 `/shared/...` 站点根相对本地资源解析。

对原始 `Kezhongke_web` 的 home、journal、atelier、grow、path、about、auth、article、fangtan 共 9 个页面进行被动抽查时，静态解析得到 61 条事件绑定和 10 个 media block，运行时得到 69 条 listener 注册与 186 个交互候选；站点根相对脚本/样式 warning 已从 12 项降为 0。隔离策略仍会阻断远程 Tailwind CDN 与 Mermaid，因此原始页面保留 10 条依赖缺失错误；这类页面应使用本地化依赖或可迁移夹具执行无错误交互回归，而不应放宽默认网络隔离。

下一阶段：

1. 在候选清单之上增加风险分级、去重和 beam-width/depth 上限，由人或 Agent 选择是否扩展候选路径。
2. 扩展 CSS media 属性策略，并评估按需加载细粒度关系，避免 canonical IR 无限制增长。
3. 用 UI-IR 关系合并替换 `aggregate_vertical.py` 的领域字段特判。
4. 需要跨项目查询时生成可重建 SQLite 索引，不把数据库作为唯一数据源。
