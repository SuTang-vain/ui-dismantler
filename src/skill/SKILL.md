---
name: html-to-component-lib
description: 将单个 HTML 案例页拆解为可复用的组件库（参数化 CSS + 渲染引擎 JS + 数据驱动示例 + 设计规范文档）。MUST USE 当用户想把 HTML 案例转为组件库/复用模板/提取主题色与交互模式，或提到「拆解 HTML」「提取组件」「做成组件库」「规范化复用」「提取主题色」「提取交互模式」。支持逐案例拆解与垂类聚合两种模式，输出遵循 sg-* 强约束规范。
---

# HTML → 组件库 拆解 Skill

把一个自包含的 HTML 案例页（含内联 `<style>`/`<script>`）拆解为结构化、可复用、数据驱动的组件库。

## 你（agent）的角色

**你是拆解的主控者**，不是脚本的调度员。你要像工程师阅读一份源码那样**理解**这份 HTML——它的主题色语义、Tab/视图结构、交互模式、数据组织、响应式断点——然后**亲自产出**完整的组件库代码。Python 脚本只是你的确定性工具，帮你拿颜色值、校验约束、量化等价度，但**理解和创作由你完成**。

标杆质量：`明星组合/组件库`（手工拆解 BLACKPINK 的产物，2613 行，完整 A11y + 设计令牌 + 数据驱动）。你产出的库要对标这个质量，不是"能跑就行"。

## 何时使用

- 用户提供一个 HTML 文件（或目录），要求「拆成组件库」「提取复用模板」「规范化」
- 用户要求提取某页面的主题色 / Tab / 交互模式 / 逻辑设置并固化复用
- 用户要求把同垂类多个案例合并为公共组件库（垂类聚合，见末节）

**支持的输入类型**（P1 泛用化后）：
- 自包含单 HTML（内联 `<style>`/`<script>`）—— 原始支持
- 多文件目录（`index.html` + 外部 `.css`/`.js`）—— 渲染器自动内联
- Tailwind CDN 页面（`cdn.tailwindcss.com`）—— 渲染器注入 tailwind 桩，analyze_html 从 `tailwind.config` 提取主题色
- 含外部依赖的页面（marked/dompurify/mermaid）—— 渲染器注入桩防崩溃
- 含 canvas 动画的页面 —— 渲染器注入 canvas context 桩
- 响应式流式布局（非固定画布）—— 支持，不再要求 788×492 固定尺寸

## 拆解工作流（按顺序执行）

### 第 1 步：通读 HTML，建立理解

**不要急着调脚本**。先完整读一遍 HTML（`<head>` 的 `<style>`、`<body>` 的结构、`<script>` 的逻辑），在脑中建立以下认知：

1. **画布与布局**：PC 尺寸多少？是固定画框（`.pc-card-frame` 788×492 这类）还是流式？有哪些响应式断点（`@media max-width: 500/320`）？每个断点画布尺寸和布局怎么变？
2. **主题色语义**：`:root` 里定义了哪些颜色变量？**哪个是品牌主色**（用于选中态/激活态/主按钮）？**哪个是强调色**（用于"其它"/故事/高亮）？文字分几级灰阶（ink/muted/subtle）？背景色（paper 卡片底/stage 画布底）？分割线色？这些语义要你自己判断，不是机械地取变量名。
3. **Tab/视图结构**：有几个 Tab？是 `role=tablist` 还是 `nav + data-p` 关联型？每个 Tab 对应什么视图（成员网格/时间线/作品轮播/详情面板）？末位有没有"更多"特殊 Tab？
4. **交互模式**：有没有自动播放（`setInterval`）？间隔多少？什么交互会停止？有没有 Modal（`role=dialog`）？触发方式？关闭方式（X/遮罩/ESC）？有没有 3D 轮播（`perspective`）？故事面板？
5. **数据组织**：成员/作品/时间线数据在哪？是 `<script type=application/json>` 还是 JS 数组（`const memberList = [...]`）还是直接写在 DOM？字段有哪些？有没有图片兜底逻辑？有没有图片来源标注？
6. **A11y 现状**：原页面已有哪些 `role`/`aria-*`？哪些缺失需要补？

