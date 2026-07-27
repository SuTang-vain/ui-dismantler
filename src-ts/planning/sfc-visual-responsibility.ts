import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { analyzeEChartsResponsibilities, type EChartsResponsibilityGraph } from "./echarts-responsibility.js";

export interface SfcStyleResponsibility {
  index: number;
  language: string;
  scoped: boolean;
  module: boolean;
  mediaQueries: string[];
  classSelectors: string[];
  customProperties: string[];
}

export interface SfcVisualComponentResponsibility {
  id: string;
  file: string;
  componentName: string;
  imports: Array<{ local: string; source: string; thirdParty: boolean }>;
  childComponents: string[];
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
  blockers: string[];
  reviewReasons: string[];
  metrics: {
    filesScanned: number;
    components: number;
    styledComponents: number;
    interactiveComponents: number;
    chartComponents: number;
    mediaQueries: number;
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
function allMatches(source: string, regex: RegExp): RegExpMatchArray[] {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...source.matchAll(new RegExp(regex.source, flags))];
}

function sections(source: string): SfcSections {
  const template = source.match(/<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i)?.[1] ?? "";
  const script = source.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i)?.[1] ?? "";
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
    const styles = parsed.styles.map((style, styleIndex): SfcStyleResponsibility => ({
      index: styleIndex,
      language: style.attributes.match(/\blang\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? "css",
      scoped: /\bscoped\b/.test(style.attributes),
      module: /\bmodule\b/.test(style.attributes),
      mediaQueries: unique(allMatches(style.source, /@media\s*([^\{]+)/g).map((match) => match[1].trim())),
      classSelectors: unique(allMatches(style.source, /\.([A-Za-z_][\w-]*)/g).map((match) => match[1])),
      customProperties: unique(allMatches(style.source, /(--[A-Za-z_][\w-]*)\s*:/g).map((match) => match[1])),
    }));
    const lifecycle = lifecycleNames.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(parsed.script));
    const runtimeDependencies = unique(imports.filter((item) => item.thirdParty).map((item) => item.source.split("/")[0].startsWith("@") ? item.source.split("/").slice(0, 2).join("/") : item.source.split("/")[0]));
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
      visualRegions,
      bindings: { events, models, conditions, loops },
      lifecycle,
      styles,
      runtimeDependencies,
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
      scanMs: Date.now() - started,
    },
  };
}
