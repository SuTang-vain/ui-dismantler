import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { parse, type AnyNode } from "acorn";
import { simple } from "acorn-walk";
import { spaRouterFixturePathMatches, type SpaRouterContractConfig, type SpaRouterFixture } from "../evaluation/spa-router.js";
import type { JsonValue } from "../types.js";
import type { SfcVisualComponentResponsibility } from "./sfc-visual-responsibility.js";

export interface ApiFixtureRenderedField {
  field: string;
  label?: string;
  width?: number;
  minWidth?: number;
  align?: string;
  filters: string[];
  prefix?: string;
  suffix?: string;
  tagged: boolean;
}

export interface ApiFixtureResponsibility {
  id: string;
  componentId: string;
  componentName: string;
  componentFile: string;
  apiCall: {
    localName: string;
    exportedName: string;
    importSource: string;
    moduleFile: string;
    method: string;
    path: string;
    transportPrefixes: Array<{ value: string; source: string }>;
    transportPathCandidates: string[];
    runtimeSelections: TransportRuntimeSelection[];
    proxyRoutes: TransportProxyRouteEvidence[];
  };
  consumption: {
    targetBinding: string;
    responsePath: string;
    sliceLimit?: number;
  };
  renderedFields: ApiFixtureRenderedField[];
  filterValueMaps: Record<string, Record<string, string>>;
  fixture: {
    index: number;
    requestPath?: string;
    reviewed: true;
    bodyHash: string;
    responseValue: JsonValue;
    materializedValue: JsonValue;
  };
  confidence: "high" | "medium";
  reviewReasons: string[];
}

export interface ApiFixtureResponsibilityGraph {
  schemaVersion: "1.0";
  kind: "api-fixture-responsibility-graph";
  reviewRequired: true;
  sourceRoot: string;
  responsibilities: ApiFixtureResponsibility[];
  unresolved: Array<{ componentId: string; apiLocalName: string; reason: string }>;
  metrics: {
    componentsScanned: number;
    importedApiCalls: number;
    matchedEndpoints: number;
    matchedFixtures: number;
    materializedBindings: number;
    renderedFields: number;
    transportPrefixesInferred: number;
    runtimeSelectionsInferred: number;
    proxyRoutesInferred: number;
    proxyTargetsInferred: number;
    proxyRewriteRulesInferred: number;
    proxyAstRoutesInferred: number;
    proxyFallbackRoutesInferred: number;
    proxyParseDiagnostics: number;
  };
  reviewReasons: string[];
}

interface SfcSections { template: string; script: string }
interface ImportedApi { localName: string; exportedName: string; source: string }
interface Endpoint { exportedName: string; method: string; path: string; moduleFile: string }
interface Consumption { targetBinding: string; responsePath: string; sliceLimit?: number }
interface TransportPrefixEvidence { value: string; source: string }
export interface TransportRuntimeSelection {
  environment: string;
  variable: string;
  value: string;
  source: string;
}
export interface TransportProxyDecisionBranch {
  condition: string;
  rawOutcome: string;
  outcomeKind: "literal" | "environment" | "boolean" | "nullish" | "expression";
  outcomeCandidates: string[];
}
export interface TransportProxyRouteEvidence {
  requestPrefix: string;
  environment: string;
  source: string;
  configSource: string;
  scopeSources: string[];
  framework: "vite" | "webpack" | "vue-cli" | "unknown";
  contextCandidates: string[];
  targetCandidates: string[];
  routerCandidates: string[];
  routerDecisionBranches: TransportProxyDecisionBranch[];
  bypassDecisionBranches: TransportProxyDecisionBranch[];
  changeOrigin?: boolean;
  secure?: boolean;
  ws?: boolean;
  configureHook: boolean;
  bypassHook: boolean;
  rewriteKind?: "path-rewrite-map" | "rewrite-callback";
  rewritePattern?: string;
  rewriteReplacement?: string;
  upstreamPathCandidate?: string;
  analysisMode: "scope-ast" | "regex-fallback";
  analysisDiagnostics: string[];
}
interface EnvironmentAssignment extends TransportRuntimeSelection {}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function balancedSection(source: string, tagName: string): string {
  const opening = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "i").exec(source);
  if (!opening || opening.index === undefined) return "";
  const start = opening.index + opening[0].length;
  const tags = new RegExp(`<\\/?${tagName}(?:\\s[^>]*)?>`, "gi");
  tags.lastIndex = start;
  let depth = 1;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return source.slice(start, match.index);
  }
  return source.slice(start);
}
function sections(source: string): SfcSections {
  return { template: balancedSection(source, "template"), script: balancedSection(source, "script") };
}
function importedApis(script: string): ImportedApi[] {
  const output: ImportedApi[] = [];
  for (const match of script.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const token of match[1].split(",").map((item) => item.trim()).filter(Boolean)) {
      const parts = token.split(/\s+as\s+/);
      output.push({ exportedName: parts[0].trim(), localName: (parts[1] ?? parts[0]).trim(), source: match[2] });
    }
  }
  return output;
}
function moduleCandidates(sourceRoot: string, componentFile: string, imported: string): string[] {
  const base = imported.startsWith("@/")
    ? join(sourceRoot, "src", imported.slice(2))
    : imported.startsWith(".")
      ? resolve(dirname(join(sourceRoot, componentFile)), imported)
      : "";
  if (!base) return [];
  return unique([base, `${base}.js`, `${base}.ts`, `${base}.mjs`, join(base, "index.js"), join(base, "index.ts")]);
}
function endpointFromModule(moduleFile: string, exportedName: string): Endpoint | undefined {
  const source = readFileSync(moduleFile, "utf8");
  const declaration = new RegExp(`export\\s+function\\s+${exportedName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)(?:\\n\\}|$)`).exec(source)?.[1];
  if (!declaration) return undefined;
  const path = declaration.match(/\burl\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (!path) return undefined;
  const method = declaration.match(/\bmethod\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? "get";
  return { exportedName, method: method.toUpperCase(), path, moduleFile };
}
function environmentAssignments(sourceRoot: string): EnvironmentAssignment[] {
  const assignments: EnvironmentAssignment[] = [];
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(".env")) continue;
    const environment = entry.name === ".env" ? "default" : entry.name.slice(".env.".length);
    const source = readFileSync(join(sourceRoot, entry.name), "utf8");
    for (const match of source.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*=\s*['"]?([^'"\r\n#]+)['"]?\s*$/gm)) {
      assignments.push({ environment, variable: match[1], value: match[2].trim(), source: `${entry.name}:${match[1]}` });
    }
  }
  return assignments;
}

