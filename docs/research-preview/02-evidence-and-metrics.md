# 当前证据与指标

> 数据快照：2026-07-25。发布前必须与 `metrics.snapshot.json` 和固定 commit 再次核对。

## 1. Babelo 代表性案例

该案例包含：

- Locomotive Scroll；
- IntersectionObserver；
- Google FontFace；
- Blob URL 数据；
- lazy images；
- theme toggle；
- clipboard feedback；
- keyboard/wheel 横向滚动；
- 异步 terminal demo 状态机。

### 组件规划

| 指标 | 当前值 |
|---|---:|
| Components | 14 |
| Over budget | 0 |
| Planning errors | 0 |
| Planning warnings | 0 |
| Interactions retained as evidence | 42 |
| Owned interactions | 42 |
| Unowned interactions | 0 |
| Dispatch ready | true |

### Interaction responsibility

| 类型 | 数量 | 是否进入状态场景分母 |
|---|---:|---|
| user-action | 11 | 是 |
| gesture-protocol | 1 | 是 |
| navigation-action | 20 | 否，进入导航完整性责任 |
| no-op-control | 6 | 否，保留无状态证据 |
| viewport-lifecycle | 1 | 否 |
| scroll-lifecycle | 1 | 否 |
| custom-lifecycle | 2 | 否 |
| **Total** | **42** | — |

### 正式 coverage

| 指标 | 当前值 |
|---|---:|
| Total responsibilities | 42 |
| Scenario-required interactions | 12 |
| Eligible interactions | 12 |
| Declared covered | 12 |
| Verified covered | 12 |
| Verified coverage | **1.0** |
| Manual coverage waivers | **0** |
| Navigation interactions | 20 |
| No-op interactions | 6 |
| Lifecycle interactions | 4 |

对外应使用：

> 42 detected responsibilities, 12 state-bearing interactions, 12/12 verified, with navigation, no-op, and lifecycle responsibilities represented separately rather than hidden behind manual waivers.

不要简写成模糊的“42 个交互 100% 全部执行”。

## 2. 视觉和运行时结果

### 初始四视口矩阵

| Viewport | Selector | Computed style | Pixel diff |
|---|---:|---:|---:|
| Desktop | 1.0 | 0.9858 | 0.000005 |
| Tablet | 1.0 | 0.9858 | 0.000005 |
| Mobile | 1.0 | 0.9994 | 0.000012 |
| Tiny | 1.0 | 0.9994 | 0.000022 |

### 综合结果

| 指标 | 当前值 |
|---|---:|
| Validation | 10/10 |
| DOM score | 1.0 |
| Visual score | 0.9902 |
| Overall | 0.9941 |
| Worst initial selector coverage | 1.0 |
| Worst initial computed style | 0.9858 |
| Worst initial pixel diff | 0.000022 |
| Runtime errors | 0 |
| Stability failures | 0 |
| Required resource failures | 0 |
| Required external failures | 0 |

### 正式场景

正式场景共 6 个：

1. `toggle-theme`
2. `copy-install-command`
3. `open-first-faq`
4. `run-and-reset-demo`
5. `scroll-how-with-keyboard`
6. `scroll-how-with-wheel`

其中前 4 个进入多视口关键场景视觉矩阵；后 2 个进入正式协议和状态验证，但不扩张截图矩阵。

当前关键场景最差值：

```text
worst computed style = 0.9857
worst pixel diff     = 0.006325
runtime errors       = 0
stability failures   = 0
```

## 3. 回归状态

### 默认 TypeScript suite

```text
90 tests
87 passed
0 failed
3 Gold tests skipped by default
```

### Optimized Gold+

```text
4/4 PASS
planning regression: PASS
BLACKPINK Gold+: PASS
Babelo Gold+: PASS
Warp Gold+: PASS
total: 111.1s
```

Gold+ 为冻结 commit 上的单次通过记录，耗时不被描述为稳定性能结论；稳定耗时以下方三次基线为准。

### 三次重复基线（2026-07-25，冻结 commit）

4 个案例 × 3 轮，全部 PASS；所有运行 runtime/resource/stability 失败均为 0：

| 案例 | 通过 | totalMs median | min | max | 最差 computed style | 最差 pixel diff |
|---|---|---:|---:|---:|---:|---:|
| blackpink | 3/3 | 30.7s | 30.4s | 34.6s | 1.0 | 0.001 |
| babelo | 3/3 | 57.9s | 53.7s | 58.1s | 0.986 | 0.006 |
| qinshihuang | 3/3 | 10.3s | 10.1s | 10.4s | 0.990 | 0.007 |
| sandadui | 3/3 | 12.2s | 12.2s | 12.4s | 0.999 | <0.001 |

原始报告：`examples/performance-baselines/quality-baseline-2026-07-25.json`（含 timer grace、stability timeout 和 browser 阶段耗时明细）。

## 4. 质量阈值

当前 Research Preview 必须说明阈值没有为案例降低：

```text
validation = 10/10
selector coverage = 1.0
computed style >= 0.98
pixel diff <= 0.02
DOM/text equivalence
4 formal viewports
critical interaction matrices
runtime/resource/stability failures = 0
component line budget = 150
Babelo verified interaction coverage = 1.0
```

## 5. 已知限制

- 输入包含原始 HTML/CSS/JavaScript，不是 screenshot-only；
- 正式案例规模仍然有限；
- Canvas、WebGL、音视频、复杂拖拽和 Shadow DOM 尚未形成正式覆盖；
- Google FontFace 渐进加载仍是主要外部耗时与方差来源；
- virtual/smooth scrolling 页面仍需要显式 `screenshotAnchor`；
- `navigation-action` 已与 DOM 状态 coverage 分离；SPA router 已有初步正式合同回归（2 个受审 dual-control 案例），跨页面导航和下载仍需专门的 navigation-integrity 指标；
- statement-level responsibility slicing 尚未完成；
- 当前不能声明通用 SOTA。
