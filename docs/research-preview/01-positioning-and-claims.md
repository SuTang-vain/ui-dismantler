# 对外定位与 Claim 边界

## 一句话定位

> `ui-dismantler` migrates existing HTML/CSS/JavaScript pages into componentized TypeScript libraries and verifies the result with executable, multi-viewport quality gates.

## 它是什么

- 源代码感知型 Web UI 迁移系统；
- DOM、CSS、JavaScript AST 联合分析器；
- 责任感知的组件规划器；
- TypeScript 组件库转译流程；
- reference/generated 双侧执行验证系统；
- 多视口、交互、资源和稳定性质量门禁。

## 它不是什么

- 不是只依赖截图的 Screenshot-to-Code 模型；
- 不是面对任意网站均可一次成功的通用克隆器；
- 不是已经完成公开 benchmark 的 SOTA 方法；
- 不是以单个像素分数替代功能验证的视觉复制工具；
- 不是运行时依赖 LLM 的页面解释器。

## 可以公开使用的表述

### 推荐

- `source-aware web UI migration`
- `execution-grounded quality verification`
- `componentized TypeScript output`
- `multi-viewport visual quality gates`
- `interaction responsibility and verified coverage`
- `early research preview`
- `evaluated on a limited representative suite`
- `seeking adversarial test cases`

### 需要带范围限定

| 表述 | 必须补充的限定 |
|---|---|
| High fidelity | 限定为当前代表性 DOM/CSS/JS 案例和已公开指标 |
| Verified coverage = 1.0 | 说明分母是 12 个需要状态证明的交互；导航、no-op 和 lifecycle 被结构化分离 |
| Automated | 说明场景、等价组和关键性仍需要审核 |
| Componentized | 说明当前主要达到组件级/函数簇级，statement-level slicing 仍在研究 |
| Stable | 说明基于固定浏览器配置和回归套件，不代表任意外部环境 |

## 当前不应使用的表述

- `state of the art` / `SOTA`
- `works on any website`
- `fully autonomous`
- `pixel-perfect for all webpages`
- `better than screenshot-to-code models`
- `production-ready for arbitrary websites`
- `zero manual review`
- `100% interaction coverage` 而不解释责任类型和分母
- `replaces frontend engineers`

## 正确解释输入条件

必须主动说明：

> The system receives the existing HTML, CSS, JavaScript, and assets as input. This is a source-aware migration problem, not a screenshot-only code generation task.

这不会削弱研究价值，而是让问题边界可信：

```text
视觉猜测代码
≠
理解现有实现并迁移为可维护组件，同时保持执行等价
```

## 当前核心研究问题

1. DOM 等价为什么不足以证明视觉等价？
2. 如何将交互区分为 user、gesture、navigation、no-op 和 lifecycle responsibility？
3. 哪些交互需要正式状态场景，哪些应由导航或运行时完整性验证？
4. 如何在多个视口中验证 reference/generated 的真实渲染状态？
5. 如何降低浏览器质量矩阵成本，同时不降低缺陷发现率？
6. 如何把组件规划、质量门禁和 agent 修复循环连接起来？

## 对外差异化信息

建议优先传播：

> DOM equivalence is not visual equivalence.

历史实验中曾出现：

```text
DOM roundtrip = 1.0
validation = green
pixel difference = 15.2%
```

该案例用于说明为什么系统需要 selector coverage、computed style 和真实截图矩阵。发布时必须明确它是早期失败案例，不是当前最终结果。
