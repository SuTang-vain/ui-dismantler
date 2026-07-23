# 刘浩存光影星途互动图鉴 0722 TypeScript 拆分测试报告

测试分支：`codex/component-planning-pipeline`

## 输入

- 原始目录：`/Users/tangyaoyue/Downloads/刘浩存光影星途互动图鉴0722 2`
- 仓库测试副本：`examples/cases/liu-haocun-0722-ts/original.html`
- 输入规模：HTML 117,100 bytes，资源目录约 4.1 MB。

## 结论

当前工具成功生成了可运行、零依赖且高保真的组件库，完整 Gold+ 质量门禁通过。初始状态四视口、8 个正式场景及 5 个关键交互多视口矩阵全部通过；但组件规划 preflight 仅识别出一个 `page-header` 边界，预计 239 行并超过 150 行预算，因此 `plan.ready=false`。这说明最终转译质量达标，但自动组件语义拆分仍需继续优化，不能把 Gold+ 通过等同于规划质量通过。

## 性能与算法分析

| 阶段 | 耗时 |
|---|---:|
| analyze | 1.36 s |
| plan | 1.16 s |
| transpile | 0.68 s |
| 完整 Gold+（4 初始视口 + 5 关键场景矩阵） | 38.63 s |

AST 分析结果：

- 交互：12；
- AST 识别：12/12；
- 含结构化状态转换：10/12；
- 状态转换证据：58 条；
- 自动候选场景：12；
- 组件交互归属：12/12，无 unowned interaction。

真实页面同时暴露出新算法的误差：语义按钮与其内部调用的初始化/弹窗 helper 被过度合并，导致普通导航按钮携带不应属于该触发器的 modal mutation；事件委托被识别为 `nav.nav`，尚未下钻到 `.nav-btn`；pointer gesture 被生成为 click candidate。正式 scenarios 因此经过人工审阅，并对 4 个无独立可观察状态或需要真实 swipe delta 的 pointer 注册提供了明确 waiver。

## Gold+ 结果

| 门禁 | 结果 |
|---|---:|
| validate | 10/10 PASS |
| node --check | PASS |
| DOM structure | 0.998 |
| text | 1.000 |
| DOM overall | 0.999 |
| selector coverage | 1.000 |
| computed style（四视口最差） | 0.9888 |
| pixel diff（四视口最差） | 0.0000% |
| visual score（四视口最差） | 0.9938 |
| final overall | 0.9959 |
| 正式交互场景 | 8/8 PASS |
| 可验证交互覆盖 | 8/8（100%，另有 4 个带理由 waiver） |
| runtime errors | 0 |
| 初始多视口矩阵 | 4/4 PASS |
| 关键交互状态矩阵 | 5/5 PASS |

视口：Desktop `1024×768`、Tablet `768×1024`、Mobile `390×844`、Tiny `320×568`。

正式场景覆盖：作品视图、身份视图、返回合作图谱、打开合作演员弹窗、按钮关闭、遮罩关闭、身份画廊下一张、作品下一部。关键场景为作品视图、身份视图、合作演员弹窗、身份画廊、作品切换，并在四个视口分别比较 selector coverage、computed style、pixel diff 和 runtime error。

## 规划门禁

```text
components: 1
interactions: 12
owned: 12
unowned: 0
over budget: 1
errors: 1
ready: false
```

唯一组件预计 239 行，超过 150 行预算。建议规划器至少拆出：application shell/navigation、costar graph、works explorer、identity gallery、actor modal。没有降低行数门槛来制造绿色结果。

## 人工查验

打开：

`examples/cases/liu-haocun-0722-ts/lib/examples/liu-haocun.html`

主要产物：

- `lib/`：零依赖组件库；
- `manifest.json`：AST 交互与状态转换分析；
- `component-plan.json`、`component-specs/`：组件规划及阻断结果；
- `scenarios-candidates.json`：未审核的算法候选场景；
- `scenarios.json`：人工审核后的正式场景；
- `quality-report.json`、`quality.log`：完整 Gold+ 结果；
- `artifacts/`：初始及关键交互多视口截图与 diff。
