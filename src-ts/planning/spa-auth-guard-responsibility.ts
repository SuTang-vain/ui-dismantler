import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { parseTypeScriptErasedProgram } from "./sfc-state-responsibility.js";

export type AuthStorageKind = "localStorage" | "sessionStorage";
export interface AuthGuardEvidence {
  kind: "storage-adapter-read" | "storage-adapter-write" | "storage-adapter-remove" | "storage-adapter-config" | "guard-registration" | "guard-authenticated-state" | "guard-navigation" | "login-api-call" | "login-success" | "identity-store-write" | "role-read" | "route-initialization" | "dynamic-route-add";
  file: string;
  line?: number;
  expression: string;
  binding?: string;
  importSource?: string;
  storage?: AuthStorageKind;
  key?: string;
  effectiveKey?: string;
  routeTarget?: string;
  statePath?: string;
  handler?: string;
  confidence: "high" | "medium";
}
export interface AuthStorageAdapterContract {
  binding: string;
  importSource: string;
  storage: AuthStorageKind | null;
  storageResolution: "explicit-argument" | "dependency-default" | "unresolved";
  prefix: string | null;
  keys: Array<{ logicalKey: string; effectiveKey: string | null; reads: number; writes: number; removes: number; files: string[] }>;
  dependencyEvidence: string[];
  requiresReview: boolean;
}
export interface AuthDynamicRouteContract {
  entryFunction: string;
  file: string;
  permissionParameter: string | null;
  apiCalls: string[];
  routeMutation: string;
  menuMutation: string | null;
  callChain: string[];
  complete: boolean;
  requiresReview: boolean;
  evidenceFiles: string[];
}
export interface AuthRouteGuardContract {
  file: string;
  routerBinding: string;
  authenticatedStatePath: string | null;
  loginPath: string | null;
  unauthenticatedRedirect: string | null;
  authenticatedLoginRedirect: string | null;
  freshLoadRouteInitialization: string | null;
  freshLoadResumeTarget: string | null;
  initializationFailureRedirect: string | null;
  dynamicRouteMutation: string | null;
  complete: boolean;
  requiresReview: boolean;
  evidenceFiles: string[];
}
export interface AuthLoginFlowContract {
  file: string;
  handler: string;
  triggerHandlers: string[];
  apiCall: string;
  endpoint: { method: string; path: string; sourceFile: string } | null;
  successCondition: string;
  identityWrite: { call: string; responsePath: string; storageKey: string | null } | null;
  rolePath: string | null;
  routeInitialization: string | null;
  navigationTarget: string | null;
  complete: boolean;
  requiresReview: boolean;
  evidenceFiles: string[];
}
export interface SpaAuthGuardResponsibilityAnalysis {
  evidence: AuthGuardEvidence[];
  storageAdapters: AuthStorageAdapterContract[];
  loginFlows: AuthLoginFlowContract[];
  routeGuards: AuthRouteGuardContract[];
  dynamicRouteInitialization: AuthDynamicRouteContract[];
  metrics: {
    storageRemoves: number;
    storageAdapters: number;
    resolvedStorageAdapters: number;
    guardRegistrations: number;
    completeRouteGuards: number;
    loginFlows: number;
    completeLoginFlows: number;
    dynamicRouteInitializers: number;
    completeDynamicRouteInitializers: number;
  };
}

