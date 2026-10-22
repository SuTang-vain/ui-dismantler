import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { JSDOM, VirtualConsole } from "jsdom";
import type { SourceBudget } from "../analysis/analyzer.js";
import type { ComponentPlanningReport } from "../planning/components.js";
import type { Manifest } from "../types.js";

const require = createRequire(import.meta.url);

interface CssTreeNode {
  type: string;
  name?: string;
  value?: CssTreeNode | string;
  prelude?: CssTreeNode | string;
  block?: CssTreeNode;
  loc?: { start: { offset: number }; end: { offset: number } };
  children?: { forEach(cb: (node: CssTreeNode) => void): void; toArray(): CssTreeNode[] };
  first?: () => CssTreeNode | null;
}
interface CssTreeApi {
  parse(source: string, options?: { positions?: boolean }): CssTreeNode;
  generate(node: CssTreeNode): string;
  walk(root: CssTreeNode, visitor: { enter(node: CssTreeNode, item?: unknown, list?: unknown): void }): void;
}
const csstree = require("css-tree") as CssTreeApi & { List?: unknown };

export interface MaterializeOptions {
  plan: ComponentPlanningReport;
  manifest?: Manifest;
  libName?: string;
  outDir: string;
  budgets?: Partial<SourceBudget>;
}

export interface MaterializeReport {
  kind: "html-materializer-report";
  libDir: string;
  libName: string;
  files: string[];
  components: string[];
  slots: { texts: number; links: number; images: number };
  classes: { renamed: number };
  css: { inputBytes: number; outputBytes: number; rulesKept: number; rulesDropped: number; colorsNormalized: number; keyframesKept: number; fontFacesKept: number; droppedAtrules: number; parseErrors: number };
  assets: string[];
  /** 几何依赖源页面运行时 JS 的元素（静态抽取无法复现），如实列出。 */
  deferredGeometry: string[];
  warnings: string[];
}

/* ---------------------------------------------------------------- naming */

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";
}
function pascal(value: string): string {
  const parts = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join("") || "Site";
}

const TAG_ROLES: Record<string, string> = {
  h1: "title", h2: "title", h3: "title", h4: "title", h5: "title", h6: "title",
  p: "text", a: "link", button: "btn", img: "media", picture: "media", video: "media",
  ul: "list", ol: "list", li: "item", svg: "icon", nav: "nav", header: "header",
  footer: "footer", form: "form", input: "input", select: "select", textarea: "input",
  table: "table", canvas: "canvas", figure: "media", figcaption: "caption", label: "label",
};

interface Renamer {
  classes: Map<string, string>;
  ids: Map<string, string>;
}

function createRenamer(): Renamer {
  return { classes: new Map(), ids: new Map() };
}

function renameClass(renamer: Renamer, compSlug: string, original: string, role: string, used: Set<string>): string {
  const existing = renamer.classes.get(original);
  if (existing) return existing;
  let candidate = `sg-${compSlug}-${role}`;
  let index = 2;
  while (used.has(candidate)) { candidate = `sg-${compSlug}-${role}-${index}`; index += 1; }
  used.add(candidate);
  renamer.classes.set(original, candidate);
  return candidate;
}

/* -------------------------------------------------------- fragment build */

interface SlotRecord { key: string; kind: "text" | "href" | "src" | "alt"; value: string }

interface FragmentBuild {
  componentId: string;
  componentName: string;
  slug: string;
  template: string;
  slots: SlotRecord[];
  elements: Element[]; // original-document elements, for CSS matching
  deferredGeometry: string[];
}

const SKIP_TAGS = new Set(["script", "style", "link", "meta", "template", "noscript"]);

