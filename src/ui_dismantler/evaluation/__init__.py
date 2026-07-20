"""Evaluation layer: roundtrip equivalence, batch verification, scenario coverage.

评测层负责度量 agent 产出的组件库与原页面的等价度：
- scenario_coverage.py: 交互覆盖率计算（声明/执行/已验证三层）
- scenario_generator.py: 从 manifest 生成交互场景候选
- roundtrip.py: 往返等价度（结构/文本/交互状态三维对比）
- batch.py: 批量验证调度（find_cases / select_cases / build_command）

原 HTML/CSS/JS 仍是最高优先级的证据来源。
"""
