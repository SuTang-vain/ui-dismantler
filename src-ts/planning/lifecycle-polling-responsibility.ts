import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SfcVisualResponsibilityGraph } from "./sfc-visual-responsibility.js";
import { parseJavaScriptOrTypeScriptErased } from "../core/ast/typescript-erasure.js";

export type LifecycleHookName = "mounted" | "before-unmount" | "unmounted" | "before-destroy" | "destroyed";
export type LifecycleTimerKind = "interval" | "timeout" | "vueuse-interval";

export interface LifecycleHookResponsibility {
  readonly hook: LifecycleHookName;
  readonly style: "composition" | "options";
  readonly callback: string;
  readonly sourceLine: number;
  readonly reachableFunctions: readonly string[];
}

export interface LifecycleCleanupResponsibility {
  readonly operation: "clear-interval" | "clear-timeout" | "pause" | "stop" | "dispose";
  readonly target: string;
  readonly hook?: LifecycleHookName;
  readonly sourceLine: number;
}

export interface LifecycleTimerResponsibility {
  readonly id: string;
  readonly kind: LifecycleTimerKind;
  readonly handle?: string;
  readonly controls: readonly string[];
  readonly callback: string;
  readonly callbackCalls: readonly string[];
  readonly intervalMs: number | null;
  readonly startHooks: readonly LifecycleHookName[];
  readonly cleanupHooks: readonly LifecycleHookName[];
  readonly cleanupOperations: readonly LifecycleCleanupResponsibility[];
  readonly terminalStopProven: boolean;
  readonly sourceLine: number;
  readonly confidence: "high" | "medium";
  readonly reviewReasons: readonly string[];
}

export interface ComponentLifecyclePollingResponsibility {
  readonly componentId: string;
  readonly componentName: string;
  readonly componentFile: string;
  readonly parsed: boolean;
  readonly parseMode: "javascript" | "typescript-erasure" | "failed";
  readonly hooks: readonly LifecycleHookResponsibility[];
  readonly timers: readonly LifecycleTimerResponsibility[];
  readonly unresolved: readonly string[];
  readonly reviewReasons: readonly string[];
  readonly reviewRequired: boolean;
  readonly parseError?: string;
}

export interface LifecyclePollingResponsibilityGraph {
  readonly schemaVersion: "1.0";
  readonly kind: "lifecycle-polling-responsibility-graph";
  readonly sourceRoot: string;
  readonly components: readonly ComponentLifecyclePollingResponsibility[];
  readonly unresolved: readonly { readonly componentId: string; readonly componentFile: string; readonly timerId?: string; readonly reason: string }[];
  readonly reviewReasons: readonly { readonly componentId: string; readonly componentFile: string; readonly reason: string }[];
  readonly metrics: {
    readonly components: number;
    readonly parsedComponents: number;
    readonly lifecycleComponents: number;
    readonly hooks: number;
    readonly timers: number;
    readonly intervals: number;
    readonly timeouts: number;
    readonly timersWithLifecycleCleanup: number;
    readonly timersWithTerminalStop: number;
    readonly unresolved: number;
    readonly reviewReasons: number;
  };
  readonly reviewRequired: boolean;
}

interface HookCandidate {
  hook: LifecycleHookName;
  style: "composition" | "options";
  callback: string;
  node: any;
  sourceLine: number;
}

interface TimerCandidate {
  start: number;
  kind: LifecycleTimerKind;
  handle?: string;
  controls: string[];
  callback: string;
  callbackNode?: any;
  intervalMs: number | null;
  sourceLine: number;
  startHooks: Set<LifecycleHookName>;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

function sourceSlice(source: string, node: any): string {
  if (typeof node?.start !== "number" || typeof node?.end !== "number") return node?.type ?? "unknown";
  return source.slice(node.start, node.end).replace(/\s+/g, " ").trim().slice(0, 240);
}

function propertyName(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && ["string", "number"].includes(typeof node.value)) return String(node.value);
  if (node.key) return propertyName(node.key);
  return undefined;
}

function memberPath(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type !== "MemberExpression") return undefined;
  const object = memberPath(node.object);
  const property = node.computed ? propertyName(node.property) : propertyName(node.property);
  return object && property ? `${object}.${property}` : undefined;
}

function normalizeTarget(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.split(".").filter((part) => part && part !== "this" && part !== "value").join(".");
  return normalized || undefined;
}

