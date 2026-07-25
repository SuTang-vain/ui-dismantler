# Research Preview Release Manifest

## 发布身份

| 字段 | 当前值 |
|---|---|
| Project | `ui-dismantler` |
| Release stage | Phase A — Research Preview |
| Public status | Draft / Not published |
| Snapshot date | 2026-07-25 |
| Working branch | `codex/browser-matrix-reuse-experiment` |
| Commit SHA | `d8b01f277adff68bf72846918ab66bfa0dce5a7c`（代码+数据冻结；tag 指向其后的 docs commit） |
| Tag | `v0.1.0-research-preview` |
| Public repository | https://github.com/SuTang-vain/ui-dismantler |
| Public demo URL | **TODO** |
| Technical note URL | **TODO** |
| X post URL | **TODO：发布后填写** |
| Owner | `SuTang-vain` |

## 发布目标

第一阶段不以论文、SOTA 或通用产品发布为目标。核心目标：

1. 建立“source-aware UI migration + execution-grounded verification”的研究叙事；
2. 展示一个可测量的 reference/generated 迁移案例；
3. 公开质量门禁如何发现 DOM-only 验证看不到的问题；
4. 征集 Canvas、SVG filter、拖拽、音视频和框架型页面作为外部对抗案例；
5. 寻找 UI-to-Code、Web Engineering、Software Testing 和 Program Analysis 方向的交流者。

## 发布包最小构成

- [ ] 固定 commit SHA；
- [ ] 固定公开指标快照；
- [ ] 20–40 秒 MP4；
- [ ] 架构图 PNG/SVG；
- [ ] 一张指标卡；
- [ ] 一张早期验证盲区示例图；
- [ ] 公开 README 或技术说明；
- [ ] X 主帖和 Thread；
- [ ] 可接收反馈的 Issue/表单/邮箱；
- [ ] 素材权利和秘密信息审计记录。

## 发布版本冻结规则

以下任一项发生变化，都应更新 snapshot 并重新审核文案：

- interaction responsibility 分类；
- coverage 分母或 waiver；
- 视口数量；
- computed-style 或 pixel 阈值；
- 正式场景数量；
- Gold+ 结果；
- 浏览器版本或稳定性模式；
- 对外 demo 内容。
