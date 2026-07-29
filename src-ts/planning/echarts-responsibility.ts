import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { collectStaticReferences, extractTopLevelStaticBindings, parseStaticExpression, type StaticExpressionValue } from "./static-expression.js";

export interface EChartsResponsibilityEvidence {
  file: string;
  line: number;
  pattern: string;
  detail: string;
}

export interface EChartsComponentResponsibility {
  id: string;
  file: string;
  componentName: string;
  confidence: "high" | "medium";
  themes: string[];
  chartTypes: string[];
  optionKeys: string[];
  optionSlices: Array<{ line: number; source: string; seriesCount: number; literalDataArrays: number; containerHeight?: string; option?: StaticExpressionValue; references: string[] }>;
  staticBindings: Record<string, StaticExpressionValue>;
  dataSources: string[];
  lifecycle: string[];
  interactions: string[];
  capabilities: {
    initializesChart: boolean;
    updatesOptions: boolean;
    watchesData: boolean;
    resizesChart: boolean;
    disposesChart: boolean;
    usesTheme: boolean;
  };
  evidence: EChartsResponsibilityEvidence[];
}

export interface EChartsResponsibilityGraph {
  schemaVersion: "1.0";
  kind: "echarts-responsibility-graph";
  reviewRequired: true;
  sourceRoot: string;
  runtime: "echarts";
  components: EChartsComponentResponsibility[];
  themes: string[];
  chartTypes: string[];
  blockers: string[];
  reviewReasons: string[];
  metrics: {
    filesScanned: number;
    chartFiles: number;
    components: number;
    evidenceCount: number;
    scanMs: number;
  };
}

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

function listSourceFiles(root: string): string[] {
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:vue|js|ts|tsx)$/.test(entry.name)) output.push(absolute);
    }
  };
  visit(root);
  return output.sort();
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function matches(source: string, regex: RegExp): RegExpMatchArray[] {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...source.matchAll(new RegExp(regex.source, flags))];
}

function evidence(file: SourceFile, regex: RegExp, detail: string): EChartsResponsibilityEvidence[] {
  return matches(file.source, regex).map((match) => ({
    file: file.relativePath,
    line: lineAt(file.source, match.index ?? 0),
    pattern: match[0].slice(0, 160),
    detail,
  }));
}