function requestClientEvidence(sourceRoot: string, moduleFile: string, exportedName: string): { clientFile?: string; environmentVariable?: string; prefixes: TransportPrefixEvidence[]; runtimeSelections: TransportRuntimeSelection[] } {
  const source = readFileSync(moduleFile, "utf8");
  const declaration = new RegExp(`export\\s+function\\s+${exportedName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)(?:\\n\\}|$)`).exec(source)?.[1] ?? "";
  const clientName = declaration.match(/\breturn\s+([A-Za-z_$][\w$]*)\s*\(/)?.[1];
  if (!clientName) return { prefixes: [], runtimeSelections: [] };
  const importSource = [...source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)].find((entry) => entry[1] === clientName)?.[2];
  if (!importSource) return { prefixes: [], runtimeSelections: [] };
  const relativeModule = relative(sourceRoot, moduleFile).replaceAll("\\", "/");
  const clientFile = moduleCandidates(sourceRoot, relativeModule, importSource).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!clientFile) return { prefixes: [], runtimeSelections: [] };
  const clientSource = readFileSync(clientFile, "utf8");
  const clientSourceName = relative(sourceRoot, clientFile).replaceAll("\\", "/");
  const literal = clientSource.match(/\bbaseURL\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (literal) return { clientFile, prefixes: [{ value: literal, source: clientSourceName }], runtimeSelections: [] };
  const environmentVariable = clientSource.match(/\bbaseURL\s*:\s*(?:process\.env|import\.meta\.env)\.([A-Za-z_$][\w$]*)/)?.[1];
  if (environmentVariable) {
    const runtimeSelections = environmentAssignments(sourceRoot).filter((item) => item.variable === environmentVariable);
    return {
      clientFile, environmentVariable,
      prefixes: runtimeSelections.map((item) => ({ value: item.value, source: item.source })),
      runtimeSelections,
    };
  }
  const ternary = clientSource.match(/\bbaseURL\s*:\s*process\.env\.([A-Za-z_$][\w$]*)\s*===?\s*['"]([^'"]+)['"]\s*\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/);
  if (ternary) {
    return {
      clientFile, environmentVariable: ternary[1],
      prefixes: [
        { value: ternary[3], source: `${clientSourceName}:${ternary[1]}=${ternary[2]}` },
        { value: ternary[4], source: `${clientSourceName}:${ternary[1]}!=${ternary[2]}` },
      ],
      runtimeSelections: [
        { environment: ternary[2], variable: ternary[1], value: ternary[3], source: clientSourceName },
        { environment: `not-${ternary[2]}`, variable: ternary[1], value: ternary[4], source: clientSourceName },
      ],
    };
  }
  return { clientFile, prefixes: [], runtimeSelections: [] };
}

function proxyConfigCandidates(sourceRoot: string): string[] {
  return [
    "vite.config.js", "vite.config.cjs", "vite.config.mjs", "vite.config.ts", "vite.config.mts",
    "vue.config.js", "vue.config.cjs", "vue.config.mjs", "vue.config.ts",
    "webpack.config.js", "webpack.config.cjs", "webpack.config.mjs", "webpack.config.ts", join("config", "index.js"),
  ].map((item) => join(sourceRoot, item)).filter((item) => existsSync(item) && statSync(item).isFile());
}

function proxyFramework(configFile: string): TransportProxyRouteEvidence["framework"] {
  const name = configFile.replaceAll("\\", "/").split("/").pop() ?? "";
  if (name.startsWith("vite.config.")) return "vite";
  if (name.startsWith("vue.config.")) return "vue-cli";
  if (name.startsWith("webpack.config.") || name === "index.js") return "webpack";
  return "unknown";
}

function environmentReferences(source: string): string[] {
  return unique([...source.matchAll(/(?:process\.env|import\.meta\.env|\b[A-Za-z_$][\w$]*)\.((?:VITE_|VUE_APP_|REACT_APP_|NEXT_PUBLIC_|APP_)[A-Za-z0-9_$]*)/g)].map((match) => match[1]));
}

function environmentValueCandidates(assignments: EnvironmentAssignment[], variables: string[], environment: string): string[] {
  return unique(variables.flatMap((variable) => assignments
    .filter((item) => item.variable === variable && (item.environment === environment || environment === "runtime" || item.environment === "default"))
    .map((item) => item.value)));
}

function proxyContexts(source: string): string[] {
  const literals = [...source.matchAll(/['"](\/[^'"]+)['"]\s*:\s*\{/g)].map((match) => match[1]);
  const direct = [...source.matchAll(/\bcontext\s*:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const arrays = [...source.matchAll(/\bcontext\s*:\s*\[([^\]]+)\]/g)].flatMap((match) => [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]));
  return unique([...literals, ...direct, ...arrays]);
}

function proxyBoolean(source: string, property: "changeOrigin" | "secure" | "ws"): boolean | undefined {
  const match = new RegExp(`\\b${property}\\s*:\\s*(true|false)`).exec(source);
  return match ? match[1] === "true" : undefined;
}

function callbackRewrite(source: string): { pattern: string; replacement: string } | undefined {
  const patterns = [
    /\b(?:rewrite|pathRewrite)\s*:\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[A-Za-z_$][\w$]*\.replace\(\s*\/((?:\\.|[^/])+)\/[dgimsuvy]*\s*,\s*['"]([^'"]*)['"]\s*\)/,
    /\b(?:rewrite|pathRewrite)\s*:\s*function\s*\([^)]*\)\s*\{[\s\S]{0,240}?return\s+[A-Za-z_$][\w$]*\.replace\(\s*\/((?:\\.|[^/])+)\/[dgimsuvy]*\s*,\s*['"]([^'"]*)['"]\s*\)/,
    /\b(?:rewrite|pathRewrite)\s*\([^)]*\)\s*\{[\s\S]{0,240}?return\s+[A-Za-z_$][\w$]*\.replace\(\s*\/((?:\\.|[^/])+)\/[dgimsuvy]*\s*,\s*['"]([^'"]*)['"]\s*\)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match) return { pattern: match[1].replaceAll("\\/", "/"), replacement: match[2] };
  }
  return undefined;
}

function proxyRouterReferences(source: string): { variables: string[]; literals: string[] } {
  const returns = proxyFunctionBodies(source, "router").flatMap((body) => [...body.matchAll(/return\s+([^;\n}]+)/g)].map((match) => match[1].trim()));
  return {
    variables: unique(returns.flatMap((value) => [...value.matchAll(/(?:process\.env|import\.meta\.env|\b[A-Za-z_$][\w$]*)\.((?:VITE_|VUE_APP_|REACT_APP_|NEXT_PUBLIC_|APP_)[A-Za-z0-9_$]*)/g)].map((match) => match[1]))),
    literals: unique(returns.map((value) => /^['"]([^'"]+)['"]$/.exec(value)?.[1]).filter((item): item is string => Boolean(item))),
  };
}

