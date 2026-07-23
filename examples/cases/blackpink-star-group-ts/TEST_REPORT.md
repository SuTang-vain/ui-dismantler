# BLACKPINK TypeScript 拆解测试报告

测试日期：2026-07-23
测试分支：`codex/qinshihuang-dispatch-experiment`
源文件：`/Users/tangyaoyue/Downloads/明星组合_BLACKPINK/index.html`

## 结论

当前 TypeScript 工具已完成该页面的实际拆解，并通过完整 Gold+：

- validation：10/10
- DOM / text roundtrip：1.000 / 1.000
- final overall：0.9996
- desktop/tablet/mobile/tiny：4/4
- 关键交互多视口矩阵：4/4
- computed style：最差 0.9997
- pixel diff：最差 0.001312
- 正式交互场景：6/6
- verified interaction coverage：1.000
- selector coverage：1.000
- runtime errors：0

## Planning 结果

初始规划暴露三个问题：

1. `data-tab="tab-members"` 入口按钮被误识别为内容 panel；
2. 成员网格和作品轮播没有拆出重复控件/轮播职责；
3. 作品与成员区域出现 2 个超预算组件，并有 9 个交互未归属。

修正后：

```text
components: 16
interactions: 49
ownedInteractions: 49
unownedInteractions: 0
overBudget: 0
errors: 0
ready: true
```

关键组件边界：

- `ApplicationShell`
- `PanelMembersPanel`
- `MemberGrid`
- `MemberControl`
- `MemberCarouselControls`
- `PanelTimelinePanel`
- `PanelTimelinePanelItem`
- `TimelineScrollSurface`
- `WorksPanel`
- `WorksExplorer`
- `WorkCardControl`
- `WorkCarouselControls`
- `WorkStoryPanel`
- `MemberModalDialog`
- `ModalDialog`
- `DetailPanel`

规划没有提高 150 行预算。

## 转译工具修正

本案例发现并修复了三类确定性转译问题：

1. ID 引用属性同步：`data-tab`、`data-target`、`aria-controls`、`aria-labelledby`、`for`、`href="#..."` 会随 ID 前缀同步改写；
2. JavaScript 对象字面量 key 也参与 AST 字符串改写，避免 `panels['tab-members']` 与 `id="sg-tab-members"` 不一致；
3. 带 ID 的 `application/json` 数据脚本保留在组件模板中，且模板中的 `</script>` 会转义，兼容 Chromium 与 jsdom roundtrip。

`memberList` 同时被识别为可由 `mount(options.memberList)` 覆盖的数据入口，validation 从初始 9/10 修复为 10/10。

## 正式场景

正式验证覆盖：

1. 从成员入口进入并选择 Jennie；
2. 进入作品页并切换下一作品；
3. 展开当前作品创作故事；
4. 关闭作品创作故事；
5. 从“其它”入口打开资料弹窗；
6. 从顶部“其它”标签打开并关闭资料弹窗。

37 个 waiver 对应重复成员/时间线控件、scrollLeft 协议限制、单页成员轮播隐藏按钮、无独立视觉状态的 autoplay/hover/touch hooks，以及已被正式关闭按钮覆盖的 backdrop alternative。

## 远程资源风险

源页面图片全部依赖远程 URL。质量比较中参考页和组件库使用同一资源地址，因此视觉门禁可以验证页面转译一致性；但离线或防盗链环境下，个别专辑图片可能显示为破图。当前结果不宣称资源已经完全本地化。

## 产物

- `lib/`：零依赖组件库；
- `manifest.json`：结构、数据和 49 个交互的 AST 分析；
- `component-plan.json`、`component-specs/`：16 组件规划；
- `scenarios-candidates.json`：49 个算法候选场景；
- `scenarios.json`：人工审核后的正式场景与 waiver；
- `quality-report.json`、`quality.log`：完整 Gold+ 报告；
- `artifacts/`：初始状态及关键交互的四视口 reference/generated/diff。
