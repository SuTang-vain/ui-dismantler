# 分支职责边界

本项目当前有四条职责独立的研发线，不能用一条线的目标覆盖另一条线。

> 历史归档：`codex/local-agent-quality` 已于 2026-07-20 删除，内容（8 提交）作为 `codex/generic-agent-quality` 的直接祖先完整保留，可通过 tag `archive/local-agent-quality-20260720` 追溯。稳定质量改动的职责现由 `codex/generic-agent-quality` 承接。

## `codex/generic-agent-quality`

稳定质量与通用能力线，负责：

- HTML 结构、视图类型和数据契约分析；
- Agent 产出组件库后的确定性校验（validate_lib + roundtrip + 交互场景矩阵）；
- 可注册的语义 detector（中立结构类型、置信度、识别证据）；
- 源页面与组件库渲染结果的双侧观察；
- 按技术特征组织的可复现测试矩阵与黄金快照回归；
- A11y、响应式、数据分离和命名约束。

本分支不负责把页面修复成某一种设计规范，也不把 DesignRepair 的知识库或修复流程作为运行时依赖。

## `codex/experimental-features`

工具能力实验线，从 `main` 与 generic 平行演进，重点探索：

- 输入泛化（Tailwind CDN、多 CSS/JS 文件、localStorage/canvas 等运行时桩）；
- 输出泛化（`adapt_output.py` 生成 ESM/UMD/Web Component，`generate_showcase.py` 生成设计令牌展示页）；
- 性能优化（`verify_all.py` 并行/缓存/增量，冷启动 1.2s → 缓存 0.04s）；
- 范式识别探索（cause-chain、nav-panel、graph 等内置识别规则）。

本分支是 `designrepair-quality-kb` 的直接上游，删除前需确认 uiir 专项线已独立。实验稳定的工具能力，经 cherry-pick 或整文件迁移到 `codex/generic-agent-quality` 后，可从本分支移除对应文件。

## `codex/vertical-case-experiments`

本分支保存垂类案例、批量生成脚本和大体积实验资源。这些资产用于发现候选模式，不直接证明通用性，也不进入稳定质量分支。

## `designrepair-quality-kb`

这是 DesignRepair 专项研究分支，研究依据是：

> *DesignRepair: Dual-Stream Design Guideline-Aware Frontend Repair with Large Language Models*

该方向关注：

- 源代码流与渲染页面流的双流分析；
- Material Design 驱动的组件知识库与系统设计知识库；
- 设计规范违规检测；
- 基于硬约束/软约束和 divide-and-conquer 的前端修复。

该分支应保持专项研究目标和独立演进，不应被本地 Agent 拆解质量线的功能、测试或架构改动污染。

## 协作原则

1. 稳定质量与通用能力改动提交到 `codex/generic-agent-quality`（原 `local-agent-quality` 职责已并入）。
2. 工具能力实验（输入/输出泛化、性能优化）先在 `codex/experimental-features` 验证，稳定后 cherry-pick 或整文件迁移到 generic。
3. 垂类资产和批处理探索只进入 `codex/vertical-case-experiments`。
4. DesignRepair 专项改动只提交到其对应分支，其他分支只作只读参照。
5. 各线的测试失败分别归属各自目标，不以一条线的指标替代另一条线的验收标准。
6. experimental 与 generic 从 main 平行演进，合并时注意 7 个共同修改文件（analyze_html/roundtrip/verify_all/SKILL.md 等）可能产生架构性冲突，优先以独立模块方式迁移而非直接合并代码。