interface ConditionalProxyReturn {
  condition: string;
  rawOutcome: string;
  outcomeKind: TransportProxyDecisionBranch["outcomeKind"];
  environmentVariable?: string;
  literalCandidate?: string;
}

function proxyFunctionBodies(source: string, property: "router" | "bypass"): string[] {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = [
    ...[...source.matchAll(new RegExp(`\\b${escaped}\\s*:\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>\\s*\\{([\\s\\S]{0,1200}?)\\}`, "g"))].map((match) => match[1]),
    ...[...source.matchAll(new RegExp(`\\b${escaped}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,1200}?)\\}`, "g"))].map((match) => match[1]),
    ...[...source.matchAll(new RegExp(`\\b${escaped}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,1200}?)\\}`, "g"))].map((match) => match[1]),
  ];
  const expressions = [...source.matchAll(new RegExp(`\\b${escaped}\\s*:\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>\\s*([^,}]+)`, "g"))].map((match) => `return ${match[1]}`);
  return unique([...bodies, ...expressions]);
}

function classifyConditionalOutcome(rawOutcome: string, aliases: Map<string, string>): Omit<ConditionalProxyReturn, "condition"> {
  const raw = rawOutcome.trim().replace(/;$/, "");
  const literal = /^['"]([^'"]*)['"]$/.exec(raw);
  if (literal) return { rawOutcome: raw, outcomeKind: "literal", literalCandidate: literal[1] };
  if (/^(?:true|false)$/.test(raw)) return { rawOutcome: raw, outcomeKind: "boolean", literalCandidate: raw };
  if (/^(?:null|undefined)$/.test(raw)) return { rawOutcome: raw, outcomeKind: "nullish", literalCandidate: raw };
  const environment = /(?:process\.env|import\.meta\.env|\b[A-Za-z_$][\w$]*)\.((?:VITE_|VUE_APP_|REACT_APP_|NEXT_PUBLIC_|APP_)[A-Za-z0-9_$]*)/.exec(raw)?.[1];
  if (environment) return { rawOutcome: raw, outcomeKind: "environment", environmentVariable: environment };
  const alias = /^[A-Za-z_$][\w$]*$/.test(raw) ? aliases.get(raw) : undefined;
  if (alias) return { rawOutcome: raw, outcomeKind: "environment", environmentVariable: alias };
  return { rawOutcome: raw, outcomeKind: "expression" };
}

function conditionalProxyReturns(source: string, property: "router" | "bypass", aliases: Map<string, string>): ConditionalProxyReturn[] {
  const output: ConditionalProxyReturn[] = [];
  for (const body of proxyFunctionBodies(source, property)) {
    const occupied: Array<[number, number]> = [];
    for (const match of body.matchAll(/if\s*\(([^)]{1,320})\)\s*(?:\{\s*)?return\s+([^;\n}]+)\s*;?\s*\}?/g)) {
      if (match.index === undefined) continue;
      occupied.push([match.index, match.index + match[0].length]);
      output.push({ condition: match[1].trim().replace(/\s+/g, " "), ...classifyConditionalOutcome(match[2], aliases) });
    }
    for (const match of body.matchAll(/return\s+([^;\n}]+)\s*;?/g)) {
      if (match.index === undefined || occupied.some(([start, end]) => match.index! >= start && match.index! < end)) continue;
      output.push({ condition: "default", ...classifyConditionalOutcome(match[1], aliases) });
    }
  }
  return output.filter((branch, index, values) => values.findIndex((item) => item.condition === branch.condition && item.rawOutcome === branch.rawOutcome) === index);
}

function materializeDecisionBranches(branches: ConditionalProxyReturn[], assignments: EnvironmentAssignment[], environment: string): TransportProxyDecisionBranch[] {
  return branches.map((branch) => ({
    condition: branch.condition,
    rawOutcome: branch.rawOutcome,
    outcomeKind: branch.outcomeKind,
    outcomeCandidates: branch.environmentVariable
      ? environmentValueCandidates(assignments, [branch.environmentVariable], environment)
      : branch.literalCandidate !== undefined ? [branch.literalCandidate] : [],
  }));
}

interface ScopedProxyEntry {
  source: string;
  sourceFile: string;
  sourceFiles: string[];
  aliasSources: string[];
  contextCandidates: string[];
  contextVariables: string[];
}

interface ProxyScopeParseResult {
  entries: ScopedProxyEntry[];
  diagnostics: string[];
  fallbackRequired: boolean;
}

interface AstImportBinding { imported: string; source: string }
interface AstModuleContext {
  file: string;
  source: string;
  program: AnyNode;
  variables: Map<string, AnyNode>;
  functions: Map<string, AnyNode>;
  imports: Map<string, AstImportBinding>;
  exports: Map<string, string | AnyNode>;
}
interface AstExpressionRef { node: AnyNode; module: AstModuleContext }

function propertyName(node: AnyNode | undefined, source: string): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name as string;
  if (node.type === "Literal" && (typeof node.value === "string" || typeof node.value === "number")) return String(node.value);
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) return node.quasis?.[0]?.value?.cooked as string | undefined;
  return source.slice(node.start, node.end).replace(/^['"]|['"]$/g, "");
}

function objectMember(object: AnyNode, name: string, source: string): AnyNode | undefined {
  return ((object as any).properties as AnyNode[] | undefined)?.find((property) => property.type === "Property" && propertyName((property as any).key as AnyNode, source) === name);
}

function memberInitializer(member: AnyNode | undefined): AnyNode | undefined {
  return member?.type === "Property" ? (member as any).value as AnyNode : undefined;
}

function literalStrings(expression: AnyNode | undefined): string[] {
  if (!expression) return [];
  if (expression.type === "Literal" && typeof (expression as any).value === "string") return [(expression as any).value as string];
  if (expression.type === "TemplateLiteral" && (expression as any).expressions?.length === 0) return [(expression as any).quasis?.[0]?.value?.cooked as string].filter(Boolean);
  if (expression.type === "ArrayExpression") return ((expression as any).elements as Array<AnyNode | null>).flatMap((element) => literalStrings(element ?? undefined));
  return [];
}

function variableInitializers(program: AnyNode): Map<string, AnyNode> {
  const output = new Map<string, AnyNode>();
  simple(program, {
    VariableDeclarator(node: AnyNode) {
      const declaration = node as any;
      if (declaration.id?.type === "Identifier" && declaration.init) output.set(declaration.id.name as string, declaration.init as AnyNode);
    },
  });
  return output;
}

function functionDeclarations(program: AnyNode): Map<string, AnyNode> {
  const output = new Map<string, AnyNode>();
  simple(program, {
    FunctionDeclaration(node: AnyNode) {
      const declaration = node as any;
      if (declaration.id?.name) output.set(declaration.id.name as string, node);
    },
  });
  return output;
}

function parseConfigProgram(source: string): { program?: AnyNode; diagnostics: string[] } {
  try {
    return { program: parse(source, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }) as AnyNode, diagnostics: [] };
  } catch (moduleError) {
    try {
      return { program: parse(source, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true }) as AnyNode, diagnostics: [] };
    } catch (scriptError) {
      const moduleMessage = moduleError instanceof Error ? moduleError.message : String(moduleError);
      const scriptMessage = scriptError instanceof Error ? scriptError.message : String(scriptError);
      return { diagnostics: [`Acorn module parse failed: ${moduleMessage}`, `Acorn script parse failed: ${scriptMessage}`] };
    }
  }
}

