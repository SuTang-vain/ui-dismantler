# Phase A Research Preview 发布检查清单

> 只有 P0 全部完成，才建议发布第一条 X 主帖。

## P0 — 必须完成

### 版本冻结

- [x] 当前算法改动已经提交（`120a433` SPA router 合同评估）；
- [x] 当前资料目录已经提交；
- [x] 已推送远端；
- [x] `00-release-manifest.md` 已填写 commit SHA；
- [x] 已创建或确认 tag，例如 `v0.1.0-research-preview`；
- [x] 发布文案中的所有数字来自同一个 commit（`d8b01f2`，docs commit 仅改文案）。

### 自动测试

在冻结 commit 上运行：

```bash
npm run test:ts
npm run test:gold:optimized:ts
```

- [x] `test:ts` 无失败（90 tests / 87 passed / 3 Gold skipped）；
- [x] optimized Gold+ 无失败（4/4 PASS，含 Warp）；
- [x] Babelo verified coverage = 1；
- [x] validation = 10/10；
- [x] selector coverage = 1；
- [x] computed style >= 0.98；
- [x] pixel diff <= 0.02；
- [x] runtime/resource/stability failures = 0。

### 三次重复基线

- [x] BLACKPINK 连续运行 3 次；
- [x] Babelo 连续运行 3 次；
- [x] 记录每次 PASS/FAIL；
- [x] 记录 totalMs；
- [x] 记录 computed style min/max；
- [x] 记录 pixel diff min/max；
- [x] 记录 timer grace；
- [x] 记录 stability timeout；
- [x] 使用 median，不只展示最佳运行。

推荐运行：

```bash
npm run benchmark:quality:ts
```

已按默认案例集合（blackpink、babelo、qinshihuang、sandadui）× 3 轮执行，报告见
`examples/performance-baselines/quality-baseline-2026-07-25.json`。

### 公开素材审计

- [ ] 确认 source 页面、图片、字体和代码可公开展示（**待人工确认**：BLACKPINK 案例热链百度百科/B站/新浪艺人图片，公开视频与截图建议只使用 Babelo 案例）；
- [ ] 确认可以公开分发的内容与只能展示的内容（**待人工确认**）；
- [x] 删除私人绝对路径（`d8b01f2` 统一脱敏为 `/Users/<user>`，git 历史按决策不重写）；
- [x] 删除用户名、token、Cookie、API key（全仓库扫描未发现秘密模式）；
- [ ] 删除无关浏览器标签和通知（录制视频时执行）；
- [ ] 检查截图中是否含私人文件名（素材制作时执行）；
- [x] 检查 Git 历史是否含秘密（全部 123 个 commit 扫描未发现秘密模式）；
- [ ] 不公开来源不明确的下载素材包（**待人工确认**）。

### 对外入口

- [x] 有公开 README 或技术说明；
- [ ] 有稳定 demo 或视频（视频待录制，见 `05-demo-video-storyboard.md`）；
- [x] 有结果快照（`metrics.snapshot.json`，已对齐冻结 commit）；
- [x] 有 issue、表单或邮箱用于接收案例（GitHub Issues）；
- [ ] 陌生用户可以在 60 秒内理解项目是什么（**待人工确认**）；
- [x] 明确写出 source-aware，不与 screenshot-only 混淆。

### 文案审核

- [x] 没有 SOTA 声明；
- [x] 没有“支持任意网站”；
- [x] 没有“完全自动”；
- [x] coverage 分母解释准确；
- [x] 明确代表性套件规模有限；
- [x] 明确列出未覆盖技术；
- [x] 早期 `15.2%` 是历史失败案例，不与当前指标混淆；
- [ ] 视频和文字指标一致（视频待录制）。

## P1 — 强烈建议

- [ ] 为架构图生成浅色和深色两个版本；
- [ ] 为视频生成静态 poster；
- [ ] 准备一张移动端可读的指标卡；
- [ ] 准备英文 alt text；
- [ ] 主帖不超过一个核心观点；
- [ ] Thread 每条只解释一个问题；
- [ ] 准备 FAQ 快速回复；
- [ ] 发布后 2 小时内可集中回复；
- [ ] 记录曝光、收藏、回复和外部案例，而不只记录点赞。

## P2 — 发布后完成

- [ ] 24 小时反馈总结；
- [ ] 72 小时案例优先级排序；
- [ ] 将高价值反馈转换为 issue；
- [ ] 识别最常见误解，修改定位文案；
- [ ] 决定 Phase B Technical Preview 范围；
- [ ] 公开失败案例，而不只展示成功案例。

## 发布批准

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Technical owner | TODO | TODO | Pending |
| Metrics reviewer | TODO | TODO | Pending |
| Asset/privacy reviewer | TODO | TODO | Pending |
| Final publisher | TODO | TODO | Pending |
