"""Bounded Playwright collection of geometry and computed-style observations."""
from __future__ import annotations
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse
from ..schema import QUALITY_SCHEMA_VERSION, validate_render_observation
from ...uiir.schema import NODE_TYPES
from ...uiir.validation import validate_uiir

DEFAULT_VIEWPORTS = (
    {"id": "desktop", "width": 1280, "height": 720},
    {"id": "wise", "width": 390, "height": 844},
)
STYLE_FIELDS = (
    "display", "visibility", "opacity", "color", "backgroundColor",
    "fontSize", "lineHeight", "fontWeight", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "marginTop", "marginRight",
    "marginBottom", "marginLeft", "gap", "overflow", "overflowX",
    "overflowY", "position", "zIndex", "outlineStyle", "outlineWidth",
)


def _normalize_viewports(viewports: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    raw = list(viewports) if viewports is not None else [dict(item) for item in DEFAULT_VIEWPORTS]
    if not raw or len(raw) > 8:
        raise ValueError("viewports must contain between 1 and 8 entries")
    result: list[dict[str, Any]] = []
    ids: set[str] = set()
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"viewports[{index}] must be an object")
        viewport_id = str(item.get("id") or f"viewport-{index + 1}").strip()
        width, height = item.get("width"), item.get("height")
        if not viewport_id or viewport_id in ids:
            raise ValueError(f"viewports[{index}].id must be unique and non-empty")
        if any(isinstance(value, bool) or not isinstance(value, int) or not 200 <= value <= 4096 for value in (width, height)):
            raise ValueError(f"viewports[{index}] dimensions must be integers between 200 and 4096")
        ids.add(viewport_id); result.append({"id": viewport_id, "width": width, "height": height})
    return result


def targets_from_uiir(document: dict[str, Any], *, limit: int = 256) -> list[dict[str, str]]:
    """Extract explicit selector/reference/id targets without guessing from prose."""
    errors = validate_uiir(document)
    if errors:
        raise ValueError("invalid UI-IR: " + "; ".join(errors))
    if not 1 <= limit <= 1024:
        raise ValueError("target limit must be between 1 and 1024")
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for node in document["nodes"]:
        if NODE_TYPES[node[1]] not in {"component", "element", "region"}:
            continue
        props = node[3]
        selector = props.get("selector", props.get("reference"))
        if not isinstance(selector, str) or not selector.strip():
            element_id = props.get("id")
            if isinstance(element_id, str) and element_id.strip() and all(ch.isalnum() or ch in "_-" for ch in element_id):
                selector = f"#{element_id}"
        if not isinstance(selector, str) or not selector.strip():
            continue
        key = (props["key"], selector.strip())
        if key in seen:
            continue
        seen.add(key); result.append({"targetKey": key[0], "selector": key[1]})
        if len(result) >= limit:
            break
    return result


def _empty(source: Path, targets: list[dict[str, str]], viewports: list[dict[str, Any]]) -> dict[str, Any]:
    return {"schemaVersion": QUALITY_SCHEMA_VERSION, "format": "render-observation", "source": str(source), "targets": targets, "viewports": viewports, "observations": [], "browser": None}


