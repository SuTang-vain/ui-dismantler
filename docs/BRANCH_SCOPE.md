# 分支职责边界

本项目当前有两条相互独立的研发线，不能把其中一条当作另一条的基础分支。

## `codex/local-agent-quality`

本分支面向 Agent 驱动的 HTML → 可复用组件库拆解，重点是：

- HTML 结构、视图类型和数据契约分析；
- Agent 产出组件库后的确定性校验；
- roundtrip 结构/文本忠实度评测；
- A11y、响应式、数据分离和命名约束；
- 真实案例与黄金快照回归。

本分支不负责把页面修复成某一种设计规范，也不把 DesignRepair 的知识库或修复流程作为运行时依赖。

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

1. 两条分支只做只读对比，不互相直接合并。
2. 本地拆解质量改动只提交到 `codex/local-agent-quality`。
3. DesignRepair 专项改动只提交到其对应分支。
4. 将来若确实需要共享能力，应从 `main` 新建中立分支，并以独立提交逐项评估，而不是改变任一专项分支的初衷。
5. 两条线的测试失败分别归属各自目标，不以一条线的指标替代另一条线的验收标准。
