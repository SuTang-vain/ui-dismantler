# 垂类案例实验资产

本目录说明 `codex/vertical-case-experiments` 分支中的案例资产。它们用于观察多种内容范式下的组件库产出，不属于 `codex/local-agent-quality` 的核心质量基线，也不进入 DesignRepair 专项研究线。

## 资产分组

- `examples/cases/关系图谱01/`：词语关系图谱组件库。
- `examples/cases/时间线+图谱01/`：人物事件与关系图谱组件库。
- `examples/cases/对比分析/`：两个双栏对比案例。
- `examples/cases/影视/`：两个影视内容案例。
- `examples/cases/明星组合/`：BLACKPINK 垂类组件库实验版本。
- `examples/cases/奢香夫人・五大事件与人物关系_v1784040982/`：带原始页面、图片和生成组件库的完整实验样本。
- `examples/cases/qingyu-relations/`：《庆余年》人物关系、剧情因果与作品推荐组件库实验；当前缺少原始输入，不属于完整 roundtrip 案例。
- `examples/girls-generation/`：少女时代组件库与本地图片资产；资源来源见其 `assets/SOURCES.md`。
- `scripts/dismantle_case_verticals.py`：批量确定性提取实验脚本，必须显式传入 `--root`。

## 使用边界

这些案例用于：

1. 比较关系图谱、时间线、对比、影视和明星组合等语义模式；
2. 探索多个同类页面是否能够共享数据契约和渲染骨架；
3. 为后续 detector 插件提供候选样本；
4. 发现通用质量规则在不同内容形态下的误报和漏报。

这些案例不用于证明核心转换器具有通用性。核心能力应由按技术特征组织、可在仓库内复现的测试矩阵验证。

## 批处理脚本

```bash
python3 scripts/dismantle_case_verticals.py --root /path/to/case-root
```

加 `--force` 会覆盖每个垂类目录下已有的 `组件库`，执行前应确认输入目录和已有产物均可重建。

## 历史报告

`docs/baselines/roundtrip_blackpink_latest_agent.json` 来自仓库外的历史输入，仅作为实验记录，不作为可执行回归门槛。稳定质量分支只使用仓库内自包含的 `blackpink-v10` 黄金 fixture。

## 分支边界

- 通用质量规则进入 `codex/local-agent-quality`。
- detector 和通用观察能力进入 `codex/generic-agent-quality`。
- 垂类生成资产和批处理探索保留在本实验分支。
- DesignRepair 的 guideline、finding、repair、verification 研究保持在其专项分支。

本实验分支可以 rebase 到最新通用质量线以复用工具，但垂类资产不得反向合并到
`codex/generic-agent-quality`。可复用能力必须先提炼为中立技术 fixture 和独立提交。