**理解不清的地方，去读对应的 CSS 规则和 JS 片段确认**。这一步的质量决定后续所有产出。

### 第 2 步：调工具拿确定性数据（参考用，不是唯一依据）

```bash
python3 scripts/analyze_html.py <html路径> --out <manifest.json> --minimal
```

`--minimal` 模式快速提取主题色令牌 + 结构清单 + 范式识别，给你当**参考**。

**P2 范式识别**（`manifest.structure.pattern`）：
- `cause-chain`：因果链（timeline-nav + causeChain + whatIf）
- `nav-panel`：导航+面板（nav > [data-p] + .panel）
- `quiz`：测验、`graph`：图谱、`member-card`：成员卡（v1 范式）
- `unknown`：未识别范式，需 agent 自行理解结构

**Tailwind config 主题色提取**（P1 泛用化）：
- 当 `:root` 无 CSS 变量时（Tailwind CDN 页面），工具自动跑原页面 JS 捕获 `tailwind.config`
- 提取 `theme.extend.colors` 并归一化到 `--sg-*`（如 `primary`->`--sg-primary`、`on-surface`->`--sg-ink`、`surface`->`--sg-paper`）
- manifest 会标注 `⚠ theme: :root 无变量，从 Tailwind config 提取 N 个主题色`

**数据契约提取**（非 minimal 模式）：
- 因果链：`data.events`/`data.causeChain`/`data.whatIf`
- nav-panel：`data.graphNodes`/`data.quiz`

注意：
- 工具提取的主题色**语义可能不准**，你要按第 1 步的理解修正归一化
- 工具识别的视图类型可能不全，你要自己判断真实结构
- `manifest.warnings[]` 标注的未识别项，是你的拆解重点

工具是拐杖，你的理解是双腿。归一化映射表见 `references/spec.md` 第 2 节。

### 第 3 步：产出组件库文件

**输出形态**（P3 输出泛化，默认 IIFE，可按需生成其他形态）：

| 形态 | 文件 | 用法 | 适用场景 |
|---|---|---|---|
| IIFE（默认） | `<lib>.js` | `<script src>` + `Lib.mount()` | 通用，roundtrip 默认验证此形态 |
| ESM/UMD | `<lib>.esm.js` | `<script src>` 或 `import {mount}` | 现代构建工具（webpack/vite） |
| Web Component | `<lib>.wc.js` | `<sg-lib>` 标签 + JSON | 声明式用法，框架无关 |

IIFE 是默认产出。如需其他形态，用适配器生成器：
```bash
python3 src/skill/scripts/adapt_output.py src/<lib>.js --esm --out src/<lib>.esm.js
python3 src/skill/scripts/adapt_output.py src/<lib>.js --wc --name sg-<lib> --out src/<lib>.wc.js
python3 src/skill/scripts/adapt_output.py src/<lib>.js --all --name sg-<lib> --out-dir src/
```

在用户指定目录（或 `/tmp/<lib-name>/`）下创建完整组件库：

```
<lib-name>/
├── README.md                 介绍 + 快速开始 + API + 数据契约 + 主题定制
├── docs/设计规范.md           主题色系统 / Tab 结构 / 交互模式 / 逻辑设置 / 响应式
├── src/
│   ├── <lib-name>.css        参数化样式（sg-* 前缀，--sg-* 变量，三档响应式）
│   └── <lib-name>.js         渲染引擎（<LibName>.mount/create API，数据驱动，A11y）
└── examples/
    ├── <案例>.html            用组件库 + 原数据复刻原案例
    └── template.html          空白复用模板（带示例数据）
```

#### 3.1 `src/<lib-name>.css` — 参数化样式

