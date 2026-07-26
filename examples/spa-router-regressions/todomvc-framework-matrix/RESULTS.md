# TodoMVC 多框架 SPA Router 语义与视觉矩阵

测试日期：2026-07-26

## 目标

以 React 19 TodoMVC 为 reference，分别将 Vue 3.5、Svelte 5、Angular 21 作为独立实现目标，验证：

- 同一用户步骤后的可观察路由状态；
- Hash Router 的 back 行为；
- Todo 新增、编辑、删除、过滤、全选；
- desktop / tablet / mobile 三视口 computed-style 与像素差；
- runtime、必需资源和稳定性门禁。

这是**跨框架等价性实验**，不是拆解后 generated SPA 的 Gold+ 证明。

## 严格阈值

- computed style >= 0.98
- pixel diff <= 0.02
- runtime errors = 0
- required network failures = 0
- navigation integrity = 1.0

## 结果

| Pair | 场景 | 导航检查 | 视口 | Worst style | Worst pixel diff | 结论 |
|---|---:|---:|---:|---:|---:|---|
| React → Vue | 8/8 | 20/20 | 12/12 | 1.0 | 0.011387 | PASS |
| React → Svelte | 8/8 | 20/20 | 12/12 | 1.0 | 0.016735 | PASS |
| React → Angular | 7/8 | 20/20 route semantics | 12/12 visual | 1.0 | 0.018435 | FAIL |

Angular 失败不是等待不足：`history.back()` 后 URL 已回到 `#/active`，但页面仍保持 Completed 选中态并显示空列表，等待 2 秒仍不恢复。失败由 `scenario-protocol` 保留；route semantic 和视觉矩阵不会掩盖它。

## 本轮算法变化

- 新增 `navigationComparison: "semantic"`；原 `strict` 模式继续比较原始 History API transition 数量、方法、target 和 state。
- semantic 模式按每个用户步骤记录 route observation，并按各自 base URL 归一化后比较。
- 支持 reference/generated 分角色 step selector 与断言 path/selector。
- Svelte 的 Toggle All 使用真实可点击的 `label[for='toggle-all']`，没有使用 `force click`。
- 支持显式 `semanticRouteAliases`；Angular 的 `/#/all` 只归一为根 route，不影响 History Back 的 UI 断言。

## 基础设施观察

### 历史基线（优化前）

- React → Vue：内部总耗时约 31.90s，外部 wall time 46.98s。
- React → Svelte：内部报告完成后 Node 进程未退出。
- React → Angular：graceful browser close 曾达到 49.56s。

### 当前状态（优化后）

- 增加跨进程 fast-shutdown lock 和 owned child stdio 安全清理。
- React → Vue region：reportReady 33.198s，total internal 33.214s，browser close 15.261ms。
- active handles after close = 0。
- lifecycle beforeExit / exit 均观察到。
- 两个并行 fast-kill runner 2/2 PASS，无 lock/process residue。
- 本轮未观察到模型 API 重连；质量指标均来自浏览器内部与本地 lifecycle 遥测。

## 文件

- `matrix-summary.json`：机器可读汇总。
- `react-*/config.json`：可复跑配置。
- `react-*/results.json`：完整合同报告。
- `react-*/visual-artifacts/`：每个状态、每个视口的 reference/generated/diff PNG。

## 优化后区域矩阵复测

React→Vue 增加 `screenshotRegion: ".todoapp"` 后重新执行：

- 8/8 场景；20/20 导航；12/12 视口通过；
- computed-style = 1.0；region worst pixel diff = 0.000552；
- reportReady = 33.198s；total internal = 33.214s；
- browser close = 15.261ms；关闭后 active handles = 0；
- lifecycle `beforeExit` / `exit` 均观察到。

证据目录：`react-vue-region/`。
