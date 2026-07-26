# YesPlayMusic generated SPA Gold+ slice

测试日期：2026-07-26

## Targets

- Reference：本地上游 YesPlayMusic Vue SPA，运行于 `http://127.0.0.1:4195`。
- Generated：当前目录内独立 plain JavaScript SPA，运行于 `http://127.0.0.1:4196`。
- Generated 不使用 Vue、Vue Router 或上游组件；它通过独立 History API 和 route renderer 实现相同行为。
- 上游源码目录 `/Users/tangyaoyue/DEV/Baidu/YesPlayMusic` 未被修改。

## Semantic route contract

| Gate | Result |
|---|---:|
| Scenario protocol | 5/5 PASS |
| Navigation integrity | 14/14 PASS |
| Route visual states | 3/3 PASS |
| Viewport runs | 9/9 PASS |
| Worst computed style | 1.0000 |
| Worst pixel diff | 0.006150 |
| Runtime errors | 0 |
| Stability failures | 0 |
| Required network failures | 0 |
| Blocking handles after close | 0 |

覆盖：

- `/settings → /explore`；
- history back；
- `/search/周杰伦` 动态 route；
- `/library → /login` guard；
- `/settings` deep-link reload；
- Desktop `1024×768`、Tablet `768×1024`、Mobile `390×844`。

## Strict route contract

Strict 模式按预期失败（0/5），并保留 20 条导航完整性差异：

- generated 初始化额外 `replaceState`；
- reference 与 generated 的 transition 数量和 method 不同；
- generated 使用独立、可审计的 history state。

这证明 semantic mode 与 strict mode 的职责边界仍然有效；Gold+ 没有吞掉底层路由实现差异。

## Stability and resource decisions

本轮确认早期稳定失败来自浏览器页面资源，而不是模型 API 重连：

- Google Analytics `www.google.com/g/collect` 被按精确 telemetry endpoint 分类，不是全域忽略 `google.com`；
- 已离开当前 route、DOM 中已无引用的图片请求不再阻塞截图；
- 当前 DOM 仍引用的远程 Vercel footer SVG 由案例级确定性 fixture 提供；
- 截图锚点前后均执行稳定判定，防止字体或滚动引起的后置布局漂移；
- 稳定失败会输出 active request 的 type、method 和 URL，便于审计。

## Three-run performance baseline

| Metric | Result |
|---|---:|
| Passing runs | 3/3 |
| Median total | 17.018s |
| Total stddev | 0.339s |
| Median visual matrix | 8.965s |
| Visual stddev | 0.238s |
| Median adaptive wait | 5.225s |
| Adaptive wait stddev | 0.025s |
| Median browser close | 17.689ms |
| Worst computed style | 1.0000 |
| Worst pixel diff | 0.006150 |
| Stability failures | 0 |
| Max blocking handles after close | 0 |

优化前曾出现单轮 `adaptiveWaitMs=79.496s`；确定性资源 fixture 与可见状态稳定算法完成后，三轮为 `5.266s / 5.221s / 5.225s`。

## Artifacts

- `semantic-results.json` / `semantic.lifecycle.json`：最终 semantic Gold+ 结果；
- `strict-results.json` / `strict.lifecycle.json`：严格合同预期失败证据；
- `performance-baseline.json`：三轮性能摘要；
- `visual-artifacts/`：三个 route state、三个 viewport 的 reference/generated/diff 截图。
