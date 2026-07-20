"""Analysis layer: HTML structure, view detection, data contract extraction.

分析层负责把原始 HTML 解析为标准化的 manifest.json，包含：
- HtmlAnalyzer：HTML → manifest 主分析器
- detectors：可注册的视图语义 detector 框架
"""
