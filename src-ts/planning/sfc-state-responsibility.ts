import { parse } from "acorn";
import type { JsonValue } from "../types.js";

export interface SfcStateWriteResponsibility {
  path: string;
  value?: JsonValue;
  expression: string;
  sourceLine: number;
  confidence: "high" | "medium";
}

export interface SfcHandlerStateResponsibility {
  handler: string;
  writes: SfcStateWriteResponsibility[];
  helperCalls: string[];
  sourceLine: number;
}

export interface SfcDisplayFunctionResponsibility {
  functionName: string;
  parameter: string;
  operation: "date-locale-string";
  locale?: string;
  fallback?: JsonValue;
  sourceLine: number;
  confidence: "high";
}

export interface SfcStateResponsibility {
  schemaVersion: "1.0";
  kind: "sfc-state-responsibility";
  parsed: boolean;
  initialState: Record<string, JsonValue>;
  handlers: SfcHandlerStateResponsibility[];
  displayFunctions: SfcDisplayFunctionResponsibility[];
  unresolvedWrites: Array<{ handler: string; path: string; expression: string; sourceLine: number }>;
  metrics: {
    initialBindings: number;
    handlers: number;
    handlersWithWrites: number;
    stateWrites: number;
    displayFunctions: number;
    unresolvedWrites: number;
  };
  reviewReasons: string[];
  parseError?: string;
}

const UNKNOWN = Symbol("unknown-static-state-value");
type StaticResult = JsonValue | typeof UNKNOWN;

function lineAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

function propertyName(node: any): string | undefined {
  if (!node) return undefined;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.property?.type === "Literal" && ["string", "number"].includes(typeof node.property.value)) return String(node.property.value);
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && ["string", "number"].includes(typeof node.value)) return String(node.value);
  return undefined;
}

function memberPath(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression") return undefined;
  const object = memberPath(node.object);
  const property = propertyName(node);
  return object && property ? `${object}.${property}` : undefined;
}

function normalizeStatePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const parts = path.split(".").filter((part) => part !== "value" && part !== "this");
  return parts.length > 0 ? parts.join(".") : undefined;
}

function sourceSlice(source: string, node: any): string {
  if (typeof node?.start !== "number" || typeof node?.end !== "number") return node?.type ?? "unknown";
  return source.slice(node.start, node.end).replace(/\s+/g, " ").slice(0, 400);
}

function staticValue(node: any, functions = new Map<string, any>(), stack = new Set<string>()): StaticResult {
  if (!node) return UNKNOWN;
  if (node.type === "Literal") return node.value instanceof RegExp ? UNKNOWN : (node.value ?? null) as JsonValue;
  if (node.type === "Identifier" && node.name === "undefined") return null;
  if (node.type === "UnaryExpression") {
    const value = staticValue(node.argument, functions, stack);
    if (value === UNKNOWN) return UNKNOWN;
    if (node.operator === "!") return !value;
    if (node.operator === "+" && typeof value === "number") return value;
    if (node.operator === "-" && typeof value === "number") return -value;
    return UNKNOWN;
  }
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) return node.quasis?.[0]?.value?.cooked ?? "";
  if (node.type === "ArrayExpression") {
    const values: JsonValue[] = [];
    for (const item of node.elements ?? []) {
      const value = staticValue(item, functions, stack);
      if (value === UNKNOWN) return UNKNOWN;
      values.push(value);
    }
    return values;
  }
  if (node.type === "CallExpression") {
    const called = functionName(node.callee), handler = called ? functions.get(called) : undefined;
    if (!called || !handler || stack.has(called) || (handler.params?.length ?? 0) > 0 || (node.arguments?.length ?? 0) > 0) return UNKNOWN;
    const nextStack = new Set(stack).add(called);
    if (handler.type === "ArrowFunctionExpression" && handler.body?.type !== "BlockStatement") return staticValue(handler.body, functions, nextStack);
    const statements = handler.body?.body ?? [];
    const returned = statements.find((statement: any) => statement.type === "ReturnStatement" && statement.argument)?.argument;
    return returned ? staticValue(returned, functions, nextStack) : UNKNOWN;
  }
  if (node.type === "ObjectExpression") {
    const value: Record<string, JsonValue> = {};
    for (const property of node.properties ?? []) {
      if (property.type === "SpreadElement") continue;
      const name = propertyName(property.key);
      if (!name) continue;
      const child = staticValue(property.value, functions, stack);
      if (child !== UNKNOWN) value[name] = child;
    }
    return value;
  }
  return UNKNOWN;
}

