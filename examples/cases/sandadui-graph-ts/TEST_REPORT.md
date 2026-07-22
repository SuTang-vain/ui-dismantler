# 《三大队：人物关系与剧情全解析》TypeScript 拆分测试报告

## 输入

- 原始目录：`/Users/tangyaoyue/Downloads/三大队：人物关系与剧情全解析`
- 原始入口：`index.html`
- 测试副本：`examples/cases/sandadui-graph-ts/original.html`
- 测试分支：`codex/ts-visual-quality-gates`

## 拆分产出

- 组件样式：`lib/src/sandadui.css`
- 组件运行时：`lib/src/sandadui.js`
- 示例页面：`lib/examples/sandadui.html`
- 模板页面：`lib/examples/template.html`
- 本地资源：`lib/assets/`
- 使用说明：`lib/README.md`
- 设计规范：`lib/docs/设计规范.md`
- 结构分析：`manifest.json`
- 交互矩阵：`scenarios.json`
- 完整质量报告：`quality-report.json`

## 拆分内容

- 四阶段剧情导航：恶性命案、漫漫刑途、千里追凶、终有回响；
- 人物关系图谱、SVG 关系边与关系标签；
- 人物节点、拖拽逻辑和人物详情面板；
- 故事图谱/作品推荐主 Tab；
- 同题材/同主演/同编剧作品分类；
- 响应式缩放与多档媒体查询；
- 本地 WebP 图片资源；
- `chars`、`storyModules`、`allEdges`、`works` 等业务数据可通过 `mount(root, options)` 覆盖。

## 最终质量结果

| 门禁 | 结果 |
|---|---:|
| validate | 10/10 PASS |
| node --check | PASS |
| DOM structure | 0.998 |
| text | 1.000 |
| DOM overall | 0.999 |
| selector coverage | 1.000 |
| computed style | 0.9989 |
| pixel diff | 0.0000% |
| visual score | 0.9994 |
| final overall | 0.9992 |
| 正式交互场景 | 5/5 PASS |
| 可验证交互覆盖 | 6/6（100%，另有 3 个基线不可达指纹获显式 waiver） |
| runtime errors | 0 |
| Gold+ | PASS |

## 正式交互场景

1. 打开程兵人物详情；
2. 关闭人物详情；
3. 切换到“漫漫刑途”剧情阶段；
4. 切换到作品推荐；
5. 切换作品推荐到“同主演”。

## 交互覆盖说明

分析器识别出 9 个交互指纹，当前正式场景验证 6 个。以下 3 个继续保留为 candidate，并同时登记为显式 coverage waiver：

- 剧情导航横向滚动提示；
- 推荐作品上一页；
- 推荐作品下一页。

在 1024×768 基线下，剧情导航无需横向滚动；每个推荐分类最多 4 项，分页按钮处于隐藏状态，因此没有将这些“不可触发状态”伪装成正式通过，而是要求在报告中给出明确 waiver 原因。

## 本轮发现并修复的工具问题

1. 原页面测试副本未携带 `images/` 时，Chrome 会报告 20 个资源加载错误；测试夹具现同步保存源资源。
2. 自动生成器此前不会生成 README 和设计规范；现为新组件库补齐文档骨架。
3. 大型业务数组/对象此前未统一暴露为 `mount(options)` 数据入口；现支持 `chars`、`storyModules`、`ALL_EDGES/allEdges`、`works` 等集合。
4. `sg-is-small-canvas`、`sg-is-tiny-canvas` 属于纯运行时状态标记，不一定拥有独立 CSS 规则；静态对齐检查现按 `sg-is-*` 状态类处理，真实 CSS 命中仍由第 10 项浏览器门禁负责。
5. 自动生成的 9 个候选场景经过人工审阅后，落地为 5 个具备状态断言的正式场景；未激活控件继续保留 candidate，避免 0/0 场景造成虚假全绿。

## 回归测试

- Python：321/321 PASS
- TypeScript：7/7 PASS
- TypeScript build/typecheck：PASS
