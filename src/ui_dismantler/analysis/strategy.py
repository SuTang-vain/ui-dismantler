"""页面规模感知的 HTML 分析策略路由。

页面大小不是质量的充分条件，但它是决定分析上下文、拆解粒度和验证顺序的
低成本先验。本模块只做确定性的规模/复杂度盘点，不执行 JS、不请求网络，
输出可解释的策略计划供分析器、agent 拆解流程和后续验证复用。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Literal


PageScale = Literal["compact", "standard", "large", "massive"]
StrategyOverride = Literal["auto", "compact", "standard", "large", "massive"]


@dataclass(frozen=True)
class PageMetrics:
    """分析前的轻量页面画像。所有值均可由原始文件确定性得到。"""

    file_bytes: int
    html_chars: int
    tag_count: int
    script_count: int
    style_count: int
    link_count: int
    inline_script_bytes: int
    inline_style_bytes: int
    external_resource_count: int
    utility_class_count: int
    tailwind_signal: bool
    framework_signal: bool
    dynamic_signal: bool

    @property
    def embedded_asset_bytes(self) -> int:
        return self.inline_script_bytes + self.inline_style_bytes

    @property
    def estimated_tokens(self) -> int:
        # 仅作路由估计，不作为模型计费或质量指标。
        return max(1, round(self.html_chars / 3.0))

    def to_dict(self) -> dict:
        return {
            "fileBytes": self.file_bytes,
            "htmlChars": self.html_chars,
            "estimatedTokens": self.estimated_tokens,
            "tagCount": self.tag_count,
            "scriptCount": self.script_count,
            "styleCount": self.style_count,
            "linkCount": self.link_count,
            "inlineScriptBytes": self.inline_script_bytes,
            "inlineStyleBytes": self.inline_style_bytes,
            "embeddedAssetBytes": self.embedded_asset_bytes,
            "externalResourceCount": self.external_resource_count,
            "utilityClassCount": self.utility_class_count,
            "tailwindSignal": self.tailwind_signal,
            "frameworkSignal": self.framework_signal,
            "dynamicSignal": self.dynamic_signal,
        }


@dataclass(frozen=True)
class AnalysisStrategy:
    """策略路由结果，明确分析/拆解/验证阶段，而非只返回一个 size 标签。"""

    name: PageScale
    source: Literal["auto", "override"]
    reason: tuple[str, ...]
    passes: tuple[str, ...]
    dismantle_mode: str
    verification_mode: str
    css_evidence_mode: str

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "source": self.source,
            "reason": list(self.reason),
            "passes": list(self.passes),
            "dismantleMode": self.dismantle_mode,
            "verificationMode": self.verification_mode,
            "cssEvidenceMode": self.css_evidence_mode,
        }


def inspect_html(path: str | Path) -> PageMetrics:
    """读取 HTML 做轻量盘点；不构造 BeautifulSoup，也不执行页面脚本。"""
    html_path = Path(path).resolve()
    raw = html_path.read_bytes()
    text = raw.decode("utf-8", errors="replace")

    script_blocks = re.findall(r"<script\b[^>]*>([\s\S]*?)</script\s*>", text, re.I)
    style_blocks = re.findall(r"<style\b[^>]*>([\s\S]*?)</style\s*>", text, re.I)
    external_resources = re.findall(
        r"<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*[\"']?([a-z][a-z0-9+.-]*:|//)",
        text,
        re.I,
    )
    utility_classes = re.findall(
        r"(?:[a-z0-9-]+:)?(?:hover:|focus:|active:|disabled:)?[a-z][a-z0-9-]*(?:\[[^\]]+\])?",
        " ".join(re.findall(r"class\s*=\s*[\"']([^\"']*)[\"']", text, re.I)),
        re.I,
    )
    utility_signal = len(utility_classes)
    tailwind_signal = bool(
        re.search(r"--tw-|@layer\s+(?:theme|utilities|components)|tailwind|(?:sm|md|lg|xl|2xl):", text, re.I)
    )
    framework_signal = bool(
        re.search(r"__next|data-reactroot|next-route-announcer|react|vue|svelte|astro", text, re.I)
    )
    dynamic_signal = bool(
        re.search(
            r"addEventListener|onclick\s*=|on(?:input|change|submit|keydown)\s*=|querySelector|createElement",
            text,
            re.I,
        )
    )
    return PageMetrics(
        file_bytes=len(raw),
        html_chars=len(text),
        tag_count=len(re.findall(r"<\s*[a-z][^>]*>", text, re.I)),
        script_count=len(re.findall(r"<script\b", text, re.I)),
        style_count=len(re.findall(r"<style\b", text, re.I)),
        link_count=len(re.findall(r"<link\b", text, re.I)),
        inline_script_bytes=sum(len(block.encode("utf-8")) for block in script_blocks),
        inline_style_bytes=sum(len(block.encode("utf-8")) for block in style_blocks),
        external_resource_count=len(external_resources),
        utility_class_count=utility_signal,
        tailwind_signal=tailwind_signal,
        framework_signal=framework_signal,
        dynamic_signal=dynamic_signal,
    )


def _auto_scale(metrics: PageMetrics) -> tuple[PageScale, list[str]]:
    reasons: list[str] = []
    # massive 优先：任何单项超过阈值都应避免把整页作为一个模型上下文。
    if (
        metrics.file_bytes > 2 * 1024 * 1024
        or metrics.embedded_asset_bytes > 1.5 * 1024 * 1024
        or metrics.tag_count > 20_000
        or metrics.estimated_tokens > 700_000
    ):
        if metrics.file_bytes > 2 * 1024 * 1024:
            reasons.append("文件超过 2 MiB")
        if metrics.embedded_asset_bytes > 1.5 * 1024 * 1024:
            reasons.append("内嵌 CSS/JS 超过 1.5 MiB")
        if metrics.tag_count > 20_000:
            reasons.append("DOM 标签超过 20,000")
        return "massive", reasons

    # large 不只看字节：Tailwind utility/框架辅助节点会显著增加拆解噪音。
    if (
        metrics.file_bytes > 512 * 1024
        or metrics.embedded_asset_bytes > 512 * 1024
        or metrics.tag_count > 5_000
        or (metrics.tailwind_signal and metrics.utility_class_count > 250)
        or (metrics.framework_signal and metrics.file_bytes > 256 * 1024)
    ):
        if metrics.file_bytes > 512 * 1024:
            reasons.append("文件超过 512 KiB")
        if metrics.embedded_asset_bytes > 512 * 1024:
            reasons.append("内嵌 CSS/JS 超过 512 KiB")
        if metrics.tag_count > 5_000:
            reasons.append("DOM 标签超过 5,000")
        if metrics.tailwind_signal and metrics.utility_class_count > 250:
            reasons.append("Tailwind utility 类较密集")
        if metrics.framework_signal and metrics.file_bytes > 256 * 1024:
            reasons.append("检测到框架运行时/辅助节点")
        return "large", reasons

    if metrics.file_bytes <= 128 * 1024 and metrics.tag_count <= 1_000 and metrics.embedded_asset_bytes <= 128 * 1024:
        reasons.append("文件、DOM 和内嵌资源均处于紧凑范围")
        return "compact", reasons

    reasons.append("未达到 compact/large 阈值，采用标准双阶段分析")
    return "standard", reasons


def _strategy_for_scale(scale: PageScale, source: Literal["auto", "override"], reason: list[str]) -> AnalysisStrategy:
    plans = {
        "compact": AnalysisStrategy(
            scale, source, tuple(reason),
            ("full-parse", "theme-structure-data", "interaction-inventory"),
            "single-pass-component",
            "full-roundtrip-and-interaction",
            "static-selector-extraction",
        ),
        "standard": AnalysisStrategy(
            scale, source, tuple(reason),
            ("page-inventory", "structure-and-data", "interaction-inventory"),
            "two-pass-section-aware",
            "roundtrip-plus-scenarios",
            "static-plus-computed-sampling",
        ),
        "large": AnalysisStrategy(
            scale, source, tuple(reason),
            ("resource-inventory", "semantic-skeleton", "section-chunks", "token-clusters", "interaction-candidates"),
            "skeleton-then-section-chunks",
            "rendered-reference-late-and-candidate-gated",
            "cdp-matched-styles-recommended",
        ),
        "massive": AnalysisStrategy(
            scale, source, tuple(reason),
            ("streaming-inventory", "section-boundaries", "bounded-chunks", "deferred-data-contract", "interaction-candidates"),
            "streaming-section-chunks",
            "sampled-render-then-promoted-gold",
            "cdp-matched-styles-required-if-available",
        ),
    }
    return plans[scale]


def choose_analysis_strategy(metrics: PageMetrics, override: StrategyOverride = "auto") -> AnalysisStrategy:
    """按规模/复杂度路由；显式 override 用于实验对照。"""
    if override not in {"auto", "compact", "standard", "large", "massive"}:
        raise ValueError(f"未知分析策略: {override}")
    if override == "auto":
        scale, reasons = _auto_scale(metrics)
        return _strategy_for_scale(scale, "auto", reasons)
    return _strategy_for_scale(override, "override", [f"显式指定策略: {override}"])
