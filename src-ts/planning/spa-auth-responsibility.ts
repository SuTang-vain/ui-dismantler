import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { analyzeSpaAuthGuardResponsibilities, type AuthDynamicRouteContract, type AuthGuardEvidence, type AuthLoginFlowContract, type AuthRouteGuardContract, type AuthStorageAdapterContract } from "./spa-auth-guard-responsibility.js";

export interface SpaAuthEvidence {
  kind: "query-read" | "storage-write" | "storage-read" | "authorization-header" | "unauthorized-status" | "redirect-read" | "redirect-navigation";
  file: string;
  storage?: "sessionStorage" | "localStorage";
  key?: string;
  queryKey?: string;
  header?: string;
  status?: number;
  expression: string;
}

export interface SpaAuthResponsibilityGraph {
  schemaVersion: "1.1";
  kind: "spa-auth-responsibility-graph";
  reviewRequired: true;
  sourceRoot: string;
  evidence: Array<SpaAuthEvidence | AuthGuardEvidence>;
  contracts: {
    queryToStorage: Array<{ queryKey: string; storage: "sessionStorage" | "localStorage"; storageKey: string; files: string[] }>;
    storageToAuthorization: Array<{ storage: "sessionStorage" | "localStorage"; storageKey: string; header: string; files: string[] }>;
    unauthorizedRedirect: Array<{ status: 401; redirectProperty?: string; navigationTarget: string; files: string[] }>;
    storageAdapters: AuthStorageAdapterContract[];
    loginFlows: AuthLoginFlowContract[];
    routeGuards: AuthRouteGuardContract[];
    dynamicRouteInitialization: AuthDynamicRouteContract[];
    freshAuthenticationRequired: true;
    crossRunPersistenceAllowed: false;
  };
  metrics: {
    filesScanned: number;
    queryReads: number;
    storageWrites: number;
    storageReads: number;
    storageRemoves: number;
    storageAdapters: number;
    resolvedStorageAdapters: number;
    authorizationHeaders: number;
    unauthorizedBranches: number;
    redirectNavigations: number;
    guardRegistrations: number;
    completeRouteGuards: number;
    loginFlows: number;
    completeLoginFlows: number;
    dynamicRouteInitializers: number;
    completeDynamicRouteInitializers: number;
    completeQueryStorageAuthorizationChains: number;
  };
  reviewReasons: string[];
}

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".vue"]);

function sourceFiles(sourceRoot: string): string[] {
  const roots = [join(sourceRoot, "src")].filter((item) => existsSync(item));
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git", "coverage"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) output.push(absolute);
    }
  };
  for (const root of roots) visit(root);
  return output.sort();
}

function expressionAt(source: string, index: number, length: number): string {
  return source.slice(index, index + length).replace(/\s+/g, " ").trim();
}

function uniqueFiles(values: SpaAuthEvidence[]): string[] {
  return [...new Set(values.map((item) => item.file))].sort();
}

