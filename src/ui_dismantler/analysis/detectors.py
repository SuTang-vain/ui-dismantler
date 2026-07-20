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
    """Detector 可读取的稳定输入。

    Attributes:
        node: 被检测的 DOM 节点（BeautifulSoup Tag）。
        html: 节点序列化后的 HTML 字符串（方便正则匹配）。
        css: 页面合并后的 CSS 文本。
        scripts: 页面 <script> 内容数组（用于检查 JS 数据契约关键字，
            如 causeChain / whatIf / NODES）。默认空 tuple，旧调用方无需改动。
    """

    node: Any
    html: str
    css: str
    scripts: tuple[str, ...] = ()


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

    def detect(
        self,
        node: Any,
        css: str,
        scripts: tuple[str, ...] = (),
    ) -> ViewDetection | None:
        """运行所有 detector，首个命中结果获胜。

        Args:
            node: 被检测的 DOM 节点。
            css: 页面 CSS 文本。
            scripts: 页面 <script> 内容数组（传给 detector 用于检查 JS 关键字）。
        """
        context = ViewContext(node=node, html=str(node), css=css, scripts=scripts)
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


def _detect_cause_chain(context: ViewContext) -> ViewDetection | None:
    """因果链范式：timeline-nav + 因果链数据/whatif。

    典型形态：奢香夫人/黄月英类页面——顶部时间线导航 + 因果链 JS 数据
    + 可选的 whatif 假设分支。需同时具备时间线导航和因果链信号才命中
    （避免与单纯 timeline 误判）。
    """
    has_timeline_nav = re.search(r"timeline-?nav", context.html, re.I) is not None
    if not has_timeline_nav:
        return None
    scripts_blob = "\n".join(context.scripts)
    has_cause_chain = (
        "causeChain" in scripts_blob
        or re.search(r"cause-?chain", context.html, re.I) is not None
    )
    has_whatif = (
        re.search(r"whatif", context.html, re.I) is not None
        or "whatIf" in scripts_blob
    )
    if not (has_cause_chain or has_whatif):
        return None
    evidence = ["class:timeline-nav"]
    if has_cause_chain:
        evidence.append("data:causeChain")
    if has_whatif:
        evidence.append("signal:whatif")
    confidence = 0.95 if (has_cause_chain and has_whatif) else 0.88
    return _result("cause-chain", "sequence", confidence, *evidence)


def _detect_nav_panel(context: ViewContext) -> ViewDetection | None:
    """导航+面板范式：nav 容器内 >=2 个触发器（data-p/data-tab）+ >=2 个面板。

    典型形态：纸上谈兵类页面——nav 里有多个 data-p 触发器，下方对应多个
    .panel 面板。需同时满足触发器和面板的最低数量才命中。
    """
    nav = context.node.find(class_=re.compile(r"^nav$", re.I)) or context.node.find("nav")
    if not nav:
        return None
    triggers = nav.find_all(attrs={"data-p": True}) or nav.find_all(attrs={"data-tab": True})
    if len(triggers) < 2:
        return None
    panels = context.node.find_all(class_=re.compile(r"panel", re.I))
    if len(panels) < 2:
        return None
    return _result(
        "nav-panel", "content-region", 0.92,
        f"nav-triggers:{len(triggers)}", f"panels:{len(panels)}",
    )


def _detect_graph(context: ViewContext) -> ViewDetection | None:
    """关系图谱范式：svg 连线 + 节点定位类名 + 图谱 JS 数据。

    典型形态：庆余年人物关系图谱、谢天子关系图、奢香夫人关系视图。

    支持三种识别路径（按强度递降）:
    1. svg + node 类名 + 图谱数据 → confidence 0.95（完整证据）
    2. svg 或 node 类名 + 图谱数据 → confidence 0.85（部分 DOM 证据）
    3. 仅强图谱数据信号（nodes:/NODES/relTypes/CharStoryGraph）→ confidence 0.75
       （数据驱动图谱，DOM 未渲染时的兜底识别）

    JS 信号兼容多种命名约定（案例实测）:
    - ``NODES``（experimental 原始案例）
    - ``nodes:`` / ``nodes =``（谢天子 graph.nodes 结构）
    - ``relTypes`` / ``CharStoryGraph.mount``（庆余年数据驱动 API）
    """
    svg = context.node.find("svg")
    has_node_class = context.node.find(class_=re.compile(r"gnd|node|graph", re.I)) is not None
    scripts_blob = "\n".join(context.scripts)
    # JS 图谱数据信号（兼容多种命名约定，案例实测）:
    # - NODES（experimental 原始案例）
    # - nodes: / nodes =（谢天子 graph.nodes 结构）
    # - relTypes / CharStoryGraph（庆余年数据驱动 API）
    # - nodeState / buildGraph（奢香夫人，驼峰命名 + 函数式）
    graph_data_tokens = (
        "NODES", "nodes:", "nodes =", "relTypes", "CharStoryGraph",
        "nodeState", "buildGraph",
    )
    has_graph_data = any(token in scripts_blob for token in graph_data_tokens)

    # 路径 1+2：有 DOM 证据（svg 或 node 类名）+ 数据 → 命中
    if (svg or has_node_class) and has_graph_data:
        evidence = []
        if svg:
            evidence.append("element:svg")
        if has_node_class:
            evidence.append("class:graph-node")
        evidence.append("data:graph-nodes")
        confidence = 0.95 if (svg and has_node_class) else 0.85
        return _result("graph", "collection", confidence, *evidence)

    # 路径 3：无 DOM 证据但有强图谱数据信号（数据驱动，DOM 未渲染）
    if not svg and not has_node_class:
        graph_keywords = [tok for tok in graph_data_tokens if tok in scripts_blob]
        if graph_keywords:
            # 进一步确认：有 mount 调用、Graph 函数、或 svg 生成代码
            mount_signal = any(
                tok in scripts_blob for tok in (".mount(", "Graph", "graph")
            )
            if mount_signal:
                return _result(
                    "graph", "collection", 0.75,
                    f"data:graph-keywords:{','.join(graph_keywords[:2])}",
                    "signal:mount-api",
                )
    return None


def default_view_detector_registry() -> ViewDetectorRegistry:
    """创建互不共享可变状态的默认 registry。

    detector 顺序遵循"越具体越靠前"原则：先识别有强信号的复合范式
    （carousel/cause-chain/nav-panel/graph，它们要求多个信号同时存在），
    再识别单一信号的范式（timeline/member-grid/detail-panel/quiz/comparison/splash）。

    特别注意：cause-chain 必须在 timeline 之前，因为 timeline 的正则
    会匹配到 cause-chain 的 timeline-nav 类名，但 cause-chain 要求
    额外的因果链/whatif 信号，是更具体的判断。
    """

    return ViewDetectorRegistry([
        ViewDetector("carousel-3d", _detect_carousel_3d),
        ViewDetector("cause-chain", _detect_cause_chain),
        ViewDetector("nav-panel", _detect_nav_panel),
        ViewDetector("graph", _detect_graph),
        ViewDetector("timeline", _detect_timeline),
        ViewDetector("member-grid", _detect_member_grid),
        ViewDetector("detail-panel", _detect_detail_panel),
        ViewDetector("quiz", _detect_quiz),
        ViewDetector("comparison", _detect_comparison),
        ViewDetector("splash", _detect_splash),
    ])