function moduleCandidate(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(importer), specifier);
  const candidates = extname(base)
    ? [base]
    : [base, ...[".js", ".mjs", ".cjs", ".ts", ".mts"].map((extension) => `${base}${extension}`), ...["index.js", "index.mjs", "index.cjs", "index.ts", "index.mts"].map((name) => join(base, name))];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function collectModuleBindings(context: AstModuleContext): void {
  const body = (context.program as any).body as AnyNode[];
  for (const statement of body) {
    const node = statement as any;
    if (node.type === "ImportDeclaration" && typeof node.source?.value === "string") {
      for (const specifier of node.specifiers ?? []) {
        const imported = specifier.type === "ImportDefaultSpecifier" ? "default" : specifier.type === "ImportSpecifier" ? propertyName(specifier.imported as AnyNode, context.source) : "*";
        if (specifier.local?.name && imported) context.imports.set(specifier.local.name as string, { imported, source: node.source.value as string });
      }
    }
    if (node.type === "ExportDefaultDeclaration") {
      context.exports.set("default", node.declaration as AnyNode);
    }
    if (node.type === "ExportNamedDeclaration") {
      const declaration = node.declaration as any;
      if (declaration?.type === "VariableDeclaration") {
        for (const item of declaration.declarations ?? []) if (item.id?.type === "Identifier") context.exports.set(item.id.name as string, item.id as AnyNode);
      } else if (declaration?.type === "FunctionDeclaration" && declaration.id?.name) {
        context.exports.set(declaration.id.name as string, declaration.id as AnyNode);
      }
      for (const specifier of node.specifiers ?? []) {
        const exported = propertyName(specifier.exported as AnyNode, context.source);
        const local = propertyName(specifier.local as AnyNode, context.source);
        if (exported && local) context.exports.set(exported, local);
      }
    }
  }
  simple(context.program, {
    AssignmentExpression(node: AnyNode) {
      const assignment = node as any;
      const left = assignment.left;
      if (left?.type !== "MemberExpression") return;
      const objectText = context.source.slice(left.object.start, left.object.end);
      const property = propertyName(left.property as AnyNode, context.source);
      if (objectText === "module" && property === "exports") context.exports.set("default", assignment.right as AnyNode);
      else if (objectText === "exports" && property) context.exports.set(property, assignment.right as AnyNode);
    },
  });
}

function loadAstModule(file: string, sourceOverride: string | undefined, cache: Map<string, AstModuleContext>, diagnostics: string[]): AstModuleContext | undefined {
  const resolvedFile = resolve(file);
  const existing = cache.get(resolvedFile);
  if (existing) return existing;
  const source = sourceOverride ?? readFileSync(resolvedFile, "utf8");
  const parsed = parseConfigProgram(source);
  if (!parsed.program) {
    diagnostics.push(...parsed.diagnostics.map((message) => `${resolvedFile}: ${message}`));
    return undefined;
  }
  const context: AstModuleContext = {
    file: resolvedFile,
    source,
    program: parsed.program,
    variables: variableInitializers(parsed.program),
    functions: functionDeclarations(parsed.program),
    imports: new Map(),
    exports: new Map(),
  };
  cache.set(resolvedFile, context);
  collectModuleBindings(context);
  return context;
}

function exportedRef(module: AstModuleContext, exported: string, cache: Map<string, AstModuleContext>, diagnostics: string[], seen: Set<string>): AstExpressionRef | undefined {
  const binding = module.exports.get(exported);
  if (!binding) return undefined;
  if (typeof binding === "string") return resolveIdentifierRef(binding, module, cache, diagnostics, seen);
  if (binding.type === "Identifier") return resolveIdentifierRef((binding as any).name as string, module, cache, diagnostics, seen);
  return { node: binding, module };
}

function resolveIdentifierRef(name: string, module: AstModuleContext, cache: Map<string, AstModuleContext>, diagnostics: string[], seen: Set<string>): AstExpressionRef | undefined {
  const identity = `${module.file}#${name}`;
  if (seen.has(identity)) return undefined;
  seen.add(identity);
  const local = module.variables.get(name);
  if (local) return resolveExpressionRef({ node: local, module }, cache, diagnostics, seen);
  const declaredFunction = module.functions.get(name);
  if (declaredFunction) return { node: declaredFunction, module };
  const imported = module.imports.get(name);
  if (imported) {
    const importedFile = moduleCandidate(module.file, imported.source);
    if (!importedFile) {
      diagnostics.push(`${module.file}: imported proxy binding ${name} could not resolve ${imported.source}`);
      return undefined;
    }
    const importedModule = loadAstModule(importedFile, undefined, cache, diagnostics);
    return importedModule ? exportedRef(importedModule, imported.imported, cache, diagnostics, seen) : undefined;
  }
  return undefined;
}

function resolveExpressionRef(ref: AstExpressionRef, cache: Map<string, AstModuleContext>, diagnostics: string[], seen = new Set<string>()): AstExpressionRef {
  if (ref.node.type !== "Identifier") return ref;
  return resolveIdentifierRef((ref.node as any).name as string, ref.module, cache, diagnostics, seen) ?? ref;
}

