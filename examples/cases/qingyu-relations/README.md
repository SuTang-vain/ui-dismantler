# Qingyu Relations 垂类实验

本目录保存《庆余年》人物关系图谱、剧情因果与作品推荐组件库实验，仅属于
`codex/vertical-case-experiments`，不作为通用质量线的黄金回归案例。

## 当前状态

- `lib/`：数据驱动组件库、示例页、复用模板与设计规范；
- `images/`：示例页使用的本地图片资产；
- `tools/dump_got_tree.mjs`：用于检查组件库运行后 DOM 的临时诊断工具。

当前样本没有可独立复现的原始输入页面，因此不能执行原页面与组件库之间的
roundtrip，也没有正式的 `manifest.json` 或 `scenarios.json`。在补齐原始输入前，
它只用于观察关系图谱、横向因果图和多分类作品推荐的组件抽象与交互实现。

## 可执行检查

从仓库根目录运行：

```bash
python3 src/skill/scripts/validate_lib.py examples/cases/qingyu-relations/lib
node --check examples/cases/qingyu-relations/lib/src/char-story-graph.js
node --check examples/cases/qingyu-relations/tools/dump_got_tree.mjs
```

安装仓库 Node 依赖后，可输出组件挂载后的简化 DOM 树：

```bash
node examples/cases/qingyu-relations/tools/dump_got_tree.mjs
```

## 晋级条件

只有补齐以下资产并通过确定性验证后，才可将本样本登记为完整案例：

1. 可在仓库内独立运行的 `original.html` 及其本地资源；
2. analyzer 生成的 `manifest.json`；
3. 覆盖 Tab、角色详情、剧情弹窗、作品分类和移动 viewport 的正式场景；
4. roundtrip 状态矩阵、交互覆盖率和连续运行稳定性报告。
