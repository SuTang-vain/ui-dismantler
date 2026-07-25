# Babelo landing dispatch experiment — 2026-07-24

## 结论

Babelo 已从“视觉通过但关闭 interaction coverage 的探索案例”升级为**正式 Gold+ 回归案例**。当前版本在不降低阈值的前提下同时通过：

| Gate | Result |
|---|---:|
| validation | **10/10** |
| planning | **14 components / 0 over budget / 42 owned / 0 unowned / ready=true** |
| DOM / text | **1.0 / 1.0** |
| initial viewport matrix | **4/4 PASS** |
| critical scenario viewport matrix | **4/4 PASS** |
| formal scenarios | **6/6 PASS** |
| verified interaction coverage | **1.0** |
| worst selector coverage | **1.0** |
| worst computed style | **0.9857** |
| worst pixel diff | **0.006325** |
| runtime / stability / required resource failures | **0 / 0 / 0** |
| overall | **0.9941** |

本次严格质量命令耗时 **58.027s**；其中初始视觉矩阵 **7.517s**，正式场景状态验证 **8.643s**，关键场景视觉矩阵 **38.154s**。

## 1. 结构化 interaction responsibility

旧模型只有 `lifecycle?: boolean`，无法表达不同责任。新分析结果写入：

```text
user-action          11
navigation-action    20
no-op-control          6
gesture-protocol       1
viewport-lifecycle     1
scroll-lifecycle       1
custom-lifecycle       2
```

旧 manifest 仍可读取，但规划、复杂度、场景要求和等价组资格统一由结构化责任判断。Babelo 的 4 个 lifecycle responsibility、20 个 navigation action 和 6 个 no-op control 都保留在 42 个规划证据中，但不进入需要持久应用状态断言的场景覆盖分母。若导航控件同时存在 DOM/class/attribute 等应用状态变更，则会保守地重新提升为 `user-action`。

## 2. 正式 interaction coverage

| Metric | Value |
|---|---:|
| total interactions | 42 |
| scenario-required | 12 |
| lifecycle responsibilities | 4 |
| navigation actions | 20 |
| no-op controls | 6 |
| non-scenario interactions | 30 |
| equivalence groups | 2 |
| formal scenarios | 6 |
| eligible | 12 |
| reasoned waivers | **0** |
| verified coverage | **1.0** |

两个经审查的等价组：

1. **copy chip**：两个安装命令组件及其嵌套按钮共享同一冒泡路径、clipboard 写入与 `copied` 状态机；
2. **FAQ accordion**：三个 FAQ 项来自同一数据循环和处理器，执行同构的 `open` / `aria-expanded` 转换。

原来的 26 个人工 waiver 已被责任模型替代：

- 20 个有效 `href` 链接分类为 `navigation-action`；
- 6 个 `href="#"` 占位链接分类为 `no-op-control`；
- 只有不存在持久应用状态证据时才允许上述分类；存在 DOM/class/attribute 变更时仍归为 `user-action`。

因此当前 coverage 不依赖人工豁免，也不通过伪造可见断言获得通过。

## 3. 导航完整性门禁

浏览器质量矩阵现在独立比较 reference/generated 的导航引用：

- fragment target 与目标元素存在性；
- relative/external URL；
- `mailto:` / `tel:`；
- `download` 属性与文件名；
- `href="#"` 等 inert control。

生成端的 `#sg-*` ID 会按转译规则归一化后与源端比较，因此合法 ID 前缀改写不会误报；目标缺失、URL 改写错误或 download 语义丢失会直接使质量门禁失败。Babelo 当前 `worstNavigationIntegrity=1`、`navigationFailures=0`。

同时修正了资源汇总语义：`resource-readiness` 只统计 `required=true` 的资源失败；`font-display: swap/fallback/optional` 的 loading 状态继续保留为非阻塞审计信息，但不会因为采样时机不同偶发拉红整个 Gold+。

## 4. FontFace 对齐与 URL 查询语义修复

新增 reference/generated 字体 face 对齐报告和遥测：

```text
facesDiscovered
blockingFaces
nonBlockingFaces
loadedFaces
fallbackFaces
failedFaces
fontStateMismatches
fontPreflightMs
```

该门禁区分阻塞字体和 `swap/fallback/optional`：阻塞 face 缺失、失败或状态不一致会失败；非阻塞 fallback 状态差异会被记录，但不会制造假失败。

