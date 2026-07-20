# ui-dismantler 优化路线

## 核心转变：从规则引擎转为 agent 驱动拆解

### 诊断

v1 的本质是"把 HTML 往预定义模板里套"——纯规则引擎（BeautifulSoup + 正则）识别已知模式、套模板、填数据。对非预定义结构走 generic 兜底，产出"合规但空壳"的库。

往返测试量化了这个 gap（v1 基线）：

| 案例 | 结构 | 文本 | 综合 |
|---|---|---|---|
| BLACKPINK | 0.215 | 0.838 | 0.527 |
| 黄月英 | 0.000 | 0.062 | 0.031 |
| 纸上谈兵 | 0.000 | 0.111 | 0.056 |

根因不是规则写得不细，而是 **HTML 结构的可能性无限，规则永远写不全**。不同页面有独特命名、数据嵌入方式和交互逻辑，正则要么过度拟合、要么无意义泛化。

### v2 方向：agent 驱动 + 工具辅助

标杆是当初手工拆解 BLACKPINK 的过程（`明星组合/组件库`）—— agent 阅读 HTML，**理解**其主题色语义、交互模式、结构组织，产出完整的组件库。这种理解力是规则做不到的，也是"根据 HTML 创建"的真正含义。

v2 架构：

```
用户给 HTML
    │
    ▼
Agent（主控）──────────────────────────────────────┐
   │ 1. 读 HTML，理解结构/样式/交互                  │
   │ 2. 调工具拿确定性数据（主题色/变量/CSS 规则）     │  工具层（确定性，可复现）
   │ 3. 产出组件库各文件（css/js/html/docs）         │  - analyze_html.py（提取主题色/CSS）
   │ 4. 自检：调 validate + roundtrip 验证           │  - validate_lib.py（8 项强约束）
   │ 5. 不达标则修订                                │  - roundtrip.py（往返等价度）
    └───────────────────────────────────────────────┘
```

**关键原则**：
- **agent 做理解和创作**（理解 HTML 结构、设计渲染逻辑、写代码）—— 这是 LLM 的强项，规则做不到
- **工具做确定性提取和校验**（颜色解析、CSS 拆分、约束校验、往返测试）—— 这是脚本的强项，LLM 不可靠
- **往返测试当裁判**：agent 产出的库必须通过往返测试，低分则修订。把 LLM 的不可控关进"可验证"的笼子

### 与 v1 的关系

v1 的 Python 脚本不丢弃，转为 agent 的**工具层**：

| v1 脚本 | v2 角色 |
|---|---|
| `_common.py` | 工具：颜色解析、CSS 变量提取、media 拆分（确定性，agent 调用） |
| `analyze_html.py` | 工具：快速提取主题色令牌、结构清单（给 agent 当参考，不是唯一依据） |
| `validate_lib.py` | 工具：8 项强约束校验（agent 自检） |
| `roundtrip.py` | 工具：往返等价度（agent 自检 + 量化质量） |
| ~~`generate_lib.py` + 模板~~ | **已删除**：agent 直接写代码，不再套模板（v1 模板链路一并移除） |
| ~~`aggregate_vertical.py`~~ | **已删除**：垂类聚合等单案例稳定后再重做 |

## 产出标准（对标手工 BLACKPINK 组件库）

agent 产出的组件库必须达到当初手工拆解的质量：

```
<库名>/
├── README.md                 介绍 + 快速开始 + API + 主题定制
├── docs/设计规范.md           主题色系统 / Tab 结构 / 交互模式 / 逻辑设置 / 响应式
├── src/
│   ├── <lib>.css             参数化样式（sg-* 前缀，--sg-* 变量，三档响应式）
│   └── <lib>.js              渲染引擎（mount/create API，数据驱动，A11y）
└── examples/
    ├── <案例>.html           用组件库复刻原案例（填入原数据）
    └── template.html         空白复用模板（带示例数据）
```

**质量门槛**（agent 自检必须全过）：
1. `validate_lib.py` 8 项强约束全 PASS
2. `roundtrip.py` 综合分 ≥ 0.85（结构 ≥ 0.7，文本 ≥ 0.8）
3. `node --check` JS 语法合法
4. example.html 用原数据能还原原页面核心内容

## 优化项总览

| 阶段 | 优化项 | 目标 |
|---|---|---|
| P0 | 往返测试基线 ✅ + 单元测试 | 度量尺 + 防回归安全网 |
| P1 | agent 拆解 skill（核心） | agent 能读懂 SKILL.md 独立拆解任意 HTML |
| P2 | 工具层增强 | 给 agent 更强的确定性工具 |
| P3 | 质量闭环 | agent 自检 + 自动修订 + 批量验证 |

---

## P0：度量与安全网

### P0-1 往返测试基线 ✅ 已完成

`scripts/roundtrip.py` + `_roundtrip_render.mjs`，量化"忠于原 HTML"的等价度。
基线报告见 `docs/baselines/`：
- `roundtrip_blackpink_v10_agent.json`：agent 产出的 gold-standard 基线（综合 0.928，结构 0.965，文本 0.892），作为回归锚点
- `archive-v1/`：v1 模板链路的历史 baseline（generate_lib 已删，不可复现，仅存档）

