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

通用化分支将领域信息降级为可选 `profile`，视图识别由可注册 detector 完成。Detector 同时给出中立结构类型、语义类型、置信度和证据；manifest v1 输出保持兼容。

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
| `scripts/roundtrip.py` | 往返等价度（原页面运行后 DOM ⇄ 库渲染 DOM；失败回退会显式报告） |
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

工具层有 197 个单元测试覆盖边界（`python3 scripts/tests/run.py`），含静态/运行态双黄金快照和技术特征矩阵。

## 当前能力与基线

| 案例 | 结构 | 文本 | 综合 | 状态 |
|---|---|---|---|---|
| BLACKPINK v10（运行态参照）| 0.995 | 0.990 | 0.992 | ✅ 主通用质量基线 |
| BLACKPINK v10（历史静态参照）| 0.965 | 0.892 | 0.928 | ✅ 兼容性基线 |
| 手工标杆（明星组合）| 0.952 | 0.865 | 0.908 | ✅ agent 产出超标杆 |
| 黄月英（因果链）| - | - | - | ⏳ 待 agent 拆解（范式识别已扩 quiz/comparison/splash，因果链待补） |
| 纸上谈兵（nav+panel）| - | - | - | ⏳ 待 agent 拆解（4 tabs 已识别，quiz 视图已识别） |

> v1 链路（generate_lib 模板）的 baseline 已归档至 `docs/baselines/archive-v1/`，不可复现。
> 运行态主基线：`docs/baselines/roundtrip_blackpink_v10_rendered.json`；历史静态兼容基线：`roundtrip_blackpink_v10_agent.json`。
> 未支持范式靠 agent 拆解提升（agent 理解因果链/nav-panel 结构，不走 generic 兜底）。

## 目录

```
src/skill/              ZCode Skill（SKILL.md + scripts + references）
  ├── SKILL.md          agent 驱动拆解指南（5 步工作流 + 自检决策表）
  ├── scripts/          工具脚本（analyze/validate + _common.py）
  └── references/       spec.md（8 项强约束）/ patterns.md / manifest_schema.md
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
