import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

export interface RouterSfcEvidence {
  file: string;
  line: number;
  pattern: string;
  detail: string;
}

export type RouterSfcResolution = "static-import" | "dynamic-import" | "unresolved";

export interface RouterSfcRouteBinding {
  path: string;
  name: string | null;
  routeFile: string;
  componentExpression: string | null;
  resolution: RouterSfcResolution;
  importBinding: string | null;
  sfcFile: string | null;
  dynamic: boolean;
  confidence: "high" | "medium" | "low";
  evidence: RouterSfcEvidence[];
  reviewReasons: string[];
}

export interface RouterSfcResponsibilityGraph {
  schemaVersion: "1.0";
  kind: "router-to-sfc-responsibility-graph";
  reviewRequired: true;
  sourceRoot: string;
  framework: { view: "vue"; router: "vue-router"; routerMajor: 2 | 3 | 4 | "unknown" };
  routes: RouterSfcRouteBinding[];
  unresolved: RouterSfcRouteBinding[];
  metrics: {
    filesScanned: number;
    routerFiles: number;
    routeBindings: number;
    resolvedRoutes: number;
    dynamicImports: number;
    unresolvedRoutes: number;
    evidenceCount: number;
    scanMs: number;
  };
  reviewReasons: string[];
}

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

interface ImportBinding {
  local: string;
  source: string;
  importedFile: string | null;
  dynamic: boolean;
  line: number;
  evidence: RouterSfcEvidence;
}

function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:js|mjs|cjs|ts|tsx|vue)$/.test(entry.name)) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
}

function lineOf(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

function evidence(file: SourceFile, pattern: string, detail: string, offset: number): RouterSfcEvidence {
  return { file: file.relativePath, line: lineOf(file.source, offset), pattern, detail };
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "))
    .replace(/(^|\n)\s*\/\/[^\n]*/g, (value) => value.replace(/[^\n]/g, " "));
}

function resolveImport(sourceRoot: string, importer: string, specifier: string): string | null {
  const candidate = specifier.startsWith("@/")
    ? join(sourceRoot, specifier.slice(2))
    : specifier.startsWith("~@/")
      ? join(sourceRoot, specifier.slice(3))
      : specifier.startsWith("~")
        ? null
        : resolve(dirname(importer), specifier);
  if (!candidate) return null;
  const candidates = [candidate, `${candidate}.vue`, `${candidate}.js`, `${candidate}.ts`, `${candidate}.tsx`, join(candidate, "index.vue"), join(candidate, "index.js")];
  return candidates.find((item) => existsSync(item)) ?? null;
}

function collectImports(sourceRoot: string, file: SourceFile): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  const active = stripComments(file.source);
  const staticPattern = /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of active.matchAll(staticPattern)) {
    const local = match[1];
    const specifier = match[2];
    const offset = match.index ?? 0;
    const importedFile = /\.vue$/.test(specifier) || specifier.includes("/views/") || specifier.includes("/components/")
      ? resolveImport(sourceRoot, file.absolutePath, specifier)
      : resolveImport(sourceRoot, file.absolutePath, specifier);
    bindings.set(local, {
      local,
      source: specifier,
      importedFile,
      dynamic: false,
      line: lineOf(active, offset),
      evidence: evidence(file, match[0], "static route component import binding", offset),
    });
  }
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of active.matchAll(dynamicPattern)) {
    const specifier = match[1];
    const offset = match.index ?? 0;
    const importedFile = resolveImport(sourceRoot, file.absolutePath, specifier);
    bindings.set(`__dynamic__${offset}`, {
      local: `__dynamic__${offset}`,
      source: specifier,
      importedFile,
      dynamic: true,
      line: lineOf(active, offset),
      evidence: evidence(file, match[0], "dynamic route component import", offset),
    });
  }
  return bindings;
}

function routeObjectContext(source: string, pathOffset: number): string {
  const nextPath = source.slice(pathOffset + 1).search(/\bpath\s*:/);
  const end = nextPath >= 0 ? pathOffset + 1 + nextPath : Math.min(source.length, pathOffset + 1400);
  return source.slice(pathOffset, end);
}

