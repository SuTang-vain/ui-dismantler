---
name: html-to-component-lib
description: 将单个 HTML 案例页拆解为可复用的组件库（参数化 CSS + 渲染引擎 JS + 数据驱动示例 + 设计规范文档）。MUST USE 当用户想把 HTML 案例转为组件库/复用模板/提取主题色与交互模式，或提到「拆解 HTML」「提取组件」「做成组件库」「规范化复用」「提取主题色」「提取交互模式」。支持逐案例拆解与垂类聚合两种模式，输出遵循 sg-* 强约束规范。
---

# HTML → 组件库 拆解 Skill

把一个自包含的 HTML 案例页（含内联 `<style>`/`<script>`）拆解为结构化、可复用、数据驱动的组件库。

## 何时使用

- 用户提供一个 HTML 文件（或目录），要求「拆成组件库」「提取复用模板」「规范化」
- 用户要求提取某页面的主题色 / Tab / 交互模式 / 逻辑设置并固化复用
- 用户要求把同垂类多个案例合并为公共组件库

## 工作流（按顺序）

### 1. 分析：HTML → manifest.json

```bash
python3 scripts/analyze_html.py <html路径> --out <manifest.json> [--vertical <垂类名>]
```

读取 HTML，提取主题色令牌、Tab 结构、视图/交互模式、数据数组、响应式断点、A11y 特征，输出标准化 `manifest.json`（schema 见 `references/manifest_schema.md`）。

**查看解析详情**：分析引擎的识别规则在 `references/patterns.md`。若某案例结构特殊导致关键字段缺失，引擎会在 manifest 的 `warnings[]` 中标注，需人工补全后再进入下一步。

### 2. 生成：manifest → 组件库

```bash
python3 scripts/generate_lib.py <manifest.json> --out <输出目录> [--name <库名>]
```

基于 `assets/templates/` 下的 Jinja2 模板生成完整组件库：

```
<输出目录>/
├── README.md
├── docs/设计规范.md
├── src/<lib-name>.css     参数化样式（sg-* 前缀，--sg-* 变量）
├── src/<lib-name>.js      渲染引擎（window.<LibName>.mount/create）
└── examples/<case>.html   数据驱动示例
```

所有输出必须符合 `references/spec.md` 的强约束。

### 3. 校验：强约束检查

```bash
python3 scripts/validate_lib.py <组件库目录>
```

校验 8 项强约束（命名/变量/数据分离/响应式/A11y/主题可定制/零依赖/文档）。不通过则报具体违规项。

### 4.（可选）聚合：垂类公共库

```bash
python3 scripts/aggregate_vertical.py <垂类目录> --out <输出目录>
```

扫描垂类目录下所有案例的 manifest（若缺失则先跑 analyze），归并出垂类公共库 + 各案例变体配置。

## 关键约束（详见 references/spec.md）

- CSS 类名 `sg-` 前缀，变量 `--sg-*` 前缀
- 内容数据必须为 JSON 数组，与渲染逻辑解耦
- 必须含 PC / WISE(≤500px) / 极端(≤320px) 三档响应式
- 所有颜色经变量，禁止硬编码 `#hex`（`:root` 定义与 `var()` fallback 除外）
- 零依赖（字体 CDN 除外）
- A11y（按需）：
  - 有 tab 切换 → 必须有 `role=tablist` + `role=tabpanel`
  - 有 modal → 必须有 `role=dialog` + ESC 关闭
  - 任何库 → 必须有 `aria-live` + `aria-label`

## 泛化能力

引擎内置三种结构化视图模式（member-grid / timeline / carousel-3d）+ tab 切换 + modal 体系，覆盖明星组合类页面。对其他垂类结构：

- **tab 变体**：识别 `role=tablist`、`.tab-bar`/`.tab-nav`、以及 `<nav>` + `data-p`/`data-tab`/`data-target` 关联型（如文化类词语的 `.nav > span.n[data-p]` ↔ `section.panel[id]`）
- **generic 兜底**：无法识别的视图统一 fallback 为 `generic`，生成 `<section role=tabpanel>` + `.sg-generic-body[aria-live]` 容器，保证 A11y 基线达标；无 tab 的单视图页面（如因果链、地图导览）生成兜底视图
- **垂类局限**：因果链（splash→timeline-nav）、地图导览（map-viewport+dpad）等深度交互范式的**数据提取**尚未实现，会走 generic 兜底产出合规但需人工细化的库。manifest 的 `warnings[]` 会标注未识别项

## 依赖

- Python 3.8+
- `beautifulsoup4`、`jinja2`（用户级安装：`pip install --user --break-system-packages beautifulsoup4 jinja2`）
- 可选：`node`（用于 `node --check` 验证生成 JS 语法）

## 端到端示例

```bash
SKILL=~/.zcode/skills/html-to-component-lib/scripts

# 逐案例：分析 → 生成 → 校验
python3 $SKILL/analyze_html.py path/to/case.html --out /tmp/case.mf --vertical 明星组合
python3 $SKILL/generate_lib.py /tmp/case.mf --out /tmp/case_lib --name my-lib
python3 $SKILL/validate_lib.py /tmp/case_lib

# 垂类聚合：同垂类多案例 → 公共库 + 变体
python3 $SKILL/aggregate_vertical.py path/to/vertical_dir --out /tmp/vertical_lib --name vertical-lib
python3 $SKILL/validate_lib.py /tmp/vertical_lib
```

## 失败处理

- `validate_lib.py` 报 FAIL：按提示修对应模板/脚本，**不要手改生成产物**（会被下次生成覆盖）
- `manifest.warnings` 非空：属正常，表示部分视图走 generic 兜底；仅当 `structure.tabs` 和 `structure.views` 同时为空且页面确有 tab/视图结构时，才需扩展 `patterns.md` 的识别规则
- 生成 JS 语法错误：`node --check src/<lib>.js` 定位

## 参考文件

- `references/spec.md` — 强约束规范（命名/变量/响应式/A11y 详细规则与归一化映射表）
- `references/patterns.md` — 模式识别规则（Tab/轮播/Modal 等结构的判定特征）
- `references/manifest_schema.md` — manifest.json 字段定义