function functionRef(name: string, module: AstModuleContext, cache: Map<string, AstModuleContext>, diagnostics: string[], seen: Set<string>): AstExpressionRef | undefined {
  const identity = `${module.file}#function:${name}`;
  if (seen.has(identity)) return undefined;
  seen.add(identity);
  const declaration = module.functions.get(name);
  if (declaration) return { node: declaration, module };
  const variable = module.variables.get(name);
  if (variable && ["ArrowFunctionExpression", "FunctionExpression"].includes(variable.type)) return { node: variable, module };
  const imported = module.imports.get(name);
  if (!imported) return undefined;
  const importedFile = moduleCandidate(module.file, imported.source);
  if (!importedFile) {
    diagnostics.push(`${module.file}: imported proxy factory ${name} could not resolve ${imported.source}`);
    return undefined;
  }
  const importedModule = loadAstModule(importedFile, undefined, cache, diagnostics);
  const exported = importedModule ? exportedRef(importedModule, imported.imported, cache, diagnostics, seen) : undefined;
  if (!exported) return undefined;
  if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(exported.node.type)) return exported;
  if (exported.node.type === "Identifier") return functionRef((exported.node as any).name as string, exported.module, cache, diagnostics, seen);
  return undefined;
}

function directReturnExpressions(functionNode: AnyNode): AnyNode[] {
  const body = (functionNode as any).body as AnyNode | undefined;
  if (!body) return [];
  if (body.type !== "BlockStatement") return [body];
  const output: AnyNode[] = [];
  const visit = (node: AnyNode): void => {
    if (node !== body && ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) return;
    if (node.type === "ReturnStatement") {
      const argument = (node as any).argument as AnyNode | undefined;
      if (argument) output.push(argument);
      return;
    }
    for (const value of Object.values(node as any)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object" && typeof child.type === "string") visit(child as AnyNode);
      } else if (value && typeof value === "object" && typeof (value as any).type === "string") {
        visit(value as AnyNode);
      }
    }
  };
  visit(body);
  return output;
}

function expressionAlternatives(ref: AstExpressionRef, cache: Map<string, AstModuleContext>, diagnostics: string[], depth: number): AstExpressionRef[] {
  if (depth > 12) {
    diagnostics.push(`${ref.module.file}: proxy expression resolution exceeded depth 12`);
    return [];
  }
  const resolved = resolveExpressionRef(ref, cache, diagnostics);
  if (resolved.node.type !== "CallExpression") return [resolved];
  const callee = (resolved.node as any).callee as AnyNode;
  if (callee?.type !== "Identifier") {
    diagnostics.push(`${resolved.module.file}: proxy factory call uses an unsupported non-identifier callee`);
    return [];
  }
  const factory = functionRef((callee as any).name as string, resolved.module, cache, diagnostics, new Set());
  if (!factory) {
    diagnostics.push(`${resolved.module.file}: proxy factory ${(callee as any).name} could not be statically resolved`);
    return [];
  }
  return directReturnExpressions(factory.node).flatMap((node) => expressionAlternatives({ node, module: factory.module }, cache, diagnostics, depth + 1));
}

function isDirectProxyObject(object: AnyNode, source: string): boolean {
  return ["context", "target", "router", "pathRewrite", "rewrite", "changeOrigin", "secure", "ws", "configure", "bypass"]
    .some((name) => Boolean(objectMember(object, name, source)));
}

function expandedObjectEvidence(ref: AstExpressionRef, cache: Map<string, AstModuleContext>, diagnostics: string[], depth = 0): { source: string; files: string[]; aliasSources: string[] } {
  if (depth > 12 || ref.node.type !== "ObjectExpression") return { source: ref.module.source.slice(ref.node.start, ref.node.end), files: [ref.module.file], aliasSources: [ref.module.source] };
  const sources = [ref.module.source.slice(ref.node.start, ref.node.end)];
  const files = [ref.module.file];
  const aliases = [ref.module.source];
  for (const property of (ref.node as any).properties as AnyNode[]) {
    if (property.type !== "SpreadElement") continue;
    for (const spread of expressionAlternatives({ node: (property as any).argument as AnyNode, module: ref.module }, cache, diagnostics, depth + 1)) {
      if (spread.node.type !== "ObjectExpression") continue;
      const nested = expandedObjectEvidence(spread, cache, diagnostics, depth + 1);
      sources.push(nested.source); files.push(...nested.files); aliases.push(...nested.aliasSources);
    }
  }
  return { source: sources.join("\n"), files: unique(files), aliasSources: unique(aliases) };
}

function scopeFromObject(ref: AstExpressionRef, cache: Map<string, AstModuleContext>, diagnostics: string[], key?: { node: AnyNode; module: AstModuleContext }): ScopedProxyEntry {
  const expanded = expandedObjectEvidence(ref, cache, diagnostics);
  const contextExpression = memberInitializer(objectMember(ref.node, "context", ref.module.source));
  const keyText = key ? propertyName(key.node, key.module.source) : undefined;
  const keySource = key ? key.module.source.slice(key.node.start, key.node.end) : "";
  const contextSource = contextExpression ? ref.module.source.slice(contextExpression.start, contextExpression.end) : expanded.source.match(/\bcontext\s*:\s*([^,}]+)/)?.[1] ?? "";
  const contextIdentifiers = [keySource, contextSource].flatMap((value) => /^[A-Za-z_$][\w$]*$/.test(value.trim()) ? [value.trim()] : []);
  return {
    source: expanded.source,
    sourceFile: ref.module.file,
    sourceFiles: expanded.files,
    aliasSources: expanded.aliasSources,
    contextCandidates: unique([...(keyText?.startsWith("/") ? [keyText] : []), ...literalStrings(contextExpression), ...proxyContexts(expanded.source)]),
    contextVariables: unique([...environmentReferences(keySource), ...environmentReferences(contextSource), ...contextIdentifiers]),
  };
}

function entriesFromProxyExpression(ref: AstExpressionRef, cache: Map<string, AstModuleContext>, diagnostics: string[], depth = 0): ScopedProxyEntry[] {
  return expressionAlternatives(ref, cache, diagnostics, depth).flatMap((resolved) => {
    if (resolved.node.type === "ArrayExpression") {
      return ((resolved.node as any).elements as Array<AnyNode | null>).flatMap((element) => {
        if (!element) return [];
        if (element.type === "SpreadElement") return entriesFromProxyExpression({ node: (element as any).argument as AnyNode, module: resolved.module }, cache, diagnostics, depth + 1);
        return expressionAlternatives({ node: element, module: resolved.module }, cache, diagnostics, depth + 1)
          .filter((value) => value.node.type === "ObjectExpression")
          .map((value) => scopeFromObject(value, cache, diagnostics));
      });
    }
    if (resolved.node.type !== "ObjectExpression") return [];
    if (isDirectProxyObject(resolved.node, resolved.module.source)) return [scopeFromObject(resolved, cache, diagnostics)];
    return ((resolved.node as any).properties as AnyNode[]).flatMap((property) => {
      if (property.type === "SpreadElement") return entriesFromProxyExpression({ node: (property as any).argument as AnyNode, module: resolved.module }, cache, diagnostics, depth + 1);
      if (property.type !== "Property") return [];
      const key = { node: (property as any).key as AnyNode, module: resolved.module };
      return expressionAlternatives({ node: (property as any).value as AnyNode, module: resolved.module }, cache, diagnostics, depth + 1)
        .filter((value) => value.node.type === "ObjectExpression")
        .map((value) => scopeFromObject(value, cache, diagnostics, key));
    });
  });
}