function sanitizeNode(node: Element, renamer: Renamer, compSlug: string, slots: SlotRecord[], counters: { text: number; link: number; img: number }, usedClasses: Set<string>, assets: Map<string, string>, assetPrefix: string): void {
  // canvas/iframe 是脚本驱动的未建模行为区（见 manifest.structure.unmodeledBehaviors）：
  // 替换为占位容器。iframe srcdoc 属性可合法携带未转义的 </script>，直接复制会破坏
  // 任何内联本库的 <script> 标签。
  if (node.tagName === "IFRAME" || node.tagName === "CANVAS") {
    const placeholder = node.ownerDocument.createElement("div");
    placeholder.setAttribute("class", `sg-${compSlug}-${node.tagName === "CANVAS" ? "canvas" : "frame"}`);
    placeholder.setAttribute("data-sg-unmodeled", node.tagName.toLowerCase());
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", node.getAttribute("aria-label") ?? node.getAttribute("title") ?? "embedded scene");
    node.replaceWith(placeholder);
    return;
  }
  if (node.id) {
    const renamed = `sg-${compSlug}-${kebab(node.id)}`;
    renamer.ids.set(node.id, renamed);
    node.setAttribute("id", renamed);
  }
  const role = TAG_ROLES[node.tagName.toLowerCase()] ?? "box";
  if (node.classList.length) {
    const renamed = [...node.classList].map((name) => renameClass(renamer, compSlug, name, role, usedClasses));
    node.setAttribute("class", renamed.join(" "));
  }
  // Images: slot src/alt and externalize data URIs.
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (src) {
      let finalSrc = src;
      if (src.startsWith("data:") && src !== "data:,") {
        const ext = src.startsWith("data:image/png") ? "png" : src.startsWith("data:image/svg") ? "svg" : src.startsWith("data:image/webp") ? "webp" : src.startsWith("data:image/avif") ? "avif" : "bin";
        const name = `${assetPrefix}-${counters.img}.${ext}`;
        assets.set(name, src);
        finalSrc = `../assets/${name}`;
      } else if (src === "data:,") {
        // 归档压缩已清空 data URI：保留插槽，交由 data 注入回填。
        finalSrc = "";
      }
      const key = `${compSlug}-img-${counters.img}`;
      counters.img += 1;
      node.setAttribute("data-sg-src", key);
      slots.push({ key, kind: "src", value: finalSrc });
    }
    const alt = node.getAttribute("alt") ?? "";
    const altKey = `${compSlug}-alt-${counters.img}`;
    node.setAttribute("data-sg-alt", altKey);
    slots.push({ key: altKey, kind: "alt", value: alt || "image" });
    if (!node.getAttribute("alt")) node.setAttribute("alt", "");
  }
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (href && href !== "#") {
      const key = `${compSlug}-href-${counters.link}`;
      counters.link += 1;
      node.setAttribute("data-sg-href", key);
      slots.push({ key, kind: "href", value: href });
    }
  }
  // Text slots: replace direct text children with markers.
  for (const child of [...node.childNodes]) {
    if (child.nodeType !== 3) continue;
    const value = (child.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = `${compSlug}-t-${counters.text}`;
    counters.text += 1;
    const marker = node.ownerDocument.createElement("span");
    marker.setAttribute("data-sg-text", key);
    marker.textContent = value;
    node.replaceChild(marker, child);
    slots.push({ key, kind: "text", value });
  }
  for (const child of [...node.children]) {
    if (SKIP_TAGS.has(child.tagName.toLowerCase())) { child.remove(); continue; }
    if (child.hasAttribute("data-sg-text")) continue; // 我们刚创建的文本插槽标记，不再深入
    sanitizeNode(child, renamer, compSlug, slots, counters, usedClasses, assets, assetPrefix);
  }
}

/* ------------------------------------------------------------- CSS phase */