- 所有类名 `sg-` 前缀，kebab-case（`.sg-frame` `.sg-tab` `.sg-member`）
- `:root`（或 `.sg-frame` 作用域）定义所有 `--sg-*` 变量，含语义注释
- **颜色全走变量**，禁止在规则里硬编码 `#hex`（`:root` 定义与 `rgba(0,0,0,0.x)` 纯黑白蒙版例外）
- 渐变里的颜色也引用变量：`linear-gradient(var(--sg-paper), var(--sg-soft))`
- 三档响应式：PC 默认 + `@media (max-width:500px)` + `@media (max-width:320px)`，即使原案例只有 PC 也要补全
- 保留原案例的布局精髓（3D 透视档位、scroll-snap、grid 列数等），不要简化掉

#### 3.2 `src/<lib-name>.js` — 渲染引擎

对标 `star-group.js` 的范式（见 `references/` 下标杆）：

```js
(function (global) {
  'use strict';
  // 工具：el(tag, cls, attrs) 创建节点；on(node, evt, fn) 绑事件
  function el(tag, cls, attrs) { /* ... */ }

  var DEFAULTS = { /* 所有可配置项，含 tabs/members/timeline/works/theme/autoPlay 等 */ };

  function LibName(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    // 定时器/索引/选中态等实例状态
  }
  LibName.prototype.create = function () { /* 构建 DOM，返回根节点 */ };
  LibName.prototype.mount = function (container) { /* create + append + afterMount */ };
  // _buildTabBar / _buildViewStack / _buildMembers / _buildTimeline / _buildWorks ...
  // _afterMount：启动自动播放、绑定交互、a11y 初始化

  function applyTheme(root, theme) { /* 把 options.theme 写入 root.style 的 --sg-* */ }

  global.LibName = { mount: function(c,o){return new LibName(o).mount(c);}, create: function(o){return new LibName(o).create();} };
})(window);
```

要点：
- **数据驱动**：所有可变内容走 `options`，**禁止硬编码业务文案/URL**
- **完整 A11y**：tablist/tab/tabpanel + aria-selected/aria-controls/aria-labelledby；dialog + aria-modal + hidden；aria-live 播报区；图标按钮 aria-label；ESC 关闭
- **图片兜底**：`load`/`error` 事件驱动 `.is-loaded`/`.is-error`，兜底显示首字母 + 渐变
- **自动播放**：`setInterval` + 任意交互停止（click/touchstart/mouseenter）
- **响应式逻辑**：`isMobile()`/`isExtremeSmall()` 判断小屏行为差异（弹 Modal vs 内嵌面板）

#### 3.3 `examples/<案例>.html` — 用原数据复刻

- 引入 `src/<lib-name>.css` 和 `src/<lib-name>.js`
- 把原 HTML 的**真实数据**（成员/作品/时间线/事实）填入 `options`
- 调 `LibName.mount(document.getElementById('mount'), {...})`
- 目标：这个页面要能还原原案例的核心内容（往返测试会量化）

#### 3.4 `examples/template.html` — 空白复用模板

- 同结构，但用示例/占位数据
- 注释标注每个数据段的含义，方便复用时替换

#### 3.5 `docs/设计规范.md` — 完整规范

对标 `明星组合/组件库/docs/设计规范.md` 的结构：
1. **主题色系统**：设计令牌表（Token / 值 / 语义用途）+ 语义分组 + 渐变叠加
2. **Tab 元素**：结构 + 属性约定 + 三档尺寸
3. **交互模式**：视图栈 + 各视图（成员/时间线/作品/详情）的交互细节
4. **逻辑设置**：响应式断点 + 自动播放策略 + 数据驱动 + A11y + 性能稳健性
5. **字体排版**：字体栈 + 标题层级 + 圆角体系
6. **组件清单**：组件 → 类名 → 复用要点

#### 3.6 `README.md`

对标 `明星组合/组件库/README.md`：介绍 + 目录结构 + 快速开始 + API 表 + 数据契约（TS 接口）+ 主题定制 + 组件清单 + 交互行为表 + 响应式断点 + 版本。

### 第 4 步：自检（必须全过）

