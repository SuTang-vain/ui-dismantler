import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
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
export interface TransportProxyRouteEvidence {
  requestPrefix: string;
  environment: string;
  source: string;
  targetCandidates: string[];
  rewritePattern?: string;
  rewriteReplacement?: string;
  upstreamPathCandidate?: string;
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
  const environmentVariable = clientSource.match(/\bbaseURL\s*:\s*process\.env\.([A-Za-z_$][\w$]*)/)?.[1];
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
  return ["vue.config.js", "vue.config.cjs", "vue.config.mjs", "vue.config.ts", "webpack.config.js", "webpack.config.cjs", join("config", "index.js")]
    .map((item) => join(sourceRoot, item)).filter((item) => existsSync(item) && statSync(item).isFile());
}

function proxyRouteEvidence(sourceRoot: string, endpointPath: string, request: ReturnType<typeof requestClientEvidence>): TransportProxyRouteEvidence[] {
  if (!request.prefixes.length) return [];
  const assignments = environmentAssignments(sourceRoot);
  const output: TransportProxyRouteEvidence[] = [];
  for (const configFile of proxyConfigCandidates(sourceRoot)) {
    const source = readFileSync(configFile, "utf8");
    if (!/\b(?:devServer\s*:\s*\{|proxy\s*:\s*\{)/.test(source)) continue;
    const aliases = new Map<string, string>();
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\.([A-Za-z_$][\w$]*)/g)) aliases.set(match[1], match[2]);
    const referencedVariables = new Set<string>();
    for (const match of source.matchAll(/process\.env\.([A-Za-z_$][\w$]*)/g)) referencedVariables.add(match[1]);
    for (const variable of aliases.values()) referencedVariables.add(variable);
    const requestVariable = request.environmentVariable;
    if (requestVariable && !referencedVariables.has(requestVariable) && !request.prefixes.some((prefix) => source.includes(prefix.value))) continue;
    const targetVariables = [...source.matchAll(/\btarget\s*:\s*process\.env\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
    const literalTargets = [...source.matchAll(/\btarget\s*:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    const dynamicRewriteVariable = [...source.matchAll(/\[\s*['"]\^['"]\s*\+\s*(?:process\.env\.)?([A-Za-z_$][\w$]*)\s*\]\s*:\s*['"]([^'"]*)['"]/g)][0];
    const literalRewrite = [...source.matchAll(/['"](\^\/[^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g)][0];
    for (const prefix of request.prefixes) {
      const selection = request.runtimeSelections.find((item) => item.value === prefix.value);
      const environment = selection?.environment ?? "runtime";
      const targetCandidates = unique([
        ...literalTargets,
        ...targetVariables.flatMap((variable) => assignments.filter((item) => item.variable === variable && (item.environment === environment || environment === "runtime")).map((item) => item.value)),
      ]);
      let rewritePattern: string | undefined, rewriteReplacement: string | undefined;
      if (dynamicRewriteVariable) {
        const variable = aliases.get(dynamicRewriteVariable[1]) ?? dynamicRewriteVariable[1];
        if (!requestVariable || variable === requestVariable) { rewritePattern = `^${prefix.value}`; rewriteReplacement = dynamicRewriteVariable[2]; }
      } else if (literalRewrite && new RegExp(literalRewrite[1]).test(prefix.value)) {
        rewritePattern = literalRewrite[1]; rewriteReplacement = literalRewrite[2];
      }
      const upstreamPathCandidate = rewritePattern === undefined
        ? undefined
        : joinTransportPath(prefix.value.replace(new RegExp(rewritePattern), rewriteReplacement ?? ""), endpointPath);
      output.push({
        requestPrefix: prefix.value, environment, source: relative(sourceRoot, configFile).replaceAll("\\", "/"),
        targetCandidates, ...(rewritePattern !== undefined ? { rewritePattern, rewriteReplacement, upstreamPathCandidate } : {}),
      });
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
    },
    reviewReasons: [
      "API ownership is established from import, request endpoint, response assignment, template field, and reviewed fixture evidence",
      "unresolved calls remain explicit and are never replaced with guessed data",
      "transport prefixes are inferred only from the imported request client and concrete environment assignments",
      "dev-server proxy targets and path rewrites are retained as auditable transport evidence and never treated as browser request paths",
    ],
  };
}