function calleePath(node: any): string | undefined {
  return memberPath(node?.callee ?? node);
}

function calleeBase(node: any): string | undefined {
  return calleePath(node)?.split(".").pop();
}

function functionLabel(node: any, source: string): string {
  if (node?.type === "Identifier") return node.name;
  const path = memberPath(node);
  if (path) return path;
  return `<inline@${lineAt(source, node?.start ?? 0)}>`;
}

function staticNumber(node: any, bindings: ReadonlyMap<string, number>): number | null {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "number" && Number.isFinite(node.value)) return node.value;
  if (node.type === "UnaryExpression" && ["+", "-"].includes(node.operator)) {
    const value = staticNumber(node.argument, bindings);
    return value === null ? null : node.operator === "-" ? -value : value;
  }
  if (node.type === "Identifier") return bindings.get(node.name) ?? null;
  return null;
}

function extractScript(source: string): string {
  const blocks = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  return blocks.length ? blocks.join("\n") : source;
}

function isFunctionNode(node: any): boolean {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node?.type);
}

function walkOwned(node: any, rootFunction: any, visit: (node: any, parent: any) => void, parent?: any): void {
  if (!node || typeof node !== "object") return;
  if (isFunctionNode(node) && node !== rootFunction) return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["start", "end", "loc", "range"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child === "object" && typeof (child as any).type === "string") walkOwned(child, rootFunction, visit, node);
    } else if (value && typeof value === "object" && typeof (value as any).type === "string") {
      walkOwned(value, rootFunction, visit, node);
    }
  }
}

function walkAll(node: any, visit: (node: any, parent: any) => void, parent?: any): void {
  if (!node || typeof node !== "object") return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["start", "end", "loc", "range"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child === "object" && typeof (child as any).type === "string") walkAll(child, visit, node);
    } else if (value && typeof value === "object" && typeof (value as any).type === "string") {
      walkAll(value, visit, node);
    }
  }
}

function functionBody(node: any): any {
  return isFunctionNode(node) ? node.body : node;
}

function collectFunctions(program: any): { byName: Map<string, any>; nodes: Set<any> } {
  const byName = new Map<string, any>();
  const nodes = new Set<any>();
  const ambiguous = new Set<string>();
  const register = (name: string | undefined, node: any): void => {
    if (!name || !isFunctionNode(node)) return;
    nodes.add(node);
    const existing = byName.get(name);
    if (existing && existing !== node) { ambiguous.add(name); return; }
    if (!ambiguous.has(name)) byName.set(name, node);
  };
  walkAll(program, (node) => {
    if (node.type === "FunctionDeclaration") register(node.id?.name, node);
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") register(node.id.name, node.init);
    if (node.type === "ExportDefaultDeclaration" && node.declaration?.type === "ObjectExpression") {
      for (const property of node.declaration.properties ?? []) {
        const name = propertyName(property);
        const value = property.value ?? property;
        register(name, value);
        if (name === "methods" && value?.type === "ObjectExpression") {
          for (const method of value.properties ?? []) register(propertyName(method), method.value ?? method);
        }
      }
    }
  });
  for (const name of ambiguous) byName.delete(name);
  return { byName, nodes };
}

function collectStaticNumbers(program: any): Map<string, number> {
  const bindings = new Map<string, number>();
  walkOwned(program, program, (node) => {
    if (node.type !== "VariableDeclarator" || node.id?.type !== "Identifier") return;
    const value = staticNumber(node.init, bindings);
    if (value !== null) bindings.set(node.id.name, value);
  });
  return bindings;
}

const COMPOSITION_HOOKS: Record<string, LifecycleHookName> = {
  onMounted: "mounted",
  onBeforeUnmount: "before-unmount",
  onUnmounted: "unmounted",
  onBeforeDestroy: "before-destroy",
  onDestroyed: "destroyed",
};

const OPTIONS_HOOKS: Record<string, LifecycleHookName> = {
  mounted: "mounted",
  beforeUnmount: "before-unmount",
  unmounted: "unmounted",
  beforeDestroy: "before-destroy",
  destroyed: "destroyed",
};

function resolveCallback(node: any, functions: ReadonlyMap<string, any>): any | undefined {
  if (isFunctionNode(node)) return node;
  const name = memberPath(node)?.split(".").pop();
  return name ? functions.get(name) : undefined;
}