function scopedProxyEntries(configFile: string, source: string): ProxyScopeParseResult {
  const diagnostics: string[] = [];
  const cache = new Map<string, AstModuleContext>();
  const root = loadAstModule(configFile, source, cache, diagnostics);
  if (!root) return { entries: [], diagnostics, fallbackRequired: true };
  const entries: ScopedProxyEntry[] = [];
  simple(root.program, {
    Property(node: AnyNode) {
      const property = node as any;
      if (propertyName(property.key as AnyNode, root.source) === "proxy" && property.value) {
        entries.push(...entriesFromProxyExpression({ node: property.value as AnyNode, module: root }, cache, diagnostics));
      }
    },
  });
  if (!entries.length && /\bproxy\s*:/.test(source)) {
    return { entries: [], diagnostics: [...diagnostics, "AST parsed the config but did not recognize a supported proxy object, array, spread, import, or factory shape"], fallbackRequired: true };
  }
  return { entries, diagnostics, fallbackRequired: false };
}

function environmentAliases(source: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:process\.env|import\.meta\.env|[A-Za-z_$][\w$]*)\.((?:VITE_|VUE_APP_|REACT_APP_|NEXT_PUBLIC_|APP_)[A-Za-z0-9_$]*)/g)) aliases.set(match[1], match[2]);
  return aliases;
}

function propertyEnvironmentVariables(source: string, property: string, aliases: Map<string, string>): string[] {
  const direct = [...source.matchAll(new RegExp(`\\b${property}\\s*:\\s*(?:process\\.env|import\\.meta\\.env|[A-Za-z_$][\\w$]*)\\.((?:VITE_|VUE_APP_|REACT_APP_|NEXT_PUBLIC_|APP_)[A-Za-z0-9_$]*)`, "g"))].map((match) => match[1]);
  const identifiers = [...source.matchAll(new RegExp(`\\b${property}\\s*:\\s*([A-Za-z_$][\\w$]*)`, "g"))].map((match) => aliases.get(match[1])).filter((item): item is string => Boolean(item));
  return unique([...direct, ...identifiers]);
}

function propertyLiteralValues(source: string, property: string): string[] {
  return [...source.matchAll(new RegExp(`\\b${property}\\s*:\\s*['\"]([^'\"]+)['\"]`, "g"))].map((match) => match[1]);
}

