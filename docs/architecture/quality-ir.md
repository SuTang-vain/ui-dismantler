# Quality IR v1 原型

Quality IR 是基于某个质量 Profile 对 canonical UI-IR 做出的可重算判断，不修改 UI-IR 页面事实。

模型采用 **2 + 1 + 1**：组件知识库与系统知识库、正交的 Profile 合成层、以及后续的 Repair Coordination Layer。本原型只实现 inspect-only：Schema、Profile 合成、确定性静态检测与 `quality-findings.json`，不应用 Patch。

指南位于 `src/skill/references/guidelines/{components,systems,profiles}`。`web-base` 中受保护的 Web/A11y 硬约束不能被子 Profile 禁用或降级；Material Design 是可选 Profile，不默认覆盖品牌设计意图。

```bash
python3 -m ui_dismantler.cli.inspect_quality page.uiir.json \
  --profile web-base -o quality-findings.json
```

首批检测器覆盖 icon button 名称、表单标签、ARIA 引用、Tab/TabPanel 引用及图片 alt。视觉系统规则仍需 Render Observation（geometry/computed styles）后才启用。
