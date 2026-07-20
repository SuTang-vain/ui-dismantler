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
    {"id": "reflow", "width": 320, "height": 800},
)
STYLE_FIELDS = (
    "display", "visibility", "opacity", "color", "backgroundColor",
    "fontSize", "lineHeight", "fontWeight", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "marginTop", "marginRight",
    "marginBottom", "marginLeft", "gap", "overflow", "overflowX",
    "overflowY", "position", "zIndex", "outlineStyle", "outlineWidth",
    "outlineColor", "outlineOffset", "boxShadow", "borderTopWidth",
    "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
    "textDecorationLine", "textDecorationColor", "textDecorationThickness",
    "transform", "filter",
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


def _build_observation(item: dict[str, Any], viewport: dict[str, Any]) -> dict[str, Any]:
    """Normalize one browser payload without dropping optional evidence contexts."""
    return {
        "targetKey": item["targetKey"], "selector": item["selector"],
        "viewportKey": viewport["id"], "viewport": {"width": viewport["width"], "height": viewport["height"]},
        "tag": item.get("tag", ""), "role": item.get("role", ""),
        "interactive": bool(item.get("interactive")), "disabled": bool(item.get("disabled")),
        "textContent": item.get("textContent", ""), "colorContext": item.get("colorContext", {}),
        "stateContext": item.get("stateContext", {}), "layoutContext": item.get("layoutContext", {}),
        "keyboardContext": item.get("keyboardContext", {}),
        "focusContext": item.get("focusContext", {}), "accessibleName": item.get("accessibleName", ""),
        "bounds": item["bounds"], "computedStyle": item["computedStyle"],
        "visible": bool(item["visible"]), "clipped": bool(item["clipped"]),
    }


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
      const focusFields = args.focusFields;
      function styleRecord(target, scope, pseudo = null) {
        const style = getComputedStyle(target, pseudo);
        const values = {};
        for (const field of focusFields) values[field] = style[field] || '';
        values.content = pseudo ? (style.content || '') : '';
        return {scope, style: values};
      }
      function isVisiblyRendered(target) {
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        return !target.hidden && target.getAttribute('aria-hidden') !== 'true'
          && style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
          && target.getClientRects().length > 0;
      }
      function stateSnapshot(target) {
        const controls = (target.getAttribute('aria-controls') || '').trim().split(/\\s+/).filter(Boolean);
        const controlledTargets = controls.slice(0, 16).map(id => {
          const controlled = document.getElementById(id);
          if (!controlled) return {id, found: false, visible: false, hiddenAttribute: false, ariaHidden: ''};
          return {
            id, found: true, visible: isVisiblyRendered(controlled),
            hiddenAttribute: controlled.hidden,
            ariaHidden: controlled.getAttribute('aria-hidden') || '',
            role: controlled.getAttribute('role') || ''
          };
        });
        return {
          ariaExpanded: target.getAttribute('aria-expanded'),
          ariaSelected: target.getAttribute('aria-selected'),
          ariaPressed: target.getAttribute('aria-pressed'),
          ariaControls: controls.slice(0, 16),
          controlsTruncated: controls.length > 16,
          controlledTargets
        };
      }
      function reflowExceptionKind(target, scrollContainer) {
        const exceptionSelector = 'table,[role="table"],[role="grid"],[role="treegrid"],pre,code,[aria-roledescription="carousel"]';
        const semantic = target.closest(exceptionSelector) || target.querySelector(exceptionSelector);
        if (semantic) {
          const tag = semantic.tagName.toLowerCase();
          const role = semantic.getAttribute('role') || '';
          if (tag === 'table' || role === 'table' || role === 'grid' || role === 'treegrid') return 'data-table';
          if (tag === 'pre' || tag === 'code') return 'preformatted-content';
          if ((semantic.getAttribute('aria-roledescription') || '').toLowerCase() === 'carousel') return 'carousel';
        }
        if (scrollContainer && scrollContainer.hasAttribute('data-quality-horizontal-scroll')) return 'explicit-horizontal-scroll';
        return '';
      }
      function layoutSnapshot(target, rect) {
        const root = document.documentElement;
        const body = document.body;
        const documentClientWidth = root.clientWidth || innerWidth;
        const documentScrollWidth = Math.max(root.scrollWidth || 0, body ? body.scrollWidth || 0 : 0);
        let containerElement = null;
        let horizontalScrollContainer = null;
        let current = target;
        for (let depth = 0; current instanceof Element && depth < 16; depth++, current = current.parentElement) {
          if (current === root || current === body) continue;
          const style = getComputedStyle(current);
          const overflowX = style.overflowX || style.overflow || 'visible';
          if ((overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth + 1) {
            containerElement = current;
            horizontalScrollContainer = {
              scope: depth === 0 ? 'target' : `ancestor:${depth}`,
              tag: current.tagName.toLowerCase(),
              role: current.getAttribute('role') || '',
              clientWidth: current.clientWidth,
              scrollWidth: current.scrollWidth,
              overflowX
            };
            break;
          }
        }
        return {
          documentClientWidth,
          documentScrollWidth,
          pageHorizontalOverflow: documentScrollWidth > documentClientWidth + 1,
          targetContributesToPageOverflow: rect.left < -1 || rect.right > documentClientWidth + 1,
          horizontalScrollContainer,
          exceptionKind: reflowExceptionKind(target, containerElement)
        };
      }
      function focusSnapshot(target, item) {
        const records = [
          styleRecord(target, 'target'),
          styleRecord(target, 'target::before', '::before'),
          styleRecord(target, 'target::after', '::after')
        ];
        let ancestor = target.parentElement;
        for (let depth = 1; ancestor instanceof Element && depth <= 2; depth++, ancestor = ancestor.parentElement) {
          records.push(styleRecord(ancestor, `ancestor:${depth}`));
          records.push(styleRecord(ancestor, `ancestor:${depth}::before`, '::before'));
          records.push(styleRecord(ancestor, `ancestor:${depth}::after`, '::after'));
        }
        Array.from(target.children).slice(0, 8).forEach((child, index) => {
          records.push(styleRecord(child, `child:${index}`));
          records.push(styleRecord(child, `child:${index}::before`, '::before'));
          records.push(styleRecord(child, `child:${index}::after`, '::after'));
        });
        return records;
      }
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
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || '';
        const nativeInteractive = ['button','input','select','textarea','summary'].includes(tag) || ((tag === 'a' || tag === 'area') && element.hasAttribute('href'));
        const roleInteractive = ['button','link','tab','checkbox','radio','switch','menuitem','option','combobox','listbox','slider','spinbutton'].includes(role);
        const handlerInteractive = element.hasAttribute('onclick') || typeof element.onclick === 'function';
        const editableInteractive = element.isContentEditable;
        const interactive = nativeInteractive || roleInteractive || handlerInteractive || editableInteractive;
        const disabled = Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';
        const composite = element.closest('[role="tablist"],[role="menu"],[role="listbox"],[role="tree"],[role="grid"],[role="radiogroup"],[role="toolbar"]');
        const compositeRole = composite && composite !== element ? composite.getAttribute('role') || '' : '';
        const textContent = (element.innerText || element.textContent || '').trim().slice(0, 500);
        const backgroundLayers = [];
        let backgroundTruncated = false;
        let backgroundDepth = 0;
        for (let current = element; current instanceof Element; current = current.parentElement) {
          if (backgroundDepth++ >= 64) { backgroundTruncated = true; break; }
          const currentStyle = getComputedStyle(current);
          backgroundLayers.push({
            selector: current === element ? item.selector : '',
            backgroundColor: currentStyle.backgroundColor || '',
            backgroundImage: currentStyle.backgroundImage || 'none',
            opacity: currentStyle.opacity || '1',
            mixBlendMode: currentStyle.mixBlendMode || 'normal',
            backdropFilter: currentStyle.backdropFilter || 'none'
          });
        }
        const colorContext = {foreground: style.color || '', backgroundLayers, backgroundTruncated};
        const stateContext = stateSnapshot(element);
        const layoutContext = layoutSnapshot(element, rect);
        const sequentiallyFocusable = interactive && !disabled && element.tabIndex >= 0;
        const keyboardContext = {
          sequentiallyFocusable,
          tabIndex: element.tabIndex,
          managedComposite: Boolean(compositeRole),
          compositeRole
        };
        const focusable = sequentiallyFocusable;
        let focusContext = {focusable, focused: false, focusVisible: false, before: [], after: []};
        if (focusable) {
          const previous = document.activeElement;
          focusContext.before = focusSnapshot(element, item);
          try { element.focus({preventScroll: true}); } catch (_) { try { element.focus(); } catch (_) {} }
          focusContext.focused = document.activeElement === element;
          try { focusContext.focusVisible = element.matches(':focus-visible'); } catch (_) {}
          focusContext.after = focusSnapshot(element, item);
          try { element.blur(); } catch (_) {}
          if (previous instanceof HTMLElement && previous !== element) {
            try { previous.focus({preventScroll: true}); } catch (_) {}
          }
        }
        output.push({...item, tag, role, interactive, disabled, textContent, colorContext, stateContext, layoutContext, keyboardContext, focusContext, accessibleName: element.getAttribute('aria-label') || element.innerText.trim().slice(0, 200), bounds: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}, computedStyle, visible, clipped});
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
                    try:
                        page.keyboard.press("Tab")
                    except Exception:
                        pass
                    raw = page.evaluate(script, {"targets": normalized_targets, "styleFields": STYLE_FIELDS, "focusFields": STYLE_FIELDS})
                    for item in raw if isinstance(raw, list) else []:
                        if item.get("error"):
                            warnings.append(f"{viewport['id']} {item.get('targetKey')}: {item['error']}"); continue
                        observation = _build_observation(item, viewport)
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