```bash
# 4a. 8 项强约束校验
python3 scripts/validate_lib.py <组件库目录>

# 4b. JS 语法检查
node --check src/<lib-name>.js

# 4c. 往返等价度（量化"忠于原 HTML"的程度）
python3 scripts/roundtrip.py <原html路径> --lib <组件库目录> --out <报告.json>
```

**质量门槛**（必须全过才算完成）：
- `validate_lib.py` 8 项全 PASS
- `node --check` 无语法错误
- `roundtrip.py` 综合分 ≥ 0.85（GOLD）/ ≥ 0.70（PASS）

**roundtrip 评分维度**（P0 诚实度量后）：
- `tag_topology_rate`（权重 40%）：DOM tag 拓扑匹配率，不受 class 命名范式影响
- `class_match_rate`（权重 30%）：class 语义相似度（容许 sg- 重命名）
- `node_match_rate`（权重 30%）：节点递归匹配率
- `text_match_rate`：文本精确+包含匹配
- `coverage`：对比覆盖率（应接近 100%）
- `overall = struct_score * 0.5 + text * 0.5`

> **关于 Tailwind 页面**：Tailwind 工具类（`bg-background text-on-background`）与 sg- 语义类
> 是两种正确范式，class 相似度天然低。此时 tag 拓扑率（通常 0.95+）和文本匹配率（1.0）
> 是更忠实的度量。overall 0.70+ 即为合格（PASS），不必追求 class 匹配高分。

> 门槛建立依据：手工标杆（明星组合）roundtrip 综合 0.91；
> agent 拆解（huang/zhi）0.97+ GOLD；
> Tailwind 页面（Kezhongke about/grow）0.71-0.73 PASS（文本 1.0 + tag 拓扑 0.96+）。

### 自检决策表（失败 -> 修订动作）

每轮自检后按此表定位修订点，改完重跑全部三项自检（不要只重跑失败项，避免引入新问题）：

| 自检失败项 | 根因定位 | 修订动作 |
|---|---|---|
| validate: 1.命名前缀 | CSS 规则主体含无 sg- 前缀的通用词（tab/member/modal...） | 把违规类名加 `sg-` 前缀；注意只改主体选择器（最右段），后代类若是数据驱动可不动 |
| validate: 2.变量归一化 | `:root` 外的规则里用了未归一的 `--原变量` 或硬编码色值 | 在 `:root` 定义 `--sg-*` 变量，规则里改用 `var(--sg-xxx)`；归一化映射见 spec.md 第 2 节 |
| validate: 3.数据分离 | examples HTML 里硬编码了业务文案/URL（非占位） | 把硬编码内容抽到 `<script type="application/json">` 或 options 参数 |
| validate: 4.响应式三档 | 缺 `@media (max-width:500px)` 或 `(max-width:320px)` | 补全两档断点，每档至少有画布尺寸/字号/布局调整 |
| validate: 5.A11y | 有 tab 但无 role=tablist，或有 dialog 但无 ESC | 按需补 A11y 属性（详见 spec.md 第 5 节的按需表） |
| validate: 6.主题可定制 | 规则里硬编码 `#hex` 或 `rgb()`（非 :root、非纯黑白蒙版） | 替换为 `var(--sg-xxx)`；渐变里的色也走变量 |
| validate: 7.零依赖 | examples HTML 引了外部 JS/CSS（字体 CDN 除外） | 删除外部引用，改用本地 src/ 资源 |
| validate: 8.文档完备 | 缺 README.md 或 docs/设计规范.md，或 README 无 API 说明 | 补全文档，README 含 mount/create API，设计规范含主题色章节 |
| node --check 报错 | JS 语法错误（缺分号/括号不匹配/非法字符） | 按报错行号定位修复，常见：模板字符串未闭合、对象尾逗号 |
| roundtrip 文本分 <0.8 | 看报告 `text.missing`，缺真实内容（成员定位/作品标题等） | 把缺失文本补进 `examples/<案例>.html` 的 options 数据 |
| roundtrip 结构分 <0.7 | 看 `structure.node_match_rate`（tag 匹配率）和 `class_match_rate` | 常见：缺视图层（没渲染 timeline/works）、嵌套层级错位、modal 没挂载。对比器已对 sg- 前缀和类名重命名容错，不必追求类名一致 |

