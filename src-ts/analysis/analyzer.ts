import { readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { extractGradients, extractMediaQueries, extractRootVariables, inferVariableRoles, normalizeTokenName } from "../core/css.js";
import type { DataContract, Interaction, Manifest, AnalyzedView } from "../types.js";

const COLOR_PROPERTIES = new Set(["color", "background", "background-color", "border-color", "box-shadow", "fill", "stroke"]);
const PROFILE_FALLBACK = "generic";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function cssFromDocument(dom: JSDOM, htmlPath: string): string {
  const document = dom.window.document;
  const chunks: string[] = [...document.querySelectorAll("style")].map((node) => node.textContent ?? "");
  for (const link of [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')]) {
    const href = link.getAttribute("href");
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const path = resolve(dirname(htmlPath), decodeURIComponent(href.split("#")[0].split("?")[0]));
    try {
      if (statSync(path).isFile()) chunks.push(readText(path));
    } catch {
      // Remote and missing resources are intentionally reported as warnings elsewhere.
    }
  }
  return chunks.join("\n");
}

function scriptsFromDocument(dom: JSDOM, htmlPath: string): string[] {
  const scripts: string[] = [];
  for (const script of [...dom.window.document.scripts]) {
    if (script.src) {
      try {
        const path = resolve(dirname(htmlPath), decodeURIComponent(new URL(script.src, `file://${htmlPath}`).pathname));
        if (statSync(path).isFile()) scripts.push(readText(path));
      } catch {
        // Keep going; a missing external script should not make static analysis impossible.
      }
    } else if (script.textContent?.trim()) {
      scripts.push(script.textContent);
    }
  }
  return scripts;
}

function escapeSelector(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `); }

function stableSelector(element: Element): string {
  if (element.id) return `#${escapeSelector(element.id)}`;
  const classes = [...element.classList].filter((item) => item.length > 1).slice(0, 2);
  if (classes.length) return `${element.tagName.toLowerCase()}.${classes.map((item) => escapeSelector(item)).join(".")}`;
  const parent = element.parentElement;
  if (!parent) return element.tagName.toLowerCase();
  const index = [...parent.children].indexOf(element) + 1;
  return `${stableSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64) || "item";
}

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
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

function detectView(element: Element, index: number): AnalyzedView | null {
  const classes = `${element.className ?? ""}`.toLowerCase();
  const text = textOf(element).toLowerCase();
  const signals: Array<[string, string, string, number]> = [
    ["carousel-3d", "collection", "carousel", 0.9],
    ["cause-chain", "sequence", "causechain", 0.95],
    ["nav-panel", "content-region", "data-p", 0.86],
    ["graph", "collection", "svg/node", 0.9],
    ["timeline", "sequence", "timeline", 0.88],
    ["member-grid", "collection", "member-grid", 0.9],
    ["detail-panel", "content-region", "detail-panel", 0.86],
    ["quiz", "form", "quiz", 0.86],
    ["comparison", "content-region", "whatif/cmp", 0.9],
    ["splash", "overlay", "splash", 0.85],
  ];
  let best: [string, string, string, number] | null = null;
  for (const signal of signals) {
    const [type, structuralType, needle, confidence] = signal;
    const hit = needle === "svg/node"
      ? Boolean(element.querySelector("svg, [class*=node]"))
      : needle === "data-p"
        ? element.querySelectorAll("[data-p], [data-tab]").length >= 2 && element.querySelectorAll("[role=tabpanel], .panel").length >= 2
        : needle === "whatif/cmp"
          ? /whatif|cmp-btn|comparison/.test(classes + text)
          : classes.includes(needle) || text.includes(needle);
    if (hit && (!best || confidence > best[3])) best = signal;
  }
  if (!best) return null;
  const [type, structuralType, needle, confidence] = best;
  return {
    id: `${type}-${index + 1}`,
    type,
    structuralType,
    semanticType: type,
    confidence,
    evidence: [{ signal: needle }],
    selector: stableSelector(element),
    details: { text: textOf(element).slice(0, 160), className: `${element.className ?? ""}` },
  };
}

export class HtmlAnalyzer {
  readonly htmlPath: string;
  constructor(
    htmlPath: string,
    readonly options: { profile?: string; vertical?: string; minimal?: boolean } = {},
  ) {
    this.htmlPath = resolve(htmlPath);
  }

  analyze(): Manifest {
    const source = readText(this.htmlPath);
    const dom = new JSDOM(source);
    const { document } = dom.window;
    const css = cssFromDocument(dom, this.htmlPath);
    const scripts = scriptsFromDocument(dom, this.htmlPath);
    const warnings: string[] = [];
    const profile = this.options.profile ?? this.options.vertical ?? PROFILE_FALLBACK;
    const views = this.analyzeViews(document);
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

  private analyzeViews(document: Document): AnalyzedView[] {
    const candidates = [...document.body.querySelectorAll("section, main, article, [class], [role=tabpanel], [data-view]")];
    const views: AnalyzedView[] = [];
    for (const element of candidates) {
      const view = detectView(element, views.length);
      if (!view) continue;
      if (views.some((item) => item.selector === view.selector)) continue;
      views.push(view);
      if (["cause-chain", "nav-panel", "graph"].includes(view.type)) break;
    }
    return views;
  }

  private analyzeInteractions(document: Document, scripts: string[]): Interaction[] {
    const items: Interaction[] = [];
    for (const element of [...document.querySelectorAll("[onclick], [onchange], [oninput], [onkeydown], [data-action], [data-target], [data-tab], [aria-controls]")]) {
      const trigger = stableSelector(element);
      const event = element.hasAttribute("onclick") ? "click" : element.hasAttribute("onchange") ? "change" : element.hasAttribute("oninput") ? "input" : element.hasAttribute("onkeydown") ? "keydown" : "click";
      const action = element.getAttribute("data-action") || element.getAttribute(`on${event}`) || "toggle";
      const target = element.getAttribute("data-target") || element.getAttribute("aria-controls") || element.getAttribute("data-p") || undefined;
      items.push({ trigger, event, action: action.slice(0, 120), target, source: "html-attribute", fingerprint: `${event}|${trigger}|${target ?? action}` });
    }
    for (const element of [...document.querySelectorAll("button, a, input, select, summary")]) {
      if (items.some((item) => item.trigger === stableSelector(element))) continue;
      const event = element.tagName.toLowerCase() === "input" || element.tagName.toLowerCase() === "select" ? "input" : "click";
      items.push({ trigger: stableSelector(element), event, action: "semantic-control", source: "semantic-control", fingerprint: `${event}|${stableSelector(element)}|semantic-control` });
    }
    const scriptText = scripts.join("\n");
    for (const match of scriptText.matchAll(/addEventListener\(\s*["'](click|change|input|keydown)["']/g)) {
      const fingerprint = `${match[1]}|event-listener|${match[0]}`;
      if (!items.some((item) => item.fingerprint === fingerprint)) items.push({ trigger: "event-listener", event: match[1], action: "listener", source: "event-listener", fingerprint });
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

export function analyzeHtml(htmlPath: string, options?: { profile?: string; vertical?: string; minimal?: boolean }): Manifest {
  return new HtmlAnalyzer(htmlPath, options).analyze();
}
