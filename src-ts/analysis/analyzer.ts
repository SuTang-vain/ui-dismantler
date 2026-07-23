import { readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { extractGradients, extractMediaQueries, extractRootVariables, inferVariableRoles, normalizeTokenName } from "../core/css.js";
import { extractScriptInteractions } from "./script-interactions.js";
import { analyzeGraphGeometry, type GraphGeometrySignals } from "./geometry-signals.js";
import type { DataContract, Interaction, Manifest, AnalyzedView, ViewEvidence } from "../types.js";

const COLOR_PROPERTIES = new Set(["color", "background", "background-color", "border-color", "box-shadow", "fill", "stroke"]);
const PROFILE_FALLBACK = "generic";
const DEFAULT_MAX_CSS_BYTES = 300_000;
const DEFAULT_MAX_STYLE_BYTES = 150_000;
const DEFAULT_MAX_SCRIPT_BYTES = 1_000_000;

interface SourceBudget {
  maxCssBytes: number;
  maxStyleBytes: number;
  maxScriptBytes: number;
}

interface CollectedSource {
  text: string;
  warnings: string[];
}

function byteLength(value: string): number { return Buffer.byteLength(value, "utf8"); }

function executableScriptType(type: string | null): boolean {
  const normalized = (type ?? "").trim().toLowerCase().split(";")[0];
  return !normalized || normalized === "module" || /^(?:text|application)\/(?:java|ecma)script$/.test(normalized);
}

function appendWithinBudget(chunks: string[], value: string, remaining: number): { used: number; truncated: boolean } {
  if (remaining <= 0) return { used: 0, truncated: Boolean(value) };
  if (byteLength(value) <= remaining) { chunks.push(value); return { used: byteLength(value), truncated: false }; }
  let end = Math.min(value.length, remaining);
  while (end > 0 && byteLength(value.slice(0, end)) > remaining) end = Math.floor(end * 0.9);
  chunks.push(value.slice(0, end));
  return { used: byteLength(value.slice(0, end)), truncated: true };
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function compactArchiveSource(source: string, budget: SourceBudget): CollectedSource {
  const warnings: string[] = [];
  if (byteLength(source) < 5_000_000) return { text: source, warnings };
  let skippedStyleBytes = 0;
  let skippedScriptBytes = 0;
  let skippedScripts = 0;
  let dataUris = 0;
  let scriptBudget = budget.maxScriptBytes;
  let cssBudget = budget.maxCssBytes;
  let text = source.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, open, body: string, close) => {
    const allowed = Math.max(0, Math.min(body.length, budget.maxStyleBytes, cssBudget));
    const compacted = body.slice(0, allowed);
    cssBudget -= byteLength(compacted);
    skippedStyleBytes += byteLength(body) - byteLength(compacted);
    return compacted ? `${open}${compacted}${close}` : "";
  });
  text = text.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi, (_match, open, attributes: string, body: string, close) => {
    const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
    if (!executableScriptType(type)) { skippedScripts += 1; skippedScriptBytes += byteLength(body); return `${open}${close}`; }
    if (byteLength(body) <= scriptBudget) { scriptBudget -= byteLength(body); return `${open}${body}${close}`; }
    const compacted = body.slice(0, Math.max(0, scriptBudget));
    skippedScriptBytes += byteLength(body) - byteLength(compacted);
    scriptBudget = 0;
    return `${open}${compacted}${close}`;
  });
  text = text.replace(/data:[^"'()\s<>]+/gi, () => { dataUris += 1; return "data:,"; });
  text = text.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  warnings.push(`大型归档预处理：压缩 ${dataUris} 个 data URI，跳过 ${skippedStyleBytes} CSS bytes、${skippedScriptBytes} script bytes`);
  if (skippedScripts) warnings.push(`归档预处理已跳过 ${skippedScripts} 个非可执行 script`);
  return { text, warnings };
}

function cssFromDocument(dom: JSDOM, htmlPath: string, budget: SourceBudget): CollectedSource {
  const document = dom.window.document;
  const chunks: string[] = [];
  const warnings: string[] = [];
  let used = 0;
  let skipped = 0;
  const append = (raw: string, label: string) => {
    const rawBytes = byteLength(raw);
    const perStyle = Math.min(rawBytes, budget.maxStyleBytes);
    const allowed = Math.max(0, Math.min(perStyle, budget.maxCssBytes - used));
    const result = appendWithinBudget(chunks, raw, allowed);
    used += result.used;
    skipped += rawBytes - result.used;
    void label;
  };
  [...document.querySelectorAll("style")].forEach((node, index) => append(node.textContent ?? "", `style[${index + 1}]`));
  for (const link of [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')]) {
    const href = link.getAttribute("href");
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const path = resolve(dirname(htmlPath), decodeURIComponent(href.split("#")[0].split("?")[0]));
    try { if (statSync(path).isFile()) append(readText(path), `stylesheet ${href}`); }
    catch { /* Missing local resources are reported by runtime validation. */ }
  }
  if (skipped) warnings.push(`CSS 分析预算生效：读取 ${used} bytes，跳过 ${skipped} bytes；DOM/文本分析保持完整`);
  return { text: chunks.join("\n"), warnings };
}

function scriptsFromDocument(dom: JSDOM, htmlPath: string, budget: SourceBudget): CollectedSource {
  const chunks: string[] = [];
  const warnings: string[] = [];
  let used = 0;
  let skippedNonExecutable = 0;
  let skippedBytes = 0;
  for (const script of [...dom.window.document.scripts]) {
    if (!executableScriptType(script.getAttribute("type"))) { skippedNonExecutable += 1; continue; }
    let value = "";
    if (script.src) {
      try {
        const path = resolve(dirname(htmlPath), decodeURIComponent(new URL(script.src, `file://${htmlPath}`).pathname));
        if (statSync(path).isFile()) value = readText(path);
      } catch { /* Keep static analysis available when an external script is absent. */ }
    } else value = script.textContent ?? "";
    if (!value.trim()) continue;
    const result = appendWithinBudget(chunks, value, Math.max(0, budget.maxScriptBytes - used));
    used += result.used;
    skippedBytes += byteLength(value) - result.used;
  }
  if (skippedNonExecutable) warnings.push(`已跳过 ${skippedNonExecutable} 个非可执行 script（JSON-LD/归档元数据等）`);
  if (skippedBytes) warnings.push(`脚本分析预算生效：读取 ${used} bytes，跳过 ${skippedBytes} bytes`);
  return { text: chunks.join("\n;\n"), warnings };
}

function escapeSelector(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `); }

function stableSelector(element: Element): string {
  if (element.id) return `#${escapeSelector(element.id)}`;
  const tag = element.tagName.toLowerCase();
  const classes = [...element.classList].filter((item) => item.length > 1 && !/^(?:active|current|selected|open|closed|disabled|hidden|focus|hover)$/i.test(item));
  const preferred = [...classes].sort((a, b) => Number(/^elementor-element-[a-f0-9]+$/i.test(b)) - Number(/^elementor-element-[a-f0-9]+$/i.test(a)));
  for (const item of preferred) {
    const candidate = `${tag}.${escapeSelector(item)}`;
    try { if (element.ownerDocument.querySelectorAll(candidate).length === 1) return candidate; } catch { /* Try a structural selector. */ }
  }
  for (let size = Math.min(3, preferred.length); size >= 1; size -= 1) {
    const candidate = `${tag}.${preferred.slice(0, size).map((item) => escapeSelector(item)).join(".")}`;
    try { if (element.ownerDocument.querySelectorAll(candidate).length === 1) return candidate; } catch { /* Try a structural selector. */ }
  }
  const parent = element.parentElement;
  if (!parent) return tag;
  const index = [...parent.children].indexOf(element) + 1;
  return `${stableSelector(parent)} > ${tag}:nth-child(${index})`;
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64) || "item";
}

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function controlsOf(element: Element): Element[] {
  return [...element.querySelectorAll("button, a, input, select, summary, [onclick], [data-action], [data-p], [data-mt], [data-k]")];
}

function regionView(element: Element, id: string, type: string, semanticType: string, parentSelector: string, interactionSelectors: string[] = []): AnalyzedView {
  return {
    id, type, structuralType: "content-region", semanticType, confidence: 0.92,
    evidence: [{ signal: "application-region", value: semanticType }], selector: stableSelector(element),
    details: { text: textOf(element).slice(0, 160), className: `${element.className ?? ""}`, parentSelector, interactionSelectors: [...new Set([...controlsOf(element).map(stableSelector), ...interactionSelectors])] },
  };
}

function geometryRoleView(
  id: string,
  type: string,
  semanticType: string,
  selector: string,
  parentSelector: string,
  geometry: GraphGeometrySignals,
): AnalyzedView {
  return {
    id, type, structuralType: "implementation-responsibility", semanticType, confidence: Math.max(0.86, geometry.score),
    evidence: geometry.reasons.map((reason) => ({ signal: "svg-geometry", value: reason })), selector,
    details: { text: "", className: "", parentSelector, interactionSelectors: [], geometryRole: semanticType, geometrySignals: geometry as any },
  };
}

function graphGeometryCandidates(graphRoot: Element, canvas: Element | null, geometry: GraphGeometrySignals, idPrefix = ""): AnalyzedView[] {
  if (!geometry.detected) return [];
  const prefix = idPrefix ? `${idPrefix}-` : "";
  const rootSelector = stableSelector(graphRoot);
  const canvasSelector = canvas ? stableSelector(canvas) : rootSelector;
  const candidates: AnalyzedView[] = [];
  if (geometry.responsibilities.includes("layout")) {
    candidates.push(geometryRoleView(`${prefix}graph-layout`, "graph-layout", "graph-layout", `${rootSelector}:where(*)`, rootSelector, geometry));
  }
  let rendererSelector = rootSelector;
  if (geometry.responsibilities.includes("edge-rendering")) {
    rendererSelector = `${canvasSelector}:where(*)`;
    candidates.push(geometryRoleView(`${prefix}edge-renderer`, "edge-renderer", "edge-renderer", rendererSelector, rootSelector, geometry));
  }
  if (geometry.responsibilities.includes("label-placement")) {
    candidates.push(geometryRoleView(`${prefix}edge-label-placement`, "edge-label-placement", "edge-label-placement", `${canvasSelector}:is(*)`, rendererSelector, geometry));
  }
  if (geometry.responsibilities.includes("animation-loop")) {
    candidates.push(geometryRoleView(`${prefix}graph-animation-loop`, "graph-animation-loop", "graph-animation-loop", `${canvasSelector}:not(:root)`, rendererSelector, geometry));
  }
  return candidates;
}

function applicationViews(document: Document, applicationScript: string): AnalyzedView[] {
  const graphNodeGestures = /(?:pointerdown|mousedown|touchstart)/.test(applicationScript) && /(?:\.node|data-node|className\s*=\s*["'][^"']*node)/.test(applicationScript);
  const graphGeometry = analyzeGraphGeometry(applicationScript);
  const navControls = [...document.querySelectorAll<HTMLElement>("[data-p], button[data-view], a[data-view], [role=tab][data-view], button[data-tab], a[data-tab], [role=tab][data-tab], button[aria-controls], a[aria-controls], [role=tab][aria-controls]")];
  const panelKey = (panel: HTMLElement): string => panel.dataset.view || panel.dataset.viewPanel || panel.id.replace(/^view-/, "");
  const controlKey = (control: HTMLElement): string => (control.dataset.p || control.dataset.view || control.dataset.tab || control.getAttribute("aria-controls") || "").replace(/^#|^view-/, "");
  const panelForControl = (control: HTMLElement): HTMLElement | null => {
    const key = controlKey(control);
    if (!key) return null;
    return [...document.querySelectorAll<HTMLElement>(".view[data-view], .view[id], .panel[id], [data-view-panel], [role=tabpanel]")].find((panel) => panelKey(panel) === key)
      ?? document.getElementById(key)
      ?? document.getElementById(`view-${key}`);
  };
  const controlledPanels = navControls.map(panelForControl).filter((panel): panel is HTMLElement => Boolean(panel));
  const structuralPanels = [...document.querySelectorAll<HTMLElement>(".view[data-view], .stage > .view[id], main > .view[id], .stage > .panel[id], main > .panel[id], [data-view-panel], [role=tabpanel]")];
  let panels = [...new Set(controlledPanels.length >= 2 ? controlledPanels : structuralPanels.length >= 2 ? structuralPanels : [])];
  const graph = document.querySelector<HTMLElement>("#graphWrap, #graphCanvas, [id*=Graph], [id*=graph], .graph-wrap, .graph-canvas, .radar-stage");
  const compoundControls = [...document.querySelectorAll<HTMLElement>("#eventBtns, .event-btns, .event-bar, [data-event], [data-i]")];
  const compoundDialog = document.querySelector<HTMLElement>('.pop[id], .modal[id], dialog[id], [role="dialog"][id], [class*="modal"][id]');
  const compoundApplication = panels.length < 2 && Boolean(graph && (compoundControls.length || compoundDialog));
  if (panels.length < 2 && !compoundApplication) return [];

  const navigation = navControls[0]?.closest<HTMLElement>("nav, [role=tablist], .tabs, [class*=tabs]");
  const panelParent = panels.length && panels.every((panel) => panel.parentElement === panels[0].parentElement) ? panels[0].parentElement : null;
  const explicitShell = document.querySelector<HTMLElement>("#app-container, #app, [data-app-shell]");
  const shell = explicitShell && (!panelParent || explicitShell.contains(panelParent))
    ? explicitShell
    : navigation?.parentElement && (!panelParent || navigation.parentElement.contains(panelParent))
      ? navigation.parentElement
      : panelParent ?? graph?.parentElement ?? document.body;
  const shellSelector = stableSelector(shell);
  const views: AnalyzedView[] = [{
    id: "application-shell", type: "app-shell", structuralType: "application", semanticType: "application-shell", confidence: compoundApplication ? 0.9 : 0.96,
    evidence: [{ signal: compoundApplication ? "compound-graph-application" : controlledPanels.length >= 2 ? "application-navigation" : "view-panel-structure", value: compoundApplication ? 1 : panels.length }], selector: shellSelector,
    details: { text: textOf(shell).slice(0, 160), className: `${shell.className ?? ""}`, interactionSelectors: navControls.map(stableSelector) },
  }];

  const classifyPanel = (panel: HTMLElement, rawId: string, label: string): { type: string; semanticType: string; dynamicSelectors: string[] } => {
    const normalized = `${rawId} ${panel.className} ${panel.dataset.view ?? ""} ${label}`.toLowerCase();
    const type = /quiz|测一测|测试/.test(normalized) ? "quiz-panel"
      : /graph|relation|costar|关联|图谱|关系/.test(normalized) ? "relationship-panel"
        : /story|典故|出处/.test(normalized) ? "story-panel"
          : /work|作品|recommend/.test(normalized) ? "works-panel"
            : /identity|gallery|profile|cast|相册|身份|档案|演员/.test(normalized) ? "identity-panel" : "content-panel";
    return {
      type, semanticType: type === "content-panel" ? `${slug(rawId)}-panel` : type,
      dynamicSelectors: type === "relationship-panel" ? [".radar-center", ".node", ".edge", "[data-node-id]", "[data-char-id]"]
        : type === "works-panel" ? [".category-btn", ".works-tab", "[data-select-poster]", "[data-select-work]", "[data-next-work]"]
          : type === "identity-panel" ? ["#photoCard", ".arrow", "[data-cast-idx]"]
            : type === "quiz-panel" ? ["#opts .opt"] : [],
    };
  };

  for (const panel of panels) {
    const rawId = panel.id || panel.dataset.view || panel.dataset.viewPanel || `panel-${views.length}`;
    const label = navControls.find((control) => panelForControl(control) === panel)?.textContent?.trim() ?? rawId;
    const { type, semanticType, dynamicSelectors } = classifyPanel(panel, rawId, label);
    const panelView = regionView(panel, `panel-${slug(rawId)}`, type, semanticType, shellSelector, dynamicSelectors);
    const candidates = componentCandidates(panel, semanticType);
    if (type === "works-panel") {
      const worksGrid = panel.querySelector<HTMLElement>("#worksGrid, .works-grid, .works-viewport, [data-works-grid]");
      if (worksGrid && worksGrid !== panel) candidates.push(regionView(worksGrid, `${slug(rawId)}-works-explorer`, "works-explorer", "works-explorer", stableSelector(panel), ["#worksGrid", "#worksScrollHint", ".works-tab", "[data-cat]"]));
    }
    if (type === "identity-panel") {
      const castExplorer = panel.querySelector<HTMLElement>(".cast-grid, #castGrid, [data-cast-grid]");
      if (castExplorer && castExplorer !== panel) {
        const castView = regionView(castExplorer, `${slug(rawId)}-cast-explorer`, "cast-explorer", "cast-explorer", stableSelector(panel), [".cast-grid"]);
        const castCandidates: AnalyzedView[] = [];
        if (panel.querySelector(".cast-card") || applicationScript.includes("cast-card")) castCandidates.push({
          id: `${slug(rawId)}-cast-card-control`, type: "cast-card-control", structuralType: "repeated-control", semanticType: "cast-card-control", confidence: 0.88,
          evidence: [{ signal: "runtime-cast-card", value: ".cast-card" }], selector: ".cast-card",
          details: { text: "", className: "cast-card", parentSelector: stableSelector(castExplorer), interactionSelectors: [".cast-card"] },
        });
        if (panel.querySelector(".story-btn") || applicationScript.includes("story-btn")) {
          const storyControl: AnalyzedView = {
            id: `${slug(rawId)}-story-control`, type: "story-control", structuralType: "repeated-control", semanticType: "story-control", confidence: 0.88,
            evidence: [{ signal: "runtime-story-control", value: ".story-btn" }], selector: ".story-btn",
            details: { text: "", className: "story-btn", parentSelector: stableSelector(castExplorer), interactionSelectors: [".story-btn", ".story-btn.active"] },
          };
          storyControl.componentCandidates = [{
            id: `${slug(rawId)}-story-scroll-surface`, type: "scroll-surface", structuralType: "interactive-control", semanticType: "story-scroll-surface", confidence: 0.84,
            evidence: [{ signal: "scroll-control", value: ".story-btn" }], selector: ".story-btn:is(*)",
            details: { text: "", className: "story-btn", parentSelector: ".story-btn", interactionSelectors: [".story-btn", ".story-btn.active"] },
          }, {
            id: `${slug(rawId)}-story-gesture-surface`, type: "gesture-surface", structuralType: "interactive-control", semanticType: "story-gesture-surface", confidence: 0.82,
            evidence: [{ signal: "pointer-gesture-control", value: ".story-btn" }], selector: ".story-btn:where(*)",
            details: { text: "", className: "story-btn", parentSelector: ".story-btn", interactionSelectors: [".story-btn", ".story-btn.active"] },
          }];
          castCandidates.push(storyControl);
        }
        castView.componentCandidates = castCandidates;
        candidates.push(castView);
      }
    }
    if (type === "identity-panel" && /identity|gallery/i.test(`${rawId} ${panel.dataset.view ?? ""}`)) {
      const gallery = panel.querySelector<HTMLElement>("#photoCard, .photo-card, [data-gallery]");
      if (gallery && gallery !== panel) candidates.push(regionView(gallery, `${slug(rawId)}-identity-gallery`, "identity-gallery", "identity-gallery", stableSelector(panel), ["#photoCard", ".arrow"]));
      else if (document.querySelector("script")?.textContent?.includes("photoCard")) {
        const galleryShell: AnalyzedView = {
          id: `${slug(rawId)}-identity-gallery`, type: "identity-gallery", structuralType: "dynamic-region", semanticType: "identity-gallery", confidence: 0.84,
          evidence: [{ signal: "runtime-gallery-control", value: "#photoCard" }], selector: "#photoCard",
          details: { text: "", className: "photo-card", parentSelector: stableSelector(panel), interactionSelectors: [".arrow"] },
        };
        galleryShell.componentCandidates = [{
          id: `${slug(rawId)}-identity-swipe-surface`, type: "gesture-surface", structuralType: "interactive-control", semanticType: "identity-swipe-surface", confidence: 0.82,
          evidence: [{ signal: "pointer-gesture-control", value: "#photoCard" }], selector: "#photoCard:where(*)",
          details: { text: "", className: "photo-card", parentSelector: "#photoCard", interactionSelectors: ["#photoCard"] },
        }];
        candidates.push(galleryShell);
      }
    }
    const regions: Array<[string, string, string, string[]]> = type === "relationship-panel"
      ? [["#filters", "graph-filters", "graph-filters", [".f"]], ["#detail, .char-panel", "relationship-detail", "relationship-detail", []]]
      : type === "quiz-panel"
        ? [["#qzbody", "quiz-question", "quiz-question", ["#opts .opt"]], ["#qzresult", "quiz-result", "quiz-result", []]]
        : type === "story-panel"
          ? [[".story-l", "story-origins", "story-origins", []], [".story-r", "story-source", "story-source", []]]
          : type === "content-panel"
            ? [[".home-l", "definition-hero", "definition-hero", []], [".home-r", "definition-details", "definition-details", []]]
            : [];
    for (const [selector, childType, childSemantic, interactions] of regions) {
      const child = panel.querySelector(selector);
      if (child) candidates.push(regionView(child, `${slug(rawId)}-${childType}`, childType, childSemantic, stableSelector(panel), interactions));
    }
    const panelGraph = panel.querySelector<HTMLElement>("#graphWrap, #graphCanvas, [id*=Graph], [id*=graph], .graph-wrap, .graph-canvas, .radar-stage");
    if (panelGraph && panelGraph !== panel) {
      const graphRoot = panelGraph.matches("#graphCanvas, .graph-canvas") && panelGraph.parentElement ? panelGraph.parentElement : panelGraph;
      const graphView = regionView(graphRoot, `${slug(rawId)}-relationship-canvas`, "relationship-canvas", "relationship-canvas", stableSelector(panel), [".radar-center", ".node", ".edge", "[data-node-id]", "[data-char-id]"]);
      const canvas = graphRoot.querySelector<HTMLElement>("#graphCanvas, .graph-canvas, svg");
      graphView.details.geometrySignals = graphGeometry as any;
      graphView.componentCandidates = graphGeometryCandidates(graphRoot, canvas, graphGeometry, slug(rawId));
      if (canvas && canvas !== graphRoot && graphNodeGestures) {
        const surface = regionView(canvas, `${slug(rawId)}-graph-surface`, "graph-surface", "graph-surface", stableSelector(graphRoot), [".edge", "[data-node-id]", "[data-char-id]"]);
        const nodeControl: AnalyzedView = {
          id: `${slug(rawId)}-graph-node-control`, type: "graph-node-control", structuralType: "repeated-control", semanticType: "graph-node-control", confidence: 0.9,
          evidence: [{ signal: "runtime-graph-node", value: ".node" }], selector: ".node",
          details: { text: "", className: "node", parentSelector: stableSelector(canvas), interactionSelectors: [".node", "[data-node-id]", "[data-char-id]"] },
        };
        nodeControl.componentCandidates = [{
          id: `${slug(rawId)}-graph-node-gesture`, type: "gesture-surface", structuralType: "interactive-control", semanticType: "graph-node-gesture", confidence: 0.84,
          evidence: [{ signal: "node-gesture-control", value: ".node" }], selector: ".node:where(*)",
          details: { text: "", className: "node", parentSelector: ".node", interactionSelectors: [".node"] },
        }];
        surface.componentCandidates = [nodeControl];
        graphView.componentCandidates = [...(graphView.componentCandidates ?? []), surface];
      }
      candidates.push(graphView);
    }
    panelView.componentCandidates = candidates.filter((candidate, index, items) => items.findIndex((item) => item.selector === candidate.selector) === index);
    views.push(panelView);
  }

  if (compoundApplication && graph) {
    const graphRoot = graph.matches(".graph-canvas, #graphCanvas") && graph.parentElement ? graph.parentElement : graph;
    const graphView = regionView(graphRoot, "relationship-canvas", "relationship-canvas", "relationship-canvas", shellSelector, [".edge", "[data-node-id]", "[data-char-id]"]);
    const canvas = graphRoot.querySelector<HTMLElement>("#graphCanvas, .graph-canvas, svg") ?? (graphRoot.matches("#graphCanvas, .graph-canvas, svg") ? graphRoot : null);
    graphView.details.geometrySignals = graphGeometry as any;
    graphView.componentCandidates = graphGeometryCandidates(graphRoot, canvas, graphGeometry);
    if (canvas && graphNodeGestures) {
      const nodeControl: AnalyzedView = {
        id: "graph-node-control", type: "graph-node-control", structuralType: "repeated-control", semanticType: "graph-node-control", confidence: 0.9,
        evidence: [{ signal: "runtime-graph-node", value: ".node" }], selector: ".node",
        details: { text: "", className: "node", parentSelector: stableSelector(graphRoot), interactionSelectors: [".node"] },
      };
      nodeControl.componentCandidates = [{
        id: "graph-node-gesture", type: "gesture-surface", structuralType: "interactive-control", semanticType: "graph-node-gesture", confidence: 0.84,
        evidence: [{ signal: "node-gesture-control", value: ".node" }], selector: ".node:where(*)",
        details: { text: "", className: "node", parentSelector: ".node", interactionSelectors: [".node"] },
      }];
      graphView.componentCandidates = [...(graphView.componentCandidates ?? []), nodeControl];
    }
    const detail = shell.querySelector<HTMLElement>("#charPanel, .char-panel, #detail, [class*=detail-panel]");
    if (detail && detail !== graphRoot) graphView.componentCandidates = [...(graphView.componentCandidates ?? []), regionView(detail, "relationship-detail", "relationship-detail", "relationship-detail", stableSelector(graphRoot))];
    views.push(graphView);
    const eventRegion = shell.querySelector<HTMLElement>("#eventBtns, .event-btns, .event-bar") ?? compoundControls[0]?.parentElement;
    if (eventRegion) views.push(regionView(eventRegion, "event-controls", "event-controls", "event-controls", shellSelector, [".event-btn", "[data-event]", "[data-i]"]));
  }

  const dialogs = [...shell.querySelectorAll<HTMLElement>('.pop[id], .modal[id], dialog[id], [role="dialog"][id], [class*="modal"][id]')]
    .filter((dialog, index, items) => items.findIndex((other) => other === dialog || other.contains(dialog)) === index);
  for (const [index, dialog] of dialogs.entries()) {
    const dialogView = regionView(dialog, `dialog-${slug(dialog.id || `${index + 1}`)}`, "dialog", `${slug(dialog.id || "detail")}-dialog`, shellSelector, [".modal-close", "[class*=modal-close]"]);
    dialogView.details.interactionSelectors = [...new Set([...(dialogView.details.interactionSelectors as string[]), ...[...dialog.querySelectorAll("[id]")].map(stableSelector), ".modal-close", "[class*=modal-close]"])];
    views.push(dialogView);
  }
  return views;
}

function repeatedSignature(element: Element): string {
  const classes = [...element.classList]
    .filter((item) => !/^(?:elementor-element|elementor-repeater-item)-[a-f0-9]+$/i.test(item))
    .filter((item) => !/^(?:wpr-)?(?:left|right)-aligned$/i.test(item))
    .sort();
  return `${element.tagName.toLowerCase()}.${classes.join(".")}`;
}

function componentCandidates(element: Element, semanticType: string): AnalyzedView[] {
  const parentSelector = stableSelector(element);
  const candidates: AnalyzedView[] = [];
  const repeated = [...element.querySelectorAll("article, [class*=card], [class*=entry], .e-con.e-child")]
    .filter((item) => textOf(item).length >= 5 && ![...item.querySelectorAll("article, [class*=card], [class*=entry], .e-con.e-child")].some((child) => child !== item && textOf(child).length >= 5));
  const groups = new Map<string, Element[]>();
  for (const item of repeated) {
    const signature = repeatedSignature(item);
    const group = groups.get(signature) ?? [];
    group.push(item); groups.set(signature, group);
  }
  const repeatedGroup = [...groups.values()].filter((group) => group.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (repeatedGroup) {
    const representative = repeatedGroup[0];
    const interactionSelectors = repeatedGroup.flatMap(controlsOf).map(stableSelector);
    candidates.push({
      id: `${slug(semanticType)}-item`, type: "repeated-item", structuralType: "collection-item", semanticType: `${slug(semanticType)}-item`, confidence: 0.88,
      evidence: [{ signal: "repeated-structure", value: repeatedGroup.length }], selector: stableSelector(representative),
      details: { text: textOf(representative).slice(0, 160), className: `${representative.className ?? ""}`, parentSelector, repeatedCount: repeatedGroup.length, repeatedSelectors: repeatedGroup.map(stableSelector), interactionSelectors },
    });
  }

  const slotElements = [...element.querySelectorAll('[class~="bento-slot"], [class*="interactive-slot"]')]
    .filter((item) => controlsOf(item).length > 0 && !item.parentElement?.closest('[class~="bento-slot"], [class*="interactive-slot"]'));
  const slotShell = slotElements.length >= 2 ? slotElements[0].parentElement : null;
  let slotParentSelector = parentSelector;
  if (slotShell && slotElements.every((item) => item.parentElement === slotShell)) {
    slotParentSelector = stableSelector(slotShell);
    candidates.push({
      id: `${slug(semanticType)}-interactive-shell`, type: "component-shell", structuralType: "collection", semanticType: `${slug(semanticType)}-interactive-shell`, confidence: 0.86,
      evidence: [{ signal: "interactive-slot-shell", value: slotElements.length }], selector: slotParentSelector,
      details: { text: textOf(slotShell).slice(0, 160), className: `${slotShell.className ?? ""}`, parentSelector, interactionSelectors: [] },
    });
  }
  slotElements.forEach((slot, index) => {
    const identity = [...slot.classList].find((item) => /(?:slot|panel)[-_]?\d+/i.test(item)) ?? `slot-${index + 1}`;
    candidates.push({
      id: `${slug(semanticType)}-${slug(identity)}`, type: "interactive-slot", structuralType: "content-region", semanticType: `${slug(semanticType)}-${slug(identity)}`, confidence: 0.9,
      evidence: [{ signal: "localized-interaction-cluster", value: controlsOf(slot).length }], selector: stableSelector(slot),
      details: { text: textOf(slot).slice(0, 160), className: `${slot.className ?? ""}`, parentSelector: slotParentSelector, interactionSelectors: controlsOf(slot).map(stableSelector) },
    });
  });

  const overlays = [...element.querySelectorAll('[id][class*="floating"], [id][class*="player"]')]
    .filter((item) => controlsOf(item).length >= 2 && !item.closest('[class~="bento-slot"], [class*="interactive-slot"]'))
    .filter((item, index, items) => items.findIndex((other) => other.contains(item) || item.contains(other)) === index);
  overlays.forEach((overlay, index) => candidates.push({
    id: `${slug(semanticType)}-overlay-${index + 1}`, type: "interactive-panel", structuralType: "overlay", semanticType: `${slug(semanticType)}-interactive-panel`, confidence: 0.86,
    evidence: [{ signal: "overlay-controls", value: controlsOf(overlay).length }], selector: stableSelector(overlay),
    details: { text: textOf(overlay).slice(0, 160), className: `${overlay.className ?? ""}`, parentSelector, interactionSelectors: controlsOf(overlay).map(stableSelector) },
  }));
  return candidates;
}

function parseCssColors(css: string): string[] {
  const values = new Set<string>();
  for (const match of css.matchAll(/(?:#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi)) values.add(match[0]);
  return [...values];
}

function colorRoles(css: string, value: string): string[] {
  const roles = new Set<string>();
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([\\w-]+)\\s*:\\s*[^;{}]*${escaped}`, "gi");
  for (const match of css.matchAll(pattern)) {
    const property = match[1].toLowerCase();
    if (property === "color") roles.add("text");
    else if (property.includes("background")) roles.add("background");
    else if (property.includes("border") || property === "outline") roles.add("border");
    else if (property.includes("shadow")) roles.add("shadow");
    else if (COLOR_PROPERTIES.has(property)) roles.add("icon-fill");
  }
  return [...roles].sort();
}

function inferArrayType(value: string): string {
  const normalized = value.trim();
  if (/^['"`]/.test(normalized)) return "string";
  if (/^(true|false)\b/.test(normalized)) return "boolean";
  if (/^-?\d+(?:\.\d+)?\b/.test(normalized)) return "number";
  if (/^\[/.test(normalized)) return "array";
  if (/^\{/.test(normalized)) return "object";
  return "unknown";
}

function extractContracts(scripts: string[]): DataContract[] {
  const contracts: DataContract[] = [];
  const joined = scripts.join("\n");
  for (const match of joined.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g)) {
    const start = match.index! + match[0].length - 1;
    const end = matchingBracket(joined, start, "[", "]");
    if (end < 0) continue;
    const body = joined.slice(start + 1, end);
    const objects = [...body.matchAll(/\{([\s\S]*?)\}/g)];
    const fields: Record<string, string> = {};
    for (const object of objects.slice(0, 8)) {
      for (const field of object[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*([^,\n}]+)/g)) {
        fields[field[1]] ??= inferArrayType(field[2]);
      }
    }
    contracts.push({ name: match[1], kind: "array", fields, count: estimateArrayCount(body) });
  }
  return contracts;
}

function matchingBracket(value: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote = "";
  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return i;
  }
  return -1;
}

function estimateArrayCount(body: string): number {
  const commas = body.match(/,(?=\s*(?:\{|['"`]|-?\d|true|false))/g)?.length ?? 0;
  return body.trim() ? commas + 1 : 0;
}

function graphEvidence(element: Element, classes: string, text: string): { hit: boolean; evidence: ViewEvidence[]; confidence: number } {
  const nodes = element.querySelectorAll('[class~="node"], [data-node], [data-id]').length;
  const edges = element.querySelectorAll('[class~="edge"], [class~="link"], line, polyline, svg path').length;
  const semantics = /(?:^|[\s_-])(graph|network|relationship|relation|关系|图谱)(?:$|[\s_-])/.test(`${classes} ${text.slice(0, 240)}`);
  const hit = nodes >= 3 && edges >= 2 && semantics;
  return { hit, confidence: hit ? Math.min(0.98, 0.82 + Math.min(nodes, 8) * 0.015 + Math.min(edges, 8) * 0.01) : 0, evidence: [{ signal: "graph-semantics", value: semantics }, { signal: "graph-nodes", value: nodes }, { signal: "graph-edges", value: edges }] };
}

function detectView(element: Element, index: number): AnalyzedView | null {
  const classes = `${element.className ?? ""}`.toLowerCase();
  const text = textOf(element).toLowerCase();
  const graph = graphEvidence(element, classes, text);
  const signals: Array<{ type: string; structuralType: string; signal: string; confidence: number; hit: boolean; evidence?: ViewEvidence[] }> = [
    { type: "carousel-3d", structuralType: "collection", signal: "carousel", confidence: 0.9, hit: classes.includes("carousel") && element.children.length >= 2 && !element.parentElement?.closest("[class*=carousel]") },
    { type: "cause-chain", structuralType: "sequence", signal: "causechain", confidence: 0.95, hit: classes.includes("cause-chain") || text.includes("causechain") },
    { type: "nav-panel", structuralType: "content-region", signal: "data-p", confidence: 0.86, hit: element.querySelectorAll("[data-p], [data-tab]").length >= 2 && element.querySelectorAll("[role=tabpanel], .panel").length >= 2 },
    { type: "graph", structuralType: "collection", signal: "graph-structure", confidence: graph.confidence, hit: graph.hit, evidence: graph.evidence },
    { type: "timeline", structuralType: "sequence", signal: "timeline", confidence: 0.88, hit: classes.includes("timeline") && element.querySelectorAll("[class*=timeline-entry], article").length >= 2 && !element.parentElement?.closest("[class*=timeline]") },
    { type: "member-grid", structuralType: "collection", signal: "member-grid", confidence: 0.9, hit: classes.includes("member-grid") || text.includes("member-grid") },
    { type: "detail-panel", structuralType: "content-region", signal: "detail-panel", confidence: 0.86, hit: classes.includes("detail-panel") || text.includes("detail-panel") },
    { type: "quiz", structuralType: "form", signal: "quiz", confidence: 0.86, hit: classes.includes("quiz") || text.includes("quiz") },
    { type: "comparison", structuralType: "content-region", signal: "whatif/cmp", confidence: 0.9, hit: /whatif|cmp-btn|comparison/.test(classes + text) },
    { type: "splash", structuralType: "overlay", signal: "splash", confidence: 0.85, hit: classes.includes("splash") || text.includes("splash") },
  ];
  const best = signals.filter((item) => item.hit).sort((a, b) => b.confidence - a.confidence)[0];
  if (!best) return null;
  return {
    id: `${best.type}-${index + 1}`, type: best.type, structuralType: best.structuralType, semanticType: best.type, confidence: best.confidence,
    evidence: best.evidence ?? [{ signal: best.signal }], selector: stableSelector(element),
    details: { text: textOf(element).slice(0, 160), className: `${element.className ?? ""}`, interactionSelectors: controlsOf(element).slice(0, 80).map(stableSelector) }, componentCandidates: componentCandidates(element, best.type),
  };
}

const GENERIC_SECTION_NAMES = new Set(["some projects", "projects", "writing", "fragments of me", "education", "experience", "readings", "awards & features"]);

function sectionHeading(element: Element): string {
  const direct = [...element.children].find((child) => /^H[1-3]$/.test(child.tagName));
  const nested = [...element.children].flatMap((child) => [...child.querySelectorAll("h1, h2, h3")]).find((heading) => !heading.closest("article, [class*=card], [class*=item], [class*=entry]") || element.contains(heading.closest("article, [class*=card], [class*=item], [class*=entry]")));
  const heading = direct ?? nested ?? null;
  return heading ? textOf(heading).replace(/[.。]+$/, "").trim() : "";
}

function shellView(element: Element, type: "page-header" | "page-footer", index: number): AnalyzedView {
  const text = textOf(element);
  return {
    id: `${type}-${index + 1}`, type, structuralType: "content-region", semanticType: type, confidence: 0.9,
    evidence: [{ signal: "page-shell-region", value: type }], selector: stableSelector(element),
    details: { text: text.slice(0, 160), className: `${element.className ?? ""}`, interactionSelectors: controlsOf(element).slice(0, 80).map(stableSelector) },
    componentCandidates: componentCandidates(element, type),
  };
}

function pageShellElements(document: Document, type: "page-header" | "page-footer"): Element[] {
  const semantic = type === "page-header"
    ? document.querySelector('header, [class~="site-header"], [class*="header-"]')
    : document.querySelector('footer, [class~="site-footer"], [class*="footer-"]');
  if (semantic) return [semantic];
  if (type === "page-header") {
    const first = [...document.body.children].find((element) => controlsOf(element).length > 0 && textOf(element).length >= 5);
    if (first && first.querySelectorAll("[data-p]").length < 2) return [first];
  }
  if (type === "page-footer") {
    const roots = [...document.body.children].filter((element) => controlsOf(element).length > 0);
    const trailing = roots.at(-1);
    if (trailing && !trailing.matches("script, style") && textOf(trailing).length >= 10) return [trailing];
  }
  return [];
}

function isSectionCandidate(element: Element): boolean {
  const headingElement = [...element.children].find((child) => /^H[1-3]$/.test(child.tagName)) ?? [...element.querySelectorAll("h1, h2, h3")][0] ?? null;
  const heading = headingElement ? textOf(headingElement).replace(/[.。]+$/, "").trim() : "";
  if (element.matches("header, footer")) return false;
  if (!heading || heading.length > 100 || textOf(element).length < heading.length + 5) return false;
  const headingCount = element.querySelectorAll("h1, h2, h3").length;
  const direct = element.matches("section, article, main") && (headingCount === 1 || (element.matches("section") && headingCount <= 3 && /designing|currently|profile|intro|hero/i.test(heading))) && !element.closest("section section");
  const builder = element.matches(".e-con-inner > .elementor-element") && (headingElement?.tagName === "H1" || GENERIC_SECTION_NAMES.has(heading.toLowerCase()));
  return direct || builder;
}

function sectionView(element: Element, index: number): AnalyzedView {
  const heading = sectionHeading(element) || (element.matches("footer") ? "Site footer" : element.matches("header") ? "Site header" : `Section ${index + 1}`);
  const hero = /designing|currently|profile|intro|hero/i.test(heading) || element.matches("header, [class*=hero]");
  const type = element.matches("footer") ? "page-footer" : hero ? "hero-profile" : "content-section";
  const repeated = [...element.children].filter((child) => child.children.length > 0).length;
  return {
    id: `section-${index + 1}-${slug(heading)}`, type, structuralType: "content-region", semanticType: slug(heading), confidence: 0.82,
    evidence: [{ signal: "heading-led-section", value: heading }, { signal: "direct-child-regions", value: repeated }], selector: stableSelector(element),
    details: { text: heading, className: `${element.className ?? ""}`, heading, childRegions: repeated, interactionSelectors: controlsOf(element).slice(0, 80).map(stableSelector) }, componentCandidates: componentCandidates(element, slug(heading)),
  };
}

export class HtmlAnalyzer {
  readonly htmlPath: string;
  constructor(
    htmlPath: string,
    readonly options: { profile?: string; vertical?: string; minimal?: boolean; maxCssBytes?: number; maxStyleBytes?: number; maxScriptBytes?: number } = {},
  ) {
    this.htmlPath = resolve(htmlPath);
  }

  analyze(): Manifest {
    const source = readText(this.htmlPath);
    const budget: SourceBudget = {
      maxCssBytes: this.options.maxCssBytes ?? DEFAULT_MAX_CSS_BYTES,
      maxStyleBytes: this.options.maxStyleBytes ?? DEFAULT_MAX_STYLE_BYTES,
      maxScriptBytes: this.options.maxScriptBytes ?? DEFAULT_MAX_SCRIPT_BYTES,
    };
    const compacted = compactArchiveSource(source, budget);
    const dom = new JSDOM(compacted.text);
    const { document } = dom.window;
    const cssSource = cssFromDocument(dom, this.htmlPath, budget);
    const scriptSource = scriptsFromDocument(dom, this.htmlPath, budget);
    const css = cssSource.text;
    const scripts = scriptSource.text ? [scriptSource.text] : [];
    const warnings: string[] = [...compacted.warnings, ...cssSource.warnings, ...scriptSource.warnings];
    const profile = this.options.profile ?? this.options.vertical ?? PROFILE_FALLBACK;
    const views = this.analyzeViews(document, scriptSource.text);
    const contracts = extractContracts(scripts);
    const interactions = this.analyzeInteractions(document, scripts);
    const a11y = this.analyzeA11y(document);
    if (document.querySelectorAll("script[src^=http], link[href^=http], img[src^=http]").length) warnings.push("包含远程资源，运行态 roundtrip 可能无法完全复现");
    if (a11y.imagesWithoutAlt) warnings.push(`${a11y.imagesWithoutAlt} 个图片缺少 alt 文本`);
    if (!views.length) warnings.push("未识别到已注册视图范式，将按 generic 处理");

    const rootVariables = extractRootVariables(css);
    const cssColors = parseCssColors(css);
    const tokens = Object.entries(rootVariables).map(([original, value]) => ({
      name: normalizeTokenName(original),
      value,
      original,
      usage: [...css.matchAll(new RegExp(`([^{}]+)\\{[^{}]*${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"))].map((match) => match[1].trim()).slice(0, 8),
      roles: inferVariableRoles(css, original),
    }));
    for (const value of cssColors.filter((candidate) => !Object.values(rootVariables).includes(candidate)).slice(0, 20)) {
      tokens.push({ name: slug(value), value, original: value, usage: [], roles: colorRoles(css, value) });
    }

    return {
      schemaVersion: "1.0",
      meta: {
        source: this.htmlPath,
        title: document.title.trim(),
        templateId: document.querySelector('meta[name="template"]')?.getAttribute("content") ?? null,
        vertical: profile,
        profile,
        caseName: basename(this.htmlPath, extname(this.htmlPath)),
        canvas: { pc: null, wise: null, extreme: null, frameSelector: null },
      },
      theme: { tokens, gradients: extractGradients(css) },
      structure: {
        tabs: this.analyzeTabs(document),
        views,
        modals: [...document.querySelectorAll("[role=dialog], .modal, [class*=modal]")].map((element, index) => ({
          id: element.id || `modal-${index + 1}`,
          selector: stableSelector(element),
          role: element.getAttribute("role"),
          closeSelector: element.querySelector("[data-close], .close, [aria-label*=close i]") ? stableSelector(element.querySelector("[data-close], .close, [aria-label*=close i]")!) : null,
        })),
        landmarks: [...document.querySelectorAll("header, nav, main, aside, footer, [role]")].slice(0, 60).map((element) => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute("role"), selector: stableSelector(element) })),
      },
      data: { contracts, members: [], timeline: [], works: [], moreFacts: [] },
      interactions,
      responsive: extractMediaQueries(css),
      a11y,
      warnings,
    };
  }

  private analyzeTabs(document: Document): Manifest["structure"]["tabs"] {
    return [...document.querySelectorAll("[role=tab], [data-tab], .tab, [class*=tab]")].slice(0, 100).map((element, index) => ({
      id: element.id || `tab-${index + 1}`,
      label: textOf(element),
      selector: stableSelector(element),
      target: element.getAttribute("aria-controls") || element.getAttribute("data-target") || element.getAttribute("data-p") || null,
    }));
  }

  private analyzeViews(document: Document, scriptText: string): AnalyzedView[] {
    const candidates = [...document.body.querySelectorAll("section, main, article, [class], [role=tabpanel], [data-view]")];
    const specialized: AnalyzedView[] = [];
    for (const element of candidates) {
      const view = detectView(element, specialized.length);
      if (!view || specialized.some((item) => item.selector === view.selector)) continue;
      specialized.push(view);
      if (specialized.length >= 40) break;
    }
    const sections = candidates.filter(isSectionCandidate).filter((element, index, items) => !items.some((other, otherIndex) => otherIndex < index && other.contains(element) && sectionHeading(other).toLowerCase() === sectionHeading(element).toLowerCase()));
    const filteredSections = sections.filter((section) => !sections.some((other) => other !== section && section.contains(other) && sectionHeading(section).toLowerCase() === sectionHeading(other).toLowerCase()));
    const sectionViews = filteredSections.slice(0, 40).map(sectionView);
    const appViews = applicationViews(document, scriptText);
    const shellViews = [
      ...pageShellElements(document, "page-header").map((element, index) => shellView(element, "page-header", index)),
      ...pageShellElements(document, "page-footer").map((element, index) => shellView(element, "page-footer", index)),
    ];
    for (const view of specialized) {
      let element: Element | null = null;
      try { element = document.querySelector(view.selector); } catch { /* Stable selectors should be valid; retain a flat plan if not. */ }
      const parent = element ? [...filteredSections].filter((section) => section !== element && section.contains(element)).sort((a, b) => textOf(a).length - textOf(b).length)[0] : undefined;
      if (parent) view.details.parentSelector = stableSelector(parent);
    }
    const combined = [...appViews, ...specialized, ...shellViews, ...sectionViews].filter((view, index, items) => items.findIndex((item) => item.selector === view.selector) === index);
    return combined.slice(0, 60);
  }

  private analyzeInteractions(document: Document, scripts: string[]): Interaction[] {
    const items: Interaction[] = [];
    const mergeEvidence = (existing: Interaction, incoming: Interaction) => {
      existing.mutationTargets = [...new Set([...(existing.mutationTargets ?? []), ...(incoming.mutationTargets ?? [])])];
      existing.stateMutations = [...new Set([...(existing.stateMutations ?? []), ...(incoming.stateMutations ?? [])])];
      existing.stateTransitions = [...(existing.stateTransitions ?? []), ...(incoming.stateTransitions ?? [])].filter((item, index, items) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);
      existing.dataDependencies = [...new Set([...(existing.dataDependencies ?? []), ...(incoming.dataDependencies ?? [])])];
      if (incoming.target && !existing.target) existing.target = incoming.target;
      if (incoming.analysis === "ast") existing.analysis = "ast";
      existing.confidence = Math.max(existing.confidence ?? 0, incoming.confidence ?? 0);
    };
    const append = (interaction: Interaction) => {
      const existing = items.find((item) => item.event === interaction.event && item.trigger === interaction.trigger);
      if (existing) {
        if (interaction.analysis === "ast" && existing.analysis !== "ast") {
          const fingerprint = existing.fingerprint;
          Object.assign(existing, interaction, { fingerprint });
        } else mergeEvidence(existing, interaction);
      } else items.push(interaction);
    };
    for (const element of [...document.querySelectorAll("[onclick], [onchange], [oninput], [onkeydown], [data-action], [data-target], [data-tab], [data-p], [aria-controls]")]) {
      const trigger = stableSelector(element);
      const event = element.hasAttribute("onclick") ? "click" : element.hasAttribute("onchange") ? "change" : element.hasAttribute("oninput") ? "input" : element.hasAttribute("onkeydown") ? "keydown" : "click";
      const action = element.getAttribute("data-action") || element.getAttribute(`on${event}`) || "toggle";
      const target = element.getAttribute("data-target") || element.getAttribute("aria-controls") || element.getAttribute("data-p") || undefined;
      append({ trigger, event, action: action.slice(0, 120), target, source: "html-attribute", analysis: "attribute", confidence: 0.98, fingerprint: `${event}|${trigger}|${target ?? action}` });
    }
    for (const element of [...document.querySelectorAll("button, a, input, select, summary")]) {
      if (items.some((item) => item.trigger === stableSelector(element))) continue;
      const event = element.tagName.toLowerCase() === "input" || element.tagName.toLowerCase() === "select" ? "input" : "click";
      append({ trigger: stableSelector(element), event, action: "semantic-control", source: "semantic-control", analysis: "semantic", confidence: 0.6, fingerprint: `${event}|${stableSelector(element)}|semantic-control` });
    }
    const scriptText = scripts.join("\n");
    const ast = extractScriptInteractions(scriptText, document, stableSelector);
    for (const interaction of ast.interactions) append(interaction);

    // Preserve bounded regex fallbacks for malformed or budget-truncated legacy scripts.
    const appendRegexInteraction = (trigger: string, event: string, action: string) => append({ trigger, event, action, source: "script-assignment", analysis: "regex", confidence: 0.55, fingerprint: `${event}|${trigger}|script-assignment` });
    for (const match of scriptText.matchAll(/(?:[\w$.]+)\.querySelectorAll\(\s*(["'])([^"']+)\1\s*\)\.forEach\(\s*function\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{[\s\S]{0,800}?\b\3\.on(click|change|input|keydown)\s*=/g)) {
      const selector = match[2]; const event = match[4];
      let elements: Element[] = [];
      try { elements = [...document.querySelectorAll(selector)]; } catch { /* Preserve the raw selector as dynamic evidence. */ }
      if (elements.length) for (const element of elements) appendRegexInteraction(stableSelector(element), event, `regex fallback assigns on${event} via ${selector}`);
      else appendRegexInteraction(selector, event, `regex fallback assigns on${event} to dynamic ${selector}`);
    }
    for (const match of scriptText.matchAll(/document\.getElementById\(\s*(["'])([^"']+)\1\s*\)\.on(click|change|input|keydown)\s*=/g)) {
      const element = document.getElementById(match[2]);
      appendRegexInteraction(element ? stableSelector(element) : `#${escapeSelector(match[2])}`, match[3], `regex fallback assigns on${match[3]} by id`);
    }
    if (/\.className\s*=\s*["']gnd/.test(scriptText) && /\bel\.onclick\s*=/.test(scriptText)) appendRegexInteraction(".gnd:not(.center)", "click", "dynamic graph node handler");
    if (!ast.parsed) {
      for (const match of scriptText.matchAll(/addEventListener\(\s*["'](click|change|input|keydown|resize|scroll)["']/g)) {
        append({ trigger: "event-listener", event: match[1], action: "unresolved listener from malformed script", source: "event-listener", analysis: "regex", confidence: 0.25, fingerprint: `${match[1]}|event-listener|${match.index ?? 0}` });
      }
    }
    return items;
  }

  private analyzeA11y(document: Document): Manifest["a11y"] {
    const buttons = [...document.querySelectorAll("button, [role=button]")];
    const images = [...document.images];
    return {
      hasLang: Boolean(document.documentElement.getAttribute("lang")),
      buttons: buttons.length,
      unlabeledButtons: buttons.filter((item) => !item.getAttribute("aria-label") && !textOf(item) && !item.querySelector("img[alt]")) .length,
      images: images.length,
      imagesWithoutAlt: images.filter((item) => !item.hasAttribute("alt")).length,
      tabs: document.querySelectorAll("[role=tab]").length,
      tabpanels: document.querySelectorAll("[role=tabpanel]").length,
      dialogs: document.querySelectorAll("[role=dialog]").length,
    };
  }
}

export function analyzeHtml(htmlPath: string, options?: { profile?: string; vertical?: string; minimal?: boolean; maxCssBytes?: number; maxStyleBytes?: number; maxScriptBytes?: number }): Manifest {
  return new HtmlAnalyzer(htmlPath, options).analyze();
}
