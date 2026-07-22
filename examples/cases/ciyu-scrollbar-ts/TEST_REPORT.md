# “词语-修滚动条”TypeScript 拆解测试报告

测试分支：`codex/component-planning-pipeline`

输入：`/Users/tangyaoyue/Downloads/词语-修滚动条/index.html`

## 结论

当前工具已成功生成可运行的零依赖组件库，并通过完整 TypeScript Gold+ 质量门。初始状态四视口与三个关键交互状态均通过 computed-style 和像素对比；人工查验入口为 `lib/examples/ciyu.html`。

继续优化后，规划 analyzer 已从错误的“整页 PageHeader”提升为层级化应用计划：识别应用 shell、四个主面板、关系图谱、筛选器、详情、典故区域、测验题目/结果及弹窗，并将脚本赋值式事件分配到最具体组件。

## 性能与规划

- analyzer：约 **0.83 秒**；
- planner：约 **0.82 秒**；
- transpiler：约 0.59 秒；
- 规划结果：**16 个组件**、0 超预算、0 错误、11 个复杂度/文本基线警告；
- 父子层级：`ApplicationShell` 下包含四个 panel 与 `PopDialog`，各 panel 继续拆出语义子组件；
- 交互发现：从 2 个提升到 **16 个**，包括 `data-p` 导航、移动子页签、典故高亮、图谱筛选/节点、测验选项和弹窗关闭；
- 交互归属：16/16，未归属 0，规划状态 ready。

## Gold+ 结果

| 检查 | 结果 |
|---|---:|
| 组件库校验 | 10/10 PASS |
| node --check | PASS |
| DOM/text overall | 1.0000 |
| 最终综合分 | 0.9996 |
| 初始状态视口矩阵 | 4/4 PASS |
| 关键交互矩阵 | 3/3 PASS |
| 正式交互场景 | 9/9 PASS |
| analyzer 已识别交互覆盖率 | 100%（16/16 eligible） |
| 选择器实际命中 | 100% |
| 最差 computed-style | 0.9989 |
| 最差像素差异 | 0.0000% |
| 浏览器 runtime errors | 0 |

## 多视口结果

| 视口 | computed-style | 像素差异 | 结果 |
|---|---:|---:|---:|
| desktop 1024×768 | 1.0000 | 0.0000% | PASS |
| tablet 768×1024 | 1.0000 | 0.0000% | PASS |
| mobile 390×844 | 1.0000 | 0.0000% | PASS |
| tiny 320×568 | 1.0000 | 0.0000% | PASS |

关键状态：

- 切换“基本释义”：四视口 PASS，样式与像素完全一致；
- 选择关联词图谱节点：四视口 PASS，最差样式 0.9989、像素差异 0%；
- 进入测验并回答第一题：四视口 PASS，样式与像素完全一致；
- 另有典故注解、下一题、完成后重新开始等正式功能场景通过，但典故注解入口在桌面与移动端采用不同可见路径，因此未强制纳入同一 all-viewport 关键截图矩阵。

## 测试中发现并修复的通用转译问题

1. `images/...` 静态模板及运行时字符串没有统一重写到 `../assets/`，导致浏览器出现 3 个资源 404；
2. DOM ID 被添加 `sg-` 前缀后，`data-p` / `data-group` 仍保留旧值，点击导航后所有 panel 均隐藏；
3. 词条的 `NODES`、`CENTER`、`COLORS`、`NODE_IMG`、`NOTE`、`QS` 大数据未接入 mount options；
4. `data-p` 主导航和 `.panel` 缺少 tab/tabpanel ARIA；弹层缺少 dialog 语义；
5. `.syn` / `.sep` 属于内容语义类但无 CSS 规则，触发 selector coverage 失败。

前四项已在通用 transpiler 中修复；第五项在案例库中补充显式无副作用规则，以保持选择器审计完整。

## 产物

- `original.html`、`images/`：输入副本；
- `manifest.json`、`component-plan.json`、`component-specs/`：规划产物；
- `lib/`：可人工查验的组件库；
- `scenarios.json`：9 个正式功能场景，覆盖 analyzer 识别的全部 16 个交互；
- `quality-report.json`、`quality.log`：完整 Gold+ 结果；
- `artifacts/`：四视口初始状态和三个关键交互状态的 reference/generated/diff；
- `reference-cover.png`、`reference-scrollbar.png`：输入目录附带的人工参考图。
