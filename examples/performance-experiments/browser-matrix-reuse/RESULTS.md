# Browser Matrix Reuse Experiment

测试日期：2026-07-23  
分支：`codex/browser-matrix-reuse-experiment`

## 目标

降低多视口关键交互视觉矩阵的执行成本，同时保持 Gold+ 门禁、视口数量、关键场景数量和像素阈值不变。

## 实现

新增：

- `legacy` / `shared-browser` A/B 调度；
- `--browser-concurrency` 受控并发参数；
- 浏览器启动、Context/Page 创建、导航、settle、场景、截图、pixel diff、产物写入和关闭阶段遥测；
- `run-local` 图片/字体响应缓存；
- 远程请求、cache hit/miss 和缓存字节统计；
- `npm run test:gold:optimized:ts` 优化配置正式 Gold+ 回归。

推荐实验配置：

```bash
--browser-mode shared-browser \
--browser-concurrency 1 \
--browser-resource-cache run-local
```

该配置只共享浏览器进程和不可变图片/字体响应；每个 viewport/state 仍使用新的 BrowserContext 和 Page，不共享 DOM、JavaScript 堆、cookies 或 localStorage。

## BLACKPINK 三轮 A/B

| 模式 | 三轮总耗时 | 平均 | 对 legacy |
|---|---|---:|---:|
| legacy, concurrency=1 | 43.14s / 43.47s / 42.46s | 43.02s | baseline |
| shared-browser, cache off | 44.83s / 43.75s / 41.85s | 43.48s | -1.1% |
| shared-browser, run-local cache | 38.92s / 38.90s / 38.72s | **38.85s** | **+9.7%** |

关键交互视觉矩阵平均耗时：

```text
legacy: 28.26s
run-local cache: 24.36s
improvement: 13.8%
```

缓存三轮均稳定为：

```text
remote requests observed: 296
cache hits: 285
cache misses: 11
cached bytes: 1,712,512
```

## 质量结果

缓存三轮均满足：

```text
Gold+: PASS
overall: 0.9999 or conservative 0.9996
selector coverage: 1.000
computed style: 0.9997
pixel diff: 0.000000
runtime errors: 0
viewports: 4/4
critical matrices: 4/4
verified coverage: 1.000
```

优化版正式 Gold+：

```text
npm run test:gold:optimized:ts
2/2 PASS
BLACKPINK Gold+: 38.55s / final rerun 38.79s
```

## 跨案例结果

| 案例 | 结果 | overall | runtime errors |
|---|---|---:|---:|
| 秦始皇 SVG 图谱 | PASS | 0.9945 | 0 |
| 词语滚动交互 | PASS | 0.9996 | 0 |
| 孙悟空动画图鉴 | PASS | 0.9928 | 0 |
| 三大队关系图谱 | PASS | 0.9992 | 0 |

这些案例没有远程 image/font 请求，因此缓存命中为 0；门禁结果与既有基线一致。

## 被否决的优化

### 仅复用 Chromium

三轮平均反而比 legacy 慢约 1.1%，没有独立启用价值。它只作为跨 Context 运行级缓存的宿主。

### 长生命周期 Context/Page + concurrency=2

最好单次曾达到 30.81s，但后续出现：

- 17～25 秒关闭等待；
- 一次运行超过 2 分钟仍未生成报告；
- 关闭阶段受远程连接生命周期影响，结果不稳定。

因此该实现已从最终 CLI 中移除，不作为可交付能力。

## 当前结论

现阶段可信方案不是共享页面状态，而是：

1. 单 Browser 承载一次质量运行；
2. Context/Page 继续按 viewport/state 隔离；
3. 只缓存本次运行内的 GET image/font 响应；
4. concurrency 保持 1；
5. 保留 `legacy` 和 `off` 作为立即回退路径。

下一步应研究减少固定等待与场景协议中的无效 100ms，而不是重新尝试共享 DOM/JS 状态。

## 2026-07-24：确定性稳定判定实验

在 run-local 资源缓存保持启用的前提下，继续对固定等待做同版本三轮 A/B。

| 稳定模式 | 三轮总耗时 | 平均 | 关键场景矩阵平均 | 对 fixed |
|---|---|---:|---:|---:|
| `fixed` | 38.88s / 39.00s / 39.45s | **39.11s** | 24.48s | baseline |
| `adaptive` 安全版 | 31.72s / 32.32s / 32.44s | **32.16s** | 17.59s | **总耗时 -17.8% / 场景矩阵 -28.1%** |

浏览器阶段平均从 `28.70s` 降至 `21.50s`，降低 `25.1%`。安全版三轮遥测稳定为：

```text
stability checks: 96
stability timeouts: 0
assertion timeouts: 0
network idle timeouts: 0
timer-aware waits: 24
timer drain timeouts: 0
explicit waits: 32
adaptive explicit waits: 32
remaining fixed wait: 0ms
```

质量保持：

```text
Gold+: PASS
validation: 10/10
viewports: 4/4
critical scenario matrices: 4/4
runtime errors: 0
selector coverage: 1.000
worst computed style: 0.9997
worst pixel diff: 0.001314
verified coverage: 1.000
```

### 被否决的 readiness-only 版本