function collectHooks(program: any, source: string, functions: ReadonlyMap<string, any>): { hooks: HookCandidate[]; unresolved: string[] } {
  const hooks: HookCandidate[] = [];
  const unresolved: string[] = [];
  walkOwned(program, program, (node) => {
    if (node.type === "CallExpression") {
      const hook = COMPOSITION_HOOKS[calleeBase(node) ?? ""];
      const argument = node.arguments?.[0];
      const callbackNode = hook ? resolveCallback(argument, functions) : undefined;
      if (hook && callbackNode) hooks.push({ hook, style: "composition", callback: functionLabel(argument, source), node: callbackNode, sourceLine: lineAt(source, node.start ?? 0) });
      else if (hook) unresolved.push(`${hook} hook callback ownership is unresolved at line ${lineAt(source, node.start ?? 0)}`);
    }
    if (node.type === "ExportDefaultDeclaration" && node.declaration?.type === "ObjectExpression") {
      for (const property of node.declaration.properties ?? []) {
        const name = propertyName(property);
        const hook = name ? OPTIONS_HOOKS[name] : undefined;
        const callbackNode = property.value ?? property;
        if (hook && isFunctionNode(callbackNode)) hooks.push({ hook, style: "options", callback: name!, node: callbackNode, sourceLine: lineAt(source, property.start ?? 0) });
      }
    }
  });
  return { hooks: hooks.sort((left, right) => left.sourceLine - right.sourceLine || left.hook.localeCompare(right.hook)), unresolved };
}

function timerKind(call: any): LifecycleTimerKind | undefined {
  const base = calleeBase(call);
  if (base === "setInterval") return "interval";
  if (base === "setTimeout") return "timeout";
  if (base === "useIntervalFn") return "vueuse-interval";
  return undefined;
}

function bindingNames(node: any): string[] {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "MemberExpression") return [normalizeTarget(memberPath(node)) ?? ""].filter(Boolean);
  if (node.type === "ObjectPattern") return (node.properties ?? []).flatMap((property: any) => bindingNames(property.value ?? property.argument));
  if (node.type === "ArrayPattern") return (node.elements ?? []).flatMap((element: any) => bindingNames(element));
  return [];
}

function timerBinding(parent: any): { handle?: string; controls: string[] } {
  if (parent?.type === "VariableDeclarator") {
    const names = bindingNames(parent.id);
    return parent.id?.type === "ObjectPattern" ? { controls: names } : { handle: names[0], controls: [] };
  }
  if (parent?.type === "AssignmentExpression") return { handle: normalizeTarget(memberPath(parent.left)), controls: [] };
  return { controls: [] };
}

function walkReachable(root: any, functions: ReadonlyMap<string, any>, visit: (node: any, parent: any) => void): string[] {
  const reached = new Set<string>();
  const visitedNodes = new Set<number>();
  const inspect = (node: any): void => {
    const start = typeof node?.start === "number" ? node.start : -1;
    if (visitedNodes.has(start)) return;
    visitedNodes.add(start);
    walkOwned(functionBody(node), node, (candidate, parent) => {
      visit(candidate, parent);
      if (candidate.type !== "CallExpression") return;
      const name = calleeBase(candidate);
      const target = name ? functions.get(name) : undefined;
      if (name && target && target !== node) {
        reached.add(name);
        inspect(target);
      }
    });
  };
  inspect(root);
  return [...reached].sort();
}

function cleanupFromCall(call: any, hook: LifecycleHookName | undefined, source: string): LifecycleCleanupResponsibility | undefined {
  const base = calleeBase(call);
  if (base === "clearInterval" || base === "clearTimeout") {
    const target = normalizeTarget(memberPath(call.arguments?.[0]));
    if (!target) return undefined;
    return { operation: base === "clearInterval" ? "clear-interval" : "clear-timeout", target, ...(hook ? { hook } : {}), sourceLine: lineAt(source, call.start ?? 0) };
  }
  if (!["pause", "stop", "dispose"].includes(base ?? "")) return undefined;
  const path = calleePath(call);
  const target = normalizeTarget(call.callee?.type === "Identifier" ? path : memberPath(call.callee?.object));
  if (!target) return undefined;
  return { operation: base as "pause" | "stop" | "dispose", target, ...(hook ? { hook } : {}), sourceLine: lineAt(source, call.start ?? 0) };
}

