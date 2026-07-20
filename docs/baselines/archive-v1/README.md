# v1 链路 baselines（已归档，不可复现）

这些 baseline 由 **v1 链路**（analyze_html.py -> generate_lib.py -> Jinja2 模板）产出。
generate_lib.py + 模板已于 Sprint 1-2 删除（agent 直接写代码，不套模板），
因此这些分数**不可复现**，仅作历史记录。

| 案例 | 综合 | 结构 | 文本 | ref_nodes | 备注 |
|---|---|---|---|---|---|
| blackpink | 0.895 | 0.952 | 0.838 | 144 | v1 模板产出，结构分接近 agent 产出 |
| huang-yueying | 0.031 | 0.000 | 0.062 | 18 | v1 generic 兜底，因果链范式未支持 |
| zhishang-tanbing | 0.056 | 0.000 | 0.111 | 5 | v1 generic 兜底，nav+panel 内部未识别 |

<<<<<<< HEAD
当前基线以 `docs/baselines/roundtrip_blackpink_v10_agent.json` 为准（agent 产出）。
=======
当前基线以 `docs/baselines/roundtrip_benchmark_rendered.json` 为准（benchmark 组件库产出）。
>>>>>>> codex/generic-agent-quality