interface ImportBinding { imported: string; source: string; file: string | null }
interface SourceDocument { absolute: string; file: string; source: string; script: string; analysisSource: string; program: any; imports: Map<string, ImportBinding> }
interface FunctionInfo { name: string; file: string; node: any; source: string; calls: string[]; exported: boolean }

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".vue"]);
function filesUnder(sourceRoot: string): string[] {
  const output: string[] = [], start = join(sourceRoot, "src");
  if (!existsSync(start)) return output;
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git", "coverage"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) output.push(absolute);
    }
  };
  visit(start); return output.sort();
}
function scriptOf(file: string, source: string): string { return file.endsWith(".vue") ? /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(source)?.[1] ?? "" : source; }
function resolveImport(sourceRoot: string, importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const candidate = specifier.startsWith("@/") ? join(sourceRoot, "src", specifier.slice(2)) : resolve(dirname(importer), specifier);
  return [candidate, `${candidate}.ts`, `${candidate}.js`, `${candidate}.vue`, `${candidate}.tsx`, `${candidate}.jsx`, join(candidate, "index.ts"), join(candidate, "index.js"), join(candidate, "index.vue")].find(existsSync) ?? null;
}
function importsOf(sourceRoot: string, absolute: string, program: any): Map<string, ImportBinding> {
  const output = new Map<string, ImportBinding>();
  for (const statement of program.body ?? []) {
    if (statement.type !== "ImportDeclaration" || typeof statement.source?.value !== "string") continue;
    for (const specifier of statement.specifiers ?? []) {
      const local = specifier.local?.name; if (!local) continue;
      const imported = specifier.type === "ImportDefaultSpecifier" ? "default" : specifier.type === "ImportNamespaceSpecifier" ? "*" : specifier.imported?.name ?? specifier.imported?.value ?? local;
      output.set(local, { imported, source: statement.source.value, file: resolveImport(sourceRoot, absolute, statement.source.value) });
    }
  }
  return output;
}
function documents(sourceRoot: string): SourceDocument[] {
  const output: SourceDocument[] = [];
  for (const absolute of filesUnder(sourceRoot)) {
    const file = relative(sourceRoot, absolute).replaceAll("\\", "/"), source = readFileSync(absolute, "utf8"), script = scriptOf(file, source);
    try {
      const parsed = parseTypeScriptErasedProgram(script);
      output.push({ absolute, file, source, script, analysisSource: parsed.source, program: parsed.program, imports: importsOf(sourceRoot, absolute, parsed.program) });
    } catch { /* Parse failures remain visible in the parent analyzer's review-required status. */ }
  }
  return output;
}
function walk(node: any, callback: (node: any, parent?: any) => void, parent?: any): void {
  if (!node || typeof node !== "object") return;
  callback(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["start", "end", "loc"].includes(key)) continue;
    if (Array.isArray(value)) for (const child of value) walk(child, callback, node);
    else if (value && typeof value === "object") walk(value, callback, node);
  }
}
function propertyName(node: any): string | null {
  if (!node) return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.property?.type === "Literal") return String(node.property.value);
  if (node.key?.type === "Identifier") return node.key.name;
  if (node.key?.type === "Literal") return String(node.key.value);
  return null;
}
function memberPath(node: any): string | null {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "CallExpression") { const call = memberPath(node.callee); return call ? `${call}()` : null; }
  if (node.type !== "MemberExpression") return null;
  const object = memberPath(node.object), property = propertyName(node); return object && property ? `${object}.${property}` : null;
}
function callName(node: any): string | null { return node?.type === "CallExpression" ? (node.callee.type === "Identifier" ? node.callee.name : propertyName(node.callee)) : null; }
function sourceSlice(doc: SourceDocument, node: any): string { return doc.analysisSource.slice(node.start ?? 0, node.end ?? 0).replace(/\s+/g, " ").trim(); }
function lineAt(source: string, offset: number): number { return source.slice(0, Math.max(0, offset)).split("\n").length; }
function literal(node: any): string | null { return node?.type === "Literal" && typeof node.value === "string" ? node.value : node?.type === "TemplateLiteral" && node.expressions?.length === 0 ? node.quasis?.[0]?.value?.cooked ?? null : null; }
function unique(values: Array<string | null | undefined>): string[] { return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(); }
function packageName(specifier: string): string { return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]; }

