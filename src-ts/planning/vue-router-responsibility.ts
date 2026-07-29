import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type VueRouterResponsibilityKind =
  | "router-construction"
  | "route-table"
  | "route-module"
  | "dynamic-route-import"
  | "history-mode"
  | "guard-before-each"
  | "guard-after-each"
  | "guard-whitelist"
  | "guard-token-check"
  | "guard-role-resolution"
  | "guard-dynamic-route-injection"
  | "guard-redirect"
  | "history-navigation"
  | "router-link-navigation"
  | "router-view-rendering"
  | "route-meta-roles"
  | "reset-router"
  | "state-route-filtering";

export interface VueRouterEvidence {
  file: string;
  line: number;
  pattern: string;
  detail: string;
}

export interface VueRouterResponsibility {
  id: string;
  kind: VueRouterResponsibilityKind;
  owner: "router" | "guard" | "store" | "component" | "route-table";
  confidence: "high" | "medium";
  evidence: VueRouterEvidence[];
}

export interface VueRouterRouteSummary {
  path: string;
  file: string;
  dynamic: boolean;
  roles: string[];
  module: boolean;
}

export interface VueRouterResponsibilityGraph {
  schemaVersion: "1.0";
  kind: "vue-router-responsibility-graph";
  reviewRequired: true;
  sourceRoot: string;
  framework: {
    view: "vue";
    router: "vue-router";
    routerMajor: 2 | 3 | 4;
    state: "vuex" | "pinia" | "unknown";
  };
  files: string[];
  routes: VueRouterRouteSummary[];
  responsibilities: VueRouterResponsibility[];
  capabilities: {
    hashMode: boolean;
    historyMode: boolean;
    dynamicImports: boolean;
    nestedRoutes: boolean;
    roleMeta: boolean;
    guardRedirects: boolean;
    dynamicRouteInjection: boolean;
    historyNavigation: boolean;
    routerLinks: boolean;
    routerView: boolean;
    resetRouter: boolean;
  };
  blockers: string[];
  reviewReasons: string[];
  metrics: {
    filesScanned: number;
    routesDiscovered: number;
    dynamicRoutes: number;
    roleProtectedRoutes: number;
    evidenceCount: number;
    scanMs: number;
  };
}

interface ScanFile {
  absolutePath: string;
  relativePath: string;
  source: string;
  lines: string[];
}

function listSourceFiles(root: string): string[] {
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:js|vue|ts|tsx)$/.test(entry.name)) output.push(absolute);
    }
  };
  visit(root);
  return output.sort();
}

function lineOf(source: ScanFile, offset: number): number {
  return source.source.slice(0, Math.max(0, offset)).split("\n").length;
}

function evidence(file: ScanFile, pattern: string, detail: string, offset?: number): VueRouterEvidence {
  return { file: file.relativePath, line: lineOf(file, offset ?? file.source.indexOf(pattern)), pattern, detail };
}

function findEvidence(file: ScanFile, pattern: RegExp, detail: string): VueRouterEvidence[] {
  return [...file.source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))]
    .map((match) => evidence(file, match[0], detail, match.index));
}

function addResponsibility(
  responsibilities: VueRouterResponsibility[],
  kind: VueRouterResponsibilityKind,
  owner: VueRouterResponsibility["owner"],
  confidence: VueRouterResponsibility["confidence"],
  items: VueRouterEvidence[],
): void {
  if (items.length === 0) return;
  responsibilities.push({ id: `${kind}:${responsibilities.length + 1}`, kind, owner, confidence, evidence: items });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "))
    .replace(/(^|\n)\s*\/\/[^\n]*/g, (value) => value.replace(/[^\n]/g, " "));
}

function routeSummaries(files: ScanFile[]): VueRouterRouteSummary[] {
  const routes: VueRouterRouteSummary[] = [];
  for (const file of files) {
    if (!file.relativePath.includes("router")) continue;
    for (const match of file.source.matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/g)) {
      const path = match[1];
      if (!path || path.startsWith("http") || path === "*") continue;
      const context = file.source.slice(Math.max(0, (match.index ?? 0) - 180), Math.min(file.source.length, (match.index ?? 0) + 320));
      const roles = [...context.matchAll(/roles\s*:\s*\[([^\]]*)\]/g)].flatMap((roleMatch) =>
        [...roleMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((role) => role[1]),
      );
      routes.push({
        path,
        file: file.relativePath,
        dynamic: path.includes(":") || path.includes("*"),
        roles: [...new Set(roles)],
        module: file.relativePath.includes("router/modules/"),
      });
    }
  }
  return routes;
}

