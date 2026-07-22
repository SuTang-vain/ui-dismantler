# 孙悟空破界成圣进化史图鉴（0722）拆解测试报告

测试分支：`codex/component-planning-pipeline`

输入：`/Users/tangyaoyue/Downloads/孙悟空破界成圣进化史图鉴_0722/index.html`

## 结论

组件库通过 TypeScript Gold+ 质量门；新增组件规划 preflight 正确阻止了过粗的单组件计划。也就是说，最终页面转译质量合格，但规划层发现当前 analyzer 只生成一个 `Graph1`，尚未把图谱、故事切换、演员对照、角色档案和弹窗拆成独立组件。

人工查验入口：`lib/examples/sun-wukong.html`

## 质量结果

| 检查 | 结果 |
|---|---:|
| 组件库校验 | 10/10 PASS |
| node --check | PASS |
| DOM/text overall | 0.998 |
| 最终综合分 | 0.9928 |
| 初始状态视口矩阵 | 4/4 PASS |
| 关键交互矩阵 | 2/2 PASS |
| 正式交互场景 | 7/7 PASS |
| 已验证交互覆盖率 | 100%（5/5 eligible） |
| 选择器实际命中 | 100% |
| 最差 computed-style | 0.9887 |
| 最差像素差异 | 1.4119% |
| 浏览器 runtime errors | 0 |

## 多视口结果

| 视口 | computed-style | 像素差异 | 结果 |
|---|---:|---:|---:|
| desktop 1024×768 | 0.9887 | 0.6818% | PASS |
| tablet 768×1024 | 0.9897 | 1.4119% | PASS |
| mobile 390×844 | 0.9897 | 0.9093% | PASS |
| tiny 320×568 | 0.9897 | 0.8676% | PASS |

关键状态：

- 打开孙悟空人物面板：四视口 PASS，最差样式 0.9899、像素差异 0.8593%。
- 打开演员版本弹窗：四视口 PASS，最差样式 0.9889、像素差异 0.2420%。

## 规划层测试

默认 `line-budget=150` 时：

- 识别视图：1 个 `graph`；
- 生成计划：`Graph1`；
- 估算规模：332 行；
- preflight：FAIL，`complexity-budget`；
- 结论：必须先拆成子组件和 wrapper，不能直接 dispatch。

人工判断建议拆为：`StorySwitcher`、`RelationshipGraph`、`CharacterPanel`、`CastComparison`、`CastModal`、`CharacterProfile`、`TabShell`。因此本案例证明复杂度门禁有效，同时暴露了自动组件边界仍依赖过粗的 view detector。

## 产物

- `original.html`、`images/`：测试输入副本；
- `manifest.json`：确定性分析结果；
- `component-plan.json`、`component-specs/`、`planning.log`：规划产物；
- `lib/`：可复用零依赖组件库；
- `scenarios.json`：7 个正式场景和 3 个显式 waiver；
- `quality-report.json`：完整质量报告；
- `artifacts/`：四视口初始状态及两个关键交互状态截图/diff。
