# Quality IR v1 原型

Quality IR 是基于某个质量 Profile 对 canonical UI-IR 做出的可重算判断，不修改 UI-IR 页面事实。

模型采用 **2 + 1 + 1**：组件知识库与系统知识库、正交的 Profile 合成层、以及后续的 Repair Coordination Layer。本原型只实现 inspect-only：Schema、Profile 合成、确定性静态检测与 `quality-findings.json`，不应用 Patch。

指南位于 `src/skill/references/guidelines/{components,systems,profiles}`。`web-base` 中受保护的 Web/A11y 硬约束不能被子 Profile 禁用或降级；Material Design 是可选 Profile，不默认覆盖品牌设计意图。

```bash
python3 -m ui_dismantler.cli.inspect_quality page.uiir.json \
  --profile web-base -o quality-findings.json
```

首批检测器覆盖 icon button 名称、表单标签、ARIA 引用、Tab/TabPanel 引用及图片 alt。

最小 Render Observation 采集器可在本地 HTML 上按 UI-IR 的显式 selector/id，针对最多 8 个 viewport 采集 geometry、可见性、viewport clipping 与受控 computed-style 白名单。它阻断 HTTP(S) 请求，不执行任意用户脚本参数，Playwright 不可用时只返回 warning：

```bash
python3 -m ui_dismantler.cli.observe_quality_render page.html page.uiir.json \
  --viewport wise:390x844 -o page.render.json
```

首批 Render Observation 规则已启用：交互目标小于 24×24 CSS px，以及可见元素超出 viewport。两者当前均为 **soft warning**：WCAG target-size 存在 spacing/inline 等例外，离屏布局也可能是有意设计；在补齐邻近元素间距、滚动容器和布局意图证据前，不自动修复。

`inspect_quality` 可合并静态与渲染证据：

```bash
python3 -m ui_dismantler.cli.inspect_quality page.uiir.json \
  --profile web-base --render page.render.json -o quality-findings.json
```

下一阶段再处理 contrast；它需要透明度、祖先背景与渐变合成，不能直接比较两个 computed color 字符串。
