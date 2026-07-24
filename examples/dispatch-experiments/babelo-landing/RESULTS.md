# Babelo landing dispatch experiment — 2026-07-24

## Conclusion

本轮把 Babelo landing 作为新的非图谱对抗案例继续回归，验证结果为：**规划器已达到 dispatch-ready，浏览器 Gold+ 视觉矩阵通过，正式四个交互场景全部通过。**

| Gate | Result |
|---|---:|
| validation | **10/10** |
| planning | **14 components / 0 over budget / 42 owned / 0 unowned / ready=true** |
| initial viewport matrix | **4/4 PASS** |
| scenario viewport matrix | **4/4 PASS** |
| DOM/text | **1.0 / 1.0** |
| worst computed style | **0.9857** |
| worst pixel diff | **0.006325** |
| runtime/stability/resource failures | **0 / 0 / 0** |
| overall | **0.9941** |

## 本轮算法优化

### 1. Planner 事件分析

- 使用作用域感知的 lexical binding records，避免外部 Locomotive/Lenis 压缩脚本中的局部变量污染主页面变量映射。
- 之前的 8 个装饰元素 click 假阳性已消失：`svg.motif`、`term-card`、`stats`、CTA 标题等不再被误判为真实交互。
- 新增并验证：`keydown`、`wheel`、`scroll`、`scroll-call`、全局 custom event，以及 `scrollBy`、`scrollLeft` 等状态变化。
- `resize`、`scroll`、`load`、`error`、`scroll-call` 被标记为生命周期事件，不再以“缺少用户场景”阻断 dispatch；仍保留组件责任归属证据。

### 2. 场景截图 scroll anchor

场景支持显式 `screenshotAnchor`。截图前只对明确声明的锚点执行：

1. `scrollIntoView({ block: "center" })`；
2. 使用实际 `getBoundingClientRect()` 修正文档滚动位置；
3. 连续两帧确认后截图；
4. 不额外延长 transient state 等待，避免 `copied` 等短时状态在截图前自然过期。

本轮 `run-and-reset-demo` 使用 `#demo` / `#sg-demo` 作为锚点，消除了深页面状态等价但滚动位置不同导致的像素误报。

### 3. 字体语义

- `font-display: block/auto` 仍视为 required。
- `swap/fallback/optional` 视为非阻塞 fallback 资源：不把外部字体可用性误报为翻译失败，也不会因为 fallback 资源未完成而错误阻断页面稳定性。
- 外部字体请求仍在 resource/external availability 图中保留，翻译保真与外部可用性分开报告。

### 4. source-unstyled hook 审计

新增 source evidence：当源页面确实使用某个语义/诊断 class，但源 CSS 没有对应视觉 selector，生成侧也没有视觉 selector 时，报告为：

```text
reason: source-unstyled-hook
sourceSelectorAbsent: true
generatedSelectorAbsent: true
```

本案例的 `.sg-lbl`、`.sg-call-fired`、`.sg-fonts-ready` 已通过该证据链审计豁免；不是靠类名白名单伪造 CSS 规则。validator 与 runtime selector gate 均达到 10/10 / 1.0。

## Formal scenario regression

| Scenario | Style | Pixel | Result |
|---|---:|---:|---|
| toggle-theme | 0.9858 | 0.000022 | PASS |
| copy-install-command | 0.9858 | 0.000022 | PASS |
| open-first-faq | 0.9863 | 0.006198 | PASS |
| run-and-reset-demo | 0.9857 | 0.006325 | PASS |

JSDOM formal scenario runner 同步补齐了 Blob URL/fetch、clipboard、`prefers-color-scheme` 等环境能力，避免把运行器缺失能力误报为页面交互失败。

## Regression

```text
TypeScript suite: 63 tests, 62 passed, 0 failed, 1 skipped
BLACKPINK optimized Gold+: 2/2 PASS
```

## Remaining risks

- Google FontFace 渐进加载仍是主要耗时/非确定性来源；当前已区分阻塞字体与 swap/fallback/optional 字体。
- smooth-scroll/虚拟滚动页面需要在正式场景中显式声明 `screenshotAnchor`；算法不会默认把所有 assertion target 都强制滚动到中心。
- Babelo 的 computed-style 最差为 0.9857，已过 0.98 门槛，但字体、动画中间态仍有进一步收敛空间。
- 本轮 exploratory quality 使用 `interaction-coverage off`，若要纳入正式回归，还需要为 42 个 fingerprint 审查交互等价类与必要 waiver。
