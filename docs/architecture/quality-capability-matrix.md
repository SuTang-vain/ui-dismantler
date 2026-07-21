# Quality Prototype Capability Matrix

本矩阵描述 `codex/designrepair-quality-prototype` 的 inspect-only 能力和进入自动 Repair Coordination 前的 acceptance gate。机器可读来源是 `src/skill/references/guidelines/capabilities.json`；文档不替代该登记表。

## 当前结论

**自动修复 Gate：BLOCKED。** 2026 年 7 月 20 日已使用 Playwright 1.61.0 完成 Chromium、WebKit、Firefox 三引擎质量矩阵：每个引擎 44/44 质量测试通过；Chromium 下全仓已于 2026 年 7 月 21 日刷新为 243/243 通过且无跳过。Gate 现按 Profile 评估 inspect readiness：`web-base` 为 READY，`material-accessible` 因 spacing detector 尚未实现而 BLOCKED。两个 Profile 均没有 capability 标记为 `repairEligibility=eligible`，且顶层人工 Repair Gate 未放行，因此自动 Repair Coordination 仍为 BLOCKED。

验证命令：

```bash
# 默认检查 web-base
python3 -m ui_dismantler.cli.check_quality_gate

# web-base inspect readiness，当前返回 0
python3 -m ui_dismantler.cli.check_quality_gate --check-inspect

# material-accessible inspect readiness，当前返回 2
python3 -m ui_dismantler.cli.check_quality_gate --profile material-accessible --check-inspect

# 自动修复 Gate，两个 Profile 当前均返回 2
python3 -m ui_dismantler.cli.check_quality_gate --check-repair

# 仓库全部 guideline 的汇总评估
python3 -m ui_dismantler.cli.check_quality_gate --profile all
```

不带 check 参数时只报告并返回 0。`--check-inspect` 对所选 Profile 的检测实现完整性负责；`--check-repair`（兼容别名 `--check`）负责自动 Repair Gate。

三引擎复验命令：

```bash
for browser in chromium webkit firefox; do
  UI_DISMANTLER_QUALITY_BROWSER="$browser" PYTHONPATH=src python3 -m unittest -q tests.unit.test_quality
done
```

也可以通过 `observe_quality_render --browser chromium|webkit|firefox` 显式选择引擎。

## Profile readiness

| Profile | 启用 Guideline | Inspect | Repair | 说明 |
|---|---:|---|---|---|
| `web-base` | 15 | READY | BLOCKED | 所有启用 detector 已实现且浏览器覆盖已验证；无 repair-eligible capability。 |
| `material-accessible` | 16 | BLOCKED | BLOCKED | 继承 `web-base`，额外启用尚未实现的 `system.spacing.sibling-consistency`。 |
| `all` | 16 | BLOCKED | BLOCKED | 仓库级汇总，包含 declared-only Material spacing。 |

## 能力分组

| 分组 | Guideline | 证据 | 等级 | 浏览器覆盖 | 修复资格 |
|---|---|---|---|---|---|
| 静态语义 | `component.icon-button.accessible-name` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.form-control.label` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.aria.reference-target` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.tab.controls-tabpanel` | UI-IR | hard | 不需要 | manual-only |
| 静态语义 | `component.image.alt` | UI-IR | hard | 不需要 | manual-only |
| Material | `system.spacing.sibling-consistency` | UI-IR + Render | soft | 未验证 | prohibited，尚未实现 |
| Geometry | `system.web.click-target.minimum` | Render | soft | Chromium/WebKit/Firefox verified | manual-only |
| Geometry | `system.web.viewport-clipping` | Render | soft | Chromium/WebKit/Firefox verified | manual-only |
| Color | `system.web.text-contrast` | Render | hard | Chromium/WebKit/Firefox verified | prohibited |
| Focus | `system.web.focus-visible` | Render focus | soft | Chromium/WebKit/Firefox verified | manual-only |
| Keyboard | `system.web.keyboard-reachable` | Render keyboard | soft | Chromium/WebKit/Firefox verified | manual-only |
| Keyboard | `system.web.tab-order.positive` | Render keyboard | soft | Chromium/WebKit/Firefox verified | manual-only |
| Reflow | `system.web.reflow.horizontal-overflow` | Render layout | soft | Chromium/WebKit/Firefox verified | manual-only |
| ARIA state | `system.web.aria-state.token-valid` | Render + Scenario | hard | Chromium/WebKit/Firefox verified | prohibited |
| ARIA state | `system.web.controlled-state.visibility` | Render state | soft | Chromium/WebKit/Firefox verified | manual-only |
| ARIA transition | `system.web.controlled-state.transition` | Trusted click | soft | Chromium/WebKit/Firefox verified | prohibited |

## Gate 条件

自动修复只有在以下条件全部满足时才可变为 eligible：

1. 所有 guideline 均有 capability 记录，且不存在未知记录；该完整性检查始终是全局的。
2. 所选 Profile 的所有启用能力均有实现；未启用的可选能力不阻断该 Profile，`declared-only` 一旦启用则不能通过。
3. 所有运行时 hard 规则均有真实浏览器验证，而非仅 synthetic fixture；当前该条件已满足。
4. 受保护 guideline 不得直接标记为 repair eligible。
5. 至少一个规则经过明确审批标记为 `repairEligibility=eligible`。
6. 顶层 `repairGate.status` 经人工评审改为 `eligible`。
7. 改动仍在 prototype 分支验证；不得直接污染 DesignRepair 研究分支。