function functionName(node: any): string | undefined {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression") return memberPath(node)?.split(".").at(-1);
  return undefined;
}

function isFunction(node: any): boolean {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node?.type);
}

function collectFunctions(program: any): Map<string, any> {
  const functions = new Map<string, any>();
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" && node.id?.name) functions.set(node.id.name, node);
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && isFunction(node.init)) functions.set(node.id.name, node.init);
    if ((node.type === "Property" || node.type === "PropertyDefinition") && isFunction(node.value)) {
      const name = propertyName(node.key); if (name) functions.set(name, node.value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (["start", "end", "loc"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(program);
  return functions;
}

function initialState(program: any, functions: Map<string, any>): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const statement of program.body ?? []) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations ?? []) {
      if (declaration.id?.type !== "Identifier" || declaration.init?.type !== "CallExpression") continue;
      const callee = functionName(declaration.init.callee);
      if (callee !== "ref" && callee !== "reactive") continue;
      const value = staticValue(declaration.init.arguments?.[0], functions);
      if (value !== UNKNOWN) output[declaration.id.name] = value;
    }
  }
  return output;
}

function flattenStaticWrites(path: string, valueNode: any, source: string, confidence: "high" | "medium", functions: Map<string, any>): SfcStateWriteResponsibility[] {
  if (valueNode?.type === "ObjectExpression") {
    return (valueNode.properties ?? []).flatMap((property: any) => {
      if (property.type === "SpreadElement") return [];
      const name = propertyName(property.key);
      return name ? flattenStaticWrites(`${path}.${name}`, property.value, source, confidence, functions) : [];
    });
  }
  const value = staticValue(valueNode, functions);
  if (value === UNKNOWN) return [];
  return [{ path, value, expression: sourceSlice(source, valueNode), sourceLine: lineAt(source, valueNode.start ?? 0), confidence }];
}

