# 通用分析边界

`codex/generic-agent-quality` 的目标是让确定性工具对不同领域页面提供稳定观察，而不是把所有页面归入越来越多的垂类枚举。

## 两层视图描述

每次 detector 命中同时返回：

- `structural_type`：中立结构，如 `collection`、`sequence`、`form`、`content-region`、`overlay`；
- `semantic_type`：可选语义，如 `member-grid`、`timeline`、`quiz`、`comparison`、`splash`；
- `confidence`：`0.0` 到 `1.0` 的 detector 置信度；
- `evidence`：促成判断的 DOM/CSS 证据。

manifest v1 暂时仍只输出原有 `type`，因此本轮重构不改变既有契约。新增元数据先通过 `HtmlAnalyzer.detect_view()` 提供，待多领域测试矩阵稳定后再设计 manifest v2。

## Detector 规则

1. 默认 detector 的顺序是兼容契约，修改顺序必须有回归测试。
2. 领域 detector 通过 `ViewDetectorRegistry.register()` 插入，不直接修改分析器主类。
3. 每个 detector 必须返回证据和置信度。
4. 新 detector 除正向样本外，还必须覆盖与已有类型的误判边界。
5. `profile` 只记录可选领域上下文，不参与 detector 选择。

## 与 DesignRepair 的边界

这里的“证据”用于解释拆解分析结果，不等同于 DesignRepair 的 Quality Finding。DesignRepair 负责设计规范知识、违规检测、修复计划和独立验证；本分支不引入 Material Design 规则库或自动修复闭环。

## 后续阶段

1. 建立静态页、动态渲染页、表单/Dialog、响应式导航、多资源页面测试矩阵；
2. 将原页面运行后 DOM 纳入 roundtrip 参照；
3. 区分 hard、project、soft 三类质量规则；
4. 在不破坏 manifest v1 的前提下评估结构类型与证据字段的新契约。