只以“后续目标已可交互”作为中间 wait 的结束条件时，三轮曾达到 `26.0–27.7s`，但其中一轮 `open-work-story / tiny` 的 computed-style 降至 `0.9859`。根因是入口遮罩已 `pointer-events:none`，但其 `setTimeout(..., 420)` 清理尚未执行，reference 与 generated 在截图时处于不同 cleanup 时刻。

最终版本在 context init script 中追踪 1 秒以内的短时 `setTimeout`，并要求可见图片完成加载。修正后三轮 computed-style 恢复为 `0.9997`，同时保留相对 fixed 的稳定收益。该实验说明：目标 actionability 是必要信号，但不能替代 timer drain、DOM/layout 稳定和最终 assertion。

### 自适应跨案例回归

| 案例 | PASS | overall | worst style | worst pixel | stability timeout | runtime errors |
|---|---:|---:|---:|---:|---:|---:|
| 秦始皇 SVG 图谱 | 是 | 0.9945 | 0.9898 | 0.007154 | 0 | 0 |
| 词语滚动交互 | 是 | 0.9996 | 0.9989 | 0 | 0 | 0 |
| 孙悟空动画图鉴 | 是 | 0.9928 | 0.9887 | 0.014119 | 0 | 0 |
| 三大队关系图谱 | 是 | 0.9992 | 0.9989 | 0 | 0 | 0 |

## 2026-07-24：动态视觉资源稳定门

在安全版 adaptive 稳定判定上继续增加：

- 动态外部 stylesheet load；
- CSS `background-image` / `mask-image` Resource Timing 完成记录；
- `document.fonts.status`；
- 可见图片 decode 前的完成状态。

新增两个确定性 HTTP 集成测试：

1. stylesheet 延迟 60ms，随后触发背景图延迟 75ms；
2. stylesheet 延迟 40ms，随后加载真实 TTF 字体并等待 `document.fonts.load()`。

测试均确认：reference/generated 使用隔离页面；stylesheet 分别请求；image/font 仍通过 run-local 缓存只访问源站一次；资源与稳定超时均为 0。

BLACKPINK 单轮探针：

```text
total: 31.87s
scenario matrices: 17.35s
browser total: 21.56s
worst computed style: 0.9997
worst pixel diff: 0.001312
resource drain timeouts: 0
stability timeouts: 0
```

正式 optimized Gold+：

```text
2/2 PASS
BLACKPINK Gold+: 32.60s
full command: 36.04s
```

异构案例全部保持原质量分，且 resource/stability timeout 均为 0：

| 案例 | PASS | overall | 总耗时 | resource timeout |
|---|---:|---:|---:|---:|
| 秦始皇 SVG 图谱 | 是 | 0.9945 | 11.48s | 0 |
| 词语滚动交互 | 是 | 0.9996 | 24.51s | 0 |
| 孙悟空动画图鉴 | 是 | 0.9928 | 18.27s | 0 |
| 三大队关系图谱 | 是 | 0.9992 | 14.60s | 0 |

### 稳定超时假绿回归

新增反例：reference/generated 同时加载一个超过 adaptive 500ms 上限的 stylesheet。两侧截图仍完全一致，pixel gate 本可为 PASS，但资源和网络尚未稳定。

新逻辑结果：

```text
pixel passed: true
stabilityFailures: > 0
viewport passed: false
matrix passed: false
```

这使“资源同时缺失导致像素一致”的情况不再被判为高保真完成。正式 BLACKPINK 与四个异构案例回归的 `stabilityFailures`、`stabilityTimeouts`、`resourceDrainTimeouts` 均为 0。

## 2026-07-24：Resource Failure Graph

新增结构化资源失败定位：

```json
{
  "url": "https://example.test/missing.png",
  "type": "background-image",
  "owner": ".hero",
  "pseudo": "::before",
  "role": "library",
  "state": "http-error",
  "status": 404,
  "elapsedMs": 18.4,
  "required": true,
  "external": true
}
```

确定性回归覆盖：

- 慢 stylesheet：pending/timeout、owner、phase、elapsed；
- HTTP 404 伪元素背景：status、pseudo、reference/library；
- socket reset 图片：request failure reason；
- CSS `@import` 404；
- SVG `image[href]` 404；
- 非 2xx route.fetch 不再 fallback continue 导致同一页面重复请求。

### Diegovz 17 MB 真实资源密集回归

初次运行把首屏之外的 lazy/data URI 图片误判为 required，产生 24 个本地资源 timeout。修正 required 判定为“CSS 可见且与当前 viewport 相交”，并将 data/blob 排除 external availability 后：

```text
browser total: 3.22s
dom stability aggregate: 0.35s
stability timeout: 0
resource timeout: 0
resource failures: 0
resource-readiness: PASS
external-availability: PASS
```

临时静态封装的 selector/computed-style/pixel 仍不满足 Gold+，因此整体正确 FAIL；失败归因保持在 translation fidelity，而不是资源可用性。

### BLACKPINK 三轮性能

```text
33.02s / 33.10s / 33.19s
average: 33.10s
scenario matrix average: 18.02s
browser average: 22.37s
resource failures: 0
stability failures: 0
```

相对 Resource Failure Graph 之前的安全 adaptive 平均 `32.16s`，增加约 `2.9%`，低于预设 5% 回退上限。