function collectHandlerWrites(name: string, handler: any, source: string, functions: Map<string, any>, stack = new Set<string>(), depth = 0): { writes: SfcStateWriteResponsibility[]; unresolved: Array<{ path: string; expression: string; sourceLine: number }>; helperCalls: string[] } {
  if (depth > 2 || stack.has(name)) return { writes: [], unresolved: [], helperCalls: [] };
  const nextStack = new Set(stack).add(name);
  const writes: SfcStateWriteResponsibility[] = [];
  const unresolved: Array<{ path: string; expression: string; sourceLine: number }> = [];
  const helperCalls = new Set<string>();
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node !== handler && isFunction(node)) return;
    if (node.type === "AssignmentExpression") {
      const path = normalizeStatePath(memberPath(node.left));
      if (path) {
        const staticWrites = flattenStaticWrites(path, node.right, source, node.operator === "=" ? "high" : "medium", functions);
        if (staticWrites.length > 0) writes.push(...staticWrites);
        else unresolved.push({ path, expression: sourceSlice(source, node), sourceLine: lineAt(source, node.start ?? 0) });
      }
    }
    if (node.type === "CallExpression") {
      const called = functionName(node.callee);
      if (called && functions.has(called) && called !== name) helperCalls.add(called);
    }
    for (const [key, value] of Object.entries(node)) {
      if (["start", "end", "loc"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(handler.body ?? handler);
  for (const helper of helperCalls) {
    const nested = collectHandlerWrites(helper, functions.get(helper), source, functions, nextStack, depth + 1);
    writes.push(...nested.writes.map((write) => ({ ...write, confidence: "medium" as const })));
    unresolved.push(...nested.unresolved);
  }
  return {
    writes: writes.filter((write, index, items) => items.findIndex((candidate) => candidate.path === write.path && JSON.stringify(candidate.value) === JSON.stringify(write.value)) === index),
    unresolved: unresolved.filter((write, index, items) => items.findIndex((candidate) => candidate.path === write.path && candidate.expression === write.expression) === index),
    helperCalls: [...helperCalls].sort(),
  };
}

function analyzeDisplayFunctions(functions: Map<string, any>, source: string): SfcDisplayFunctionResponsibility[] {
  const output: SfcDisplayFunctionResponsibility[] = [];
  const visit = (node: any, callback: (node: any) => void): void => {
    if (!node || typeof node !== "object") return;
    callback(node);
    for (const [key, value] of Object.entries(node)) {
      if (["start", "end", "loc"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((item) => visit(item, callback));
      else if (value && typeof value === "object") visit(value, callback);
    }
  };
  for (const [name, handler] of functions) {
    const parameter = handler.params?.[0]?.type === "Identifier" ? handler.params[0].name : undefined;
    if (!parameter) continue;
    let locale: string | undefined, matched = false, fallback: JsonValue | undefined;
    visit(handler.body ?? handler, (node) => {
      if (node.type === "IfStatement" && node.test?.type === "UnaryExpression" && node.test.operator === "!" && node.test.argument?.type === "Identifier" && node.test.argument.name === parameter) {
        const returned = node.consequent?.type === "ReturnStatement" ? node.consequent.argument : node.consequent?.body?.find?.((statement: any) => statement.type === "ReturnStatement")?.argument;
        const value = staticValue(returned, functions); if (value !== UNKNOWN) fallback = value;
      }
      if (node.type !== "CallExpression" || propertyName(node.callee) !== "toLocaleString") return;
      const receiver = node.callee.object;
      if (receiver?.type !== "NewExpression" || receiver.callee?.type !== "Identifier" || receiver.callee.name !== "Date") return;
      if (receiver.arguments?.[0]?.type !== "Identifier" || receiver.arguments[0].name !== parameter) return;
      const localeValue = staticValue(node.arguments?.[0], functions);
      locale = typeof localeValue === "string" ? localeValue : undefined;
      matched = true;
    });
    if (matched) output.push({ functionName: name, parameter, operation: "date-locale-string", locale, fallback, sourceLine: lineAt(source, handler.start ?? 0), confidence: "high" });
  }
  return output.sort((left, right) => left.functionName.localeCompare(right.functionName));
}

export function analyzeSfcStateResponsibilities(script: string): SfcStateResponsibility {
  try {
    const program = parse(script, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }) as any;
    const functions = collectFunctions(program);
    const handlers: SfcHandlerStateResponsibility[] = [];
    const unresolvedWrites: SfcStateResponsibility["unresolvedWrites"] = [];
    for (const [handlerName, handler] of [...functions.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const evidence = collectHandlerWrites(handlerName, handler, script, functions);
      handlers.push({ handler: handlerName, writes: evidence.writes, helperCalls: evidence.helperCalls, sourceLine: lineAt(script, handler.start ?? 0) });
      unresolvedWrites.push(...evidence.unresolved.map((write) => ({ handler: handlerName, ...write })));
    }
    const initial = initialState(program, functions);
    const displayFunctions = analyzeDisplayFunctions(functions, script);
    const stateWrites = handlers.reduce((sum, handler) => sum + handler.writes.length, 0);
    return {
      schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, initialState: initial, handlers, displayFunctions, unresolvedWrites,
      metrics: { initialBindings: Object.keys(initial).length, handlers: handlers.length, handlersWithWrites: handlers.filter((handler) => handler.writes.length > 0).length, stateWrites, displayFunctions: displayFunctions.length, unresolvedWrites: unresolvedWrites.length },
      reviewReasons: [
        "only structurally proven static state writes are executable candidates",
        "dynamic values and conditional branches remain reviewable evidence rather than guessed runtime values",
      ],
    };
  } catch (error) {
    return {
      schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: false, initialState: {}, handlers: [], displayFunctions: [], unresolvedWrites: [],
      metrics: { initialBindings: 0, handlers: 0, handlersWithWrites: 0, stateWrites: 0, displayFunctions: 0, unresolvedWrites: 0 },
      reviewReasons: ["script parse failure blocks executable state responsibility"],
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}
