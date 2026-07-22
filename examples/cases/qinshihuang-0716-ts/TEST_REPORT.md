# 秦始皇 · 七大事件与人物关系（0716）TypeScript 拆解测试报告

测试分支：`codex/ts-visual-quality-gates`

测试日期：2026-07-22

输入目录：`/Users/tangyaoyue/Downloads/秦始皇・七大事件与人物关系-0716`

输入页面：`index.html`

## 结论

**本次拆解通过 ts-visual-quality-gates Gold+ 质量门禁。**

组件库产出位于：`examples/cases/qinshihuang-0716-ts/lib/`

可直接人工查看：

```text
examples/cases/qinshihuang-0716-ts/lib/examples/qinshihuang.html
```

## 门禁结果

| 检查项 | 结果 |
|---|---:|
| TypeScript 10 项库校验 | **10/10 PASS** |
| node --check | **PASS** |
| DOM/text roundtrip overall | **0.998** |
| 最终综合分 | **0.9945** |
| 初始状态多视口 | **4/4 PASS** |
| 关键交互多视口 | **1/1 PASS** |
| 选择器实际命中 | **100%** |
| 最差 computed-style | **0.9898** |
| 最差像素差异 | **0.7154%** |
| 浏览器 runtime errors | **0** |
| 正式交互场景 | **4/4 PASS** |
| 已验证交互覆盖率 | **100%（3/3 eligible）** |

门槛：computed-style ≥ 0.98，像素差异 ≤ 2%，初始/关键交互视口全部通过。

## 多视口结果

| 视口 | 尺寸 | 结果 | 视觉分 | computed-style | 像素差异 |
|---|---:|---:|---:|---:|---:|
| desktop | 1024×768 | PASS | 0.9983 | 0.9970 | 0% |
| tablet | 768×1024 | PASS | 0.9983 | 0.9970 | 0% |
| mobile | 390×844 | PASS | 0.9983 | 0.9970 | 0% |
| tiny | 320×568 | PASS | 0.9944 | 0.9899 | 0% |

关键交互场景：`open-yingzheng-modal`，在 desktop/tablet/mobile/tiny 四个视口执行后均通过；该状态矩阵最差 computed-style 为 **0.9898**，最差像素差异为 **0.7154%**。

## 交互场景

正式验证场景：

- `open-yingzheng-modal`：点击嬴政头像打开人物详情（critical）
- `close-person-modal`：点击关闭按钮
- `escape-close-modal`：按 Escape 关闭人物详情
- `switch-event-button`：选择“一统天下”事件

工具识别到的两个底部横向滚动箭头已显式记录 waiver：

- `#barPrev`
- `#barNext`

原因：当前场景断言协议没有稳定的 `scrollLeft` 检查项；这两个控件只负责滚动事件条，不改变可断言的业务状态。waiver 已写入 `scenarios.json`，未被静默忽略。

## 产物清单

- `original.html`：输入页面副本，用于 reference 渲染
- `manifest.json`：TypeScript 确定性分析结果，识别为 graph 页面，42 个主题令牌、5 个交互
- `scenarios.json`：正式交互场景与明确 waiver
- `lib/src/qinshihuang.css`：`sg-*` 命名、`--sg-*` 主题变量、三档响应式 CSS
- `lib/src/qinshihuang.js`：`QinShihuangLibrary.mount/create`，数据从 example 的 JSON 契约注入
- `lib/examples/qinshihuang.html`：可直接打开的人工查验页面
- `quality-report.json`：完整质量报告
- `artifacts/`：初始状态与人物弹窗状态的 reference/generated/diff PNG

## 注意事项

- 原页面在 jsdom reference 模式下会报告 `SVGTextElement.getComputedTextLength` 和 `scrollIntoView` 兼容性提示；这不影响真实 Chromium Gold+ 结果，组件库侧已增加兼容兜底，浏览器质量报告 runtime errors 为 0。
- 本次产出沿用了源页面的图谱布局和关系数据，并将运行时业务数据移出渲染逻辑，放入 example 的 `application/json` 数据契约中。
