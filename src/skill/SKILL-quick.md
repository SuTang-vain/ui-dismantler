---
name: html-to-component-lib-quick
description: 精简入口版。将 HTML 案例页拆解为可复用组件库。MUST USE 当用户提到「拆解 HTML」「提取组件」「做成组件库」「提取主题色」「提取交互模式」「规范化复用」。先读本文件；复杂案例或失败时读完整版 SKILL.md。
---

# HTML -> 组件库 拆解（精简版）

**完整规范见 `SKILL.md`**。本文件是快速入口，只讲三件事：何时用、5 步怎么做、怎么算完成。

## 何时用

用户提供 HTML 文件（或目录），要求拆成组件库 / 提取主题色 / 规范化复用。

## 5 步工作流

1. **通读 HTML**：理解主题色语义、Tab/视图结构、交互模式、数据组织、响应式断点
2. **调工具拿数据**：`python3 src/skill/scripts/analyze_html.py <html> --out <mf.json> --minimal`（拿主题色令牌 + 范式识别 + 结构清单，`:root` 为空时自动从 Tailwind config 提取）
3. **产出组件库**（在用户指定目录下）：
   - `src/<lib>.css`：参数化样式（`sg-` 前缀，`--sg-*` 变量，三档响应式）
   - `src/<lib>.js`：渲染引擎（`<Lib>.mount(container, opts)` API，数据驱动，A11y）
   - `examples/<案例>.html`：用原数据复刻原案例
   - `docs/设计规范.md` + `README.md`：文档
4. **自检**（三项全过才算完成）：
   - `python3 src/skill/scripts/validate_lib.py <库目录>` → 8 项全 PASS
   - `node --check src/<lib>.js` → 无语法错误
   - `python3 scripts/roundtrip.py <原html> --lib <库目录> --out <报告.json>` → 综合 ≥ 0.70（GOLD ≥ 0.85）
5. **修订**：不达标按报错修订，重跑自检，循环至达标或 3 轮上限

## 8 项强约束（validate_lib.py 校验）

1. 命名前缀：CSS `sg-`、变量 `--sg-`、JS PascalCase、DOM id `sg-`
2. 变量归一化：原变量名映射到 `--sg-primary/accent/ink/muted/line/paper/stage/soft`
3. 数据分离：可变内容走 JSON，禁止 JS 硬编码业务文案/URL
4. 响应式三档：PC + WISE(≤500px) + 极端(≤320px)
5. A11y：tablist/tabpanel/dialog/aria-live/aria-label/ESC（按需）
6. 主题可定制：颜色全走变量，禁止硬编码 `#hex`（`:root` 与纯黑白蒙版例外）
7. 零依赖：禁止外部 JS/CSS（字体 CDN 例外）
8. 文档完备：README.md + docs/设计规范.md 齐全

## 质量门槛

- **PASS**：roundtrip 综合 ≥ 0.70（结构 + 文本各加权）
- **GOLD**：roundtrip 综合 ≥ 0.85
- Tailwind 页面：tag 拓扑率（0.95+）和文本匹配率（1.0）是更忠实的度量，class 相似度天然低属正常

## 何时读完整版

- 本文件跑不通 → 读 `SKILL.md` 的「拆解工作流」详细步骤
- validate 某项 FAIL 不知怎么修 → 读 `SKILL.md` 的「自检决策表」
- 变量归一化映射不全 → 读 `references/spec.md` 第 2 节
- 不确定结构范式 → 读 `references/patterns.md`
- 想输出 ESM/Web Component → 读 `SKILL.md` 的「输出形态」+ 调 `adapt_output.py`

## 依赖

- Python 3.8+ + beautifulsoup4
- Node.js 18+（roundtrip 的 jsdom 渲染）
