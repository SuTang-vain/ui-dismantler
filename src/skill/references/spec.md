# 强约束规范（spec.md）

所有由本 skill 生成的组件库必须遵循以下 9 项强约束。`validate_lib.py` 据此校验。

## 1. 命名前缀

| 对象 | 规则 | 示例 |
|---|---|---|
| CSS 类名 | `sg-` 前缀，kebab-case | `.sg-tab-bar` `.sg-member` `.sg-modal-card` |
| CSS 变量 | `--sg-` 前缀 | `--sg-primary` `--sg-ink` |
| JS 全局对象 | `window.<LibName>`，PascalCase | `window.StarGroup` |
| JS 公共 API | `.mount(container, opts)` / `.create(opts)` | — |
| DOM id | `sg-` 前缀 | `#sg-panel-members` |

**禁止**：无前缀的通用类名（`.tab`、`.member`、`.modal`），避免宿主页面冲突。

## 2. CSS 变量归一化

原案例变量名各异，必须按下表归一化到 `--sg-*` 命名空间：

| 原命名模式（正则） | 归一化为 | 语义 |
|---|---|---|
| `--primary`, `--primary-color`, `--marker-primary`, `--brand` | `--sg-primary` | 主功能色 |
| `--accent`, `--accent-color`, `--cause-color` | `--sg-accent` | 强调色 |
| `--ink`, `--text-main`, `--text-primary`, `--color-text` | `--sg-ink` | 主文字 |
| `--muted`, `--text-secondary`, `--text-sub`, `--text-muted` | `--sg-muted` | 次级文字 |
| `--subtle`, `--text-tertiary`, `--text-light` | `--sg-subtle` | 三级文字 |
| `--line`, `--border`, `--divider` | `--sg-line` | 分割线 |
| `--paper`, `--bg-white`, `--panel-bg`, `--card-bg` | `--sg-paper` | 卡片底色 |
| `--stage`, `--bg-gray`, `--bg-color` | `--sg-stage` | 画布背景 |
| `--soft`, `--primary-l`, `--primary-light` | `--sg-soft` | 主色浅底 |

未匹配的原变量：`--sg-<去连词原名>`，并在 manifest 的 `theme.tokens[].original` 记录原名。

## 3. 数据分离

- 所有可变内容（成员、作品、时间线、事实）必须以 JSON 数组形式存在
- JS 中通过 `<script type="application/json" id="...">` 内嵌或 `options` 参数传入
- **禁止**在 JS 渲染逻辑中硬编码业务文案/URL

校验：生成库的 `examples/*.html` 必须能通过替换 JSON 数据生成不同内容卡片。

## 4. 响应式三档

必须含三档 `@media` 断点（即使原案例只有 PC 也要补全）：

| 档位 | 断点 | 画布尺寸 | 必备调整 |
|---|---|---|---|
| PC | 默认 | 原案例 PC 尺寸 | 完整布局 |
| WISE | `max-width: 500px` | 380×456 | 单栏、隐藏次要面板、控件缩小 |
| 极端 | `max-width: 320px, max-height: 380px` | 100%（min 280×340） | 字号缩小、弹窗替代面板、隐藏计数 |

## 5. A11y

| 元素 | 要求 |
|---|---|
| Tab Bar | `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls` |
| 面板 | `role="tabpanel"` + `aria-labelledby` + `hidden` |
| Modal | `role="dialog"` + `aria-modal="true"` + `hidden` |
| 动态播报区 | `aria-live="polite"` |
| 图标按钮 | `aria-label` |
| 关闭 | ESC 键 + 点击遮罩 + X 按钮 三选一以上 |

## 6. 主题可定制

- 所有颜色必须经 CSS 变量，**禁止**在样式规则中硬编码 `#hex` 或 `rgb()`
- 渐变中的颜色也必须引用变量：`linear-gradient(var(--sg-paper), var(--sg-soft))`
- 唯一例外：纯黑白透明叠加（如 `rgba(0,0,0,0.75)` 蒙版）可硬编码
- 校验：`grep -E '#[0-9a-fA-F]{3,8}' src/*.css` 只应出现在 `:root` 变量定义和注释中

## 7. 零依赖

- 禁止 `<script src="...">` 引入外部 JS（含 CDN）
- 禁止 `<link rel="stylesheet" href="https://...">` 引入外部 CSS
- 唯一例外：字体 CDN（`font-family` 引用的 Google Fonts 等）
- 生成的 `.css`/`.js` 之间可互相引用，但不得依赖第三方库

## 8. 文档完备

每个生成的组件库必须含：

| 文件 | 内容 |
|---|---|
| `README.md` | 快速开始 + API + 数据契约 + 主题定制说明 |
| `docs/设计规范.md` | 主题色令牌表 + Tab 结构 + 交互模式 + 逻辑设置 |

## 9. 类名对齐

JS 中 `el()` 调用和 `class=` 字面量引用的 `sg-*` 类名，必须在 `src/*.css` 中有对应的 `.sg-*` 规则定义。

**禁止**：JS 生成 `<div class="sg-arrow">` 但 CSS 中无 `.sg-arrow` 规则（元素将无样式）

**豁免**：
- 动态拼接的 ID 前缀（`sg-tab-` + tabId、`sg-panel-` + viewId）不是类名，不在此约束范围
- 语义基类（如 `sg-tl-prev`/`sg-tl-next` 用于组合选择器，CSS 定义带后缀的变体 `sg-tl-prev-pc`/`sg-tl-prev-mobile`）不报