**退出协议**：
- 全部门槛通过 -> 拆解完成，向用户汇报各文件路径 + 自检结果
- 第 3 轮仍不达标 -> 停止修订，向用户说明：哪几项过、哪几项差多少、差距原因（如"黄月英是因果链范式，当前未支持需扩展 patterns"）、建议下一步
- 每轮修订只改与失败项相关的文件，不要大面积重写（避免引入回归）

### 第 5 步：修订（不达标则循环）

按上方"自检决策表"定位修订点，改完重跑全部自检（4a+4b+4c 三项都要重跑）。循环直到达标或达 3 轮上限。

- 修订后重跑自检，循环直到达标或达 3 轮上限（3 轮仍不达标则按"退出协议"向用户说明差距）

## 关键约束（详见 references/spec.md）

8 项强约束，`validate_lib.py` 据此校验：

1. **命名前缀**：CSS 类 `sg-`、变量 `--sg-`、JS 全局 PascalCase、DOM id `sg-`
2. **变量归一化**：原变量名按下表归一到 `--sg-*`（primary/accent/ink/muted/subtle/line/paper/stage/soft...）
3. **数据分离**：可变内容走 JSON，禁止 JS 硬编码业务文案/URL
4. **响应式三档**：PC + WISE(≤500px) + 极端(≤320px)
5. **A11y**：tablist/tabpanel、dialog、aria-live、aria-label、ESC 关闭（按需）
6. **主题可定制**：颜色全走变量，禁止硬编码 `#hex`（`:root` 与纯黑白蒙版例外）
7. **零依赖**：禁止外部 JS/CSS（字体 CDN 例外）
8. **文档完备**：README.md + docs/设计规范.md 齐全

## 标杆参考

拆解时对标手工 BLACKPINK 组件库的质量（用户提供，作为 gold standard）：
- `明星组合/组件库/README.md` — 文档结构范本
- `明星组合/组件库/docs/设计规范.md` — 规范文档范本
- `明星组合/组件库/src/star-group.js` — 渲染引擎范式（IIFE + el() + DEFAULTS + create/mount + _buildXxx）
- `明星组合/组件库/src/star-group.css` — 参数化样式范式（:root 变量 + sg- 前缀 + 三档响应式）

## 工具层（确定性辅助，你调用它们）

### CLI 脚本（命令行调用）

| 脚本 | 用途 | 何时调 |
|---|---|---|
| `scripts/analyze_html.py --minimal` | 提取主题色令牌 + 范式识别（pattern）+ 结构清单；`:root` 为空时自动从 Tailwind config 提取 | 第 2 步，拿参考数据 |
| `scripts/validate_lib.py` | 8 项强约束校验 | 第 4 步自检 |
| `scripts/roundtrip.py` | 往返等价度（渲染版参照 + tag 拓扑 + class + 文本三维对比） | 第 4 步自检 |
| `src/skill/scripts/adapt_output.py` | 输出适配器：IIFE -> ESM/UMD / Web Component | 第 3 步，按需生成其他形态 |
| `node --check` | JS 语法检查 | 第 4 步自检 |
| `scripts/verify_all.py` | 批量验证（并行+缓存+增量） | 回归测试 |

**verify_all.py 的 P4 鲁棒性能力**：
- **并行**：`--workers N`（默认 CPU 核数），多案例并行跑 roundtrip
- **缓存**：原 HTML + 组件库 hash 不变时复用结果（冷启动 1.2s -> 缓存 0.04s，29x 加速）
- **增量**：`--changed` 只测变更的案例（基于 hash 比对，跳过未变更）
- 用法：`python3 scripts/verify_all.py --lib-dir out`（全量）/ `--changed`（增量）/ `--clear-cache`（清缓存）

