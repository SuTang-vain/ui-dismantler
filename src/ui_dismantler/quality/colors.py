"""Auditable WCAG color parsing, alpha compositing, and contrast math."""
from __future__ import annotations
import re
from typing import Any

RGBA = tuple[float, float, float, float]
_RGB_RE = re.compile(r"^rgba?\((.*)\)$", re.IGNORECASE)
_HEX_RE = re.compile(r"^#([0-9a-f]{3,8})$", re.IGNORECASE)


def _channel(value: str) -> float | None:
    value = value.strip()
    try:
        if value.endswith("%"):
            number = float(value[:-1]) * 2.55
        else:
            number = float(value)
    except ValueError:
        return None
    return max(0.0, min(255.0, number))


def _alpha(value: str) -> float | None:
    value = value.strip()
    try:
        number = float(value[:-1]) / 100.0 if value.endswith("%") else float(value)
    except ValueError:
        return None
    return max(0.0, min(1.0, number))


def parse_css_color(value: Any) -> RGBA | None:
    """Parse browser-computed rgb/rgba plus hex fixture values; reject ambiguity."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().lower()
    if text == "transparent":
        return (0.0, 0.0, 0.0, 0.0)
    match = _HEX_RE.match(text)
    if match:
        raw = match.group(1)
        if len(raw) in (3, 4):
            raw = "".join(char * 2 for char in raw)
        if len(raw) not in (6, 8):
            return None
        channels = [int(raw[index:index + 2], 16) for index in range(0, len(raw), 2)]
        alpha = channels[3] / 255.0 if len(channels) == 4 else 1.0
        return (float(channels[0]), float(channels[1]), float(channels[2]), alpha)
    match = _RGB_RE.match(text)
    if not match:
        return None
    body = match.group(1).strip()
    if "," in body:
        parts = [part.strip() for part in body.split(",")]
        if len(parts) not in (3, 4):
            return None
        rgb_parts, alpha_part = parts[:3], parts[3] if len(parts) == 4 else "1"
    else:
        if "/" in body:
            rgb_text, alpha_part = body.split("/", 1)
        else:
            rgb_text, alpha_part = body, "1"
        rgb_parts = rgb_text.split()
        if len(rgb_parts) != 3:
            return None
    rgb = [_channel(part) for part in rgb_parts]
    alpha = _alpha(alpha_part)
    if any(part is None for part in rgb) or alpha is None:
        return None
    return (float(rgb[0]), float(rgb[1]), float(rgb[2]), alpha)


def composite(foreground: RGBA, background: RGBA) -> RGBA:
    """Source-over alpha composition in sRGB channel space."""
    output_alpha = foreground[3] + background[3] * (1.0 - foreground[3])
    if output_alpha <= 0:
        return (0.0, 0.0, 0.0, 0.0)
    channels = tuple(
        (foreground[index] * foreground[3]
         + background[index] * background[3] * (1.0 - foreground[3]))
        / output_alpha
        for index in range(3)
    )
    return (channels[0], channels[1], channels[2], output_alpha)


def resolve_background(color_context: dict[str, Any]) -> tuple[RGBA | None, str | None]:
    """Resolve ancestor background layers over the browser's white canvas.

    Any image/gradient, opacity, blend, backdrop filter, or unparsable color is
    intentionally uncertain and therefore returns no color.
    """
    if not isinstance(color_context, dict):
        return None, "missing-color-context"
    layers = color_context.get("backgroundLayers")
    if not isinstance(layers, list) or not layers:
        return None, "missing-background-layers"
    if color_context.get("backgroundTruncated"):
        return None, "background-chain-truncated"
    parsed: list[RGBA] = []
    for layer in layers:
        if not isinstance(layer, dict):
            return None, "invalid-background-layer"
        if str(layer.get("backgroundImage") or "none").strip().lower() != "none":
            return None, "background-image"
        if str(layer.get("mixBlendMode") or "normal").strip().lower() != "normal":
            return None, "mix-blend-mode"
        if str(layer.get("backdropFilter") or "none").strip().lower() != "none":
            return None, "backdrop-filter"
        try:
            opacity = float(layer.get("opacity", "1"))
        except (TypeError, ValueError):
            return None, "invalid-opacity"
        if abs(opacity - 1.0) > 1e-9:
            return None, "ancestor-opacity"
        color = parse_css_color(layer.get("backgroundColor"))
        if color is None:
            return None, "unparsed-background-color"
        parsed.append(color)
        # A fully opaque nearer background hides all farther ancestors.
        if color[3] >= 1.0:
            break
    result: RGBA = (255.0, 255.0, 255.0, 1.0)
    for color in reversed(parsed):
        result = composite(color, result)
    return result, None


def relative_luminance(color: RGBA) -> float:
    def linear(channel: float) -> float:
        value = channel / 255.0
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
    return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2])


def contrast_ratio(first: RGBA, second: RGBA) -> float:
    first_luminance = relative_luminance(first)
    second_luminance = relative_luminance(second)
    lighter, darker = max(first_luminance, second_luminance), min(first_luminance, second_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def resolved_text_contrast(observation: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """Return contrast evidence or a stable uncertainty reason."""
    context = observation.get("colorContext")
    background, reason = resolve_background(context)
    if background is None:
        return None, reason
    foreground = parse_css_color((context or {}).get("foreground") or (observation.get("computedStyle") or {}).get("color"))
    if foreground is None:
        return None, "unparsed-foreground-color"
    foreground = composite(foreground, background)
    return {
        "foreground": [round(value, 4) for value in foreground],
        "background": [round(value, 4) for value in background],
        "ratio": round(contrast_ratio(foreground, background), 4),
    }, None