## 校验脚本行为

`validate_lib.py <组件库目录>` 逐项检查，输出：

```
[PASS] 1. 命名前缀
[PASS] 2. CSS 变量归一化
[FAIL] 3. 数据分离 - examples/example.html 中发现硬编码 URL
  ↳ src/glossary.js:142  img.src = 'https://...'
[PASS] 4. 响应式三档
...
[PASS] 9. 类名对齐
```

退出码：全过 0，有失败 1。

## 10. 组件片映射表（按组件切分生成 CSS）

CSS 按"组件边界"切分为独立片，每片 100-300 行，逐片生成后拼接为单文件。`view type -> 组件片`映射规则：

| view type | 需要的组件片 | 共享依赖 |
|---|---|---|
| `member-grid` | `07-member-grid` + `08-detail-panel` | `06-carousel-controls`（如分页） |
| `timeline` | `09-timeline` | `06-carousel-controls`（如双端箭头） |
| `carousel-3d` | `10-works-carousel-3d` + `11-work-story-panel`（如有故事面板） | `06-carousel-controls` |
| `quiz` | `quiz` 片 | - |
| `comparison` | `comparison` 片 | - |
| `splash` | `splash` 片 | - |
| `cause-chain` | `cause-chain` 片 | - |
| `nav-panel` | `nav-panel` 片 | - |
| `graph` | `graph` 片 | - |
| `detail-panel`（独立） | `08-detail-panel` | - |
| `generic` | `generic` 兜底片 | - |

**容器片**（所有案例必有）：`01-tokens` + `02-frame` + `03-tab-bar`（如有 tabs）+ `04-view-stack`（如有 views）+ `05-section-head`（如有标题）

**Modal 片**：`structure.modals[]` 每个 modal -> 对应布局片（`fact-grid`/`relation-list`/`image-text`/`comparison`）

**每片内部结构**：
1. 片头注释 `/* ==== N. 片名 ==== */`
2. PC 默认规则（选择器 + 属性）
3. `@media (max-width:500px) { /* 本片选择器的 WISE 调整 */ }`
4. `@media (max-width:320px) { /* 本片选择器的 extreme 调整 */ }`

**拼接顺序**（依赖驱动）：
```
01-tokens -> 02-frame -> 03-tab-bar -> 04-view-stack -> 05-section-head
-> 06-carousel-controls -> [07-11 view 组件片] -> [12-13 modal 片] -> 14-a11y
```

> **跳过缺失信号的片**：如 manifest 无 `modals[]`，则跳过 12/13；无 `hasStoryPanel` 则跳过 11。确保无死 CSS。

## 11. 输出形态（P3 输出泛化）

组件库支持三种输出形态，由 `adapt_output.py` 从 IIFE 源码生成：

### IIFE（默认，agent 直接产出）

```js
(function(global) {
  "use strict";
  function LibName(root, options) { /* 渲染逻辑 */ }
  global.LibName = { mount: function(c,o){...}, create: function(o){...} };
})(window);
```
- 用法：`<script src="lib.js"></script>` + `LibName.mount(el, opts)`
- roundtrip 默认验证此形态

### ESM/UMD（适配器生成）

```bash
python3 src/skill/scripts/adapt_output.py lib.js --esm --out lib.esm.js
```
- 构造函数改名为 `_LibCtor` 避免与全局 API 名冲突
- 用法：`<script src="lib.esm.js"></script>` + `LibName.mount(el, opts)`（兼容 `<script>` 加载）
- 或构建工具 `import { mount } from 'lib.esm.js'`（UMD 风格）

### Web Component（适配器生成）

```bash
python3 src/skill/scripts/adapt_output.py lib.js --wc --name sg-lib --out lib.wc.js
```
- 声明式用法：`<sg-lib><script type="application/json">{...}</script></sg-lib>`
- `connectedCallback` 自动解析 JSON 子元素或 `data-options` 属性
- 用法：`<script src="lib.wc.js"></script>` + `<sg-lib>...</sg-lib>`

### 批量生成所有形态

```bash
python3 src/skill/scripts/adapt_output.py lib.js --all --name sg-lib --out-dir src/
```
一次生成 `.esm.js` + `.wc.js`。

> **注意**：`adapt_output.py` 目前仅识别 `function Lib(root, options)` 命名约定。使用自定义构造函数名（如 `function GlossaryExplorer(options)`）的库需要先用此命名约定产出 IIFE，再转换。

## 12. Gold+ 真实渲染质量门

DOM 拓扑和文本等价不能证明视觉等价。TypeScript Gold+ 校验必须在真实 Chrome/Chromium 中同时运行原页面和组件库 example，并执行三层检查：

1. **选择器实际命中**：逐个检查渲染 DOM 中的 `sg-*` 类是否有实际可用的 CSS 规则；不仅检查 CSS 文件里是否出现同名类。重点捕获 ID/class 不一致、修饰类前缀不一致、祖先选择器链断裂。
2. **计算样式**：对关键元素比较 `display`、`position`、尺寸、位置、背景、颜色、flex/grid、overflow、z-index、transform 等属性。执行顺序错误导致的 `left/top/transform` 差异必须拉低质量分。
3. **像素截图**：相同 viewport、相同 device scale factor 下截图并计算 pixel diff；默认阈值为 2%。

Gold+ 默认门槛：选择器覆盖率 100%、关键计算样式匹配率 ≥ 0.98、像素差异 ≤ 2%、无运行时错误。若 Gold+ 失败，即使 DOM/text roundtrip 全绿也不得交付。