function componentName(file: SourceFile): string {
  const declared = file.source.match(/export\s+default\s*\{\s*name\s*:\s*['"]([^'"]+)['"]/);
  if (declared) return declared[1];
  const stem = basename(file.relativePath, extname(file.relativePath));
  if (stem !== "index") return stem;
  const parent = file.relativePath.split("/").slice(-2, -1)[0];
  return parent || "AnonymousChart";
}

const knownOptionKeys = ["xAxis", "yAxis", "grid", "tooltip", "legend", "series", "radar", "dataset", "visualMap", "dataZoom", "title"];
const chartRendererTypes = new Set(["line", "bar", "pie", "radar", "scatter", "effectScatter", "map", "graph", "gauge", "funnel", "heatmap", "treemap", "sunburst", "boxplot", "candlestick", "lines", "sankey", "parallel", "themeRiver", "pictorialBar", "wordCloud", "custom"]);
const lifecyclePatterns: Array<[string, RegExp]> = [
  ["mounted", /\bmounted\s*\(/], ["beforeDestroy", /\bbeforeDestroy\s*\(/], ["beforeUnmount", /\bbeforeUnmount\s*\(/],
  ["dispose", /\.dispose\s*\(/], ["resize", /\.resize\s*\(|\bresize\b/], ["watch", /\bwatch\s*:/],
];


function balancedObjectAfter(source: string, start: number): string | undefined {
  const openParen = source.indexOf("(", start);
  if (openParen < 0) return undefined;
  const firstArgument = source.slice(openParen + 1).match(/^\s*\{/);
  if (!firstArgument) return undefined;
  const open = openParen + 1 + (firstArgument[0].length - 1);
  let depth = 0, quote = "", escaped = false;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      const closeParen = source.slice(index + 1).match(/^\s*\)/);
      if (!closeParen) return undefined;
      const afterCall = source.slice(index + 1 + closeParen[0].length).trimStart();
      if (afterCall.startsWith("{")) return undefined;
      return source.slice(open, index + 1);
    }
  }
  return undefined;
}

function resolveImportedModule(sourceRoot: string, importer: SourceFile, specifier: string): string | undefined {
  const candidate = specifier.startsWith("@/")
    ? join(sourceRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer.absolutePath), specifier)
      : undefined;
  if (!candidate) return undefined;
  const candidates = [candidate, `${candidate}.ts`, `${candidate}.js`, `${candidate}.tsx`, `${candidate}.vue`, join(candidate, "index.ts"), join(candidate, "index.js"), join(candidate, "index.vue")];
  return candidates.find((item) => existsSync(item));
}

function importsChartRuntime(sourceRoot: string, file: SourceFile, runtimeFiles: Set<string>): boolean {
  return [...file.source.matchAll(/\bimport\s+(?:\{[^}]+\}|[A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)]
    .map((match) => resolveImportedModule(sourceRoot, file, match[1]))
    .some((importedFile) => Boolean(importedFile && runtimeFiles.has(importedFile)));
}
function chartContainerHeight(source: string): string | undefined {
  return source.match(/\bheight\s*:\s*\{[\s\S]{0,300}?\bdefault\s*:\s*["']([^"']+)["']/)?.[1]
    ?? source.match(/(?:height\s*:\s*|height=["'])(\d+(?:px|%|vh|rem)?)/i)?.[1];
}
function optionSlices(file: SourceFile): EChartsComponentResponsibility["optionSlices"] {
  return matches(file.source, /(?:\.setOption\b|\bsetOptions\b)\s*\(/g).flatMap((match) => {
    const object = balancedObjectAfter(file.source, match.index ?? 0); if (!object) return [];
    const option = parseStaticExpression(object);
    return [{
      line: lineAt(file.source, match.index ?? 0),
      source: object.slice(0, 12000),
      seriesCount: matches(object, /\btype\s*:\s*['"][A-Za-z][\w-]*['"]/g).length,
      literalDataArrays: matches(object, /\bdata\s*:\s*\[/g).length,
      containerHeight: chartContainerHeight(file.source),
      option,
      references: collectStaticReferences(option),
    }];
  });
}
export function analyzeEChartsResponsibilities(sourceRoot: string): EChartsResponsibilityGraph {
  const started = Date.now();
  const root = resolve(sourceRoot);
  const files: SourceFile[] = listSourceFiles(root).map((absolutePath) => ({
    absolutePath,
    relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
    source: readFileSync(absolutePath, "utf8"),
  }));
  const directChartFiles = files.filter((file) => /(?:from\s+['"]echarts['"]|require\s*\(\s*['"]echarts(?:\/[^'"]*)?['"]\s*\)|\becharts\.init\s*\()/.test(file.source));
  const directChartPaths = new Set(directChartFiles.map((file) => file.absolutePath));
  const runtimeWrapperPaths = new Set(directChartFiles.filter((file) => extname(file.relativePath) !== ".vue").map((file) => file.absolutePath));
  const visualSources = files.filter((file) => extname(file.relativePath) === ".vue" || /<template(?:\s|>)/i.test(file.source));
  const chartFiles = visualSources.filter((file) => directChartPaths.has(file.absolutePath) || (/\bsetOptions\s*\(/.test(file.source) && importsChartRuntime(root, file, runtimeWrapperPaths)));
  const components = chartFiles.map((file, index): EChartsComponentResponsibility => {
    const initEvidence = evidence(file, /\becharts\.init\s*\([^)]*/g, "ECharts instance initialization");
    const optionEvidence = evidence(file, /(?:\.setOption\b|\bsetOptions\b)\s*\(/g, "chart option application");
    const themeEvidence = evidence(file, /(?:echarts\/theme\/([\w-]+)|echarts\.init\s*\([^,]+,\s*['"]([^'"]+)['"])/g, "ECharts theme dependency");
    const chartTypeMatches = matches(file.source, /\btype\s*:\s*['"]([A-Za-z][\w-]*)['"]/g);
    const themes = unique(themeEvidence.flatMap((item) => {
      const match = item.pattern.match(/theme\/([\w-]+)|,\s*['"]([^'"]+)['"]/);
      return [match?.[1] ?? match?.[2] ?? ""];
    }));
    const dataSources = unique([
      ...matches(file.source, /\bdata\s*:\s*([A-Za-z_$][\w$]*)/g).map((match) => match[1]),
      ...matches(file.source, /\b(?:props|watch)\s*:[\s\S]{0,500}?\b([A-Za-z_$][\w$]*Data)\b/g).map((match) => match[1]),
      ...matches(file.source, /setOptions\s*\(\s*\{([^}]*)\}/g).flatMap((match) => matches(match[1], /([A-Za-z_$][\w$]*)/g).map((item) => item[1])),
    ]).filter((value) => !["normal", "itemStyle", "lineStyle", "areaStyle"].includes(value));
    const lifecycle = lifecyclePatterns.filter(([, pattern]) => pattern.test(file.source)).map(([name]) => name);
    const interactions = unique([
      ...matches(file.source, /\$emit\s*\(\s*['"]([^'"]+)['"]/g).map((match) => `emit:${match[1]}`),
      ...matches(file.source, /\b(handle[A-Z][A-Za-z0-9_$]*)\s*\(/g).map((match) => `handler:${match[1]}`),
      ...( /\bwatch\s*:[\s\S]*?chartData/.test(file.source) ? ["watch:chartData"] : []),
    ]);
    const lifecycleEvidence = lifecyclePatterns.flatMap(([name, pattern]) => evidence(file, pattern, `chart lifecycle: ${name}`));
    const allEvidence = [...initEvidence, ...optionEvidence, ...themeEvidence, ...lifecycleEvidence];
    return {
      id: `echarts:${index + 1}`,
      file: file.relativePath,
      componentName: componentName(file),
      confidence: initEvidence.length > 0 && optionEvidence.length > 0 ? "high" : "medium",
      themes,
      chartTypes: unique(chartTypeMatches.map((match) => match[1]).filter((type) => chartRendererTypes.has(type))),
      optionKeys: knownOptionKeys.filter((key) => new RegExp(`\\b${key}\\s*:`).test(file.source)),
      optionSlices: optionSlices(file),
      staticBindings: extractTopLevelStaticBindings([...file.source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n") || file.source),
      dataSources,
      lifecycle: unique(lifecycle),
      interactions,
      capabilities: {
        initializesChart: initEvidence.length > 0,
        updatesOptions: optionEvidence.length > 0,
        watchesData: /\bwatch\s*:[\s\S]*?chartData/.test(file.source),
        resizesChart: /\.resize\s*\(|mixins\s*:[^\]]*resize|from\s+['"][^'"]*resize['"]/.test(file.source),
        disposesChart: /\.dispose\s*\(/.test(file.source),
        usesTheme: themes.length > 0,
      },
      evidence: allEvidence,
    };
  });
  const blockers: string[] = [];
  if (components.some((item) => item.capabilities.initializesChart && !item.capabilities.disposesChart)) blockers.push("one or more ECharts components initialize a chart without an auditable dispose lifecycle");
  if (components.some((item) => item.chartTypes.length === 0)) blockers.push("one or more ECharts components require review because chart series types were not statically resolved");
  return {
    schemaVersion: "1.0",
    kind: "echarts-responsibility-graph",
    reviewRequired: true,
    sourceRoot: root,
    runtime: "echarts",
    components,
    themes: unique(components.flatMap((item) => item.themes)),
    chartTypes: unique(components.flatMap((item) => item.chartTypes)),
    blockers,
    reviewReasons: [
      "chart configuration and data ownership are extracted for review; runtime code is not copied or applied automatically",
      "third-party chart lifecycle, theme, resize, and dispose responsibilities must remain explicit",
      "visual acceptance still requires computed-style and pixel matrices at the reviewed route states",
    ],
    metrics: {
      filesScanned: files.length,
      chartFiles: chartFiles.length,
      components: components.length,
      evidenceCount: components.reduce((sum, item) => sum + item.evidence.length, 0),
      scanMs: Date.now() - started,
    },
  };
}
