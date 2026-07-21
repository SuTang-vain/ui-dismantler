"""Analysis layer: HTML structure, view detection, and scale-aware routing.

分析层负责把原始 HTML 解析为标准化的 manifest.json，包含：
- HtmlAnalyzer：HTML → manifest 主分析器
- strategy：页面规模/复杂度 → 分析与拆解策略
- sections：large/massive 页面有界 section inventory
- chunks：page-plan、section fragments 与可选 CDP evidence 产物
- contracts：基于 section/浏览器证据的可审查组件契约提示
- detectors：可注册的视图语义 detector 框架
"""