function callbackCalls(callbackNode: any, functions: ReadonlyMap<string, any>): string[] {
  if (!callbackNode) return [];
  const calls: string[] = [];
  walkReachable(callbackNode, functions, (node) => {
    if (node.type !== "CallExpression") return;
    const path = calleePath(node);
    const base = calleeBase(node);
    if (!path || ["setInterval", "setTimeout", "useIntervalFn", "clearInterval", "clearTimeout", "pause", "stop", "dispose"].includes(base ?? "")) return;
    calls.push(path.replace(/^this\./, ""));
  });
  return unique(calls);
}

function analyzeScript(component: SfcVisualResponsibilityGraph["components"][number], source: string): ComponentLifecyclePollingResponsibility {
  try {
    const parsed = parseJavaScriptOrTypeScriptErased(source);
    const program = parsed.program;
    const analysisSource = parsed.source;
    const functionIndex = collectFunctions(program);
    const functions = functionIndex.byName;
    const numbers = collectStaticNumbers(program);
    const hookAnalysis = collectHooks(program, analysisSource, functions);
    const hooks = hookAnalysis.hooks;
    const timers = new Map<number, TimerCandidate>();
    const registerTimer = (node: any, parent: any, hook?: LifecycleHookName): void => {
      if (node.type !== "CallExpression") return;
      const kind = timerKind(node);
      if (!kind) return;
      const existing = timers.get(node.start ?? -1);
      if (existing) { if (hook) existing.startHooks.add(hook); return; }
      const binding = timerBinding(parent);
      const callbackArg = node.arguments?.[0];
      const callbackNode = resolveCallback(callbackArg, functions);
      timers.set(node.start ?? -1, {
        start: node.start ?? -1,
        kind,
        handle: binding.handle,
        controls: binding.controls,
        callback: functionLabel(callbackArg, analysisSource),
        callbackNode,
        intervalMs: staticNumber(node.arguments?.[1], numbers),
        sourceLine: lineAt(analysisSource, node.start ?? 0),
        startHooks: new Set(hook ? [hook] : []),
      });
    };

    walkOwned(program, program, (node, parent) => registerTimer(node, parent));
    for (const functionNode of functionIndex.nodes) walkOwned(functionBody(functionNode), functionNode, (node, parent) => registerTimer(node, parent));
    const hookResponsibilities = hooks.map((hook): LifecycleHookResponsibility => ({
      hook: hook.hook,
      style: hook.style,
      callback: hook.callback,
      sourceLine: hook.sourceLine,
      reachableFunctions: walkReachable(hook.node, functions, (node, parent) => registerTimer(node, parent, hook.hook)),
    }));

    const lifecycleCleanups: LifecycleCleanupResponsibility[] = [];
    for (const hook of hooks.filter((item) => ["before-unmount", "unmounted", "before-destroy", "destroyed"].includes(item.hook))) {
      walkReachable(hook.node, functions, (node) => {
        if (node.type !== "CallExpression") return;
        const cleanup = cleanupFromCall(node, hook.hook, analysisSource);
        if (cleanup) lifecycleCleanups.push(cleanup);
      });
    }

    const timerResponsibilities = [...timers.values()].sort((left, right) => left.start - right.start).map((timer): LifecycleTimerResponsibility => {
      const targets = unique([timer.handle ?? "", ...timer.controls].map((item) => normalizeTarget(item) ?? ""));
      const cleanupOperations = lifecycleCleanups.filter((cleanup) => targets.includes(cleanup.target));
      const terminalOperations: LifecycleCleanupResponsibility[] = [];
      if (timer.callbackNode) {
        walkReachable(timer.callbackNode, functions, (node) => {
          if (node.type !== "CallExpression") return;
          const cleanup = cleanupFromCall(node, undefined, analysisSource);
          if (cleanup && targets.includes(cleanup.target)) terminalOperations.push(cleanup);
        });
      }
      const reviewReasons: string[] = [];
      if (!timer.callbackNode) reviewReasons.push("timer callback ownership is unresolved");
      if (timer.intervalMs === null) reviewReasons.push("timer interval requires reviewed static evidence");
      if (timer.intervalMs !== null && timer.intervalMs < 0) reviewReasons.push("timer interval must not be negative");
      if (timer.startHooks.size === 0) reviewReasons.push("timer creation is not owned by a reviewed lifecycle hook");
      if (["interval", "vueuse-interval"].includes(timer.kind) && cleanupOperations.length === 0) reviewReasons.push("polling timer has no lifecycle cleanup responsibility");
      if (targets.length === 0 && ["interval", "vueuse-interval"].includes(timer.kind)) reviewReasons.push("polling timer handle/control ownership is unresolved");
      return {
        id: `timer:${component.id}:${timer.kind}:${timer.sourceLine}`,
        kind: timer.kind,
        ...(timer.handle ? { handle: timer.handle } : {}),
        controls: unique(timer.controls),
        callback: timer.callback,
        callbackCalls: callbackCalls(timer.callbackNode, functions),
        intervalMs: timer.intervalMs,
        startHooks: [...timer.startHooks].sort(),
        cleanupHooks: unique(cleanupOperations.flatMap((cleanup) => cleanup.hook ? [cleanup.hook] : [])) as LifecycleHookName[],
        cleanupOperations,
        terminalStopProven: terminalOperations.length > 0,
        sourceLine: timer.sourceLine,
        confidence: reviewReasons.length === 0 && parsed.mode === "javascript" ? "high" : "medium",
        reviewReasons,
      };
    });
    const unresolved = [
      ...hookAnalysis.unresolved,
      ...timerResponsibilities.flatMap((timer) => timer.reviewReasons.map((reason) => `${timer.id}: ${reason}`)),
    ];
    const reviewReasons = parsed.mode === "typescript-erasure"
      ? ["TypeScript syntax was erased with line-preserving structural rules before lifecycle responsibility analysis"]
      : [];
    return {
      componentId: component.id,
      componentName: component.componentName,
      componentFile: component.file,
      parsed: true,
      parseMode: parsed.mode,
      hooks: hookResponsibilities,
      timers: timerResponsibilities,
      unresolved,
      reviewReasons,
      reviewRequired: unresolved.length > 0 || reviewReasons.length > 0,
    };
  } catch (error) {
    return {
      componentId: component.id,
      componentName: component.componentName,
      componentFile: component.file,
      parsed: false,
      parseMode: "failed",
      hooks: [],
      timers: [],
      unresolved: ["script parse failure blocks lifecycle responsibility"],
      reviewReasons: [],
      reviewRequired: true,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function analyzeLifecyclePollingResponsibilities(graph: SfcVisualResponsibilityGraph): LifecyclePollingResponsibilityGraph {
  const components = graph.components.map((component): ComponentLifecyclePollingResponsibility => {
    const file = resolve(graph.sourceRoot, component.file);
    if (!existsSync(file)) {
      return { componentId: component.id, componentName: component.componentName, componentFile: component.file, parsed: false, parseMode: "failed", hooks: [], timers: [], unresolved: ["component source file is unavailable"], reviewReasons: [], reviewRequired: true };
    }
    return analyzeScript(component, extractScript(readFileSync(file, "utf8")));
  });
  const unresolved = components.flatMap((component) => component.unresolved.map((reason) => {
    const delimiter = reason.indexOf(": ");
    const timerId = reason.startsWith("timer:") && delimiter > 0 ? reason.slice(0, delimiter) : undefined;
    return { componentId: component.componentId, componentFile: component.componentFile, ...(timerId ? { timerId } : {}), reason };
  }));
  const reviewReasons = components.flatMap((component) => component.reviewReasons.map((reason) => ({ componentId: component.componentId, componentFile: component.componentFile, reason })));
  const timers = components.flatMap((component) => component.timers);
  return {
    schemaVersion: "1.0",
    kind: "lifecycle-polling-responsibility-graph",
    sourceRoot: graph.sourceRoot,
    components,
    unresolved,
    reviewReasons,
    metrics: {
      components: components.length,
      parsedComponents: components.filter((component) => component.parsed).length,
      lifecycleComponents: components.filter((component) => component.hooks.length > 0 || component.timers.length > 0).length,
      hooks: components.reduce((sum, component) => sum + component.hooks.length, 0),
      timers: timers.length,
      intervals: timers.filter((timer) => timer.kind === "interval" || timer.kind === "vueuse-interval").length,
      timeouts: timers.filter((timer) => timer.kind === "timeout").length,
      timersWithLifecycleCleanup: timers.filter((timer) => timer.cleanupHooks.length > 0).length,
      timersWithTerminalStop: timers.filter((timer) => timer.terminalStopProven).length,
      unresolved: unresolved.length,
      reviewReasons: reviewReasons.length,
    },
    reviewRequired: components.some((component) => component.reviewRequired) || unresolved.length > 0 || reviewReasons.length > 0,
  };
}
