# ui-dismantler 优化路线

## 核心问题诊断

v1 的本质是"把 HTML 往预定义模板里套"，不是"根据 HTML 创建"：
流程为 HTML → 识别它属于哪种已知模式（member-grid/timeline/carousel）→ 套对应模板 → 填数据。
当 HTML 不匹配预定义模式时走 generic 兜底，产出"合规但空壳"的库——8 项校验通过但内容为空，不可复用。

**核心矛盾**：复用要求把 HTML 的结构/样式/交互参数化抽象，但 v1 的抽象是"写死几套模板"，对新结构无法抽象。

## v2 目标：从"选模板填数据"转向"提模板留占位"

真正"根据 HTML 创建"应该是：把输入 HTML 本身当作模板来参数化，而不是套预设模板。

组件库复用的本质是四样东西：
1. **结构模板**（HTML 骨架带占位）—— v1 写死，v2 从 HTML 提取
2. **样式系统**（CSS 参数化变量）—— v1 重写，v2 保留+归一化
3. **渲染逻辑**（JS 把数据填进结构 + 绑交互）—— v1 重写，v2 提取
4. **数据契约**（JSON schema）—— v1 部分提取，v2 从占位反推

## 优化项总览

| 阶段 | 优化项 | 目标 | 依赖 |
|---|---|---|---|
| P0 | 往返测试基线 | 量化"忠于原 HTML"的 gap | 无 |
| P0 | 单元测试 + 快照基线 | 防回归安全网 | 无 |
| P1 | 样式保留引擎 | CSS 从重写改为保留+归一化 | 无 |
| P1 | 结构参数化引擎 | HTML→参数化模板+数据 schema | P0 |
| P2 | 交互提取引擎 | 从原 JS 提取事件绑定 | P1 |
| P2 | 数据契约自动生成 | 从占位反推 schema+默认值 | P1 |
| P3 | 视图类型注册机制 | 新增结构不改核心 | P1 |
| P3 | 一键 CLI | 降低使用门槛 | P1 |

---

## P0：建立度量与安全网

### P0-1 往返测试基线（roundtrip test）

**为什么最先做**：它是"忠于原 HTML"的唯一可信度量。当前 8 项校验只验"组件库自身规范"，
不验"是否忠于原 HTML"。没有这个度量，后续优化容易变成"看起来更完善但实际还是空壳"。

**做什么**：原 HTML → 组件库 → 用原数据填充 → 与原 HTML 对比。

对比维度（从严到宽）：
1. **结构等价**：DOM 树拓扑一致（标签、层级、class 集合）
2. **文本等价**：可见文本内容一致（容许空白差异）
3. **样式等价**：关键元素的计算样式一致（颜色/尺寸/布局，容许变量名差异）
4. **交互等价**：核心事件可触发且效果一致（tab 切换、modal 打开关闭）

**实现**：
- `scripts/roundtrip.py`：输入原 HTML + 组件库目录 + 原数据，输出差异报告
- 阶段一：只做结构+文本对比（用 BeautifulSoup 解析两份 HTML 做树 diff）
- 阶段二：接 headless browser 做样式+交互对比（可选，需 Playwright）

**交付物**：
- `scripts/roundtrip.py`
- `examples/cases/<案例>/` 真实案例样本（含原 HTML + 预期数据）
- 往返等价度报告（量化当前 v1 的 gap，作为 v2 优化的基准线）

**验收标准**：对 BLACKPINK 案例跑通，输出"结构/文本/样式/交互"四维等价度评分（哪怕分数低）。

### P0-2 单元测试 + 快照基线

**为什么做**：v1 全是端到端跑，改正则可能悄悄破坏某垂类。v2 改动更大，必须有安全网。