对齐报告发现了一个真实转译错误：Google Fonts URL 中的 `display=swap` 曾被通用 token 前缀逻辑错误改写为 `sg-display=swap`，使生成页的 FontFace 退回 `auto`。现已让 URL query/path 语义绕过 DOM class/ID token 改写，并加入专门回归测试。修复后 Babelo：

```text
font-face-alignment = PASS
alignmentFailures = 0
blockingStateMismatches = 0
blockingFaces = 0
failedFaces = 0
```

## 5. adaptive readiness 的 offscreen 修复

旧逻辑用当前 viewport 的 hit-test 判断下一步控件是否 actionable。在 tiny/tablet 视口，位于折叠线下方但实际可由 Playwright 自动滚入视口的按钮会被误判为“尚不可操作”，把一个普通 100ms temporal wait 升级成严格 actionable wait，从而偶发产生 `dom/layout/assertion timeout`。

现在 readiness 只判断：

- DOM 可见；
- 非 disabled / `aria-disabled`；
- 具有正尺寸。

是否当前位于 viewport 内交给 Playwright 的真实点击滚动处理。Babelo follow-up 3/3 通过、稳定失败率 0。

## 6. wheel 与数值状态断言

场景协议新增真实 `wheel` action，并支持数值属性范围：

```json
{
  "steps": [{ "action": "wheel", "target": "#howScroll", "deltaY": 120 }],
  "assertions": [{
    "target": "#howScroll",
    "propertyRanges": { "scrollLeft": { "min": 1 } }
  }]
}
```

正式的非关键场景现在覆盖：

- `keydown` + `ArrowRight` → `scrollLeft >= 1`；
- hover 目标上的真实 wheel delta → `scrollLeft >= 1`。

pointer/touch 仍不会被降级为 click。

## 7. deadline-aware timer grace

Babelo 的复制反馈、FAQ hydration 和 demo abort 会留下短定时器。大 DOM 签名扫描偶尔使 ≤1000ms 定时器执行后无法在 1200ms 基础窗口内再完成连续两帧稳定。

本轮增加 **350ms timer-only grace**：

- 仅在本轮确实等待过已跟踪 timer；
- assertion 与资源已经满足；
- 网络、资源和普通断言仍使用原硬门槛；
- grace 有独立 `timerGraceMs` / `timerGraceExtensions` 遥测；
- 1400ms 慢资源失败测试仍保持失败，不会被放宽掩盖。

这解决的是调度边界抖动，不是全局增加超时。

## 8. 正式场景结果

### 关键视觉场景

| Scenario | Style | Pixel | Stability | Result |
|---|---:|---:|---:|---|
| toggle-theme | 0.9858 | 0.000022 | 0 | PASS |
| copy-install-command | 0.9858 | 0.000022 | 0 | PASS |
| open-first-faq | 0.9863 | 0.006198 | 0 | PASS |
| run-and-reset-demo | 0.9857 | 0.006325 | 0 | PASS |

### 非关键协议场景

- `scroll-how-with-keyboard`: PASS；
- `scroll-how-with-wheel`: PASS。

二者进入正式状态与 coverage 门禁，但不扩张关键多视口截图矩阵，因此不会无必要增加 8 组浏览器截图。

## 9. Regression

```text
TypeScript suite: 73 tests, 71 passed, 0 failed, 2 Gold skipped by default (~52.8s)
Optimized Gold+: 3/3 PASS
  planning matrix: PASS (~3.7s)
  BLACKPINK Gold+: PASS (~32.5s)
  Babelo Gold+: PASS (~59.3s)
```

## Performance follow-up

Babelo 当前版本再次执行三轮：

```text
3/3 PASS
median total = 61.780s
stability failure rate = 0
```

与原始 58.773s 中位数相比，总时间增加 5.1%，因此本轮**不宣称端到端提速**。拆分来看，初始视觉矩阵、关键场景矩阵、DOM 稳定和场景执行约改善 1–2%，但 Chromium close 中位数增加约 3.378s，抵消了收益。曾尝试跳过 adaptive 字体 preflight，但实测无收益，已经回退。

## Remaining risks

- Google FontFace 渐进加载仍是主要外部耗时和方差来源；阻塞与非阻塞字体语义已分离。
- `screenshotAnchor` 仍坚持显式声明，不自动移动所有 assertion target。
- computed-style 最低为 0.9857，已过 0.98，但字体与动画中间态尚非完全相等。
- `navigation-action` 目前依赖 DOM href 与“无持久应用状态变更”证据；跨页导航、下载链接和 SPA router 后续仍应增加独立的导航完整性指标，而不是重新塞回 DOM 场景覆盖。
