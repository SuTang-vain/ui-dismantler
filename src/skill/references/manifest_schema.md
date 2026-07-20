# manifest.json 字段定义（manifest_schema.md）

`analyze_html.py` 的输出。这是 HTML 的标准化中间契约，供 agent 拆解时参考（结构化主题色/结构/数据清单）。

## 顶层结构

```json
{
  "schemaVersion": "1.0",
  "meta": { ... },
  "theme": { ... },
  "structure": { ... },
  "data": { ... },
  "interactions": [ ... ],
  "responsive": [ ... ],
  "a11y": { ... },
  "warnings": [ ... ]
}
```

---

## meta

源文件元信息。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `source` | string | 是 | 源 HTML 绝对路径 |
| `title` | string | 是 | `<title>` 文本 |
| `templateId` | string | 否 | `data-dudesign-template` 属性值 |
| `vertical` | string | 否 | manifest v1 兼容字段，记录可选领域上下文；新调用使用 `--profile`，`--vertical` 仅为兼容别名。该字段不参与核心识别分支 |
| `caseName` | string | 否 | 案例名（slug 化，用于命名库） |
| `canvas` | object | 是 | 见下 |

### canvas

```json
"canvas": {
  "pc": [788, 492],
  "wise": [380, 456],
  "extreme": [300, 360],
  "frameSelector": ".pc-card-frame"
}
```

缺档时填 `null`，生成阶段补默认值（WISE=380×456，extreme=300×360）。

---

## theme

主题色与渐变。

```json
"theme": {
  "tokens": [
    {
      "name": "primary",          // 归一化后的 sg- 名（不含前缀）
      "value": "#6487FA",
      "original": "--primary",    // 原变量名，或 tailwind.colors.primary
      "usage": ["选中描边","激活态","主按钮"]
    }
  ],
  "gradients": [
    {
      "selector": ".detail-panel",
      "value": "linear-gradient(180deg, #FBFBFD 0%, #F5F7FC 100%)",
      "normalized": "linear-gradient(180deg, var(--sg-paper) 0%, var(--sg-soft) 100%)"
    }
  ]
}
```

`tokens[].usage` 由扫描该变量在 CSS 规则中的出现选择器推断（取前 5 个去重）。
对于 Tailwind CDN 页面，分析器还会读取静态 `tailwind.config` 中的
`theme.extend.colors` 颜色叶子，并通过页面 utility class 推断 `usage` 与 `roles`；
不会执行配置代码或请求远程资源。

---

## structure

页面结构骨架。

```json
"structure": {
  "tabs": [ { "id","label","count","more","ariaControls" } ],
  "views": [ { "id","tabId","active","type","<type特定字段>" } ],
  "modals": [ { "id","trigger","layout","hasClose","closeOn" } ],
  "storyPanels": [ { "id","trigger","layout","hasClose" } ]
}
```

### view.type 枚举

| type | 说明 | 特定字段 |
|---|---|---|
| `member-grid` | 成员网格 | `layout`, `perPage`, `paginated`, `hasAvatarFallback`, `hasPhotoSource`, `hasState` |
| `detail-panel` | 详情面板 | `hasKicker`, `rowSelector` |
| `timeline` | 时间线 | `scrollSnap`, `perPage`, `dualArrowStrategy`, `hasDots`, `hasPageLabel` |
| `carousel-3d` | 3D 中心聚焦轮播 | `perspective`, `positions[]`, `hasStoryPanel` |
| `quiz` | 问答测试 | `questionCount`, `hasFeedback`, `hasResult`, `hasProgressBar`, `optionsSelector` |
| `comparison` | 对比辨析（双栏 real/alt） | `columns[]`(`{side,label}`), `hasPopup` |
| `splash` | 开场解锁屏 | `hasQuestion`, `hasOptions`, `ctaSelector`, `ctaText` |
| `generic` | 未识别 | `note` |

### modal.layout 枚举

| layout | 说明 |
|---|---|
| `image-text` | 图片+文本 |
| `relation-list` | 关系列表（标签:值行） |
| `fact-grid` | 事实网格 |
| `comparison` | 对比辨析（whatif real/alt 双栏） |
| `generic` | 未识别 |

---

## data

从 HTML/JS 提取的业务数据。

```json
"data": {
  "members": [
    {
      "key": "jisoo",
      "name": "Jisoo · 金智秀",
      "role": "队内定位：主唱 · 视觉",
      "shortName": "Jisoo",
      "state": "在团",
      "img": "https://...",
      "photoSource": "Wikimedia Commons",
      "relations": [ ["category","frontend"], ["role","layout"] ]
    }
  ],
  "timeline": [
    { "time": "2016.08", "title": "出道", "desc": "...", "img": "...", "alt": "..." }
  ],
  "works": [
    { "img":"...", "alt":"...", "year":"2016 · 单曲", "title":"《Square One》", "desc":"...", "story":"..." }
  ],
  "moreFacts": [
    { "label": "词条类型", "value": "韩国女子演唱组合", "full": false }
  ]
}
```

每个数组可为空（原案例无对应数据）。字段缺失时填 `null` 或空字符串。

---

## interactions

交互行为清单。

```json
"interactions": [
  { "type": "tab-switch", "trigger": "click", "target": ".tab-bar .tab", "action": "switchPanel" },
  { "type": "select", "trigger": "click", "target": ".member", "action": "selectMember", "sideEffect": "updateDetailPanel" },
  { "type": "autoplay", "target": "members", "interval": 3000, "stopOn": ["click","touchstart"] },
  { "type": "modal-open", "trigger": "click", "target": "#tab-more", "action": "openModal" },
  { "type": "modal-close", "trigger": ["click","keydown:Escape"], "target": ".modal-overlay" },
  { "type": "explicit-handler", "trigger": "click", "target": "#tab-register", "handler": "switchTab", "action": "switch-tab" }
]
```

`explicit-handler` 来自 DOM 中明确声明的 `onclick`、`onsubmit`、`oninput`、
`onchange`、`onkeydown` 或 `onkeyup`。它记录稳定 selector 和 handler 名，不执行
handler，也不推断未显式绑定的业务行为。

---

## responsive

响应式断点与变化。

```json
"responsive": [
  {
    "breakpoint": "max-width:500px",
    "canvas": [380, 456],
    "changes": [
      "members-view grid 1.45fr→1fr",
      "detail-panel display:none",
      "timeline perPage 3→2",
      "tl-controls display:none→flex"
    ]
  }
]
```

---

## a11y

无障碍特征汇总。

```json
"a11y": {
  "hasTablist": true,
  "hasTabpanel": true,
  "hasDialog": true,
  "hasAriaLive": true,
  "hasAriaPressed": true,
  "hasAriaLabel": true,
  "closeOnEscape": true,
  "closeOnOverlayClick": true
}
```

---

## warnings

分析过程中的告警，不阻断生成但需人工复核。

```json
"warnings": [
  "view panel-works: positions 识别为 5 档，但 is-prev-far 缺少 filter:blur，可能不完整",
  "data.works[2].story 字段为空，生成时需补全"
]
```

---

## 最小模式（--minimal）

当 `analyze_html.py --minimal` 时，仅输出 `meta` + `theme` + `structure.tabs` + `structure.views[].type` + `warnings`，不提取 data/interactions/responsive。用于结构特殊案例的「最小提取」降级。
