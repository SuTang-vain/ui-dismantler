# ui-dismantler

> 将自包含 HTML 案例页拆解为可复用组件库的工具集。

核心诉求：**根据 HTML 创建对应的组件库以便复用**。Agent 阅读 HTML、理解其主题色语义与交互模式、产出完整的数据驱动组件库（对标手工拆解的 `明星组合/组件库` 质量）。Python 脚本作为确定性工具，辅助提取与校验。

## 架构：agent 驱动 + 工具辅助

```
用户给 HTML
    │
    ▼
Agent（主控）──────────────────────────────────────┐
   │ 1. 读 HTML，理解结构/样式/交互                  │  工具层（确定性，可复现）
   │ 2. 调工具拿确定性数据（主题色/变量/CSS 规则）     │  - analyze_html.py（提取主题色/CSS，含语义角色）
   │ 3. 产出组件库各文件（css/js/html/docs）         │  - validate_lib.py（8 项强约束校验）
   │ 4. 自检：调 validate + roundtrip 验证           │  - roundtrip.py（往返等价度）
   │ 5. 不达标则按决策表修订                          │  - _common.py（颜色/CSS/数据契约工具函数）
    └───────────────────────────────────────────────┘
```

- **agent 做理解和创作**：理解 HTML 结构、设计渲染逻辑、写代码
- **工具做确定性提取和校验**：颜色解析、CSS 拆分、约束校验、往返测试
- **往返测试当裁判**：agent 产出的库必须通过往返测试，低分则修订

## 产出标准

对标手工拆解的 `明星组合/组件库`（2613 行，完整 A11y + 设计令牌 + 数据驱动）：

```
<库名>/
├── README.md                 介绍 + 快速开始 + API + 数据契约 + 主题定制
├── docs/设计规范.md           主题色系统 / Tab 结构 / 交互模式 / 逻辑设置 / 响应式
├── src/
│   ├── <lib>.css             参数化样式（sg-* 前缀，--sg-* 变量，三档响应式）
│   └── <lib>.js              渲染引擎（mount/create API，数据驱动，A11y）
└── examples/
    ├── <案例>.html           用组件库复刻原案例（填入原数据）
    └── template.html         空白复用模板（带示例数据）
```

**质量门槛**：validate 8 项全 PASS + node --check 通过 + roundtrip 综合 ≥ 0.85（结构 ≥ 0.7 / 文本 ≥ 0.8）。

## 工具层

### CLI 脚本

| 脚本 | 用途 |
|---|---|
| `src/skill/scripts/analyze_html.py` | HTML -> manifest.json（提取主题色令牌含语义角色 + 结构清单） |
| `src/skill/scripts/validate_lib.py` | 8 项强约束校验（命名/变量/数据分离/响应式/A11y/主题/零依赖/文档） |
| `scripts/roundtrip.py` | 往返等价度（原 HTML ⇄ 库渲染 DOM，量化"忠于原 HTML"程度） |
| `scripts/verify_all.py` | 批量验证全案例（回归用，汇总通过率与平均分） |
| `node --check` | JS 语法检查 |

### Python 工具函数（`src/skill/scripts/_common.py`）

| 函数 | 用途 |
|---|---|
| `infer_color_roles(css, var)` | 推断 --var 被用作什么角色（text/background/border/shadow/icon-fill） |
| `query_rules(css, ...)` | 按选择器/属性/值过滤 CSS 规则 |
| `extract_data_contracts(scripts)` | 扫描 JS 提取数据契约速览（变量名/类型/字段） |
| `parse_color` / `to_hex` | 颜色值解析与归一化 |
| `extract_root_vars` / `split_media_blocks` / `extract_gradients` | CSS 解析 |

工具层有 113 个单元测试覆盖边界（`python3 scripts/tests/run.py`）。

## 当前能力与基线

| 案例 | 结构 | 文本 | 综合 | 状态 |
|---|---|---|---|---|
| BLACKPINK（v1 链路）| 0.952 | 0.838 | 0.895 | ✅ 支持范式 |
| 手工标杆（明星组合）| 0.952 | 0.865 | 0.908 | ✅ gold standard |
| 子代理产出（部分）| 0.952 | 0.892 | 0.922 | ✅ 超标杆，验证 agent 路线 |
| 黄月英（因果链）| 0.000 | 0.062 | 0.031 | ❌ 未支持范式 |
| 纸上谈兵（nav+panel）| 0.000 | 0.111 | 0.056 | ❌ 未支持范式 |

未支持范式靠 agent 拆解提升（agent 理解因果链/nav-panel 结构，不走 v1 generic 兜底）。

## 目录

```
src/skill/              ZCode Skill（SKILL.md + scripts + references + assets 模板）
  ├── SKILL.md          agent 驱动拆解指南（5 步工作流 + 自检决策表）
  ├── scripts/          工具脚本（analyze/validate/aggregate + _common.py）
  ├── references/       spec.md（8 项强约束）/ patterns.md / manifest_schema.md
  └── assets/templates/ Jinja2 模板（v1 generate_lib 用，agent 驱动后退役）
examples/cases/         案例样本（blackpink / huang-yueying / zhishang-tanbing）
scripts/                roundtrip + verify_all + tests
docs/                   ROADMAP + baselines
```

## 快速开始

```bash
# 装依赖
pip install --user --break-system-packages beautifulsoup4

# 1. 分析 HTML（拿主题色/结构参考）
python3 src/skill/scripts/analyze_html.py examples/cases/blackpink/original.html --out /tmp/mf.json --minimal

# 2. 校验组件库（8 项强约束）
python3 src/skill/scripts/validate_lib.py <组件库目录>

# 3. 往返等价度
python3 scripts/roundtrip.py examples/cases/blackpink/original.html --lib <组件库目录>

# 4. 批量回归验证
python3 scripts/verify_all.py
```

agent 拆解工作流详见 [src/skill/SKILL.md](src/skill/SKILL.md)，规划详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 依赖

- Python 3.8+（beautifulsoup4）
- Node.js（用于 `node --check` 和 roundtrip 的 jsdom 渲染）
