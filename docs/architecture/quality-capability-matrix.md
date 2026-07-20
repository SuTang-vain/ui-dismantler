# Quality Prototype Capability Matrix

本矩阵描述 `codex/designrepair-quality-prototype` 的 inspect-only 能力和进入自动 Repair Coordination 前的 acceptance gate。机器可读来源是 `src/skill/references/guidelines/capabilities.json`；文档不替代该登记表。

## 当前结论

**自动修复 Gate：BLOCKED。** 当前环境没有 Playwright，因此浏览器集成测试按设计跳过；运行时 hard 规则只有合成证据，且没有任何 capability 标记为 `repairEligibility=eligible`。在浏览器覆盖完成、误报边界复核和显式 repair eligibility 审批前，不实现或启用自动 Repair Coordination。

验证命令：

```bash
python3 -m ui_dismantler.cli.check_quality_gate
python3 -m ui_dismantler.cli.check_quality_gate --check
```

第一条用于报告，Gate blocked 时仍返回 0；第二条用于 CI acceptance gate，blocked 时返回 2。

## 能力分组

| 分组 | Guideline | 证据 | 等级 | 浏览器覆盖 | 修复资格 |
|---|---|---|---|---|---|
| 静态语义 | `component.icon-button.accessible-name` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.form-control.label` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.aria.reference-target` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.tab.controls-tabpanel` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.image.alt` | UI-IR | hard | 不需要 | manual-only |
| Material | `system.spacing.sibling-consistency` | UI-IR + Render | soft | 未验证 | prohibited，尚未实现 |
| Geometry | `system.web.click-target.minimum` | Render | soft | synthetic-only | manual-only |
| Geometry | `system.web.viewport-clipping` | Render | soft | synthetic-only | manual-only |
| Color | `system.web.text-contrast` | Render | hard | synthetic-only | prohibited |
| Focus | `system.web.focus-visible` | Render focus | soft | synthetic-only | manual-only |
| Keyboard | `system.web.keyboard-reachable` | Render keyboard | soft | synthetic-only | manual-only |
| Keyboard | `system.web.tab-order.positive` | Render keyboard | soft | synthetic-only | manual-only |
| Reflow | `system.web.reflow.horizontal-overflow` | Render layout | soft | synthetic-only | manual-only |
| ARIA state | `system.web.aria-state.token-valid` | Render + Scenario | hard | synthetic-only | prohibited |
| ARIA state | `system.web.controlled-state.visibility` | Render state | soft | synthetic-only | manual-only |
| ARIA transition | `system.web.controlled-state.transition` | Trusted click | soft | synthetic-only | prohibited |

## Gate 条件

自动修复只有在以下条件全部满足时才可变为 eligible：

1. 所有 guideline 均有 capability 记录，且不存在未知记录。
2. 所有启用能力均有实现；`declared-only` 不能通过。
3. 所有运行时 hard 规则均有真实浏览器验证，而非仅 synthetic fixture。
4. 受保护 guideline 不得直接标记为 repair eligible。
5. 至少一个规则经过明确审批标记为 `repairEligibility=eligible`。
6. 顶层 `repairGate.status` 经人工评审改为 `eligible`。
7. 改动仍在 prototype 分支验证；不得直接污染 DesignRepair 研究分支。
