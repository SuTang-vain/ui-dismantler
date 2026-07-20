# 分支职责边界

本项目当前有四条职责独立的研发线，不能用一条线的目标覆盖另一条线。

## `codex/local-agent-quality`

本分支面向 Agent 驱动的 HTML → 可复用组件库拆解，重点是：

- HTML 结构、视图类型和数据契约分析；
- Agent 产出组件库后的确定性校验；
- roundtrip 结构/文本忠实度评测；
- A11y、响应式、数据分离和命名约束；
- 真实案例与黄金快照回归。

本分支不负责把页面修复成某一种设计规范，也不把 DesignRepair 的知识库或修复流程作为运行时依赖。

## `codex/generic-agent-quality`

本分支从稳定质量线演进，负责跨领域成立的通用观察和识别能力：

- 可注册的语义 detector；
- 中立结构类型、置信度和识别证据；
- 源页面与组件库渲染结果的双侧观察；
- 按技术特征组织的可复现测试矩阵。

领域 profile 只提供上下文，不得成为核心算法分支。

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

1. 稳定质量改动只提交到 `codex/local-agent-quality`。
2. 通用化能力先在 `codex/generic-agent-quality` 验证，再决定是否回迁稳定线。
3. 垂类资产和批处理探索只进入 `codex/vertical-case-experiments`。
4. DesignRepair 专项改动只提交到其对应分支，其他分支只作只读参照。
5. 各线的测试失败分别归属各自目标，不以一条线的指标替代另一条线的验收标准。
