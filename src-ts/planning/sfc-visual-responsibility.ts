import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { analyzeEChartsResponsibilities, type EChartsResponsibilityGraph } from "./echarts-responsibility.js";
import { analyzeSfcTemplateStructure, type SfcTemplateStructure } from "./sfc-template-structure.js";
import { analyzeDataCardinality, type DataCardinalityResponsibility } from "./data-cardinality.js";
import type { ApiFixtureResponsibilityGraph } from "./api-fixture-responsibility.js";
import { analyzeSfcStateResponsibilities, type SfcStateResponsibility } from "./sfc-state-responsibility.js";

export interface SfcStyleResponsibility {
  index: number;
  language: string;
  scoped: boolean;
  module: boolean;
  mediaQueries: string[];
  classSelectors: string[];
  customProperties: string[];
  compiledCss?: string;
  compileStatus: "compiled" | "raw-css" | "failed";
}

export interface SfcVisualResourceEvidence {
  kind: "canvas-element" | "canvas-api" | "webgl-context" | "request-animation-frame" | "zrender-runtime";
  sourceFile: string;
  line: number;
  detail: string;
}

export interface SfcVisualComponentResponsibility {
  id: string;
  file: string;
  componentName: string;
  imports: Array<{ local: string; source: string; thirdParty: boolean }>;
  childComponents: string[];
  templateStructure: SfcTemplateStructure;
  dataCardinality: DataCardinalityResponsibility;
  stateResponsibility: SfcStateResponsibility;
  visualRegions: string[];
  bindings: {
    events: string[];
    models: string[];
    conditions: string[];
    loops: string[];
  };
  lifecycle: string[];
  styles: SfcStyleResponsibility[];
  runtimeDependencies: string[];
  visualResourceEvidence: SfcVisualResourceEvidence[];
  chartResponsibilityIds: string[];
  confidence: "high" | "medium";
  reviewReasons: string[];
}

export interface SfcVisualResponsibilityGraph {
  schemaVersion: "1.0";
  kind: "sfc-visual-responsibility-graph";
  reviewRequired: true;
  sourceRoot: string;
  framework: "vue-sfc";
  components: SfcVisualComponentResponsibility[];
  echarts: EChartsResponsibilityGraph;
  apiFixtures?: ApiFixtureResponsibilityGraph;
  blockers: string[];
  reviewReasons: string[];
  metrics: {
    filesScanned: number;
    components: number;
    styledComponents: number;
    interactiveComponents: number;
    chartComponents: number;
    mediaQueries: number;
    templateNodes: number;
    elementUiPrimitives: number;
    responsiveGridNodes: number;
    embeddedSvgAssets: number;
    canvasResourceComponents: number;
    webglResourceComponents: number;
    frameDrivenComponents: number;
    compiledStyleSheets: number;
    failedStyleSheets: number;
    staticDataBindings: number;
    dataCardinalities: number;
    stateInitialBindings: number;
    stateHandlers: number;
    stateWrites: number;
    displayFunctions: number;
    unresolvedStateWrites: number;
    scanMs: number;
  };
}

interface SfcSections {
  template: string;
  script: string;
  styles: Array<{ attributes: string; source: string }>;
}

