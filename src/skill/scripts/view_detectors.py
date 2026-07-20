"""可注册的 HTML 视图语义 detector。

Detector 只负责从 DOM/CSS 证据判断视图语义，不负责生成组件库。默认
registry 保持 manifest v1 的既有类型和优先级；调用方可以在不修改核心
分析器的情况下插入新的语义 detector。
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Callable


@dataclass(frozen=True)
class ViewDetection:
    """一次视图识别结果。"""

    semantic_type: str
    structural_type: str
    confidence: float
    evidence: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.semantic_type or not self.structural_type:
            raise ValueError("semantic_type 与 structural_type 不能为空")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence 必须位于 0.0 到 1.0 之间")
        if not self.evidence:
            raise ValueError("detector 结果必须包含至少一条证据")


@dataclass(frozen=True)
class ViewContext:
    """Detector 可读取的稳定输入。"""

    node: Any
    html: str
    css: str


DetectorFn = Callable[[ViewContext], ViewDetection | None]


@dataclass(frozen=True)
class ViewDetector:
    """具名 detector；name 用于排序、插入和诊断。"""

    name: str
    detect: DetectorFn


class ViewDetectorRegistry:
    """按注册顺序运行 detector，首个命中结果获胜。"""

    def __init__(self, detectors: list[ViewDetector] | None = None):
        self._detectors: list[ViewDetector] = []
        for detector in detectors or []:
            self.register(detector)

    @property
    def detectors(self) -> tuple[ViewDetector, ...]:
        return tuple(self._detectors)

    def register(self, detector: ViewDetector, *, before: str | None = None) -> None:
        if any(item.name == detector.name for item in self._detectors):
            raise ValueError(f"detector 已注册: {detector.name}")
        if before is None:
            self._detectors.append(detector)
            return
        for index, item in enumerate(self._detectors):
            if item.name == before:
                self._detectors.insert(index, detector)
                return
        raise ValueError(f"找不到插入目标 detector: {before}")

    def detect(self, node: Any, css: str) -> ViewDetection | None:
        context = ViewContext(node=node, html=str(node), css=css)
        for detector in self._detectors:
            result = detector.detect(context)
            if result is not None:
                return result
        return None


def _result(
    semantic_type: str,
    structural_type: str,
    confidence: float,
    *evidence: str,
) -> ViewDetection:
    return ViewDetection(
        semantic_type=semantic_type,
        structural_type=structural_type,
        confidence=confidence,
        evidence=tuple(evidence),
    )


def _detect_carousel_3d(context: ViewContext) -> ViewDetection | None:
    if re.search(r"is-center|is-prev-side|is-next-side", context.html) and "perspective" in context.css:
        return _result("carousel-3d", "collection", 0.98, "class:carousel-position", "css:perspective")
    if re.search(r"works?-?(carousel|slider|stage)", context.html, re.I) and "perspective" in context.css:
        return _result("carousel-3d", "collection", 0.94, "class:works-carousel", "css:perspective")
    return None


def _detect_timeline(context: ViewContext) -> ViewDetection | None:
    if re.search(r"time-?line|tl-?(track|item|scroll)", context.html, re.I):
        return _result("timeline", "sequence", 0.96, "class:timeline")
    if context.node.find("time") and "scroll-snap" in context.css:
        return _result("timeline", "sequence", 0.86, "element:time", "css:scroll-snap")
    return None


def _detect_member_grid(context: ViewContext) -> ViewDetection | None:
    if re.search(r"member-?(grid|list|stage|area)", context.html, re.I):
        return _result("member-grid", "collection", 0.96, "class:member-collection")
    if context.node.find(class_=re.compile(r"member", re.I)):
        return _result("member-grid", "collection", 0.78, "descendant-class:member")
    return None


def _detect_detail_panel(context: ViewContext) -> ViewDetection | None:
    if re.search(r"detail-?(panel|card|aside)", context.html, re.I):
        return _result("detail-panel", "content-region", 0.94, "class:detail-panel")
    if context.node.get("aria-live") == "polite":
        return _result("detail-panel", "content-region", 0.72, "aria-live:polite")
    return None


def _detect_quiz(context: ViewContext) -> ViewDetection | None:
    if re.search(r"\bqz-?(top|body|next|fb|result|opts)|\bquiz\b|\bqt\b|\bq-title\b", context.html, re.I):
        return _result("quiz", "form", 0.94, "class:quiz")
    if context.node.find(class_=re.compile(r"\bopt\b|qz-(?:next|result|fb)", re.I)) and \
       context.node.find(class_=re.compile(r"q(?:t|title|no)", re.I)):
        return _result("quiz", "form", 0.84, "class:question", "class:option")
    return None


def _detect_comparison(context: ViewContext) -> ViewDetection | None:
    if re.search(r"whatif-card|cmp-(?:btn|pop)|\bcmp\b", context.html, re.I):
        return _result("comparison", "content-region", 0.93, "class:comparison")
    if context.node.find(class_=re.compile(r"\bcol-[ab]\b|\bcol\b", re.I)) and \
       context.node.find(class_=re.compile(r"real|alt", re.I)):
        return _result("comparison", "content-region", 0.82, "columns:a-b", "variants:real-alt")
    return None


def _detect_splash(context: ViewContext) -> ViewDetection | None:
    if re.search(r"\bsplash-?(?:cta|opt|question|options|start)\b", context.html, re.I):
        return _result("splash", "overlay", 0.92, "class:splash-control")
    return None


def default_view_detector_registry() -> ViewDetectorRegistry:
    """创建互不共享可变状态的默认 registry。"""

    return ViewDetectorRegistry([
        ViewDetector("carousel-3d", _detect_carousel_3d),
        ViewDetector("timeline", _detect_timeline),
        ViewDetector("member-grid", _detect_member_grid),
        ViewDetector("detail-panel", _detect_detail_panel),
        ViewDetector("quiz", _detect_quiz),
        ViewDetector("comparison", _detect_comparison),
        ViewDetector("splash", _detect_splash),
    ])