**做什么**：
- `scripts/tests/` 目录，pytest 风格但保持零依赖（纯 assert 脚本，`python3 tests/run.py` 执行）
- 对 `_common.py` 每个解析函数做边界测试：
  - `extract_root_vars`：空 CSS / 嵌套 :root / 选择器组 / 多 :root
  - `parse_color` / `to_hex`：hex3/hex6/hex8/rgba/hsl/无效值
  - `split_media_blocks`：嵌套括号 / 无闭合 / 空 @media
  - `normalize_var_name`：VAR_NORMALIZE_MAP 全覆盖
- 对 `_fix_js_object` 做 fixture 测试：单引号 / 模板字符串 / 尾逗号 / URL 冒号 / 嵌套对象
- 把 5 个垂类案例的 manifest 做成快照基线（`tests/snapshots/`），改动后对比 diff

**交付物**：
- `scripts/tests/test_common.py`、`test_fix_js_object.py`、`test_snapshots.py`
- `tests/snapshots/<案例>.manifest.json`
- `scripts/tests/run.py`（一键跑全部测试）

**验收标准**：`python3 scripts/tests/run.py` 退出码 0；故意改坏一个正则后能报错。

---

## P1：结构化提取引擎

### P1-1 样式保留引擎

**做什么**：CSS 从"重写"改为"保留 + 归一化"。

当前 `lib.css.j2` 按预定义结构重写 CSS，导致 generic 视图"有骨架没样式"。
改为保留原 CSS 全部规则，只做三件事：
1. **变量归一化**：颜色/字号等换为 `--sg-*` 变量（复用现有 `VAR_NORMALIZE_MAP`）
2. **类名加前缀**：所有类名加 `sg-` 前缀（保留选择器结构，不丢规则）
3. **归并重复**：相同属性合并、`:root` 变量去重

**实现**：新增 `scripts/transform_css.py`：
- 输入原 CSS 文本
- 用 `parse_rules` 拆规则
- 对每条规则：类名加前缀、值中的颜色/尺寸替换为变量引用
- 输出归一化后的 CSS（保留原始选择器结构与所有声明）

**交付物**：
- `scripts/transform_css.py`
- 替换 `generate_lib.py` 中 CSS 生成逻辑（从套模板改为调用 transform_css）
- 用往返测试验证：样式等价度应显著提升

**验收标准**：generic 视图不再"没样式"；BLACKPINK 案例样式等价度 ≥ 90%。

### P1-2 结构参数化引擎（核心）

**做什么**：遍历原 HTML 的 DOM，自动识别数据点和重复结构，产出参数化模板 + 数据 schema。

这是 v2 最核心、最难的部分。把 HTML 当模板来参数化：

**数据点标记**：
- 文本节点 → 标记为占位（`{{title}}`、`{{member.name}}`）
- `src`/`href`/`alt` 等属性 → 标记为占位
- 推断占位语义：从 class 名/上下文猜（`.title` → title，`.member .name` → member.name）

**循环识别**：
- ≥2 个相似兄弟节点（同 class、结构相近）→ 抽成 `{{#each items}}...{{/each}}`
- 相似度判定：标签序列一致 + class 集合交集 ≥ 80%
- 循环项的字段从首个节点提取，作为 schema 的 item 定义

**条件识别**（后做）：
- `hidden` 属性、`.is-active` 类 → 抽成 `{{#if}}` 条件块
- modal 的显隐 → 条件块

**实现**：新增 `scripts/parametrize_html.py`：
- 输入原 HTML
- 输出 `template.html`（带占位的参数化模板）+ `schema.json`（数据结构定义）+ `default.json`（从原 HTML 提取的默认数据）

**实现步骤**（分小步）：
1. 先只做数据点标记（文本+属性占位），不做循环——验证占位回填能还原原 HTML
2. 再加循环识别——验证循环回填能还原列表结构
3. 最后加条件块

**交付物**：
- `scripts/parametrize_html.py`
- `assets/templates/render.js.j2`（通用渲染器：读模板 + 数据 → 填充 DOM）
- 用往返测试验证：结构等价度应接近 100%