function parseRouteBindings(sourceRoot: string, file: SourceFile): RouterSfcRouteBinding[] {
  const active = stripComments(file.source);
  const imports = collectImports(sourceRoot, file);
  const results: RouterSfcRouteBinding[] = [];
  for (const pathMatch of active.matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/g)) {
    const path = pathMatch[1];
    if (!path || path === "*" || path.startsWith("http")) continue;
    const pathOffset = pathMatch.index ?? 0;
    const context = routeObjectContext(active, pathOffset);
    const nameMatch = context.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
    const componentMatch = context.match(/\bcomponent\s*:\s*([^,}\n]+)/);
    const componentExpression = componentMatch?.[1]?.trim() ?? null;
    const routeEvidence = [
      evidence(file, pathMatch[0], "route path declaration", pathOffset),
      ...(componentMatch ? [evidence(file, componentMatch[0], "route component declaration", pathOffset + (componentMatch.index ?? 0))] : []),
    ];
    let binding: ImportBinding | undefined;
    let resolution: RouterSfcResolution = "unresolved";
    let importBinding: string | null = null;
    let sfcFile: string | null = null;
    let dynamic = false;
    const reviewReasons: string[] = [];
    if (componentExpression) {
      const direct = componentExpression.match(/^([A-Za-z_$][\w$]*)$/);
      const dynamicMatch = componentExpression.match(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (direct) {
        importBinding = direct[1];
        binding = imports.get(importBinding);
        if (binding && !binding.dynamic) {
          resolution = binding.importedFile ? "static-import" : "unresolved";
          sfcFile = binding.importedFile ? relative(sourceRoot, binding.importedFile) : null;
          routeEvidence.push(binding.evidence);
        } else {
          reviewReasons.push(`route component binding ${importBinding} has no resolvable static import`);
        }
      } else if (dynamicMatch) {
        const specifier = dynamicMatch[1];
        dynamic = true;
        resolution = "dynamic-import";
        const dynamicBinding = [...imports.values()].find((item) => item.dynamic && item.source === specifier);
        sfcFile = dynamicBinding?.importedFile ? relative(sourceRoot, dynamicBinding.importedFile) : null;
        routeEvidence.push(dynamicBinding?.evidence ?? evidence(file, dynamicMatch[0], "dynamic route component import", pathOffset + (componentMatch?.index ?? 0)));
        if (!sfcFile) {
          resolution = "unresolved";
          reviewReasons.push(`dynamic component import ${specifier} cannot be resolved from source root`);
        }
      } else {
        reviewReasons.push(`unsupported route component expression: ${componentExpression}`);
      }
    } else {
      reviewReasons.push("route has no component declaration; visual owner must be reviewed");
    }
    if (!sfcFile) reviewReasons.push("route-to-SFC binding is unresolved; acceptance selector/text must not be promoted to ownership evidence");
    const confidence = sfcFile && (resolution === "static-import" || resolution === "dynamic-import") ? "high" : componentExpression ? "medium" : "low";
    results.push({
      path,
      name: nameMatch?.[1] ?? null,
      routeFile: file.relativePath,
      componentExpression,
      resolution,
      importBinding,
      sfcFile,
      dynamic,
      confidence,
      evidence: routeEvidence,
      reviewReasons: [...new Set(reviewReasons)],
    });
  }
  return results;
}

export function analyzeRouterToSfcResponsibilities(sourceRoot: string): RouterSfcResponsibilityGraph {
  const started = Date.now();
  const requestedRoot = resolve(sourceRoot);
  const nestedSourceRoot = join(requestedRoot, "src");
  const root = existsSync(join(nestedSourceRoot, "router")) ? nestedSourceRoot : requestedRoot;
  const files = listSourceFiles(root).map((absolutePath): SourceFile => ({ absolutePath, relativePath: relative(root, absolutePath), source: readFileSync(absolutePath, "utf8") }));
  const routerFiles = files.filter((file) => /(^|\/)router(?:\/|\.(?:js|ts|mjs|cjs))$/.test(file.relativePath) || /(^|\/)router\//.test(file.relativePath));
  const routerSource = files.find((file) => /(^|\/)router\/index\.(?:js|ts|mjs|cjs)$/.test(file.relativePath)) ?? routerFiles[0];
  const routerText = stripComments(routerSource?.source ?? "");
  const routerMajor: RouterSfcResponsibilityGraph["framework"]["routerMajor"] = /createRouter\s*\(/.test(routerText) ? 4 : /(?:new\s+Router|from\s+['"]vue-router['"])/.test(routerText) ? 3 : "unknown";
  const routes = routerFiles.flatMap((file) => parseRouteBindings(root, file));
  const unresolved = routes.filter((route) => route.resolution === "unresolved");
  const evidenceCount = routes.reduce((total, route) => total + route.evidence.length, 0);
  return {
    schemaVersion: "1.0",
    kind: "router-to-sfc-responsibility-graph",
    reviewRequired: true,
    sourceRoot: root,
    framework: { view: "vue", router: "vue-router", routerMajor },
    routes,
    unresolved,
    metrics: {
      filesScanned: files.length,
      routerFiles: routerFiles.length,
      routeBindings: routes.length,
      resolvedRoutes: routes.length - unresolved.length,
      dynamicImports: routes.filter((route) => route.resolution === "dynamic-import").length,
      unresolvedRoutes: unresolved.length,
      evidenceCount,
      scanMs: Number((Date.now() - started).toFixed(3)),
    },
    reviewReasons: [
      "route component ownership is derived from router-to-import-to-SFC evidence, not acceptance selectors or visible text",
      "the graph is review-only and does not authorize copying source implementation",
      ...(unresolved.length > 0 ? ["unresolved route bindings require manual review before visual target generation"] : []),
    ],
  };
}