export function analyzeVueRouterResponsibility(sourceRoot: string): VueRouterResponsibilityGraph {
  const started = Date.now();
  const requestedRoot = resolve(sourceRoot);
  const nestedSourceRoot = join(requestedRoot, "src");
  const root = existsSync(join(nestedSourceRoot, "router")) ? nestedSourceRoot : requestedRoot;
  const files = listSourceFiles(root).map((absolutePath): ScanFile => ({
    absolutePath,
    relativePath: relative(root, absolutePath),
    source: readFileSync(absolutePath, "utf8"),
    lines: [],
  }));
  const responsibilities: VueRouterResponsibility[] = [];
  const routerFiles = files.filter((file) => /(^|\/)router(?:\/|\.(?:js|ts|mjs|cjs|jsx|tsx)$)/.test(file.relativePath));
  const routerIndex = files.find((file) => /(^|\/)router\/index\.(?:js|ts|mjs|cjs|jsx|tsx)$/.test(file.relativePath));
  const guardFiles = files.filter((file) => /\brouter\.(?:beforeEach|afterEach)\s*\(/.test(stripComments(file.source)));
  const storePermissionFiles = files.filter((file) =>
    /(^|\/)store(?:s)?\//.test(file.relativePath)
    && /(?:permission|role|access|route)/i.test(file.relativePath)
  );
  for (const file of files) file.lines = file.source.split("\n");
  const routes = routeSummaries(files);
  const all = files.map((file) => file.source).join("\n");
  const activeRouterSource = stripComments(routerIndex?.source ?? "");
  const vueRouter4 = /import\s*\{[^}]*\bcreateRouter\b[^}]*\}\s*from\s*['"]vue-router['"]/.test(activeRouterSource);
  const explicitHistoryMode = /mode\s*:\s*['"]history['"]/.test(activeRouterSource) || /\bcreateWebHistory\s*\(/.test(activeRouterSource);
  const explicitHashMode = /\bcreateWebHashHistory\s*\(/.test(activeRouterSource);

  addResponsibility(responsibilities, "router-construction", "router", "high", routerFiles.flatMap((file) => [
    ...findEvidence(file, /new\s+Router\s*\(/g, "Vue Router 2/3 instance construction"),
    ...findEvidence(file, /\bcreateRouter\s*\(/g, "Vue Router 4 instance construction"),
  ]));
  addResponsibility(responsibilities, "route-table", "route-table", "high", routerFiles.flatMap((file) => [
    ...findEvidence(file, /export\s+const\s+constantRoutes\s*=\s*\[/g, "constant route table"),
    ...findEvidence(file, /export\s+const\s+asyncRoutes\s*=\s*\[/g, "role-aware asynchronous route table"),
    ...findEvidence(file, /(?:export\s+)?const\s+routes\s*=\s*\[/g, "Vue Router route table"),
  ]));
  addResponsibility(responsibilities, "route-module", "route-table", "high", files.filter((file) => file.relativePath.includes("router/modules/")).map((file) => evidence(file, file.relativePath, "modular route table source")));
  addResponsibility(responsibilities, "dynamic-route-import", "route-table", "high", routerFiles.flatMap((file) => findEvidence(file, /component\s*:\s*\(\)\s*=>\s*import\s*\(/g, "lazy route component import")));
  addResponsibility(responsibilities, "history-mode", "router", "high", routerIndex && explicitHistoryMode
    ? [
      ...findEvidence({ ...routerIndex, source: activeRouterSource }, /mode\s*:\s*['"]history['"]/g, "explicit active history mode"),
      ...findEvidence({ ...routerIndex, source: activeRouterSource }, /\bcreateWebHistory\s*\(/g, "Vue Router 4 HTML5 history factory"),
    ]
    : []);
  addResponsibility(responsibilities, "guard-before-each", "guard", "high", guardFiles.flatMap((file) =>
    findEvidence(file, /router\.beforeEach\s*\(/g, "global router guard registration")
  ));
  addResponsibility(responsibilities, "guard-after-each", "guard", "high", guardFiles.flatMap((file) =>
    findEvidence(file, /router\.afterEach\s*\(/g, "global router after-hook registration")
  ));
  addResponsibility(responsibilities, "guard-whitelist", "guard", "high", guardFiles.flatMap((file) =>
    findEvidence(file, /(?:whiteList|whiteRoutes?|publicRoutes?)\s*=\s*\[[^\]]*\]/gi, "unauthenticated route allow-list")
  ));
  addResponsibility(responsibilities, "guard-token-check", "guard", "high", guardFiles.flatMap((file) =>
    findEvidence(file, /getToken\s*\(|hasToken\b|(?:userInfo|session|auth(?:entication)?)Store\.[\w$]+/gi, "authentication state check")
  ));
  addResponsibility(responsibilities, "guard-role-resolution", "guard", "high", [
    ...guardFiles.flatMap((file) => findEvidence(file, /getInfo|roles|hasRoles|\.roles\b/g, "user role resolution in navigation guard")),
    ...storePermissionFiles.flatMap((file) => findEvidence(file, /roles\.includes|hasPermission|filter.*Routes/gi, "role-based route filtering")),
  ]);
  addResponsibility(responsibilities, "guard-dynamic-route-injection", "guard", "high", [
    ...files.flatMap((file) => findEvidence(file, /router\.addRoutes?\s*\(/g, "dynamic accessible route injection")),
    ...storePermissionFiles.flatMap((file) => findEvidence(file, /generateRoutes\s*\(|initRoute\s*\(/g, "state-owned accessible route generation")),
  ]);
  addResponsibility(responsibilities, "guard-redirect", "guard", "high", guardFiles.flatMap((file) => [
    ...findEvidence(file, /next\s*\([^\n]*(?:login|path|replace)/gi, "guard redirect via next()"),
    ...findEvidence(file, /router\.(?:push|replace)\s*\([^\n]*(?:login|path|replace)/gi, "guard redirect via router navigation"),
  ]));
  addResponsibility(responsibilities, "history-navigation", "router", "medium", files.flatMap((file) => findEvidence(file, /\$router\.(?:push|replace|go|back|forward)\s*\(|router\.(?:push|replace|go|back|forward)\s*\(/g, "imperative Vue Router navigation")));
  addResponsibility(responsibilities, "router-link-navigation", "component", "high", files.flatMap((file) => findEvidence(file, /<router-link\b|:to\s*=|\bto\s*=\s*['"]/g, "declarative router-link navigation")));
  addResponsibility(responsibilities, "router-view-rendering", "component", "high", files.flatMap((file) => findEvidence(file, /<router-view\b/g, "route view rendering outlet")));
  addResponsibility(responsibilities, "route-meta-roles", "route-table", "high", routerFiles.flatMap((file) => findEvidence(file, /roles\s*:\s*\[[^\]]+\]/g, "role metadata on route")));
  addResponsibility(responsibilities, "reset-router", "router", "high", routerIndex ? findEvidence(routerIndex, /resetRouter\s*\(|router\.matcher\s*=/g, "router matcher reset for dynamic route lifecycle") : []);
  addResponsibility(responsibilities, "state-route-filtering", "store", "high", storePermissionFiles.flatMap((file) => [
    ...findEvidence(file, /filterAsyncRoutes\s*\(|filter.*Routes\s*\(/gi, "recursive permission route filtering"),
    ...findEvidence(file, /constantRoutes\.concat\(|routeModulesList|wholeMenus/gi, "constant and accessible route composition"),
  ]));

  const capabilities = {
    hashMode: explicitHashMode || (responsibilities.some((item) => item.kind === "router-construction") && !explicitHistoryMode && !vueRouter4),
    historyMode: explicitHistoryMode,
    dynamicImports: responsibilities.some((item) => item.kind === "dynamic-route-import"),
    nestedRoutes: routes.some((route) => route.path.startsWith("/") === false) || /children\s*:\s*\[/.test(all),
    roleMeta: responsibilities.some((item) => item.kind === "route-meta-roles"),
    guardRedirects: responsibilities.some((item) => item.kind === "guard-redirect"),
    dynamicRouteInjection: responsibilities.some((item) => item.kind === "guard-dynamic-route-injection"),
    historyNavigation: responsibilities.some((item) => item.kind === "history-navigation"),
    routerLinks: responsibilities.some((item) => item.kind === "router-link-navigation"),
    routerView: responsibilities.some((item) => item.kind === "router-view-rendering"),
    resetRouter: responsibilities.some((item) => item.kind === "reset-router"),
  };
  const blockers: string[] = [];
  if (!routerIndex) blockers.push("router/index.(js|ts|mjs|cjs|jsx|tsx) was not found; route ownership cannot be proven");
  if (!responsibilities.some((item) => item.kind === "guard-before-each")) blockers.push("global beforeEach guard was not found");
  if (capabilities.dynamicRouteInjection && !capabilities.roleMeta) blockers.push("dynamic route injection was found without auditable route meta roles");
  const roleProtectedRoutes = routes.filter((route) => route.roles.length > 0).length;
  return {
    schemaVersion: "1.0",
    kind: "vue-router-responsibility-graph",
    reviewRequired: true,
    sourceRoot: root,
    framework: {
      view: "vue",
      router: "vue-router",
      routerMajor: vueRouter4 ? 4 : 3,
      state: files.some((file) => /from\s*['"]pinia['"]|\bdefineStore\s*\(/.test(stripComments(file.source)))
        ? "pinia"
        : files.some((file) => /from\s*['"]vuex['"]|\bnew\s+Vuex\.Store\s*\(/.test(stripComments(file.source)))
          ? "vuex"
          : "unknown",
    },
    files: files.map((file) => file.relativePath),
    routes,
    responsibilities,
    capabilities,
    blockers,
    reviewReasons: [
      "Vue Router owns route matching and history semantics; the analyzer must not replace it with a generic router",
      "dynamic route injection is role-dependent and requires a reviewed fixture identity",
      "lazy component imports and router-view boundaries remain source-owned visual responsibilities",
      "the output is an auditable graph and review-only integration proposal, not an applied source rewrite",
    ],
    metrics: {
      filesScanned: files.length,
      routesDiscovered: routes.length,
      dynamicRoutes: routes.filter((route) => route.dynamic).length,
      roleProtectedRoutes,
      evidenceCount: responsibilities.reduce((sum, item) => sum + item.evidence.length, 0),
      scanMs: Date.now() - started,
    },
  };
}