**验收标准**：对 BLACKPINK 和黄月英（不同结构）都能产出非空模板；往返结构等价度 ≥ 95%。

---

## P2：交互与数据契约

### P2-1 交互提取引擎

**做什么**：从原 `<script>` 提取事件绑定，生成"挂载后重新绑定"的轻量 JS。

当前 `lib.js.j2` 重写整套交互，导致"看着像但点不动"。改为提取：
- 扫描 `addEventListener`/`onclick`/`on*` 属性 → 记录 (选择器, 事件, 处理函数体)
- 状态机/动画/轮播定时器 → 原样保留，只把硬编码数据引用换成从 options 取
- 产出 `interactions.js`：在挂载后重新绑定所有事件

**实现**：新增 `scripts/extract_interactions.py`：
- 输入原 JS 文本
- 用正则/AST 提取事件绑定与定时器
- 输出 `interactions.js` + `interactions.json`（绑定清单）

**难点**：JS 是动态语言，纯正则提取有局限。阶段一只支持常见模式（addEventListener、onclick），复杂逻辑（自定义状态机）原样保留并标注"需人工确认"。

**验收标准**：BLACKPINK 的 tab 切换、modal 打开关闭等核心交互可触发；交互等价度 ≥ 80%。

### P2-2 数据契约自动生成

**做什么**：从参数化占位反推数据 schema，并从原 HTML 提取默认值作为示例数据。

用户拿到组件库时，schema 告诉他"换数据要换什么"，示例数据让他能立即跑起来验证。

**实现**：在 `parametrize_html.py` 中，识别占位时同步生成 schema：
```json
{
  "title": { "type": "string", "source": ".title", "default": "BLACKPINK" },
  "members": {
    "type": "array",
    "itemSchema": {
      "name": { "type": "string", "source": ".member .name" },
      "img": { "type": "string", "source": ".member img@src" }
    }
  }
}
```

**验收标准**：schema 完整描述所有占位；default.json 填入模板后能还原原 HTML。

---

## P3：工程化与扩展性

### P3-1 视图类型注册机制

当前 `_classify_view` 是一长串 if-elif，加一个垂类要改核心。改为注册表：

```python
VIEW_CLASSIFIERS = []

def register_view_type(name):
    def deco(fn): VIEW_CLASSIFIERS.append((name, fn)); return fn
    return deco

@register_view_type("member-grid")
def _detect_member_grid(node, css): ...
```

模板侧对应：每个视图类型一个独立 j2 片段，`generate_lib` 按注册表拼装。
新增垂类只需加一个装饰器函数 + 一个 j2 片段，不动核心。

### P3-2 一键 CLI

`scripts/run.py`：`python3 run.py <html> --out <dir>` 自动串联 analyze→generate→validate→roundtrip，失败即停并报错。降低使用门槛，尤其给子代理用。

---

## 落地顺序与里程碑

```
M0 (本周)    P0-1 往返测试基线 + P0-2 单元测试
             ↓ 建立度量与安全网
M1 (下周)    P1-1 样式保留引擎
             ↓ generic 视图不再没样式
M2 (2周)     P1-2 结构参数化引擎（数据点+循环）
             ↓ 任意结构都能产出非空模板
M3 (3周)     P2-1 交互提取 + P2-2 数据契约
             ↓ 产出的库真正可运行
M4 (4周)     P3 工程化 + 全案例往返验收
             ↓ v2 完成
```

每个里程碑的验收都依赖 P0 的往返测试——它是 v2 全程的度量尺。

## 不做的事

- **多框架适配（React/Vue）**：原生 JS 零依赖是卖点，转框架破坏定位。
- **AI 辅助识别**：LLM 理解 HTML 会破坏确定性，同一输入每次结果不同，校验和回归失效。
- **垂类分类**：当前阶段聚焦"根据 HTML 创建"，垂类聚合等 v2 核心能力稳定后再做。
- **可视化 Playground**：浏览器打开 example.html 即可预览，单独做投入产出比低。
