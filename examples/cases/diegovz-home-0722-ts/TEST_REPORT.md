# Home — Diegovz 大型归档页面拆解测试报告

测试分支：`codex/component-planning-pipeline`

输入：`/Users/tangyaoyue/Downloads/Home — Diegovz (2026_7_22 16：28：53).html`

## 阶段结论

本案例未进入最终 Gold+ 组件库验收，当前结论是：**现有工具不适合直接处理 SingleFile 保存的 17 MB WordPress/Elementor 页面归档。** 规划门禁正确阻止了错误计划，但 analyzer 和通用 transpiler 暴露了新的输入规模及页面类型盲区。

## 输入特征

- 文件大小：17,840,490 bytes；
- DOM 节点约 1,435；
- 56 个内联 style、41 张内嵌图片、3 个 canvas、19 个 SVG；
- 图片和样式大量以 data URI/SingleFile 归档形式内嵌；
- 语义区域包括 Hero、项目集、文章、个人碎片、教育、经历、阅读、奖项和 Footer；
- 页面并非自包含应用型 HTML，而是保存下来的 WordPress/Elementor 站点快照。

## 实验结果

### 原文件分析

`analyze` 在原始 17 MB 文件上运行超过 2 分钟未结束，已人工终止。主要原因是 CSS/颜色/变量分析对巨型内联归档样式缺少输入预算和线性扫描保护。

### 轻量规划 fixture

为了继续验证规划行为，保留 DOM 和文本、移除脚本/巨型样式及大型 data URI，生成 `planning-fixture.html`（约 203 KB）。分析在约 1 秒内完成，但结果错误：

- 将返回顶部进度控件 `div.progress-wrap.active-progress` 误识别为唯一 `graph`；
- 页面 8 个主要内容区域均未成为组件；
- 15 个全页交互被错误归入该 graph；
- 生成单一 `Graph1`，预计 352 行；
- 150 行 preflight 返回 `complexity-budget`，阻止 dispatch。

### 通用 transpiler

`transpile_self_contained_case.mjs` 在解析归档脚本时失败：Acorn `Unexpected token (1:11)`。该脚本将 JSON-LD/归档辅助脚本和应用脚本合并后按普通 JavaScript 解析，不适用于此类页面。

## 有效发现

1. 150 行规划门禁发挥了作用，没有把错误的 `Graph1` 直接送入实现阶段。
2. `graph` detector 目前过宽：只要容器内有 SVG 或 `node` 字样就可能被误判。
3. analyzer 需要输入预算、style 大小上限和 SingleFile 预处理层。
4. portfolio/landing page 需要 section-based 候选识别，不能继续依赖应用型 view detector。
5. transpiler 必须按 script type 分离 JSON-LD、配置和可执行脚本，并允许无应用脚本的静态页面。

## 建议的人工组件边界

- `HeroProfile`
- `ProjectShowcase`
- `WritingFeed`
- `PersonalFragments`
- `EducationTimeline`
- `ExperienceTimeline`
- `ReadingShelf`
- `AwardsGrid`
- `SiteFooter`

## 产物

- `original.html`：17 MB 原始输入副本；
- `planning-fixture.html`：仅用于规划诊断的轻量 DOM fixture；
- `manifest.json`、`component-plan.json`、`component-specs/`：当前错误识别结果，作为回归样本；
- `analyze.log`、`planning.log`、`transpile.log`：实验日志。


## 优化后复测（2026-07-22）

本轮针对上述失败补齐了大归档预处理、分析预算、图谱强证据、标题分区规划和脚本类型过滤，并直接对 17.0 MB 原始文件复测（SHA-256 与 Downloads 输入一致）。

- 原文件分析：约 **2.0 s** 完成（此前超过 120 s 后人工中断）。
- 误判修复：`.progress-wrap.active-progress` 不再被识别为 graph。
- 页面规划：识别 10 个边界，包括 `HeroProfile`、`SomeProjects`、`Writing`、`FragmentsOfMe`、`Education`、`Experience`、`Readings`、`AwardsFeatures`，以及其下的 `Carousel3d`、`Timeline` 子组件。
- 层级：`Carousel3d` 归属 `FragmentsOfMe`，`Timeline` 归属 `Experience`。
- 交互：不再把全部交互分配给单个误判图谱；交互按最先匹配的组件边界唯一归属。
- 150 行预检：7 个组件可派发；`Timeline`、`FragmentsOfMe`、`AwardsFeatures` 仍需继续拆分，属于正确的质量阻断。
- 通用转译器：原文件已能在约 **5.9 s** 产出静态库；跳过 1 个 JSON-LD/归档脚本，不再出现 Acorn `Unexpected token`，且无外部 assets 目录时不再失败。

当前结论：**分析与规划阶段已经从“不可用/语义错误”提升为“可在秒级输出可审阅边界并正确阻断超复杂组件”**。转译器产出仍是整页静态封装，尚未达到可接受的组件库质量，因此本轮未把临时转译产物作为 Gold+ 交付。

## 语义二次拆分复测（2026-07-22）

继续优化后，规划器不再通过放宽 150 行预算来“变绿”，而是从 DOM 重复结构和局部交互簇中生成可审计的父子组件计划：

- 原始 17 MB 输入分析约 **1.97 s**，规划约 **1.96 s**；
- 规划从 10 个粗粒度边界扩展为 **24 个组件**，其中 **14 个**具有明确父组件；
- 自动识别复用实例：Carousel item 12、Timeline item 6、Projects item 5、Education item 10、Readings item 4、Awards item 10；
- `FragmentsOfMe` 被拆成交互 shell、3 个局部交互 slot 和独立浮层播放器；
- `Timeline` 被拆成 timeline shell + 6 实例 item；4 个链接交互归属于 item；
- `AwardsFeatures` 被拆成 section shell + 10 实例 item；
- 补充非语义化 WordPress 页头/页尾边界，发现的 **31/31** 个交互均有且仅有一个组件 owner；
- 150 行 preflight：**0 个超预算、0 个错误、6 个接近预算警告**，计划状态 ready；
- specs 已重新生成，共 **24** 份，每个复用组件记录完整 source instance selectors，供实现及 Gold+ 验收逐实例追踪。

该结论仅表示“组件计划已可派发”，不等于页面已完成高保真转译。下一阶段仍需按计划生成真实组件库，并通过 selector coverage、DOM/text roundtrip、computed style、像素差异、多视口及关键交互矩阵。