function routeFromScope(
  sourceRoot: string,
  configFile: string,
  scope: ScopedProxyEntry,
  endpointPath: string,
  request: ReturnType<typeof requestClientEvidence>,
  assignments: EnvironmentAssignment[],
  analysisMode: TransportProxyRouteEvidence["analysisMode"],
  analysisDiagnostics: string[],
): TransportProxyRouteEvidence[] {
  const aliases = environmentAliases([readFileSync(configFile, "utf8"), ...scope.aliasSources].join("\n"));
  const requestVariable = request.environmentVariable;
  const targetVariables = propertyEnvironmentVariables(scope.source, "target", aliases);
  const literalTargets = propertyLiteralValues(scope.source, "target");
  const routerReferences = proxyRouterReferences(scope.source);
  const dynamicRewriteVariable = [...scope.source.matchAll(/\[\s*['"]\^['"]\s*\+\s*(?:(?:process\.env|import\.meta\.env|env)\.)?([A-Za-z_$][\w$]*)\s*\]\s*:\s*['"]([^'"]*)['"]/g)][0];
  const literalRewrite = [...scope.source.matchAll(/['"](\^\/[^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g)][0];
  const callback = callbackRewrite(scope.source);
  const framework = proxyFramework(configFile);
  const output: TransportProxyRouteEvidence[] = [];

  for (const prefix of request.prefixes) {
    const selection = request.runtimeSelections.find((item) => item.value === prefix.value);
    const environment = selection?.environment ?? "runtime";
    const contextVariables = unique(scope.contextVariables.map((variable) => aliases.get(variable) ?? variable));
    const resolvedContexts = unique([
      ...scope.contextCandidates,
      ...environmentValueCandidates(assignments, contextVariables, environment),
    ]);
    const matchesContext = resolvedContexts.includes(prefix.value)
      || contextVariables.some((variable) => variable === requestVariable)
      || (!resolvedContexts.length && scope.source.includes(prefix.value));
    if (!matchesContext) continue;

    const targetCandidates = unique([...literalTargets, ...environmentValueCandidates(assignments, targetVariables, environment)]);
    const routerVariables = unique([
      ...routerReferences.variables,
      ...[...scope.source.matchAll(/\brouter\s*:\s*([A-Za-z_$][\w$]*)/g)].map((match) => aliases.get(match[1])).filter((item): item is string => Boolean(item)),
    ]);
    const routerDecisionBranches = materializeDecisionBranches(conditionalProxyReturns(scope.source, "router", aliases), assignments, environment);
    const bypassDecisionBranches = materializeDecisionBranches(conditionalProxyReturns(scope.source, "bypass", aliases), assignments, environment);
    const routerCandidates = unique([
      ...routerReferences.literals,
      ...environmentValueCandidates(assignments, routerVariables, environment),
      ...routerDecisionBranches.flatMap((branch) => branch.outcomeCandidates),
    ]);
    let rewritePattern: string | undefined, rewriteReplacement: string | undefined;
    let rewriteKind: TransportProxyRouteEvidence["rewriteKind"];
    if (dynamicRewriteVariable) {
      const variable = aliases.get(dynamicRewriteVariable[1]) ?? dynamicRewriteVariable[1];
      if (!requestVariable || variable === requestVariable) {
        rewritePattern = `^${prefix.value}`;
        rewriteReplacement = dynamicRewriteVariable[2];
        rewriteKind = "path-rewrite-map";
      }
    } else if (literalRewrite && new RegExp(literalRewrite[1]).test(prefix.value)) {
      rewritePattern = literalRewrite[1]; rewriteReplacement = literalRewrite[2]; rewriteKind = "path-rewrite-map";
    } else if (callback && new RegExp(callback.pattern).test(prefix.value)) {
      rewritePattern = callback.pattern; rewriteReplacement = callback.replacement; rewriteKind = "rewrite-callback";
    }
    const upstreamPathCandidate = rewritePattern === undefined
      ? undefined
      : joinTransportPath(prefix.value.replace(new RegExp(rewritePattern), rewriteReplacement ?? ""), endpointPath);
    output.push({
      requestPrefix: prefix.value,
      environment,
      source: relative(sourceRoot, scope.sourceFile).replaceAll("\\", "/"),
      configSource: relative(sourceRoot, configFile).replaceAll("\\", "/"),
      scopeSources: scope.sourceFiles.map((file) => relative(sourceRoot, file).replaceAll("\\", "/")),
      framework,
      contextCandidates: resolvedContexts,
      targetCandidates,
      routerCandidates,
      routerDecisionBranches,
      bypassDecisionBranches,
      changeOrigin: proxyBoolean(scope.source, "changeOrigin"),
      secure: proxyBoolean(scope.source, "secure"),
      ws: proxyBoolean(scope.source, "ws"),
      configureHook: /\bconfigure(?:\s*:\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*)|\s*\([^)]*\)\s*\{)/.test(scope.source),
      bypassHook: /\bbypass(?:\s*:\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*)|\s*\([^)]*\)\s*\{)/.test(scope.source),
      analysisMode,
      analysisDiagnostics,
      ...(rewritePattern !== undefined ? { rewriteKind, rewritePattern, rewriteReplacement, upstreamPathCandidate } : {}),
    });
  }
  return output;
}

function fallbackProxyEntry(source: string): ScopedProxyEntry {
  return { source, sourceFile: "", sourceFiles: [], aliasSources: [source], contextCandidates: proxyContexts(source), contextVariables: environmentReferences(source) };
}

function proxyRouteEvidence(sourceRoot: string, endpointPath: string, request: ReturnType<typeof requestClientEvidence>): TransportProxyRouteEvidence[] {
  if (!request.prefixes.length) return [];
  const assignments = environmentAssignments(sourceRoot);
  const output: TransportProxyRouteEvidence[] = [];
  for (const configFile of proxyConfigCandidates(sourceRoot)) {
    const source = readFileSync(configFile, "utf8");
    if (!/\b(?:devServer\s*:\s*\{|server\s*:\s*\{|proxy\s*:\s*[\[{])/.test(source)) continue;
    const parsed = scopedProxyEntries(configFile, source);
    if (parsed.fallbackRequired) {
      const fallback = fallbackProxyEntry(source); fallback.sourceFile = configFile; fallback.sourceFiles = [configFile];
      output.push(...routeFromScope(sourceRoot, configFile, fallback, endpointPath, request, assignments, "regex-fallback", parsed.diagnostics));
      continue;
    }
    for (const entry of parsed.entries) {
      output.push(...routeFromScope(sourceRoot, configFile, entry, endpointPath, request, assignments, "scope-ast", []));
    }
  }
  return output;
}

function joinTransportPath(prefix: string, endpointPath: string): string {
  if (!prefix || prefix === "/") return endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  return `${prefix.replace(/\/$/, "")}/${endpointPath.replace(/^\//, "")}`;
}
function consumptionFor(script: string, localName: string): Consumption | undefined {
  const call = new RegExp(`${localName}\\s*\\([^)]*\\)\\s*\\.then\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*=>\\s*\\{([\\s\\S]*?)\\}\\s*\\)`).exec(script);
  if (!call) return undefined;
  const responseName = call[1];
  const assignment = new RegExp(`this\\.([A-Za-z_$][\\w$]*)\\s*=\\s*${responseName}((?:\\.(?!slice\\b)[A-Za-z_$][\\w$]*)+)(?:\\.slice\\(\\s*0\\s*,\\s*(\\d+)\\s*\\))?`).exec(call[2]);
  if (!assignment) return undefined;
  return { targetBinding: assignment[1], responsePath: assignment[2].slice(1), sliceLimit: assignment[3] ? Number(assignment[3]) : undefined };
}
function valueAtPath(value: JsonValue, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const key of path.split(".").filter(Boolean)) {
    if (!current || Array.isArray(current) || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}
function matchingFixture(fixtures: SpaRouterFixture[], endpoint: Endpoint, transportPaths: string[]): { fixture: SpaRouterFixture; index: number } | undefined {
  const index = fixtures.findIndex((fixture) => {
    const pathMatches = [endpoint.path, ...transportPaths].some((candidate) => spaRouterFixturePathMatches(candidate, fixture));
    return (fixture.method ?? "GET").toUpperCase() === endpoint.method && pathMatches && fixture.body !== undefined;
  });
  return index < 0 ? undefined : { fixture: fixtures[index], index };
}
function renderedFields(template: string): ApiFixtureRenderedField[] {
  const output: ApiFixtureRenderedField[] = [];
  for (const match of template.matchAll(/<el-table-column\b([^>]*)>([\s\S]*?)<\/el-table-column>/gi)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((item) => [item[1], item[2] ?? item[3]]));
    const body = match[2];
    const field = body.match(/(?:\b[A-Za-z_$][\w$]*\.)?row\.([A-Za-z_$][\w$]*)/)?.[1];
    if (!field) continue;
    const interpolation = body.match(/\{\{([\s\S]*?)\}\}/)?.[1] ?? "";
    const filters = unique([...body.matchAll(/\|\s*([A-Za-z_$][\w$]*)/g)].map((item) => item[1]));
    const interpolationIndex = body.indexOf("{{");
    const interpolationEnd = body.indexOf("}}", interpolationIndex + 2);
    const literal = (value: string) => value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    output.push({
      field,
      label: attributes.label,
      width: attributes.width ? Number(attributes.width) : undefined,
      minWidth: attributes["min-width"] ? Number(attributes["min-width"]) : undefined,
      align: attributes.align,
      filters,
      prefix: interpolationIndex >= 0 ? literal(body.slice(0, interpolationIndex)) || undefined : undefined,
      suffix: interpolationEnd >= 0 ? literal(body.slice(interpolationEnd + 2)) || undefined : undefined,
      tagged: /<el-tag\b/i.test(body),
    });
  }
  return output;
}

function filterValueMaps(script: string, fields: ApiFixtureRenderedField[]): Record<string, Record<string, string>> {
  const output: Record<string, Record<string, string>> = {};
  for (const filter of unique(fields.flatMap((field) => field.filters))) {
    const start = script.search(new RegExp(`\\b${filter}\\s*\\([^)]*\\)\\s*\\{`));
    const methodWindow = start >= 0 ? script.slice(start, start + 1200) : "";
    const objectBody = methodWindow.match(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{([\s\S]*?)\}/)?.[1];
    if (!objectBody) continue;
    const entries = [...objectBody.matchAll(/([A-Za-z_$][\w$]*|['"][^'"]+['"])\s*:\s*['"]([^'"]+)['"]/g)];
    if (entries.length) output[filter] = Object.fromEntries(entries.map((entry) => [entry[1].replace(/^['"]|['"]$/g, ""), entry[2]]));
  }
  return output;
}

function hashFixture(body: JsonValue): string { return createHash("sha256").update(JSON.stringify(body)).digest("hex"); }

export function analyzeApiFixtureResponsibilities(
  sourceRoot: string,
  config: SpaRouterContractConfig,
  components: SfcVisualComponentResponsibility[],
): ApiFixtureResponsibilityGraph {
  const responsibilities: ApiFixtureResponsibility[] = [];
  const unresolved: ApiFixtureResponsibilityGraph["unresolved"] = [];
  let importedApiCalls = 0;
  let matchedEndpoints = 0;
  for (const component of components) {
    const absolute = join(sourceRoot, component.file);
    if (!existsSync(absolute)) continue;
    const parsed = sections(readFileSync(absolute, "utf8"));
    for (const imported of importedApis(parsed.script)) {
      if (!new RegExp(`\\b${imported.localName}\\s*\\(`).test(parsed.script)) continue;
      importedApiCalls += 1;
      const moduleFile = moduleCandidates(sourceRoot, component.file, imported.source).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
      if (!moduleFile) { unresolved.push({ componentId: component.id, apiLocalName: imported.localName, reason: "imported API module could not be resolved" }); continue; }
      const endpoint = endpointFromModule(moduleFile, imported.exportedName);
      if (!endpoint) { unresolved.push({ componentId: component.id, apiLocalName: imported.localName, reason: "request endpoint could not be statically extracted" }); continue; }
      matchedEndpoints += 1;
      const transport = requestClientEvidence(sourceRoot, moduleFile, imported.exportedName);
      const transportPrefixes = transport.prefixes;
      const transportPathCandidates = unique(transportPrefixes.map((entry) => joinTransportPath(entry.value, endpoint.path)));
      const runtimeSelections = transport.runtimeSelections;
      const proxyRoutes = proxyRouteEvidence(sourceRoot, endpoint.path, transport);
      const consumption = consumptionFor(parsed.script, imported.localName);
      if (!consumption) { unresolved.push({ componentId: component.id, apiLocalName: imported.localName, reason: "response assignment path could not be statically extracted" }); continue; }
      const matched = matchingFixture(config.fixtures ?? [], endpoint, transportPathCandidates);
      if (!matched || matched.fixture.body === undefined) { unresolved.push({ componentId: component.id, apiLocalName: imported.localName, reason: `reviewed deterministic fixture is missing for ${endpoint.method} ${endpoint.path}` }); continue; }
      const responseValue = valueAtPath(matched.fixture.body, consumption.responsePath);
      if (responseValue === undefined) { unresolved.push({ componentId: component.id, apiLocalName: imported.localName, reason: `fixture does not contain response path ${consumption.responsePath}` }); continue; }
      const materializedValue = Array.isArray(responseValue) && consumption.sliceLimit !== undefined ? responseValue.slice(0, consumption.sliceLimit) : responseValue;
      const fields = renderedFields(parsed.template);
      responsibilities.push({
        id: `api-fixture:${component.id}:${imported.localName}`,
        componentId: component.id,
        componentName: component.componentName,
        componentFile: component.file,
        apiCall: {
          localName: imported.localName, exportedName: imported.exportedName, importSource: imported.source,
          moduleFile: relative(sourceRoot, moduleFile).replaceAll("\\", "/"), method: endpoint.method, path: endpoint.path,
          transportPrefixes, transportPathCandidates, runtimeSelections, proxyRoutes,
        },
        consumption,
        renderedFields: fields,
        filterValueMaps: filterValueMaps(parsed.script, fields),
        fixture: { index: matched.index, requestPath: matched.fixture.path, reviewed: true, bodyHash: hashFixture(matched.fixture.body), responseValue, materializedValue },
        confidence: "high",
        reviewReasons: ["fixture response body is consumed only after explicit reviewed-config matching", "runtime source code is not executed during extraction"],
      });
    }
  }
  return {
    schemaVersion: "1.0", kind: "api-fixture-responsibility-graph", reviewRequired: true, sourceRoot,
    responsibilities, unresolved,
    metrics: {
      componentsScanned: components.length, importedApiCalls, matchedEndpoints,
      matchedFixtures: responsibilities.length, materializedBindings: responsibilities.length,
      renderedFields: responsibilities.reduce((sum, item) => sum + item.renderedFields.length, 0),
      transportPrefixesInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.transportPrefixes.length, 0),
      runtimeSelectionsInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.runtimeSelections.length, 0),
      proxyRoutesInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.proxyRoutes.length, 0),
      proxyTargetsInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.proxyRoutes.reduce((count, route) => count + route.targetCandidates.length, 0), 0),
      proxyRewriteRulesInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.proxyRoutes.filter((route) => route.rewritePattern !== undefined).length, 0),
      proxyAstRoutesInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.proxyRoutes.filter((route) => route.analysisMode === "scope-ast").length, 0),
      proxyFallbackRoutesInferred: responsibilities.reduce((sum, item) => sum + item.apiCall.proxyRoutes.filter((route) => route.analysisMode === "regex-fallback").length, 0),
      proxyParseDiagnostics: responsibilities.reduce((sum, item) => sum + item.apiCall.proxyRoutes.reduce((count, route) => count + route.analysisDiagnostics.length, 0), 0),
    },
    reviewReasons: [
      "API ownership is established from import, request endpoint, response assignment, template field, and reviewed fixture evidence",
      "unresolved calls remain explicit and are never replaced with guessed data",
      "transport prefixes are inferred only from the imported request client and concrete environment assignments",
      "dev-server proxy targets and path rewrites are retained as auditable transport evidence and never treated as browser request paths",
      "proxy target, router, rewrite, and hook evidence is bound to one scope-aware AST proxy entry; unsupported or malformed config shapes use an explicit diagnostic fallback",
    ],
  };
}