def observe_render(
    source_path: str | Path,
    targets: list[dict[str, str]],
    *,
    viewports: list[dict[str, Any]] | None = None,
    timeout_ms: int = 5000,
    settle_ms: int = 100,
    max_targets: int = 256,
) -> tuple[dict[str, Any], list[str]]:
    """Observe explicit local-page targets; network requests are always blocked."""
    source = Path(source_path).expanduser().resolve()
    normalized_viewports = _normalize_viewports(viewports)
    if not source.is_file() or source.suffix.lower() not in {".html", ".htm"}:
        return _empty(source, [], normalized_viewports), [f"render source is not a local HTML file: {source}"]
    if timeout_ms < 100 or settle_ms < 0:
        raise ValueError("timeout_ms must be >= 100 and settle_ms must be >= 0")
    if not 1 <= max_targets <= 1024:
        raise ValueError("max_targets must be between 1 and 1024")
    normalized_targets: list[dict[str, str]] = []
    for index, item in enumerate(targets[:max_targets]):
        if not isinstance(item, dict) or not str(item.get("targetKey") or "").strip() or not str(item.get("selector") or "").strip():
            raise ValueError(f"targets[{index}] must contain targetKey and selector")
        normalized_targets.append({"targetKey": str(item["targetKey"])[:512], "selector": str(item["selector"])[:512]})
    result = _empty(source, normalized_targets, normalized_viewports)
    warnings: list[str] = []
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return result, [f"Playwright unavailable; render observation skipped: {exc}"]
    script = """args => {
      const output = [];
      for (const item of args.targets) {
        let element = null;
        try { element = document.querySelector(item.selector); }
        catch (error) { output.push({...item, error: 'invalid-selector'}); continue; }
        if (!element) { output.push({...item, error: 'not-found'}); continue; }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const computedStyle = {};
        for (const field of args.styleFields) computedStyle[field] = style[field] || '';
        const visible = !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        const clipped = rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
        output.push({...item, tag: element.tagName.toLowerCase(), role: element.getAttribute('role') || '', accessibleName: element.getAttribute('aria-label') || element.innerText.trim().slice(0, 200), bounds: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}, computedStyle, visible, clipped});
      }
      return output;
    }"""
    browser = None
    try:
        with sync_playwright() as playwright:
            launch_errors: list[str] = []
            for name in ("chromium", "webkit", "firefox"):
                try:
                    browser = getattr(playwright, name).launch(headless=True); result["browser"] = name; break
                except Exception as exc:
                    launch_errors.append(f"{name}: {exc}")
            if browser is None:
                return result, ["unable to launch Playwright browser: " + " | ".join(launch_errors)]
            for viewport in normalized_viewports:
                context = browser.new_context(viewport={"width": viewport["width"], "height": viewport["height"]}, service_workers="block")
                page = context.new_page()
                def route_request(route: Any) -> None:
                    parsed = urlparse(route.request.url)
                    if parsed.scheme in {"http", "https"}:
                        route.abort(); return
                    if parsed.scheme == "file":
                        requested = Path(unquote(parsed.path)).resolve()
                        allowed_root = source.parent.resolve()
                        if not requested.is_file() or (requested != source and allowed_root not in requested.parents):
                            route.abort(); return
                    route.continue_()
                page.route("**/*", route_request)
                try:
                    page.goto(source.as_uri(), wait_until="domcontentloaded", timeout=timeout_ms)
                    page.wait_for_timeout(settle_ms)
                    raw = page.evaluate(script, {"targets": normalized_targets, "styleFields": STYLE_FIELDS})
                    for item in raw if isinstance(raw, list) else []:
                        if item.get("error"):
                            warnings.append(f"{viewport['id']} {item.get('targetKey')}: {item['error']}"); continue
                        observation = {"targetKey": item["targetKey"], "selector": item["selector"], "viewportKey": viewport["id"], "viewport": {"width": viewport["width"], "height": viewport["height"]}, "tag": item.get("tag", ""), "role": item.get("role", ""), "accessibleName": item.get("accessibleName", ""), "bounds": item["bounds"], "computedStyle": item["computedStyle"], "visible": bool(item["visible"]), "clipped": bool(item["clipped"])}
                        errors = validate_render_observation(observation)
                        if errors: warnings.append(f"{viewport['id']} {item['targetKey']}: {'; '.join(errors)}")
                        else: result["observations"].append(observation)
                except Exception as exc:
                    warnings.append(f"{viewport['id']} observation failed: {type(exc).__name__}: {exc}")
                finally:
                    context.close()
            browser.close(); browser = None
    except Exception as exc:
        warnings.append(f"render observation failed: {type(exc).__name__}: {exc}")
        if browser is not None:
            try: browser.close()
            except Exception: pass
    return result, warnings
