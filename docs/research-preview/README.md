# Research Preview 发布资料包

> 状态：**Draft / Internal Review**  
> 资料基线日期：**2026-07-25**  
> 目标平台：X  
> 发布阶段：Phase A — Research Preview

本目录用于准备 `ui-dismantler` 的第一阶段公开材料。它不是论文、正式 benchmark 或通用产品发布包；目标是以可核验、不过度承诺的方式说明当前研究问题、系统方法、代表性结果和开放问题，并征集外部对抗案例。

## 推荐公开定位

**English**

> An execution-grounded, source-aware system for migrating existing HTML/CSS/JavaScript pages into componentized TypeScript libraries while verifying DOM, style, pixel, responsive, interaction, resource, and runtime fidelity.

**中文**

> 一个基于真实执行证据的源代码感知型网页迁移系统：将现有 HTML/CSS/JavaScript 页面拆解为 TypeScript 组件库，并验证 DOM、样式、像素、响应式、交互、资源和运行时等价性。

## 当前发布判断

当前项目已经满足 Research Preview 的技术门槛：

- 有明确问题定义和差异化定位；
- 有可运行的 reference/generated 双侧案例；
- 有多视口与关键交互视觉矩阵；
- 有可审计的 interaction responsibility 和 coverage；
- 有自动测试与 Gold+ 回归；
- 有明确限制，不需要以通用 SOTA 身份发布。

正式发帖前仍需完成：

1. ~~将当前算法与资料形成稳定 commit/tag~~（已完成：`d8b01f2` + `v0.1.0-research-preview`）；
2. ~~对核心案例执行三次重复基线~~（已完成：4 案例 × 3 轮全 PASS）；
3. ~~审计公开素材的版权、隐私、绝对路径和秘密信息~~（路径与秘密已完成；版权与分发范围待人工确认）；
4. 录制并审核 20–40 秒演示视频；
5. ~~冻结对外指标快照~~（已完成）和公开链接。

完整检查见 [`07-release-checklist.md`](./07-release-checklist.md)。

## 目录

| 文件 | 用途 |
|---|---|
| [`00-release-manifest.md`](./00-release-manifest.md) | 发布负责人、版本、链接和状态总表 |
| [`01-positioning-and-claims.md`](./01-positioning-and-claims.md) | 研究定位、允许/禁止的公开表述 |
| [`02-evidence-and-metrics.md`](./02-evidence-and-metrics.md) | 当前可核验结果和指标解释 |
| [`03-x-post-en.md`](./03-x-post-en.md) | 英文 X 主帖与 Thread 草稿 |
| [`04-x-post-zh.md`](./04-x-post-zh.md) | 中文同步稿 |
| [`05-demo-video-storyboard.md`](./05-demo-video-storyboard.md) | 20–40 秒视频分镜和录制要求 |
| [`06-architecture.md`](./06-architecture.md) | 架构图、图注和对外解释 |
| [`architecture.mmd`](./architecture.mmd) | 可单独渲染的 Mermaid 源文件 |
| [`07-release-checklist.md`](./07-release-checklist.md) | 发布前技术、素材、合规和复现检查 |
| [`08-faq.md`](./08-faq.md) | 预期问题与统一回答口径 |
| [`09-feedback-log.md`](./09-feedback-log.md) | 发布后反馈、对抗案例和数据记录模板 |
| [`metrics.snapshot.json`](./metrics.snapshot.json) | 当前对外指标的机器可读快照 |
| [`assets/README.md`](./assets/README.md) | 视频、图片和图表素材命名规范 |

## 建议发布顺序

```text
1. 冻结 commit/tag 和指标
2. 录制 reference/generated 对比视频
3. 渲染架构图和指标卡
4. 执行发布检查清单
5. 发布英文主帖 + Thread
6. 视受众需要同步中文稿
7. 24 小时内集中回复问题并登记对抗案例
8. 72 小时后总结反馈，决定 Technical Preview 范围
```

## 事实来源

Research Preview 中的数字应只来自以下文件或固定回归命令：

- `examples/dispatch-experiments/babelo-landing/results.json`
- `examples/dispatch-experiments/babelo-landing/scenarios.json`
- `examples/dispatch-experiments/babelo-landing/component-plan.json`
- `npm run test:ts`
- `npm run test:gold:optimized:ts`
- `npm run benchmark:quality:ts`

发布前如重新运行测试，必须同步更新 `metrics.snapshot.json`、本目录中的指标以及发布草稿，禁止混用不同 commit 的结果。