function dependencyDefault(sourceRoot: string, specifier: string): { storage: AuthStorageKind | null; evidence: string[] } {
  const link = join(sourceRoot, "node_modules", packageName(specifier));
  if (!existsSync(link)) return { storage: null, evidence: [`dependency ${packageName(specifier)} is unavailable`] };
  const root = realpathSync(link), candidates: string[] = [];
  const visit = (directory: string, depth: number): void => {
    if (depth > 5 || candidates.length > 400) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.endsWith(".map")) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile() && /storage/i.test(absolute) && /\.(?:js|mjs|cjs|ts)$/.test(entry.name)) candidates.push(absolute);
    }
  };
  visit(root, 0);
  for (const absolute of candidates.sort()) {
    const source = readFileSync(absolute, "utf8");
    if (!/\bgetStorage\b/.test(source) || !/\bsetStorage\b/.test(source)) continue;
    const defaults = [...source.matchAll(/(?:type\s*=|arguments\.length[^;\n]{0,220}:)\s*['"](localStorage|sessionStorage)['"]/g)].map((match) => match[1] as AuthStorageKind);
    const resolved = [...new Set(defaults)];
    if (resolved.length === 1) return { storage: resolved[0], evidence: [`${packageName(specifier)}/${relative(root, absolute).replaceAll("\\", "/")}: wrapper default ${resolved[0]}`] };
  }
  return { storage: null, evidence: [`dependency ${packageName(specifier)} inspected without an unambiguous storage default`] };
}
function storagePrefix(sourceRoot: string, docs: SourceDocument[]): { prefix: string | null; evidence: string[] } {
  const calls = docs.filter((doc) => /\.setStorageConfig\s*\(/.test(doc.script));
  if (!calls.length) return { prefix: null, evidence: [] };
  const publicRoot = join(sourceRoot, "public");
  if (!existsSync(publicRoot)) return { prefix: null, evidence: ["setStorageConfig exists but public configuration root is absent"] };
  for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== ".json") continue;
    const absolute = join(publicRoot, entry.name);
    try {
      const value = JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
      if (typeof value.title === "string" && value.StorageConfig && calls.some((doc) => /prefix\s*:\s*[A-Za-z_$][\w$]*\.title/.test(doc.script) && /\.StorageConfig/.test(doc.script))) return { prefix: value.title, evidence: [`${relative(sourceRoot, absolute).replaceAll("\\", "/")}: title and StorageConfig match the wrapper configuration flow`] };
    } catch {}
  }
  return { prefix: null, evidence: ["storage prefix flow exists but its value was not statically resolved"] };
}

function functionsOf(docs: SourceDocument[]): Map<string, FunctionInfo[]> {
  const output = new Map<string, FunctionInfo[]>();
  const add = (info: FunctionInfo): void => { output.set(info.name, [...(output.get(info.name) ?? []), info]); };
  for (const doc of docs) {
    walk(doc.program, (node, parent) => {
      let name: string | null = null, fn: any = null, exported = false;
      if (node.type === "FunctionDeclaration" && node.id?.name) { name = node.id.name; fn = node; exported = parent?.type === "ExportNamedDeclaration"; }
      else if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && ["ArrowFunctionExpression", "FunctionExpression"].includes(node.init?.type)) { name = node.id.name; fn = node.init; exported = parent?.type === "VariableDeclaration" && Boolean((parent as any).__exported); }
      else if (node.type === "Property" && ["FunctionExpression", "ArrowFunctionExpression"].includes(node.value?.type)) { name = propertyName(node); fn = node.value; }
      if (!name || !fn) return;
      const calls: string[] = []; walk(fn.body, (child) => { const call = callName(child); if (call) calls.push(call); });
      const statementText = sourceSlice(doc, node);
      exported ||= new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(doc.analysisSource.slice(Math.max(0, (node.start ?? 0) - 20), (node.end ?? 0) + 5));
      add({ name, file: doc.file, node: fn, source: statementText, calls: unique(calls), exported });
    });
  }
  return output;
}
function reaches(functions: Map<string, FunctionInfo[]>, start: string, target: (call: string) => boolean, stack = new Set<string>()): string[] | null {
  if (stack.has(start)) return null;
  const next = new Set(stack).add(start);
  for (const info of functions.get(start) ?? []) for (const call of info.calls) {
    if (target(call)) return [start, call];
    const nested = reaches(functions, call, target, next); if (nested) return [start, ...nested];
  }
  return null;
}
function targetOf(node: any, doc: SourceDocument): string | null {
  const argument = node.arguments?.[0], direct = literal(argument); if (direct) return direct;
  if (argument?.type === "ObjectExpression") {
    const path = argument.properties?.find((property: any) => propertyName(property) === "path");
    return path ? literal(path.value) ?? sourceSlice(doc, path.value) : null;
  }
  return argument ? sourceSlice(doc, argument) : null;
}
function endpointFor(docs: SourceDocument[], caller: SourceDocument, localName: string): { method: string; path: string; sourceFile: string } | null {
  const imported = caller.imports.get(localName); if (!imported?.file) return null;
  const target = docs.find((doc) => doc.absolute === imported.file); if (!target) return null;
  const escaped = imported.imported.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:export\\s+)?(?:const|function)\\s+${escaped}\\b[\\s\\S]{0,1400}?\\.\\s*(get|post|put|delete|patch)\\s*(?:<[^;()]*>)?\\s*\\([\\s\\S]{0,500}?url\\s*:\\s*['\"]([^'\"]+)['\"]`, "i").exec(target.script);
  return match ? { method: match[1].toUpperCase(), path: match[2], sourceFile: target.file } : null;
}

export function analyzeSpaAuthGuardResponsibilities(sourceRoot: string): SpaAuthGuardResponsibilityAnalysis {
  const root = resolve(sourceRoot), docs = documents(root), functions = functionsOf(docs), evidence: AuthGuardEvidence[] = [];
  const callsByAdapter = new Map<string, { binding: string; importSource: string; calls: AuthGuardEvidence[]; explicit: AuthStorageKind[] }>();
  for (const doc of docs) walk(doc.program, (node) => {
    if (node.type !== "CallExpression" || node.callee?.type !== "MemberExpression" || node.callee.object?.type !== "Identifier") return;
    const method = propertyName(node.callee), binding = node.callee.object.name, imported = doc.imports.get(binding);
    if (!method || !imported || !["getStorage", "setStorage", "removeStorage", "setStorageConfig"].includes(method)) return;
    if (method === "setStorageConfig") { evidence.push({ kind: "storage-adapter-config", file: doc.file, line: lineAt(doc.analysisSource, node.start), expression: sourceSlice(doc, node), binding, importSource: imported.source, confidence: "high" }); return; }
    const key = literal(node.arguments?.[0]); if (!key) return;
    const explicitValue = literal(node.arguments?.[method === "setStorage" ? 3 : 1]);
    const storage = explicitValue === "localStorage" || explicitValue === "sessionStorage" ? explicitValue : undefined;
    const item: AuthGuardEvidence = { kind: method === "getStorage" ? "storage-adapter-read" : method === "setStorage" ? "storage-adapter-write" : "storage-adapter-remove", file: doc.file, line: lineAt(doc.analysisSource, node.start), expression: sourceSlice(doc, node), binding, importSource: imported.source, storage, key, confidence: storage ? "high" : "medium" };
    evidence.push(item);
    const adapterKey = `${binding}\u0000${imported.source}`, current = callsByAdapter.get(adapterKey) ?? { binding, importSource: imported.source, calls: [] as AuthGuardEvidence[], explicit: [] as AuthStorageKind[] };
    current.calls.push(item); if (storage) current.explicit.push(storage); callsByAdapter.set(adapterKey, current);
  });
  const prefix = storagePrefix(root, docs);
  const storageAdapters = [...callsByAdapter.values()].map((adapter): AuthStorageAdapterContract => {
    const explicit = [...new Set(adapter.explicit)], dependency = explicit.length === 1 ? { storage: explicit[0], evidence: ["all calls use one explicit storage argument"] } : dependencyDefault(root, adapter.importSource);
    const storage = explicit.length === 1 ? explicit[0] : dependency.storage;
    for (const item of adapter.calls) { if (storage) item.storage = storage; if (item.key && prefix.prefix) item.effectiveKey = `${prefix.prefix}_${item.key}`; }
    const keys = unique(adapter.calls.map((item) => item.key)).map((logicalKey) => ({ logicalKey, effectiveKey: prefix.prefix ? `${prefix.prefix}_${logicalKey}` : null, reads: adapter.calls.filter((item) => item.key === logicalKey && item.kind === "storage-adapter-read").length, writes: adapter.calls.filter((item) => item.key === logicalKey && item.kind === "storage-adapter-write").length, removes: adapter.calls.filter((item) => item.key === logicalKey && item.kind === "storage-adapter-remove").length, files: unique(adapter.calls.filter((item) => item.key === logicalKey).map((item) => item.file)) }));
    return { binding: adapter.binding, importSource: adapter.importSource, storage, storageResolution: explicit.length === 1 ? "explicit-argument" : storage ? "dependency-default" : "unresolved", prefix: prefix.prefix, keys, dependencyEvidence: [...dependency.evidence, ...prefix.evidence], requiresReview: !storage || !prefix.prefix };
  });

  const dynamicRouteInitialization: AuthDynamicRouteContract[] = [];
  for (const [name, infos] of functions) for (const info of infos.filter((item) => item.exported)) {
    const chain = reaches(functions, name, (call) => call === "addRoute" || call === "addRoutes"); if (!chain) continue;
    const parameter = info.node.params?.[0]?.name ?? memberPath(info.node.params?.[0]);
    const apiCalls = unique(info.calls.filter((call) => /^(?:get|fetch|load|request)/i.test(call) || Boolean(reaches(functions, call, (nested) => /^(?:get|fetch|load|request)/i.test(nested)))));
    const menuMutation = info.calls.find((call) => /^(?:set|update).*(?:menu|route)/i.test(call)) ?? null;
    const evidenceFiles = unique([info.file, ...(functions.get(chain.at(-2) ?? "") ?? []).map((item) => item.file)]);
    const contract: AuthDynamicRouteContract = { entryFunction: name, file: info.file, permissionParameter: parameter ?? null, apiCalls, routeMutation: chain.at(-1) ?? "addRoute", menuMutation, callChain: chain, complete: Boolean(parameter && chain.length >= 2), requiresReview: true, evidenceFiles };
    dynamicRouteInitialization.push(contract);
    evidence.push({ kind: "route-initialization", file: info.file, line: lineAt(info.source, 0), expression: info.source, handler: name, confidence: contract.complete ? "high" : "medium" });
    evidence.push({ kind: "dynamic-route-add", file: evidenceFiles.at(-1) ?? info.file, expression: chain.join(" → "), handler: name, confidence: "high" });
  }

  const routeGuards: AuthRouteGuardContract[] = [];
  for (const doc of docs) walk(doc.program, (node) => {
    if (node.type !== "CallExpression" || propertyName(node.callee) !== "beforeEach") return;
    const callback = node.arguments?.find((argument: any) => ["ArrowFunctionExpression", "FunctionExpression"].includes(argument.type)); if (!callback) return;
    const text = sourceSlice(doc, callback), routerBinding = memberPath(node.callee.object) ?? "router", navigation: Array<{ method: string; target: string }> = [];
    walk(callback.body, (child) => { if (child.type === "CallExpression" && ["next", "push", "replace"].includes(callName(child) ?? "")) { const target = targetOf(child, doc); if (target) navigation.push({ method: callName(child)!, target }); } });
    const comparisons = [...text.matchAll(/(?:to|from)\s*\.\s*path\s*(?:={2,3}|!={1,2})\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    const loginPath = comparisons.find((path) => navigation.some((item) => item.target === path)) ?? comparisons[0] ?? null;
    const importedCalls: string[] = []; walk(callback.body, (child) => { if (child.type === "CallExpression" && child.callee?.type === "Identifier" && doc.imports.has(child.callee.name)) importedCalls.push(child.callee.name); });
    const initializerLocal = unique(importedCalls).find((call) => dynamicRouteInitialization.some((item) => item.entryFunction === (doc.imports.get(call)?.imported ?? call))) ?? null;
    const initializer = initializerLocal ? doc.imports.get(initializerLocal)?.imported ?? initializerLocal : null;
    const authCandidates: Array<{ test: string; score: number }> = [];
    walk(callback.body, (child) => {
      if (child.type !== "IfStatement") return;
      const branch = sourceSlice(doc, child), test = sourceSlice(doc, child.test);
      let score = 0;
      if (loginPath && branch.includes(loginPath)) score += 3;
      if (initializerLocal && branch.includes(initializerLocal)) score += 5;
      if (child.alternate) score += 1;
      if (/(?:to|from)\s*\.\s*path/.test(test)) score -= 4;
      authCandidates.push({ test, score });
    });
    const authenticatedStatePath = authCandidates.sort((left, right) => right.score - left.score)[0]?.test ?? null;
    const dynamic = initializer ? dynamicRouteInitialization.find((item) => item.entryFunction === initializer) : undefined;
    const contract: AuthRouteGuardContract = {
      file: doc.file, routerBinding, authenticatedStatePath, loginPath,
      unauthenticatedRedirect: loginPath && navigation.some((item) => item.target === loginPath) ? loginPath : null,
      authenticatedLoginRedirect: navigation.find((item) => /from\s*\.\s*path/.test(item.target))?.target ?? null,
      freshLoadRouteInitialization: initializer,
      freshLoadResumeTarget: navigation.find((item) => /to\s*\.\s*path/.test(item.target))?.target ?? null,
      initializationFailureRedirect: navigation.filter((item) => item.target === loginPath).at(-1)?.target ?? null,
      dynamicRouteMutation: dynamic?.routeMutation ?? null,
      complete: Boolean(authenticatedStatePath && loginPath && initializer && dynamic?.complete && navigation.some((item) => /to\s*\.\s*path/.test(item.target))), requiresReview: true,
      evidenceFiles: unique([doc.file, ...(dynamic?.evidenceFiles ?? [])]),
    };
    routeGuards.push(contract);
    evidence.push({ kind: "guard-registration", file: doc.file, line: lineAt(doc.analysisSource, node.start), expression: sourceSlice(doc, node.callee), handler: "beforeEach", confidence: "high" });
    if (authenticatedStatePath) evidence.push({ kind: "guard-authenticated-state", file: doc.file, expression: authenticatedStatePath, statePath: authenticatedStatePath, confidence: "high" });
    for (const item of navigation) evidence.push({ kind: "guard-navigation", file: doc.file, expression: `${item.method}(${item.target})`, routeTarget: item.target, confidence: "high" });
  });

  const loginFlows: AuthLoginFlowContract[] = [];
  for (const doc of docs) for (const infos of functions.values()) for (const info of infos.filter((item) => item.file === doc.file)) {
    let responseBinding: string | null = null, apiCall: string | null = null, successCondition = "", identity: { call: string; responsePath: string } | null = null, rolePath: string | null = null, routeInitializer: string | null = null, navigationTarget: string | null = null;
    walk(info.node.body, (node) => {
      if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.init?.type === "AwaitExpression" && node.init.argument?.type === "CallExpression" && node.init.argument.callee?.type === "Identifier") { responseBinding = node.id.name; apiCall = node.init.argument.callee.name; }
    });
    if (!responseBinding || !apiCall) continue;
    walk(info.node.body, (node) => {
      if (node.type === "IfStatement" && sourceSlice(doc, node.test).includes(responseBinding!)) successCondition ||= sourceSlice(doc, node.test);
      if (node.type !== "CallExpression") return;
      const name = callName(node), path = memberPath(node.callee), first = sourceSlice(doc, node.arguments?.[0] ?? {});
      if (path && first.startsWith(`${responseBinding}.data`) && name && !["push", "replace"].includes(name)) identity ??= { call: path, responsePath: first };
      if (name && dynamicRouteInitialization.some((item) => item.entryFunction === (doc.imports.get(name)?.imported ?? name))) { routeInitializer = doc.imports.get(name)?.imported ?? name; rolePath = first || null; }
      if (["push", "replace"].includes(name ?? "")) navigationTarget ??= targetOf(node, doc);
    });
    if (!successCondition || !identity || !routeInitializer) continue;
    const resolvedApiCall = apiCall as string, resolvedIdentity = identity as { call: string; responsePath: string }, resolvedInitializer = routeInitializer as string;
    const endpoint = endpointFor(docs, doc, resolvedApiCall), identityMethod = resolvedIdentity.call.split(".").at(-1) ?? "";
    const identityOwnerBinding = resolvedIdentity.call.split(".")[0]?.replace(/\(\)$/, "") ?? "";
    const identityOwnerFile = doc.imports.get(identityOwnerBinding)?.file;
    const storage = evidence.find((item) => item.kind === "storage-adapter-write" && ((functions.get(identityMethod) ?? []).some((candidate) => candidate.file === item.file) || Boolean(identityOwnerFile && docs.find((candidate) => candidate.file === item.file)?.absolute === identityOwnerFile)));
    const triggers = unique([info.name, ...[...functions.entries()].filter(([, values]) => values.some((candidate) => candidate.file === info.file && candidate.calls.includes(info.name))).map(([name]) => name)]);
    const dynamic = dynamicRouteInitialization.find((item) => item.entryFunction === resolvedInitializer);
    const contract: AuthLoginFlowContract = { file: info.file, handler: info.name, triggerHandlers: triggers, apiCall: resolvedApiCall, endpoint, successCondition, identityWrite: { ...resolvedIdentity, storageKey: storage?.key ?? null }, rolePath, routeInitialization: resolvedInitializer, navigationTarget, complete: Boolean(endpoint && storage?.key && rolePath && navigationTarget && dynamic?.complete), requiresReview: true, evidenceFiles: unique([info.file, endpoint?.sourceFile, storage?.file, ...(dynamic?.evidenceFiles ?? [])]) };
    loginFlows.push(contract);
    evidence.push({ kind: "login-api-call", file: info.file, expression: `${resolvedApiCall}(...)`, handler: info.name, confidence: endpoint ? "high" : "medium" });
    evidence.push({ kind: "login-success", file: info.file, expression: successCondition, handler: info.name, confidence: "high" });
    evidence.push({ kind: "identity-store-write", file: info.file, expression: `${resolvedIdentity.call}(${resolvedIdentity.responsePath})`, handler: info.name, key: storage?.key, confidence: storage ? "high" : "medium" });
    if (rolePath) evidence.push({ kind: "role-read", file: info.file, expression: rolePath, statePath: rolePath, handler: info.name, confidence: "high" });
  }

  return {
    evidence, storageAdapters, loginFlows, routeGuards, dynamicRouteInitialization,
    metrics: {
      storageRemoves: evidence.filter((item) => item.kind === "storage-adapter-remove").length,
      storageAdapters: storageAdapters.length, resolvedStorageAdapters: storageAdapters.filter((item) => item.storage).length,
      guardRegistrations: routeGuards.length, completeRouteGuards: routeGuards.filter((item) => item.complete).length,
      loginFlows: loginFlows.length, completeLoginFlows: loginFlows.filter((item) => item.complete).length,
      dynamicRouteInitializers: dynamicRouteInitialization.length, completeDynamicRouteInitializers: dynamicRouteInitialization.filter((item) => item.complete).length,
    },
  };
}