function listVueFiles(root: string): string[] {
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith(".vue")) output.push(absolute);
    }
  };
  visit(root);
  return output.sort();
}

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
function lineAt(source: string, offset: number): number { return source.slice(0, Math.max(0, offset)).split("\n").length; }
function visualResourceEvidence(relativePath: string, template: string, script: string, runtimeDependencies: string[]): SfcVisualResourceEvidence[] {
  const evidence: SfcVisualResourceEvidence[] = [];
  const record = (kind: SfcVisualResourceEvidence["kind"], source: string, regex: RegExp, detail: string): void => {
    for (const match of allMatches(source, regex)) evidence.push({ kind, sourceFile: relativePath, line: lineAt(source, match.index ?? 0), detail: `${detail}: ${match[0].slice(0, 120)}` });
  };
  record("canvas-element", template, /<canvas(?:\s|>)/gi, "template declares a Canvas rendering surface");
  record("webgl-context", script, /\.getContext\(\s*['"](?:webgl2?|experimental-webgl)['"]/g, "script acquires a WebGL rendering context");
  record("canvas-api", script, /\.getContext\(\s*['"]2d['"]|\.(?:fillRect|strokeRect|clearRect|drawImage|putImageData|fillText|strokeText|arc|bezierCurveTo|quadraticCurveTo)\s*\(/g, "script uses a Canvas 2D drawing API");
  record("request-animation-frame", script, /\brequestAnimationFrame\s*\(/g, "script registers a frame-driven render or update loop");
  if (runtimeDependencies.some((dependency) => /(?:^|\/)zrender(?:$|\/)/i.test(dependency))) {
    evidence.push({ kind: "zrender-runtime", sourceFile: relativePath, line: 1, detail: "component imports the ZRender runtime" });
  }
  return evidence.filter((item, index, items) => items.findIndex((candidate) => candidate.kind === item.kind && candidate.line === item.line && candidate.detail === item.detail) === index);
}
function allMatches(source: string, regex: RegExp): RegExpMatchArray[] {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...source.matchAll(new RegExp(regex.source, flags))];
}

function balancedSection(source: string, tagName: string): string {
  const opening = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "i").exec(source);
  if (!opening || opening.index === undefined) return "";
  const bodyStart = opening.index + opening[0].length;
  const tags = new RegExp(`<\\/?${tagName}(?:\\s[^>]*)?>`, "gi");
  tags.lastIndex = bodyStart;
  let depth = 1;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    if (/^<\//.test(match[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(bodyStart, match.index);
  }
  return source.slice(bodyStart);
}

function sections(source: string): SfcSections {
  const template = balancedSection(source, "template");
  const script = balancedSection(source, "script");
  const styles = allMatches(source, /<style([^>]*)>([\s\S]*?)<\/style>/gi).map((match) => ({ attributes: match[1], source: match[2] }));
  return { template, script, styles };
}

function componentName(relativePath: string, script: string): string {
  const declared = script.match(/export\s+default\s*\{\s*name\s*:\s*['"]([^'"]+)['"]/);
  if (declared) return declared[1];
  const stem = basename(relativePath, extname(relativePath));
  if (stem !== "index") return stem;
  return relativePath.split("/").slice(-2, -1)[0] || "AnonymousSfc";
}

function normalizeTag(tag: string): string {
  return tag.includes("-") ? tag.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join("") : tag;
}

function importResponsibilities(script: string): Array<{ local: string; source: string; thirdParty: boolean }> {
  const imports: Array<{ local: string; source: string; thirdParty: boolean }> = [];
  for (const match of allMatches(script, /import\s+([^;\n]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1].trim();
    const source = match[2];
    const locals = clause.startsWith("{")
      ? allMatches(clause, /([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/g).map((item) => item[2] ?? item[1]).filter((item) => item !== "as")
      : [clause.split(",")[0].trim().replace(/^\*\s+as\s+/, "")];
    for (const local of locals) imports.push({ local, source, thirdParty: !source.startsWith(".") && !source.startsWith("@/") });
  }
  return imports;
}



interface SassCompiler { compileString?: (source: string, options: Record<string, unknown>) => { css: string }; renderSync?: (options: Record<string, unknown>) => { css: Uint8Array | string } }
const sassCompilerByRoot = new Map<string, SassCompiler | null>();
function sassCompiler(root: string): SassCompiler | null {
  if (sassCompilerByRoot.has(root)) return sassCompilerByRoot.get(root) ?? null;
  try {
    const loaded = createRequire(join(root, "package.json"))("sass") as SassCompiler;
    sassCompilerByRoot.set(root, loaded); return loaded;
  } catch { sassCompilerByRoot.set(root, null); return null; }
}
function compileVisualStyle(root: string, absolutePath: string, language: string, source: string): { compiledCss?: string; compileStatus: SfcStyleResponsibility["compileStatus"] } {
  if (language === "css") return { compiledCss: source.trim(), compileStatus: "raw-css" };
  if (!["scss", "sass"].includes(language)) return { compileStatus: "failed" };
  const compiler = sassCompiler(root); if (!compiler) return { compileStatus: "failed" };
  try {
    const includePaths = [dirname(absolutePath), join(root, "src"), join(root, "src", "styles")];
    if (compiler.compileString) {
      const result = compiler.compileString(source, { syntax: language === "sass" ? "indented" : "scss", style: "compressed", loadPaths: includePaths, logger: { warn() {}, debug() {} } });
      return { compiledCss: String(result.css).trim(), compileStatus: "compiled" };
    }
    if (compiler.renderSync) {
      const result = compiler.renderSync({ data: source, outputStyle: "compressed", includePaths, indentedSyntax: language === "sass", file: absolutePath });
      return { compiledCss: Buffer.from(result.css).toString("utf8").trim(), compileStatus: "compiled" };
    }
    return { compileStatus: "failed" };
  } catch { return { compileStatus: "failed" }; }
}

function svgIconCandidates(attributes: Record<string, string | true>): string[] {
  const literal = attributes["icon-class"];
  const bound = attributes[":icon-class"];
  if (typeof literal === "string") return [literal];
  if (typeof bound !== "string") return [];
  const ternary = bound.match(/\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/);
  if (ternary) return unique([ternary[1], ternary[2]]);
  return unique([...bound.matchAll(/['"]([A-Za-z0-9_-]+)['"]/g)].map((match) => match[1]));
}

function embedSvgIconAssets(root: string, structure: SfcTemplateStructure): SfcTemplateStructure {
  for (const node of structure.nodes) {
    if (node.componentName !== "SvgIcon") continue;
    node.embeddedAssets = svgIconCandidates(node.attributes).flatMap((name) => {
      const absolute = join(root, "src", "icons", "svg", `${name}.svg`);
      if (!existsSync(absolute)) return [];
      const source = readFileSync(absolute, "utf8");
      const opening = source.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
      const width = opening.match(/\bwidth=['"]([^'"]+)['"]/i)?.[1];
      const height = opening.match(/\bheight=['"]([^'"]+)['"]/i)?.[1];
      const viewBox = opening.match(/\bviewBox=['"]([^'"]+)['"]/i)?.[1] ?? (width && height ? `0 0 ${width} ${height}` : "0 0 24 24");
      const markup = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1]?.trim() ?? "";
      return [{ kind: "svg" as const, name, sourcePath: relative(root, absolute).replaceAll("\\", "/"), viewBox, markup }];
    });
  }
  return structure;
}

const lifecycleNames = ["beforeCreate", "created", "beforeMount", "mounted", "beforeUpdate", "updated", "beforeDestroy", "destroyed", "beforeUnmount", "unmounted"];

export function analyzeSfcVisualResponsibilities(sourceRoot: string): SfcVisualResponsibilityGraph {
  const started = Date.now();
  const root = resolve(sourceRoot);
  const echarts = analyzeEChartsResponsibilities(root);
  const vueFiles = listVueFiles(root);
  const components = vueFiles.map((absolutePath, index): SfcVisualComponentResponsibility => {
    const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
    const parsed = sections(readFileSync(absolutePath, "utf8"));
    const imports = importResponsibilities(parsed.script);
    const tags = allMatches(parsed.template, /<([A-Za-z][\w-]*)\b/g).map((match) => match[1]);
    const nativeTags = new Set(["div", "span", "section", "main", "aside", "header", "footer", "nav", "button", "input", "form", "label", "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li", "a", "img", "svg", "path", "component", "template", "slot", "transition", "keep-alive"]);
    const childComponents = unique(tags.filter((tag) => tag.includes("-") || /^[A-Z]/.test(tag)).filter((tag) => !nativeTags.has(tag.toLowerCase())).map(normalizeTag));
    const visualRegions = unique(allMatches(parsed.template, /(?:class|:class)\s*=\s*['"]([^'"]+)['"]/g).flatMap((match) => allMatches(match[1], /[A-Za-z_][\w-]*/g).map((item) => item[0])).filter((item) => !["true", "false"].includes(item)));
    const events = unique(allMatches(parsed.template, /(?:@|v-on:)([\w-]+)/g).map((match) => match[1]));
    const models = unique(allMatches(parsed.template, /v-model(?::[\w-]+)?\s*=\s*['"]([^'"]+)['"]/g).map((match) => match[1]));
    const conditions = unique(allMatches(parsed.template, /v-(?:if|else-if|show)\s*=\s*['"]([^'"]+)['"]/g).map((match) => match[1]));
    const loops = unique(allMatches(parsed.template, /v-for\s*=\s*['"]([^'"]+)['"]/g).map((match) => match[1]));
    const dataCardinality = analyzeDataCardinality(parsed.script, loops);
    const stateResponsibility = analyzeSfcStateResponsibilities(parsed.script);
    const styles = parsed.styles.map((style, styleIndex): SfcStyleResponsibility => {
      const language = style.attributes.match(/\blang\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? "css";
      return {
        index: styleIndex, language,
        scoped: /\bscoped\b/.test(style.attributes),
        module: /\bmodule\b/.test(style.attributes),
        mediaQueries: unique(allMatches(style.source, /@media\s*([^\{]+)/g).map((match) => match[1].trim())),
        classSelectors: unique(allMatches(style.source, /\.([A-Za-z_][\w-]*)/g).map((match) => match[1])),
        customProperties: unique(allMatches(style.source, /(--[A-Za-z_][\w-]*)\s*:/g).map((match) => match[1])),
        ...compileVisualStyle(root, absolutePath, language, style.source),
      };
    });
    const lifecycle = lifecycleNames.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(parsed.script));
    const runtimeDependencies = unique(imports.filter((item) => item.thirdParty).map((item) => item.source.split("/")[0].startsWith("@") ? item.source.split("/").slice(0, 2).join("/") : item.source.split("/")[0]));
    const resourceEvidence = visualResourceEvidence(relativePath, parsed.template, parsed.script, runtimeDependencies);
    const chartResponsibilityIds = echarts.components.filter((item) => item.file === relativePath).map((item) => item.id);
    const reviewReasons: string[] = [];
    if (styles.some((style) => style.scoped)) reviewReasons.push("scoped styles require selector ownership preservation");
    if (events.length > 0) reviewReasons.push("template events require reviewed state-transition scenarios");
    if (chartResponsibilityIds.length > 0) reviewReasons.push("third-party chart lifecycle and visual output require Gold+ matrix validation");
    if (styles.some((style) => style.mediaQueries.length > 0)) reviewReasons.push("responsive style responsibilities require multi-viewport validation");
    return {
      id: `sfc:${index + 1}`,
      file: relativePath,
      componentName: componentName(relativePath, parsed.script),
      imports,
      childComponents,
      templateStructure: embedSvgIconAssets(root, analyzeSfcTemplateStructure(parsed.template)),
      dataCardinality,
      stateResponsibility,
      visualRegions,
      bindings: { events, models, conditions, loops },
      lifecycle,
      styles,
      runtimeDependencies,
      visualResourceEvidence: resourceEvidence,
      chartResponsibilityIds,
      confidence: parsed.template && (parsed.script || parsed.styles.length > 0) ? "high" : "medium",
      reviewReasons,
    };
  });
  const blockers: string[] = [];
  if (components.length === 0) blockers.push("no Vue SFC files were found");
  if (echarts.blockers.length > 0) blockers.push(...echarts.blockers.map((reason) => `echarts: ${reason}`));
  return {
    schemaVersion: "1.0",
    kind: "sfc-visual-responsibility-graph",
    reviewRequired: true,
    sourceRoot: root,
    framework: "vue-sfc",
    components,
    echarts,
    blockers,
    reviewReasons: [
      "the graph describes component, style, interaction, lifecycle, and runtime ownership; it does not rewrite source files",
      "generated targets remain review-only until route-state Semantic Gold+ and responsive visual matrices pass",
      "scoped styles, third-party renderers, and framework lifecycle hooks must retain explicit ownership",
    ],
    metrics: {
      filesScanned: vueFiles.length,
      components: components.length,
      styledComponents: components.filter((item) => item.styles.length > 0).length,
      interactiveComponents: components.filter((item) => item.bindings.events.length + item.bindings.models.length > 0).length,
      chartComponents: components.filter((item) => item.chartResponsibilityIds.length > 0).length,
      mediaQueries: components.reduce((sum, item) => sum + item.styles.reduce((styleSum, style) => styleSum + style.mediaQueries.length, 0), 0),
      templateNodes: components.reduce((sum, item) => sum + item.templateStructure.nodes.length, 0),
      elementUiPrimitives: components.reduce((sum, item) => sum + item.templateStructure.nodes.filter((node) => node.primitive).length, 0),
      responsiveGridNodes: components.reduce((sum, item) => sum + item.templateStructure.responsiveGridNodes, 0),
      embeddedSvgAssets: components.reduce((sum, item) => sum + item.templateStructure.nodes.reduce((nodeSum, node) => nodeSum + (node.embeddedAssets?.length ?? 0), 0), 0),
      canvasResourceComponents: components.filter((item) => item.visualResourceEvidence.some((evidence) => evidence.kind === "canvas-element" || evidence.kind === "canvas-api" || evidence.kind === "zrender-runtime")).length,
      webglResourceComponents: components.filter((item) => item.visualResourceEvidence.some((evidence) => evidence.kind === "webgl-context")).length,
      frameDrivenComponents: components.filter((item) => item.visualResourceEvidence.some((evidence) => evidence.kind === "request-animation-frame")).length,
      compiledStyleSheets: components.reduce((sum, item) => sum + item.styles.filter((style) => style.compileStatus !== "failed").length, 0),
      failedStyleSheets: components.reduce((sum, item) => sum + item.styles.filter((style) => style.compileStatus === "failed").length, 0),
      staticDataBindings: components.reduce((sum, item) => sum + Object.keys(item.dataCardinality.staticBindings).length, 0),
      dataCardinalities: components.reduce((sum, item) => sum + item.dataCardinality.cardinalities.length, 0),
      stateInitialBindings: components.reduce((sum, item) => sum + item.stateResponsibility.metrics.initialBindings, 0),
      stateHandlers: components.reduce((sum, item) => sum + item.stateResponsibility.metrics.handlers, 0),
      stateWrites: components.reduce((sum, item) => sum + item.stateResponsibility.metrics.stateWrites, 0),
      displayFunctions: components.reduce((sum, item) => sum + item.stateResponsibility.metrics.displayFunctions, 0),
      unresolvedStateWrites: components.reduce((sum, item) => sum + item.stateResponsibility.metrics.unresolvedWrites, 0),
      scanMs: Date.now() - started,
    },
  };
}
