import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

export interface RouterSfcEvidence {
  file: string;
  line: number;
  pattern: string;
  detail: string;
}

export type RouterSfcResolution = "static-import" | "dynamic-import" | "unresolved";

export type RouterSfcRouteKind =
  | "visual-leaf"
  | "layout-owner"
  | "router-view-parent"
  | "redirect-only-parent"
  | "route-grouping";

export interface RouterSfcRouteBinding {
  /** The normalized, fully-qualified route path. */
  path: string;
  /** The path as declared by this route record before parent merging. */
  recordPath: string;
  name: string | null;
  routeFile: string;
  routeRecords: string[];
  parentPath: string | null;
  layoutChain: string[];
  routeKind: RouterSfcRouteKind;
  ownershipRoles: RouterSfcRouteKind[];
  parentOnly: boolean;
  visualOwnerProven: boolean;
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
    routeGroups: number;
    redirectOnlyParents: number;
    layoutOwners: number;
    visualLeaves: number;
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
  const candidates = [
    candidate,
    `${candidate}.vue`,
    `${candidate}.js`,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.jsx`,
    join(candidate, "index.vue"),
    join(candidate, "index.js"),
    join(candidate, "index.ts"),
  ];
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
  // A route component is often declared as a local factory instead of an
  // import binding, e.g. `const Layout = () => import('@/layouts/Layout.vue')`.
  // Resolve the factory from its source evidence; do not infer ownership from
  // the variable name.
  const factoryPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?(?:[^=()]*)\)?\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of active.matchAll(factoryPattern)) {
    const local = match[1];
    const specifier = match[2];
    const offset = match.index ?? 0;
    const importedFile = resolveImport(sourceRoot, file.absolutePath, specifier);
    bindings.set(local, {
      local,
      source: specifier,
      importedFile,
      dynamic: true,
      line: lineOf(active, offset),
      evidence: evidence(file, match[0], "local route component factory binding", offset),
    });
  }
  return bindings;
}

interface RouteProperty {
  key: string;
  valueStart: number;
  valueEnd: number;
  value: string;
}

interface RouteObject {
  start: number;
  end: number;
  path: string;
  pathOffset: number;
  name: string | null;
  componentExpression: string | null;
  componentOffset: number | null;
  hasChildren: boolean;
  childrenStart: number | null;
  childrenEnd: number | null;
  hasRedirect: boolean;
  routeFile: SourceFile;
  imports: Map<string, ImportBinding>;
  children: RouteObject[];
}

function matchingBracket(source: string, start: number, open: string, close: string): number | null {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function topLevelProperties(source: string, start: number, end: number): RouteProperty[] {
  const properties: RouteProperty[] = [];
  let cursor = start + 1;
  while (cursor < end) {
    while (cursor < end && /\s|,/.test(source[cursor] ?? "")) cursor += 1;
    const keyMatch = source.slice(cursor, end).match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (!keyMatch) {
      cursor += 1;
      continue;
    }
    const key = keyMatch[1];
    const colonOffset = cursor + keyMatch[0].lastIndexOf(":");
    const valueStart = colonOffset + 1;
    let index = valueStart;
    let braces = 0;
    let brackets = 0;
    let parens = 0;
    let quote: string | null = null;
    let escaped = false;
    for (; index < end; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") braces += 1;
      else if (character === "}") braces -= 1;
      else if (character === "[") brackets += 1;
      else if (character === "]") brackets -= 1;
      else if (character === "(") parens += 1;
      else if (character === ")") parens -= 1;
      else if (character === "," && braces === 0 && brackets === 0 && parens === 0) break;
    }
    properties.push({ key, valueStart, valueEnd: index, value: source.slice(valueStart, index).trim() });
    cursor = index + 1;
  }
  return properties;
}

function stringValue(source: string, start: number, end: number): string | null {
  const value = source.slice(start, end).trim();
  const match = value.match(/^['"]([^'"\\]*(?:\\.[^'"\\]*)*)['"]$/);
  return match ? match[1].replace(/\\(['"])/g, "$1") : null;
}

function hasProperty(properties: RouteProperty[], key: string): boolean {
  return properties.some((property) => property.key === key);
}

function parseRouteObjects(sourceRoot: string, file: SourceFile): RouteObject[] {
  const active = stripComments(file.source);
  const imports = collectImports(sourceRoot, file);
  const objects: RouteObject[] = [];
  for (let start = active.indexOf("{"); start >= 0; start = active.indexOf("{", start + 1)) {
    const end = matchingBracket(active, start, "{", "}");
    if (end === null) continue;
    const properties = topLevelProperties(active, start, end);
    const pathProperty = properties.find((property) => property.key === "path");
    if (!pathProperty) continue;
    const path = stringValue(active, pathProperty.valueStart, pathProperty.valueEnd);
    if (!path || path === "*" || path.startsWith("http")) continue;
    const childrenProperty = properties.find((property) => property.key === "children");
    const possibleChildrenStart = childrenProperty ? active.indexOf("[", childrenProperty.valueStart) : -1;
    const childrenStart = childrenProperty && possibleChildrenStart >= childrenProperty.valueStart && possibleChildrenStart < childrenProperty.valueEnd ? possibleChildrenStart : -1;
    const childrenEnd = childrenStart >= 0 ? matchingBracket(active, childrenStart, "[", "]") : null;
    const componentProperty = properties.find((property) => property.key === "component");
    const nameProperty = properties.find((property) => property.key === "name");
    const routeLike = Boolean(componentProperty || childrenProperty || hasProperty(properties, "redirect") || nameProperty);
    // A guard such as `next({ path: '/login' })` is an object literal, but it
    // is not a route record. Require a route-semantic property before adding it.
    if (!routeLike) continue;
    const children = objects.filter((candidate) => childrenStart !== -1 && childrenEnd !== null && candidate.start > childrenStart && candidate.end < childrenEnd);
    objects.push({
      start,
      end,
      path,
      pathOffset: pathProperty.valueStart,
      name: nameProperty ? stringValue(active, nameProperty.valueStart, nameProperty.valueEnd) : null,
      componentExpression: componentProperty?.value ?? null,
      componentOffset: componentProperty ? componentProperty.valueStart : null,
      hasChildren: Boolean(childrenProperty),
      childrenStart: childrenStart >= 0 ? childrenStart : null,
      childrenEnd,
      hasRedirect: hasProperty(properties, "redirect"),
      routeFile: file,
      imports,
      children,
    });
  }
  // Objects are discovered from the outside in, so the initial children list
  // may miss descendants discovered later. Rebuild it from the final set.
  for (const object of objects) {
    object.children = objects.filter((candidate) => object.childrenStart !== null && object.childrenEnd !== null && candidate.start > object.childrenStart && candidate.end < object.childrenEnd && !objects.some((other) => other !== object && other.start > object.childrenStart! && other.end < object.childrenEnd! && candidate.start > other.start && candidate.end < other.end));
  }
  return objects;
}

function resolveRouteComponent(sourceRoot: string, route: RouteObject): Pick<RouterSfcRouteBinding, "resolution" | "importBinding" | "sfcFile" | "dynamic" | "confidence" | "evidence" | "reviewReasons"> {
  const expression = route.componentExpression;
  const routeEvidence = [
    evidence(route.routeFile, `path: '${route.path}'`, "route path declaration", route.pathOffset),
    ...(route.componentOffset !== null && expression ? [evidence(route.routeFile, expression, "route component declaration", route.componentOffset)] : []),
  ];
  let resolution: RouterSfcResolution = "unresolved";
  let importBinding: string | null = null;
  let sfcFile: string | null = null;
  let dynamic = false;
  const reviewReasons: string[] = [];
  if (expression) {
    const direct = expression.match(/^([A-Za-z_$][\w$]*)$/);
    const dynamicMatch = expression.match(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (direct) {
      importBinding = direct[1];
      const binding = route.imports.get(importBinding);
      if (binding) {
        dynamic = binding.dynamic;
        resolution = binding.importedFile ? (binding.dynamic ? "dynamic-import" : "static-import") : "unresolved";
        sfcFile = binding.importedFile ? relative(sourceRoot, binding.importedFile) : null;
        routeEvidence.push(binding.evidence);
        if (!sfcFile) reviewReasons.push(`route component binding ${importBinding} cannot be resolved from ${binding.source}`);
      } else {
        reviewReasons.push(`route component binding ${importBinding} has no resolvable import or component factory`);
      }
    } else if (dynamicMatch) {
      const specifier = dynamicMatch[1];
      dynamic = true;
      resolution = "dynamic-import";
      const binding = [...route.imports.values()].find((item) => item.dynamic && item.source === specifier);
      sfcFile = binding?.importedFile ? relative(sourceRoot, binding.importedFile) : null;
      routeEvidence.push(binding?.evidence ?? evidence(route.routeFile, dynamicMatch[0], "dynamic route component import", route.componentOffset ?? route.pathOffset));
      if (!sfcFile) {
        resolution = "unresolved";
        reviewReasons.push(`dynamic component import ${specifier} cannot be resolved from source root`);
      }
    } else {
      reviewReasons.push(`unsupported route component expression: ${expression}`);
    }
  } else if (!route.hasChildren && !route.hasRedirect) {
    reviewReasons.push("route has no component declaration; visual owner must be reviewed");
  }
  if (!sfcFile && expression) reviewReasons.push("route-to-SFC binding is unresolved; acceptance selector/text must not be promoted to ownership evidence");
  const confidence = sfcFile && (resolution === "static-import" || resolution === "dynamic-import") ? "high" : expression ? "medium" : "low";
  return { resolution, importBinding, sfcFile, dynamic, confidence, evidence: routeEvidence, reviewReasons };
}

function joinRoutePath(parentPath: string | null, recordPath: string): string {
  if (!parentPath || recordPath.startsWith("/")) return recordPath.startsWith("/") ? recordPath : `/${recordPath}`;
  if (parentPath === "/") return `/${recordPath.replace(/^\/+/, "")}`;
  return `${parentPath.replace(/\/+$/, "")}/${recordPath.replace(/^\/+/, "")}`;
}

function containsRouterView(sourceRoot: string, sfcFile: string | null): boolean {
  if (!sfcFile) return false;
  try {
    const source = readFileSync(join(sourceRoot, sfcFile), "utf8");
    return /<router-view\b|<RouterView\b/.test(source);
  } catch {
    return false;
  }
}

function classifyRoute(route: RouteObject, resolved: Pick<RouterSfcRouteBinding, "sfcFile" | "resolution">, _sourceRoot: string): RouterSfcRouteKind {
  if (route.hasChildren && route.hasRedirect && !resolved.sfcFile) return "redirect-only-parent";
  if (route.hasChildren && resolved.sfcFile) return "layout-owner";
  if (route.hasChildren) return "route-grouping";
  return route.componentExpression || resolved.sfcFile ? "visual-leaf" : "route-grouping";
}

function ownershipRoles(route: RouteObject, resolved: Pick<RouterSfcRouteBinding, "sfcFile" | "resolution">, sourceRoot: string, routeKind: RouterSfcRouteKind): RouterSfcRouteKind[] {
  const roles: RouterSfcRouteKind[] = [routeKind];
  if (route.hasChildren && resolved.sfcFile && containsRouterView(sourceRoot, resolved.sfcFile)) roles.push("router-view-parent");
  return [...new Set(roles)];
}

function flattenRouteTree(sourceRoot: string, roots: RouteObject[], parentPath: string | null, parentLayoutChain: string[]): RouterSfcRouteBinding[] {
  const result: RouterSfcRouteBinding[] = [];
  for (const route of roots) {
    const resolved = resolveRouteComponent(sourceRoot, route);
    const path = joinRoutePath(parentPath, route.path);
    const routeKind = classifyRoute(route, resolved, sourceRoot);
    const layoutChain = routeKind === "layout-owner" && resolved.sfcFile ? [...parentLayoutChain, resolved.sfcFile] : parentLayoutChain;
    const reviewReasons = [...resolved.reviewReasons];
    if (route.hasChildren && route.path.startsWith("/")) reviewReasons.push("child route paths are resolved relative to this route record");
    if (routeKind === "route-grouping") reviewReasons.push("route grouping node has no proven visual owner");
    if (routeKind === "redirect-only-parent") reviewReasons.push("redirect-only parent has no visual owner; inspect its children independently");
    if (routeKind === "layout-owner" && resolved.sfcFile && !containsRouterView(sourceRoot, resolved.sfcFile)) reviewReasons.push("layout component does not expose a direct router-view; inspect nested AppMain/router-view ownership");
    if (routeKind === "router-view-parent") reviewReasons.push("route component has children but no proven router-view boundary");
    const roles = ownershipRoles(route, resolved, sourceRoot, routeKind);
    const visualOwnerProven = routeKind === "visual-leaf" ? Boolean(resolved.sfcFile) : routeKind === "layout-owner" ? Boolean(resolved.sfcFile) : false;
    result.push({
      path,
      recordPath: route.path,
      name: route.name,
      routeFile: route.routeFile.relativePath,
      routeRecords: [route.routeFile.relativePath],
      parentPath,
      layoutChain,
      routeKind,
      ownershipRoles: roles,
      parentOnly: route.hasChildren,
      visualOwnerProven,
      componentExpression: route.componentExpression,
      ...resolved,
      reviewReasons: [...new Set(reviewReasons)],
    });
    result.push(...flattenRouteTree(sourceRoot, route.children, path, layoutChain));
  }
  return result;
}

function parseRouteBindings(sourceRoot: string, file: SourceFile): RouterSfcRouteBinding[] {
  const objects = parseRouteObjects(sourceRoot, file);
  const roots = objects.filter((candidate) => !objects.some((parent) => parent !== candidate && parent.children.includes(candidate)));
  return flattenRouteTree(sourceRoot, roots, null, []);
}

export function analyzeRouterToSfcResponsibilities(sourceRoot: string): RouterSfcResponsibilityGraph {
  const started = Date.now();
  const requestedRoot = resolve(sourceRoot);
  const nestedSourceRoot = join(requestedRoot, "src");
  const root = existsSync(join(nestedSourceRoot, "router")) ? nestedSourceRoot : requestedRoot;
  const files = listSourceFiles(root).map((absolutePath): SourceFile => ({ absolutePath, relativePath: relative(root, absolutePath), source: readFileSync(absolutePath, "utf8") }));
  const routerFiles = files.filter((file) => /(^|\/)router(?:\/|\.(?:js|ts|mjs|cjs|jsx|tsx))$/.test(file.relativePath) || /(^|\/)router\//.test(file.relativePath));
  const routerSource = files.find((file) => /(^|\/)router\/index\.(?:js|ts|mjs|cjs|jsx|tsx)$/.test(file.relativePath)) ?? routerFiles[0];
  const routerText = stripComments(routerSource?.source ?? "");
  const routerMajor: RouterSfcResponsibilityGraph["framework"]["routerMajor"] = /createRouter\s*\(/.test(routerText) ? 4 : /(?:new\s+Router|from\s+['"]vue-router['"])/.test(routerText) ? 3 : "unknown";
  const routes = routerFiles.flatMap((file) => parseRouteBindings(root, file));
  // Grouping and redirect-only records intentionally have no SFC owner. They
  // remain reviewable route nodes, but are not unresolved component bindings.
  const unresolved = routes.filter((route) => route.resolution === "unresolved" && route.routeKind !== "route-grouping" && route.routeKind !== "redirect-only-parent");
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
      routeGroups: routes.filter((route) => route.routeKind === "route-grouping").length,
      redirectOnlyParents: routes.filter((route) => route.routeKind === "redirect-only-parent").length,
      layoutOwners: routes.filter((route) => route.routeKind === "layout-owner").length,
      visualLeaves: routes.filter((route) => route.routeKind === "visual-leaf").length,
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