export function analyzeSpaAuthResponsibilities(sourceRoot: string): SpaAuthResponsibilityGraph {
  const root = resolve(sourceRoot);
  const files = sourceFiles(root);
  const guardAnalysis = analyzeSpaAuthGuardResponsibilities(root);
  const evidence: SpaAuthEvidence[] = [];
  for (const absolute of files) {
    if (!statSync(absolute).isFile()) continue;
    const file = relative(root, absolute).replaceAll("\\", "/");
    const source = readFileSync(absolute, "utf8");
    for (const match of source.matchAll(/new\s+URLSearchParams\s*\([^)]*\)\s*\.get\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      evidence.push({ kind: "query-read", file, queryKey: match[1], expression: expressionAt(source, match.index ?? 0, match[0].length) });
    }
    for (const match of source.matchAll(/\b(sessionStorage|localStorage)\s*\.\s*(setItem|getItem)\s*\(\s*['"]([^'"]+)['"]/g)) {
      evidence.push({ kind: match[2] === "setItem" ? "storage-write" : "storage-read", file, storage: match[1] as "sessionStorage" | "localStorage", key: match[3], expression: expressionAt(source, match.index ?? 0, match[0].length) });
    }
    for (const match of source.matchAll(/(?:headers\s*\.\s*|headers\s*\[\s*['"])(Authorization)(?:['"]\s*\])?\s*=\s*([^;\n]+)/gi)) {
      evidence.push({ kind: "authorization-header", file, header: "Authorization", expression: expressionAt(source, match.index ?? 0, match[0].length) });
    }
    for (const match of source.matchAll(/(?:status|statusCode)\s*===?\s*(401)\b/g)) {
      evidence.push({ kind: "unauthorized-status", file, status: 401, expression: expressionAt(source, match.index ?? 0, match[0].length) });
    }
    for (const match of source.matchAll(/(?:response\s*\.\s*data|data)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g)) {
      if (!/redirect/i.test(match[1])) continue;
      evidence.push({ kind: "redirect-read", file, key: match[1], expression: expressionAt(source, match.index ?? 0, match[0].length) });
    }
    for (const match of source.matchAll(/(?:window\s*\.\s*)?location\s*\.\s*(href|assign|replace)\s*(?:=|\()\s*([^;\n)]+)/g)) {
      evidence.push({ kind: "redirect-navigation", file, key: match[1], expression: expressionAt(source, match.index ?? 0, match[0].length) });
    }
  }

  const queryReads = evidence.filter((item) => item.kind === "query-read");
  const writes = evidence.filter((item) => item.kind === "storage-write");
  const reads = evidence.filter((item) => item.kind === "storage-read");
  const authHeaders = evidence.filter((item) => item.kind === "authorization-header");
  const queryToStorage = queryReads.flatMap((query) => writes
    .filter((write) => write.storage && write.key && write.file === query.file)
    .map((write) => ({ queryKey: query.queryKey!, storage: write.storage!, storageKey: write.key!, files: uniqueFiles([query, write]) }))
    .filter((item, index, values) => values.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index));
  const storageToAuthorization = reads.flatMap((read) => authHeaders
    .filter((header) => read.storage && read.key && header.file === read.file)
    .map((header) => ({ storage: read.storage!, storageKey: read.key!, header: header.header ?? "Authorization", files: uniqueFiles([read, header]) }))
    .filter((item, index, values) => values.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index));
  const unauthorized = evidence.filter((item) => item.kind === "unauthorized-status");
  const redirectReads = evidence.filter((item) => item.kind === "redirect-read");
  const redirectNavigations = evidence.filter((item) => item.kind === "redirect-navigation");
  const unauthorizedRedirect = unauthorized.length && redirectNavigations.length ? [{
    status: 401 as const,
    redirectProperty: redirectReads[0]?.key,
    navigationTarget: redirectNavigations[0].key ?? "href",
    files: uniqueFiles([...unauthorized, ...redirectReads, ...redirectNavigations]),
  }] : [];
  const completeChains = queryToStorage.filter((query) => storageToAuthorization.some((auth) => auth.storage === query.storage && auth.storageKey === query.storageKey)).length;
  return {
    schemaVersion: "1.1",
    kind: "spa-auth-responsibility-graph",
    reviewRequired: true,
    sourceRoot: root,
    evidence: [...evidence, ...guardAnalysis.evidence],
    contracts: {
      queryToStorage,
      storageToAuthorization,
      unauthorizedRedirect,
      storageAdapters: guardAnalysis.storageAdapters,
      loginFlows: guardAnalysis.loginFlows,
      routeGuards: guardAnalysis.routeGuards,
      dynamicRouteInitialization: guardAnalysis.dynamicRouteInitialization,
      freshAuthenticationRequired: true,
      crossRunPersistenceAllowed: false,
    },
    metrics: {
      filesScanned: files.length,
      queryReads: queryReads.length,
      storageWrites: writes.length,
      storageReads: reads.length + guardAnalysis.evidence.filter((item) => item.kind === "storage-adapter-read").length,
      storageRemoves: guardAnalysis.metrics.storageRemoves,
      storageAdapters: guardAnalysis.metrics.storageAdapters,
      resolvedStorageAdapters: guardAnalysis.metrics.resolvedStorageAdapters,
      authorizationHeaders: authHeaders.length,
      unauthorizedBranches: unauthorized.length,
      redirectNavigations: redirectNavigations.length,
      guardRegistrations: guardAnalysis.metrics.guardRegistrations,
      completeRouteGuards: guardAnalysis.metrics.completeRouteGuards,
      loginFlows: guardAnalysis.metrics.loginFlows,
      completeLoginFlows: guardAnalysis.metrics.completeLoginFlows,
      dynamicRouteInitializers: guardAnalysis.metrics.dynamicRouteInitializers,
      completeDynamicRouteInitializers: guardAnalysis.metrics.completeDynamicRouteInitializers,
      completeQueryStorageAuthorizationChains: completeChains,
    },
    reviewReasons: [
      "authentication evidence is extracted from query, storage, imported wrapper, handler data flow, router guard, header, status, and navigation structure without executing source code",
      "third-party storage defaults are resolved only from installed frozen dependency implementation; unresolved wrapper behavior remains review-required",
      "login, role, dynamic-route, and guard chains remain review-required until source-backed credential and fixture selection is approved",
      "storage artifacts remain isolated to one BrowserContext unless an explicitly reviewed setup contract is present",
      "cross-run authentication persistence remains disabled even when a complete token chain is discovered",
      "a fresh authentication contract is still required to prevent cached credentials from hiding regressions",
    ],
  };
}
