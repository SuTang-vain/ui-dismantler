# 模式识别规则（patterns.md）

`analyze_html.py` 据此识别 HTML 中的结构模式。每条规则给出「判定特征」和「提取字段」。

## 目录

1. [画布与画框](#1-画布与画框)
2. [Tab Bar](#2-tab-bar)
3. [视图栈](#3-视图栈)
4. [成员网格](#4-成员网格)
5. [详情面板](#5-详情面板)
6. [时间线](#6-时间线)
7. [作品轮播（3D 中心聚焦）](#7-作品轮播3d-中心聚焦)
8. [通用轮播控件](#8-通用轮播控件)
9. [Modal 体系](#9-modal-体系)
10. [故事/覆盖面板](#10-故事覆盖面板)
11. [主题色令牌](#11-主题色令牌)
12. [响应式断点](#12-响应式断点)
13. [数据数组](#13-数据数组)
14. [自动播放](#14-自动播放)

---

## 1. 画布与画框

**判定特征**：`<main>` 或顶层 `<div>` 含以下类名之一：
- `pc-card-frame` / `card-frame` / `app-container` / `main-area` / `main-layout` / `h-main`

**提取字段**：
```json
"canvas": {
  "pc": [width, height],      // 从 width/height CSS 或内联 style
  "wise": [...],              // 从 @media max-width:500px
  "extreme": [...],           // 从 @media max-width:320px
  "frameSelector": ".pc-card-frame"
}
```

## 2. Tab Bar

**判定特征**（满足任一）：
- 元素含 `role="tablist"`
- 类名匹配 `/tab-?(bar|nav|list|s)/i` 且子元素含 `role="tab"` 或类名 `/tab-?item/i`
- **`<nav>` / `.nav` 容器 + 子项带 `data-p`/`data-tab`/`data-target`**（变体命名，如纸上谈兵 `.nav > span.n[data-p="home"]` ↔ `section.panel#home`）

**子模式：「更多」Tab**：
- 类名含 `more` / `tab-more`
- 或无对应 `tabpanel`（`aria-controls` 指向的 id 不存在）
- 或文本含「其它」「更多」「more」

**tab id 优先级**：`data-p` / `data-tab` / `data-target` → `aria-controls` → 原 `id` → 文本 slug。常见前缀 `tab-`/`sg-tab-`/`nav-` 自动剥离。

**提取字段**：
```json
"tabs": [
  { "id": "members", "label": "成员详情", "count": 4, "more": false, "ariaControls": "panel-members" },
  { "id": "more", "label": "其它", "more": true }
]
```

`count` 从 `<small>` 文本提取数字；`id` 从 `aria-controls` 反推或从文本拼音/英文 slug 化。

> **变体示例**（文化类词语·纸上谈兵）：`.nav > span.n[data-p]` 是 tab，`section.panel[id]` 是 tabpanel，`data-p` 值即 tab id，`.on` 是 active 态。

## 3. 视图栈

**判定特征**：
- 容器内多个同级 `<section>`/`<div>`，含 `role="tabpanel"` 或类名 `/view|panel/`
- 仅一个有 `active` 类或无 `hidden` 属性

**提取字段**：
```json
"views": [
  { "id": "panel-members", "tabId": "members", "active": true, "type": "<视图类型>" }
]
```

`type` 由内部结构判定（见 4-7）。

## 4. 成员网格

**判定特征**：
- 类名匹配 `/member-?(grid|list|stage|area)/i`
- 或含多个 `role="listitem"` 的卡片，卡片内含 `<img>` + 姓名/角色文本

**子结构识别**：
- **头像兜底**：`.avatar-fallback` / `.avatar-portrait` → `hasAvatarFallback: true`
- **图片来源标注**：`.photo-source` → `hasPhotoSource: true`
- **状态徽标**：`.member-state` → `hasState: true`
- **分页**：存在 `.carousel-dots` 且成员数 > 网格容量 → `paginated: true`

**提取字段**：
```json
{
  "type": "member-grid",
  "layout": "2x2",           // 从 grid-template-columns/rows 推断
  "perPage": 4,
  "paginated": true,
  "hasAvatarFallback": true,
  "hasPhotoSource": true,
  "hasState": true
}
```

## 5. 详情面板

**判定特征**：
- 类名匹配 `/detail-?(panel|card|aside)/i`
- 或 `aria-live="polite"` 的侧栏
- 含多行「标签:值」结构（`.relation-row` / `.rel-label` + `.rel-value`）

**提取字段**：
```json
{
  "type": "detail-panel",
  "hasKicker": true,         // 存在 .detail-kicker
  "rowSelector": ".relation-row",
  "labelSelector": ".rel-label",
  "valueSelector": ".rel-value"
}
```

## 6. 时间线

**判定特征**（满足任一）：
- 类名匹配 `/time-?line|tl-?(track|item|scroll)/i`
- 容器含 `<time>` 元素且横向排列（`overflow-x: auto` + `scroll-snap`）

**子模式：双端箭头策略**：
- 同时存在 `.tl-prev-pc` + `.tl-prev-mobile` → `dualArrowStrategy: true`

**提取字段**：
```json
{
  "type": "timeline",
  "itemSelector": ".t-item, .tl-item",
  "scrollSnap": true,
  "perPage": { "pc": 3, "mobile": 2 },
  "dualArrowStrategy": true,
  "hasDots": true,
  "hasPageLabel": true
}
```

## 7. 作品轮播（3D 中心聚焦）

**判定特征**（满足任一）：
- 类名匹配 `/works?-?(carousel|slider|stage)/i` 且父容器 `perspective` 非 0
- 存在 `is-center` / `is-prev-side` / `is-next-side` 等档位类名
- 卡片含 `transform: ... translateZ(...)` 

**档位识别**：扫描 CSS 中此类选择器的 `transform`/`width`/`opacity`/`filter:blur`，按 z-index 与 opacity 排序得到档位序列。

**提取字段**：
```json
{
  "type": "carousel-3d",
  "perspective": 900,
  "positions": [
    { "cls": "is-prev-far", "width": 100, "opacity": 0.28, "blur": 2.5, "translateX": -312, "translateZ": -45 },
    { "cls": "is-prev-side", "width": 132, "opacity": 0.5, "blur": 1.5, "translateX": -180, "translateZ": -20 },
    { "cls": "is-center", "width": 280, "opacity": 1, "blur": 0, "translateX": 0, "translateZ": 50 },
    { "cls": "is-next-side", ... },
    { "cls": "is-next-far", ... }
  ],
  "hasStoryPanel": true
}
```

## 8. 通用轮播控件

**箭头判定**：类名匹配 `/carousel-?arrow|arrow|prev|next/i` 且为 `<button>`
**圆点判定**：类名匹配 `/dots?$/i` 且子元素为 `<button>` 或 `::after` 圆点

提取 `selector`、`activeCls`（如 `is-active`）、`hiddenCls`（如 `is-hidden`）。

## 9. Modal 体系

**判定特征**：类名匹配 `/modal-?overlay|dialog|popup/i`，或 `role="dialog"` + `aria-modal="true"`

**子模式分类**：
- **事实网格**：`.modal-body` 含 `.m-row` 网格 → `layout: "fact-grid"`
- **图文详情**：`.modal-body` 含 `<img>` + 文本 → `layout: "image-text"`
- **关系列表**：单列 `.m-row` → `layout: "relation-list"`

提取触发方式（`triggerTab`/`triggerClick`）、关闭方式（X/遮罩/ESC）。

## 10. 故事/覆盖面板

**判定特征**：类名匹配 `/story-?(panel|card|overlay)/i` 或 `/work-?story/`，绝对定位覆盖父视图，含 `open` 类切换 + `@keyframes` 滑入动画。

提取 `trigger`（CTA 按钮/中心卡点击）、`hasClose`、`layout`（封面+文字比例）。

## 11. 主题色令牌

**判定特征**：`<style>` 中 `:root { ... }` 块，或 `--<name>: <value>` 声明。

**解析**：
1. 正则提取所有 `--<name>: <value>` 声明
2. 按本文档第 2 节（spec.md 归一化表）映射到 `--sg-*`
3. 对每个变量，扫描其在 CSS 中的使用位置，推断 `usage[]`

**颜色值解析**：支持 `#hex`/`#hex8`/`rgb()`/`rgba()`/`hsl()`。

**渐变识别**：正则 `/linear-gradient\(([^)]+)\)/`，提取 stops 中的颜色与变量引用。

## 12. 响应式断点

**判定特征**：`@media (max-width: <n>px)` 规则块。

**提取**：
```json
"responsive": [
  { "breakpoint": "max-width:500px", "changes": ["grid 1.45fr→1fr", "detail-panel display:none", ...] }
]
```

`changes` 通过对比该 `@media` 块内规则与默认规则的差异生成（启发式：属性名 + 选择器简述）。

## 13. 数据数组

**优先级**（依次尝试）：
1. `<script type="application/json" id="...">` 内嵌 JSON → 直接解析
2. JS 中 `var <name> = [ {...}, ... ]` 数组字面量 → AST 或正则提取
3. DOM 中重复结构（如多个 `.t-item`）→ 逐节点提取字段

**字段映射**：根据视图类型套用预设字段名（member→key/name/role/img/relations；work→img/year/title/desc/story；timeline→time/title/desc/img）。

## 14. 自动播放

**判定特征**：JS 中 `setInterval(..., <n>)` 且函数名/上下文含 `auto`/`play`/`cycle`/`rotate`。

**提取**：
```json
"interactions": [
  { "type": "autoplay", "target": "members", "interval": 3000, "stopOn": ["click","touchstart"] },
  { "type": "autoplay", "target": "works", "interval": 3500, "stopOn": ["mouseleave","tab-leave"] }
]
```

---

## 识别失败处理

当某视图类型无法被 4-10 任一规则匹配：
- manifest 的 `warnings[]` 追加 `"view <id>: unknown type, fallback to generic"`
- 该视图 `type` 标记为 `"generic"`，`data` 字段尝试通用 DOM 提取（文本+图片）
- 生成阶段走 **generic 视图分支**（`has_generic_views`）：
  - 有 tabs：为每个非-more tab 生成 `<section role="tabpanel">`，内含 `.sg-section-head` + `.sg-generic-body[aria-live=polite]`
  - 无 tabs（如因果链/地图导览等单视图范式）：生成一个兜底视图（id=`main`），确保 A11y 基线（tabpanel + aria-live）达标
- README 标注「需人工细化」

> **A11y 按需校验**（spec #5）：tablist/tabpanel 仅在 manifest `structure.tabs` 非空时强制；dialog/ESC 仅在 `structure.modals` 非空时强制；aria-live/aria-label 任何组件库都要求。这样因果链、地图导览等无 tab 切换的垂类不会因 tabpanel 缺失而误判失败。