### Python 工具函数（import 自 `_common.py`，可在拆解时按需调用）

第 1 步理解 HTML / 第 2 步拿参考数据时，可写临时 Python 片段调用这些确定性函数，减少盲猜：

| 函数 | 用途 | 示例场景 |
|---|---|---|
| `infer_color_roles(css, var_name)` | 推断某 `--var` 被用作什么角色（text/background/border/shadow/icon-fill） | 归一化时确认"这个色值是文字色还是边框色" |
| `query_rules(css, selector_contains, has_prop, prop_value_contains)` | 按选择器/属性/值过滤 CSS 规则 | 查 `.member` 的布局规则、查含 `perspective` 的 3D 档位 |
| `extract_data_contracts(scripts)` | 扫描 JS 提取数据契约速览（变量名/类型/元素数/字段） | 知道原页面有哪些数据数组、字段是什么 |
| `parse_color(value)` / `to_hex(rgba)` | 颜色值解析与归一化 | 把 `hsl(...)` 转 `#hex` 对比去重 |
| `extract_root_vars(css)` | 提取 `:root` 变量（支持 `:root,.sg-frame` 选择器组） | 拿主题色清单 |
| `split_media_blocks(css)` | 拆 `@media` 块（区分 keyframes） | 理解响应式断点 |
| `extract_gradients(css)` | 提取渐变（支持嵌套 `rgba()`） | 归一化渐变里的颜色到 `var()` |

工具的源码在 `src/skill/scripts/_common.py`，单测在 `scripts/tests/`（`python3 scripts/tests/run.py` 跑全部，113 个测试覆盖边界）。

## 垂类聚合（可选，单案例拆解稳定后再做）

同垂类多个案例 → 公共库 + 各案例变体配置：

1. 对每个案例独立跑第 1-5 步，产出各自组件库
2. 提取公共部分（主题色骨架、Tab 结构、渲染引擎框架）为垂类公共库
3. 各案例的差异（主题色值、数据字段、特有视图）作为变体配置叠加
4. `scripts/aggregate_vertical.py` 可辅助归并（但归并逻辑由你主导，脚本只做去重）

**前置条件**：单案例拆解能力稳定（前向测试全过）后再做垂类聚合，否则会在不稳固的基础上叠加复杂度。

## 依赖

- Python 3.8+（`beautifulsoup4`，用户级安装：`pip install --user --break-system-packages beautifulsoup4`）
- Node.js（用于 `node --check` 和 `roundtrip.py` 的 jsdom 渲染）

**roundtrip 渲染器**（`scripts/_roundtrip_render.mjs`）的能力与限制：
- 两种模式：组件库模式（默认，序列化 `#mount` 子树）+ 参照模式（`--ref`，序列化 `<body>` 子树）
- 多文件支持：自动内联所有 `<link>` CSS 和 `<script src>` JS（按文档顺序）
- 桩注入：Tailwind/marked/dompurify/mermaid/localStorage/canvas getContext 全部桩化，防外部依赖缺失崩溃
- VirtualConsole：静音 jsdom 的 "Not implemented" 警告
- 大 JSON 输出：>40KB 时走临时文件（防管道截断）
- 限制：jsdom 无真实布局引擎（clientWidth=0）、无 canvas 像素渲染、对 Web Component connectedCallback 时序支持有限

## 失败处理

- `validate_lib.py` 报 FAIL：按提示修订对应文件，重跑自检
- `roundtrip.py` 低分：看报告 `missingTexts`/`missingNodes`，补回缺失内容
- `node --check` 语法错误：定位行号修复
- 工具脚本本身报错（非校验失败）：检查 Python 依赖，或读 `scripts/tests/` 确认工具行为

## 参考文件

- `references/spec.md` — 8 项强约束详细规范 + 变量归一化映射表
- `references/patterns.md` — 结构识别特征（Tab/轮播/Modal 等的判定规则，第 1 步理解 HTML 时参考）
- `references/manifest_schema.md` — manifest.json 字段定义（第 2 步工具输出）
