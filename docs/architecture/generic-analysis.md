# 通用分析边界

ui-dismantler 的目标是让确定性工具对不同领域页面提供稳定观察，而不是把所有页面归入越来越多的垂类枚举。

## 两层视图描述

每次 detector 命中同时返回：

- `structural_type`：中立结构，如 `collection`、`sequence`、`form`、`content-region`、`overlay`；
- `semantic_type`：可选语义，如 `member-grid`、`timeline`、`quiz`、`comparison`、`splash`、`cause-chain`、`nav-panel`、`graph`；
- `confidence`：`0.0` 到 `1.0` 的 detector 置信度；
- `evidence`：促成判断的 DOM/CSS/JS 证据。

manifest v1 暂时仍只输出原有 `type`，因此本轮重构不改变既有契约。新增元数据通过 `HtmlAnalyzer.detect_view()` 提供，待多领域测试矩阵稳定后再设计 manifest v2。

## Detector 架构

### ViewContext（detector 输入）

`ViewContext` 暴露 `node`（DOM 节点）、`html`（序列化字符串）、`css`（页面 CSS）、`scripts`（`<script>` 内容数组）。`scripts` 字段用于检查 JS 数据契约关键字（如 `causeChain`、`NODES`、`relTypes`），是 cause-chain/graph 等数据驱动范式识别的关键信号。

### ViewDetectorRegistry（注册与优先级）

- 注册顺序遵循"越具体越靠前"原则：复合范式（carousel-3d / cause-chain / nav-panel / graph）先于单一信号范式（timeline / member-grid / quiz / comparison / splash）。
- 特别注意：`cause-chain` 必须在 `timeline` 之前，因为 timeline 正则会匹配到 cause-chain 的 `timeline-nav` 类名。
- 领域 detector 通过 `registry.register()` 插入，不直接修改分析器主类。
- 每个 detector 必须返回证据和置信度。新 detector 除正向样本外，还必须覆盖误判边界。
- `profile` 只记录可选领域上下文，不参与 detector 选择。

### 页面级 vs panel 级检测

`_analyze_views` 有两条检测路径：

1. **无 `role=tabpanel` 时**（页面级范式）：对 `body` 整体跑 detector。命中 `cause-chain` / `nav-panel` / `graph` 时作为唯一 view 返回。支持黄月英、纸上谈兵等全屏范式（无 tab 结构）。
2. **有 `role=tabpanel` 时**（panel 级范式）：对每个 panel 单独跑 detector。支持 benchmark 式的多 tab 多范式页面。

判据是 `role=tabpanel` 的存在（而非 `.panel` 类名），因为 nav-panel 范式自身的 `.panel` 子元素会干扰发现逻辑。

### View Details 提取

命中范式后，`_extract_view_details` 提取范式特定字段：

| 范式 | 提取字段 |
|---|---|
| `cause-chain` | `hasTimelineNav` / `hasCauseChainData` / `hasWhatIf` / `navItems` |
| `nav-panel` | `triggerCount` / `panelCount` / `triggers`（最多 10 个）|
| `graph` | `hasSvg` / `nodeCount` / `dataSource` / `hasEdges` |
| `quiz` | `questionCount` / `hasFeedback` / `hasResult` / `optionsSelector` |
| `comparison` | `hasWhatIfCard` / `layout` |
| `splash` | `hasQuestion` / `ctaSelector` / `ctaText` |

`dataSource` 识别 6 种图谱数据源（`uppercase-const` / `object-property` / `mount-options` / `mount-api` / `runtime-state` / `function-builder`），帮 agent 理解数据接入方式。

## Benchmark 质量标杆

`benchmark/` 目录是 domain-neutral 的通用质量标杆和回归 fixture：

- **Technical Glossary Explorer**：覆盖 6 种范式（quiz/comparison/graph/nav-panel/cause-chain/splash）
- **roundtrip overall 0.990**（rendered 参照）
- **8 个交互场景矩阵**：全部通过（splash dismiss / quiz answer / tab switch / nav-panel switch / cause-chain navigate / whatif toggle）
- **277 单元测试**：含架构守护断言 + 黄金快照 + 场景矩阵回归

## 运行态参照协议

Roundtrip 使用统一渲染器对称执行原页面和组件库：

- 本地 CSS/JS 按 DOM 顺序内联；
- 远程资源不发起网络请求并进入诊断；
- `auto` 优先运行态，失败时显式回退静态；
- `rendered` 是禁止回退的严格模式；
- `static` 仅用于历史分数连续性；
- 报告保存两侧实际模式、回退状态、运行错误、缺失/远程资源、暂不支持的 ES module 和 viewport。

## 包架构

工具源码在 `src/ui_dismantler/`（分层 Python 包），旧入口在 `src/skill/scripts/` 和 `scripts/`（≤11 行薄桥接）。架构守护测试（`test_architecture.py`，9 条断言）强制：

- 业务模块不含 CLI 代码（`argparse` / `sys.exit` / `def main()`）
- 旧入口是薄桥接（通过 `_bootstrap.expose` 透出符号）
- 核心包不反向依赖兼容层（循环依赖防护）

## 与 DesignRepair 的边界

这里的"证据"用于解释拆解分析结果，不等同于 DesignRepair 的 Quality Finding。DesignRepair 负责设计规范知识、违规检测、修复计划和独立验证；本项目不引入 Material Design 规则库或自动修复闭环。

## 后续阶段

1. 补齐剩余 4 种范式（carousel-3d / timeline / member-grid / detail-panel）的端到端 fixture 覆盖；
2. 增强 verify_all 的 per-pattern 分数报告（按 panel 分别报告分数）；
3. 区分 hard、project、soft 三类质量规则；
4. 在不破坏 manifest v1 的前提下评估结构类型与证据字段的新契约。