/** 原样收集页面 CSS（内联 <style> + 本地 link 样式表），不剥 data URI。 */
function collectRawCss(document: Document, htmlPath: string): string {
  const chunks: string[] = [];
  for (const node of [...document.querySelectorAll("style")]) chunks.push(node.textContent ?? "");
  for (const link of [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')]) {
    const href = link.getAttribute("href");
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const path = resolve(dirname(htmlPath), decodeURIComponent(href.split("#")[0].split("?")[0]));
    try { chunks.push(readFileSync(path, "utf8")); } catch { /* 缺失的本地样式表由运行时验证报告 */ }
  }
  return chunks.join("\n");
}

const DATA_URI_IN_URL = /url\(\s*(["']?)(data:(?:font|image)\/[a-z0-9.+-]*;base64,[a-z0-9+/=]+)\1\s*\)/gi;

function mimeToExt(mime: string): string {
  if (mime.includes("woff2")) return "woff2";
  if (mime.includes("woff")) return "woff";
  if (mime.includes("ttf")) return "ttf";
  if (mime.includes("otf")) return "otf";
  if (mime.includes("png")) return "png";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("avif")) return "avif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "bin";
}

/**
 * 把 CSS 里的 url(data:...) 资产落盘并改写为相对路径；按内容哈希去重。
 * 必须在颜色归一之前运行（base64 不含 #，顺序其实安全，但先落盘能缩小下游字符串）。
 */
function externalizeCssAssets(css: string, assets: Map<string, string>): string {
  return css.replace(DATA_URI_IN_URL, (_match, _quote, uri: string) => {
    const mime = uri.slice(5, uri.indexOf(";"));
    const hash = createHash("md5").update(uri).digest("hex").slice(0, 8);
    const name = `asset-${hash}.${mimeToExt(mime)}`;
    if (!assets.has(name)) assets.set(name, uri);
    return `url("../assets/${name}")`;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A rule selector matches when any included element matches its rightmost subject. */
function selectorMatches(selector: string, elements: Element[]): boolean {
  const subject = selector.trim().split(/[\s>+~]+/).pop() ?? "";
  const cleaned = subject.replace(/::?[a-z-]+(\([^)]*\))?/gi, (match) => (match.startsWith("::") || /^:(?:hover|focus|active|visited|focus-visible|focus-within|checked|disabled|first-child|last-child|nth|not|is|where|has|empty|root)/i.test(match) ? "" : match));
  if (!cleaned || !/[.#\w[]/.test(cleaned)) return false;
  return elements.some((element) => {
    try { return element.matches(cleaned) || element.matches(subject.replace(/::?[a-z-]+(\([^)]*\))?/gi, "")); }
    catch { return false; }
  });
}

interface CssSelection {
  css: string;
  rulesKept: number;
  rulesDropped: number;
  keyframesKept: number;
  fontFacesKept: number;
  droppedAtrules: number;
}

/** jsdom CSSOM 无法解析的选择器特性（:has 等）——保留它们会让整个样式表报错。 */
const UNSUPPORTED_SELECTOR_FEATURE = /:has\(|:state\(|::part\(|::slotted\(/i;

function selectFragmentCss(fullCss: string, elements: Element[], renamer: Renamer): CssSelection {
  const ast = csstree.parse(fullCss, { positions: false });
  const kept: string[] = [];
  let rulesKept = 0, rulesDropped = 0, keyframesKept = 0, fontFacesKept = 0, droppedAtrules = 0;
  const usedAnimationNames = new Set<string>();

  const processRules = (nodes: CssTreeNode[], sink: string[], inKeyframes = false): void => {
    for (const node of nodes) {
      if (node.type === "Rule") {
        const prelude = csstree.generate(node.prelude as CssTreeNode);
        if (UNSUPPORTED_SELECTOR_FEATURE.test(prelude)) { rulesDropped += 1; continue; }
        const selectors = prelude.split(",");
        const matching = selectors.filter((selector) => selectorMatches(selector, elements));
        if (!matching.length) { rulesDropped += 1; continue; }
        const bodyRaw = csstree.generate(node.block as CssTreeNode);
        const body = bodyRaw.startsWith("{") && bodyRaw.endsWith("}") ? bodyRaw.slice(1, -1) : bodyRaw;
        // Record animation names so referenced @keyframes survive below.
        for (const match of body.matchAll(/animation(?:-name)?\s*:\s*(?:var\([^)]*\),\s*)?([a-zA-Z][\w-]*)/g)) usedAnimationNames.add(match[1]);
        // Rename mapped classes and ids inside kept selectors.
        let renamed = matching.join(", ");
        for (const [from, to] of renamer.classes) renamed = renamed.replace(new RegExp(`\\.${escapeRegExp(from)}(?![\\w-])`, "g"), `.${to}`);
        for (const [from, to] of renamer.ids) renamed = renamed.replace(new RegExp(`#${escapeRegExp(from)}(?![\\w-])`, "g"), `#${to}`);
        sink.push(`${renamed}{${body}}`);
        rulesKept += 1;
      } else if (node.type === "Atrule") {
        const name = (node.name ?? "").toLowerCase();
        if (name === "media" || name === "supports") {
          const inner: string[] = [];
          if (node.block?.children) processRules(node.block.children.toArray(), inner);
          if (inner.length) sink.push(`@${name} ${csstree.generate(node.prelude as CssTreeNode)}{${inner.join("")}}`);
        } else if (name === "keyframes") {
          keyframes.push(node);
        } else if (name === "font-face") {
          fontFaces.push(node);
        } else {
          // 其余 at-rule（@property/@layer/@container/@scope/@import…）一律丢弃：
          // 零依赖库不允许外部引用，且 jsdom CSSOM 解析不了它们，会拖垮整个样式表。
          droppedAtrules += 1;
        }
      }
    }
  };
  const keyframes: CssTreeNode[] = [];
  const fontFaces: CssTreeNode[] = [];
  const top = (ast as CssTreeNode).children?.toArray() ?? [];
  processRules(top, kept);
  for (const node of fontFaces) { kept.push(csstree.generate(node)); fontFacesKept += 1; }
  for (const node of keyframes) {
    if (usedAnimationNames.has(node.name ?? "")) { kept.push(csstree.generate(node)); keyframesKept += 1; }
  }
  return { css: kept.join("\n"), rulesKept, rulesDropped, keyframesKept, fontFacesKept, droppedAtrules };
}

/* -------------------------------------------------- color normalization */

function normalizeColors(css: string): { css: string; vars: Map<string, string> } {
  const vars = new Map<string, string>();
  const out = css.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => {
    const key = hex.toLowerCase();
    const name = `--sg-c-${key.slice(1)}`;
    vars.set(name, key);
    return `var(${name})`;
  });
  return { css: out, vars };
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) / 255, g = parseInt(full.slice(2, 4), 16) / 255, b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function saturation(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) / 255, g = parseInt(full.slice(2, 4), 16) / 255, b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === min ? 0 : (max - min) / max;
}

function coreVars(colors: Map<string, string>): Record<string, string> {
  const entries = [...colors.values()];
  const byLum = [...entries].sort((a, b) => luminance(a) - luminance(b));
  const saturated = [...entries].sort((a, b) => saturation(b) - saturation(a));
  const ink = byLum[0] ?? "#1e1e1e";
  const paper = byLum.at(-1) ?? "#ffffff";
  const primary = saturated.find((c) => saturation(c) > 0.25) ?? ink;
  const muted = byLum.find((c) => luminance(c) > 0.15 && luminance(c) < 0.55 && saturation(c) < 0.2) ?? ink;
  const line = byLum.find((c) => luminance(c) > 0.6 && luminance(c) < 0.92 && saturation(c) < 0.25) ?? paper;
  return { "--sg-primary": primary, "--sg-ink": ink, "--sg-muted": muted, "--sg-line": line, "--sg-paper": paper };
}

/* ---------------------------------------------------------- JS template */

/**
 * 几何延迟元素检测：inline 100%×100% 的媒体元素，若其片段内没有任何祖先携带
 * 显式 inline 尺寸（px），则实际几何由源页面运行时 JS 决定，静态抽取无法复现。
 * 如实报告（选择器清单），不静默也不猜尺寸。
 */
function detectDeferredGeometry(fragmentRoot: Element): string[] {
  const hits: string[] = [];
  for (const element of [fragmentRoot, ...fragmentRoot.querySelectorAll("*")]) {
    const style = element.getAttribute("style") ?? "";
    if (!/width\s*:\s*100%/.test(style) || !/height\s*:\s*100%/.test(style)) continue;
    if (!/^(?:IMG|DIV|CANVAS|VIDEO)$/.test(element.tagName)) continue;
    let ancestor = element.parentElement;
    let sized = false;
    while (ancestor && ancestor !== fragmentRoot.parentElement) {
      const ancestorStyle = ancestor.getAttribute("style") ?? "";
      if (/(?:width|min-width)\s*:\s*\d+(?:\.\d+)?px/.test(ancestorStyle) && /(?:height|min-height)\s*:\s*\d+(?:\.\d+)?px/.test(ancestorStyle)) { sized = true; break; }
      if (ancestor === fragmentRoot) break;
      ancestor = ancestor.parentElement;
    }
    if (!sized) hits.push(element.id ? `#${element.id}` : element.tagName.toLowerCase() + (element.getAttribute("class") ? `.${(element.getAttribute("class") ?? "").split(/\s+/)[0]}` : ""));
  }
  return hits;
}

function generateLibraryJs(libName: string, fragments: FragmentBuild[]): string {
  const templates = fragments.map((fragment) => `  ${JSON.stringify(fragment.componentId)}: ${JSON.stringify(fragment.template).replace(/<\//g, "<\\/")}`).join(",\n");
  return `/* ${libName} — generated by ui-dismantler html materializer.
 * Structure extracted from the source page; all copy/media arrive via mount data.
 */
(function (global) {
  "use strict";

  var TEMPLATES = {
${templates}
  };

  function resolveData(options) {
    var data = (options && options.data) || {};
    if (typeof document !== "undefined") {
      var island = document.querySelector("script[type=\\"application/json\\"][id^=sg-]");
      if (island && !(options && options.data)) {
        try { data = JSON.parse(island.textContent || "{}"); } catch (error) { data = {}; }
      }
    }
    return data || {};
  }

  function applySlots(root, data) {
    var nodes = root.querySelectorAll("[data-sg-text],[data-sg-href],[data-sg-src],[data-sg-alt]");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var textKey = node.getAttribute("data-sg-text");
      if (textKey && data[textKey] != null) node.textContent = String(data[textKey]);
      var hrefKey = node.getAttribute("data-sg-href");
      if (hrefKey && data[hrefKey] != null) node.setAttribute("href", String(data[hrefKey]));
      var srcKey = node.getAttribute("data-sg-src");
      if (srcKey && data[srcKey] != null) node.setAttribute("src", String(data[srcKey]));
      var altKey = node.getAttribute("data-sg-alt");
      if (altKey && data[altKey] != null) node.setAttribute("alt", String(data[altKey]));
    }
  }

  function render(root, data) {
    root.innerHTML = "";
    var host = document.createElement("div");
    host.className = "sg-root";
    ${fragments.map((fragment) => `host.insertAdjacentHTML("beforeend", TEMPLATES[${JSON.stringify(fragment.componentId)}]);`).join("\n    ")}
    root.appendChild(host);
    applySlots(host, data);
    return host;
  }

  function mount(target, options) {
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) throw new Error("${libName}: mount target not found");
    var data = resolveData(options);
    var host = render(root, data);
    var api = {
      unmount: function () { if (host.parentNode) host.parentNode.removeChild(host); },
      destroy: function () { api.unmount(); root.innerHTML = ""; }
    };
    return api;
  }

  global.${libName} = { mount: mount };
})(typeof window !== "undefined" ? window : this);
`;
}

function generateExampleHtml(libName: string, cssFile: string, jsFile: string, dataJson: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — generated component library example</title>
<link rel="stylesheet" href="../src/${cssFile}">
<style>body{margin:0}</style>
</head>
<body>
<div id="mount"></div>
<script type="application/json" id="sg-data">
${dataJson}
</script>
<script src="../src/${jsFile}"></script>
<script>window.${libName}.mount("#mount")</script>
</body>
</html>
`;
}

function generateReadme(libName: string, exampleFile: string): string {
  return `# ${libName}

由 ui-dismantler html materializer 从源页面自动抽取的组件库。

## 使用

\`\`\`html
<link rel="stylesheet" href="src/${libName}.css">
<div id="mount"></div>
<script src="src/${libName}.js"></script>
<script>
  window.${libName}.mount("#mount", { data: {/* 覆盖默认空数据 */} });
</script>
\`\`\`

打开 \`examples/${exampleFile}\` 查看完整演示（数据来自内嵌 JSON 岛）。

## API

- \`mount(target, options?)\` — 渲染全部组件；\`options.data\` 注入业务数据，缺省时读取页面内 \`script#sg-data\` JSON 岛。
- 返回值含 \`unmount()\` 与 \`destroy()\`，用于卸载与清理。

## 数据边界

结构与样式内置，文案、链接、图片均通过 data 注入；库内默认数据保持中性（空字符串 / \`#\`）。
`;
}

function generateDesignSpec(colors: Record<string, string>): string {
  const rows = Object.entries(colors).map(([name, value]) => `| \`${name}\` | ${value} |`).join("\n");
  return `# 设计规范

## 主题色

| 变量 | 值 |
|---|---|
${rows}

颜色统一经 \`--sg-*\` 变量引用；派生色为 \`--sg-c-*\`。修改 \`:root\` 即可整体换肤。

## 结构

每个组件对应模板中的一段 \`sg-<组件>-*\` 结构，类名全部带 \`sg-\` 前缀。
`;
}

/* -------------------------------------------------------------- driver */

export async function materializeComponentLibrary(htmlPath: string, options: MaterializeOptions): Promise<MaterializeReport> {
  const warnings: string[] = [];
  const source = readFileSync(htmlPath, "utf8");
  // materialize 走原始文件而非归档压缩文本：压缩会把 data URI 清成 "data:,"，
  // 字体与图片资产正是本次要回填的对象。jsdom 不执行脚本，raw 解析是安全的。
  const dom = new JSDOM(source);
  const { document } = dom.window;
  const rawCss = collectRawCss(document, htmlPath);
  const fullCss = { text: rawCss, warnings: [] as string[] };

  const title = document.title.trim() || basename(htmlPath);
  const libName = options.libName ?? pascal(title.split(/[-–—|]/).at(-1) ?? title);
  const renamer = createRenamer();
  const usedClasses = new Set<string>();
  const assets = new Map<string, string>();
  const fragments: FragmentBuild[] = [];
  const matchedElements: Element[] = [];

  for (const component of options.plan.components) {
    const selector = component.sourceSelectors.find((candidate) => {
      try { return document.querySelector(candidate); } catch { return false; }
    });
    const original = selector ? document.querySelector(selector) : null;
    if (!original) { warnings.push(`组件 ${component.componentName} 的源选择器未命中：${component.sourceSelectors.join(", ")}`); continue; }
    const slug = kebab(component.componentName);
    const clone = original.cloneNode(true) as Element;
    const counters = { text: 0, link: 0, img: 0 };
    const slots: SlotRecord[] = [];
    clone.setAttribute("data-sg-component", slug);
    sanitizeNode(clone, renamer, slug, slots, counters, usedClasses, assets, slug);
    matchedElements.push(...[original, ...original.querySelectorAll("*")]);
    fragments.push({
      componentId: component.id,
      componentName: component.componentName,
      slug,
      template: clone.outerHTML,
      slots,
      elements: [original, ...original.querySelectorAll("*")],
      deferredGeometry: detectDeferredGeometry(clone),
    });
  }
  const deferredGeometry = fragments.flatMap((fragment) => fragment.deferredGeometry);
  if (deferredGeometry.length) warnings.push(`${deferredGeometry.length} 个元素的几何由源页面运行时 JS 决定，静态抽取无法复现（${deferredGeometry.slice(0, 5).join("、")}…）`);

  // CSS：仅保留命中已抽取元素的规则，类名/id 同步改写，颜色归一为变量。
  const selection = selectFragmentCss(fullCss.text, matchedElements, renamer);
  const withAssets = externalizeCssAssets(selection.css, assets);
  const normalized = normalizeColors(withAssets);
  const core = coreVars(normalized.vars);
  const derived = [...normalized.vars.entries()].filter(([name]) => !(name in core)).map(([name, value]) => `  ${name}: ${value};`).join("\n");
  const coreBlock = Object.entries(core).map(([name, value]) => `  ${name}: ${value};`).join("\n");
  const rootBlock = `:root {\n${coreBlock}\n${normalized.vars.size ? `${derived}\n` : ""}  --sg-font: "Helvetica Neue", "Inter", Arial, sans-serif;\n  --sg-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  --sg-gap: 32px;\n  --sg-radius: 2px;\n  --sg-max: 1180px;\n}`;

  const baseCss = `\n.sg-root { box-sizing: border-box; margin: 0; font-family: var(--sg-font); color: var(--sg-ink); background: var(--sg-paper); }\n.sg-root *, .sg-root *::before, .sg-root *::after { box-sizing: inherit; }\n.sg-root img { max-width: 100%; }\n@media (max-width: 500px) {\n  .sg-root { font-size: 15px; }\n}\n@media (max-width: 320px), (max-height: 380px) {\n  .sg-root { font-size: 14px; }\n}\n`;

  const cssText = `/* ${libName} — extracted styles, class names remapped to sg-*, colors normalized to variables. */\n${rootBlock}\n${normalized.css}\n${baseCss}`;

  // 运行时专用类（源页面里没有任何规则覆盖的类，如 Framer 变体标记）不进入产物：
  // 它们无视觉效果，却会让“DOM 类必有规则命中”的校验失败。按最终 CSS 反过滤模板。
  const covered = new Set([...cssText.matchAll(/\.(sg-[a-z0-9_-]+)/gi)].map((match) => match[1]));
  let droppedUncovered = 0;
  for (const fragment of fragments) {
    fragment.template = fragment.template.replace(/\s*class="([^"]*)"/g, (_match, list: string) => {
      const kept = list.split(/\s+/).filter((name) => covered.has(name));
      droppedUncovered += list.split(/\s+/).length - kept.length;
      return kept.length ? ` class="${kept.join(" ")}"` : "";
    });
  }
  if (droppedUncovered) warnings.push(`剔除 ${droppedUncovered} 个无样式证据的运行时类（源页面无对应规则）`);

  // 自检：生成的 CSS 必须能被 jsdom CSSOM 完整解析（roundtrip 运行时就靠它）。
  const cssProbe = (() => {
    const errors: string[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (error) => { if (/parse css/i.test(error.message)) errors.push(error.message); });
    new JSDOM(`<!doctype html><style>${cssText}</style>`, { virtualConsole });
    return errors.length;
  })();
  if (cssProbe) warnings.push(`生成 CSS 存在 ${cssProbe} 处 jsdom 解析错误，需人工检查`);
  const libDir = options.outDir;
  mkdirSync(join(libDir, "src"), { recursive: true });
  mkdirSync(join(libDir, "examples"), { recursive: true });
  mkdirSync(join(libDir, "docs"), { recursive: true });
  mkdirSync(join(libDir, "data"), { recursive: true });
  mkdirSync(join(libDir, "assets"), { recursive: true });
  const assetFiles: string[] = [];
  for (const [name, uri] of assets) {
    const base64 = uri.split(",")[1] ?? "";
    try {
      writeFileSync(join(libDir, "assets", name), Buffer.from(base64, "base64"));
      assetFiles.push(`assets/${name}`);
    } catch { warnings.push(`资产 ${name} 解码失败，已跳过`); }
  }

  const data: Record<string, string> = {};
  for (const fragment of fragments) for (const slot of fragment.slots) data[slot.key] = slot.value;
  const dataJson = JSON.stringify(data, null, 2).replace(/<\//g, "<\\/");

  const cssFile = `${libName}.css`;
  const jsFile = `${libName}.js`;
  const exampleFile = `${kebab(libName)}.html`;
  writeFileSync(join(libDir, "src", cssFile), cssText);
  writeFileSync(join(libDir, "src", jsFile), generateLibraryJs(libName, fragments));
  writeFileSync(join(libDir, "examples", exampleFile), generateExampleHtml(libName, cssFile, jsFile, dataJson, title));
  writeFileSync(join(libDir, "data", "data.json"), `${dataJson}\n`);
  writeFileSync(join(libDir, "README.md"), generateReadme(libName, exampleFile));
  writeFileSync(join(libDir, "docs", "设计规范.md"), generateDesignSpec(core));

  return {
    kind: "html-materializer-report",
    libDir,
    libName,
    files: [`src/${cssFile}`, `src/${jsFile}`, `examples/${exampleFile}`, "data/data.json", "README.md", "docs/设计规范.md", ...assetFiles],
    components: fragments.map((fragment) => fragment.componentName),
    slots: {
      texts: fragments.reduce((sum, fragment) => sum + fragment.slots.filter((slot) => slot.kind === "text").length, 0),
      links: fragments.reduce((sum, fragment) => sum + fragment.slots.filter((slot) => slot.kind === "href").length, 0),
      images: fragments.reduce((sum, fragment) => sum + fragment.slots.filter((slot) => slot.kind === "src").length, 0),
    },
    classes: { renamed: renamer.classes.size },
    css: {
      inputBytes: Buffer.byteLength(fullCss.text),
      outputBytes: Buffer.byteLength(cssText),
      rulesKept: selection.rulesKept,
      rulesDropped: selection.rulesDropped,
      colorsNormalized: normalized.vars.size,
      keyframesKept: selection.keyframesKept,
      fontFacesKept: selection.fontFacesKept,
      droppedAtrules: selection.droppedAtrules,
      parseErrors: cssProbe,
    },
    assets: assetFiles,
    deferredGeometry,
    warnings,
  };
}