### P0-2 单元测试

对工具层（`_common.py`、`_fix_js_object`）做边界测试，确保 agent 调用的工具可靠。
- `scripts/tests/test_common.py`：颜色解析、变量提取、media 拆分、slugify
- `scripts/tests/test_fix_js_object.py`：单引号/模板字符串/URL 冒号/嵌套
- `scripts/tests/run.py`：一键跑全部

---

## P1：agent 拆解 skill（核心）

### P1-1 重写 SKILL.md 为 agent 可执行的拆解指南

当前 SKILL.md 是"调脚本"指南（analyze→generate→validate）。改为 **"agent 拆解"指南**：

agent 拿到 HTML 后该怎么做：
1. **通读 HTML**，理解：画布尺寸、主题色语义（哪个是品牌主色/强调色/中性色）、Tab/视图结构、交互模式（轮播/展开/切换）、数据组织、响应式断点
2. **调工具拿确定性数据**：跑 `analyze_html.py --minimal` 拿主题色令牌和结构清单作参考（不是唯一依据，agent 要自己判断）
3. **产出组件库文件**：
   - `src/<lib>.css`：参数化样式，颜色全走 `--sg-*` 变量，三档响应式，sg- 前缀
   - `src/<lib>.js`：渲染引擎，`<LibName>.mount(el, options)` API，数据驱动，完整 A11y
   - `examples/<案例>.html`：用原数据复刻原案例
   - `examples/template.html`：空白复用模板
   - `docs/设计规范.md`：主题色/Tab/交互/逻辑的完整规范
   - `README.md`：介绍 + 快速开始 + API
4. **自检**：跑 `validate_lib.py`（8 约束）+ `roundtrip.py`（往返等价度）+ `node --check`（语法）
5. **修订**：不达标则修改对应文件，重跑自检，直到全过

SKILL.md 要包含：
- 拆解思维框架（看 HTML 的顺序和关注点）
- sg-* 强约束规范（命名/变量/响应式/A11y，引用 spec.md）
- 工具调用方式（analyze/validate/roundtrip 的 CLI）
- 质量门槛（validate 全过 + roundtrip ≥ 0.85）
- 标杆示例（BLACKPINK 组件库的结构和质量标准）

### P1-2 前向测试：agent 独立拆解新案例

用子代理验证 SKILL.md 是否足够自解释：
- 给子代理 SKILL.md + 一个未拆解的 HTML
- 让它独立产出组件库
- 检查：是否过 8 约束、往返分多少、JS 语法、example 能否还原原页

测试案例（覆盖不同结构）：
1. BLACKPINK（明星组合，已知结构，应高分）
2. 黄月英（因果链，agent 需理解 splash+timeline-nav+modal）
3. 纸上谈兵（nav+panel，agent 需理解 data-p 关联）
4. 蜂鸟科图鉴（对比辨析，agent 需理解特征对比）

每个案例的通过标准：validate 8/0 + roundtrip 综合 ≥ 0.85（未支持范式暂按 generic 兜底，不达 0.85 属预期）。

---

## P2：工具层增强

给 agent 更强的确定性工具，减少它的盲猜。

### P2-1 主题色语义标注工具

当前 `analyze_html.py` 只提取颜色值。增强为标注语义：
- 扫描颜色使用位置（背景/边框/文字/选中态）推断语义
- 输出"这个色值在原页面用作 X"的标注，帮 agent 准确归一化到 `--sg-*`

### P2-2 CSS 规则结构化工具

把原 CSS 拆成结构化数据（选择器→属性→值），让 agent 快速查询"某元素的样式"而不必通读整段 CSS。
- 输入原 CSS
- 输出 JSON：`[{selector, properties: {prop: value}}]`
- agent 用它确认布局/尺寸/动画细节

### P2-3 数据提取辅助工具

扫描原 HTML 的 `<script>`，提取所有 `const X = [...]` 形式的大数组，按字段推断类型，给 agent 当数据契约参考。

---

## P3：质量闭环

### P3-1 agent 自检与自动修订

把自检流程固化进 SKILL.md 的拆解步骤：
- agent 产出后必须跑 validate + roundtrip
- 若 validate 失败：按报错项修订
- 若 roundtrip 低分：看 missing 文本清单，补回缺失数据
- 循环直到达标或达到 3 轮上限

### P3-2 批量验证脚本

`scripts/verify_all.py`：对一个目录下所有案例 HTML 批量跑 agent 拆解 + 自检，汇总通过率和平均往返分。
用于回归：每次改 SKILL.md 或工具后，跑全量验证确认没退化。

---

## 不做的事

- **LLM 做运行时解析**：解析在开发期由 agent 完成，产出是确定性代码。运行时组件库是纯 JS，不需 LLM。
- **套模板生成（generate_lib + Jinja2）**：已删除。agent 直接写代码，组件库由 agent 产出后用 `roundtrip.py --lib` 验证。
- **垂类聚合**：已删除（aggregate_vertical.py）。等 agent 单案例拆解能力稳定（P1 前向测试全过）后再重做。
- **可视化 Playground**：浏览器打开 example.html 即可预览。
