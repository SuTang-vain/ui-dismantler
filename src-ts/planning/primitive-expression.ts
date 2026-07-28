import { parseExpressionAt } from "acorn";
import type { JsonValue } from "../types.js";

export type PrimitiveExpression =
  | { kind: "literal"; value: JsonValue }
  | { kind: "path"; path: string }
  | { kind: "unary"; operator: "!" | "+" | "-"; argument: PrimitiveExpression }
  | { kind: "logical"; operator: "&&" | "||" | "??"; left: PrimitiveExpression; right: PrimitiveExpression }
  | { kind: "binary"; operator: "===" | "!==" | "==" | "!=" | ">" | ">=" | "<" | "<="; left: PrimitiveExpression; right: PrimitiveExpression }
  | { kind: "conditional"; test: PrimitiveExpression; consequent: PrimitiveExpression; alternate: PrimitiveExpression }
  | { kind: "call"; functionName: string; arguments: PrimitiveExpression[] }
  | { kind: "unsupported"; source: string };

export interface PrimitiveExpressionEvaluation {
  resolved: boolean;
  value?: JsonValue;
}

export interface PrimitiveTextSegment {
  kind: "text" | "expression";
  value?: string;
  expression?: PrimitiveExpression;
}

function propertyName(node: any): string | undefined {
  if (!node) return undefined;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.property?.type === "Literal" && ["string", "number"].includes(typeof node.property.value)) return String(node.property.value);
  return undefined;
}

function memberPath(node: any): string | undefined {
  if (node?.type === "Identifier") return node.name;
  if (node?.type !== "MemberExpression") return undefined;
  const object = memberPath(node.object);
  const property = propertyName(node);
  return object && property ? `${object}.${property}` : undefined;
}

function compileNode(node: any, source: string): PrimitiveExpression {
  if (!node) return { kind: "unsupported", source };
  if (node.type === "Literal") return { kind: "literal", value: (node.value ?? null) as JsonValue };
  if (node.type === "Identifier") {
    if (node.name === "true") return { kind: "literal", value: true };
    if (node.name === "false") return { kind: "literal", value: false };
    if (["null", "undefined"].includes(node.name)) return { kind: "literal", value: null };
    return { kind: "path", path: node.name };
  }
  if (node.type === "MemberExpression") {
    const path = memberPath(node); return path ? { kind: "path", path } : { kind: "unsupported", source };
  }
  if (node.type === "UnaryExpression" && ["!", "+", "-"].includes(node.operator)) {
    return { kind: "unary", operator: node.operator, argument: compileNode(node.argument, source) } as PrimitiveExpression;
  }
  if (node.type === "LogicalExpression" && ["&&", "||", "??"].includes(node.operator)) {
    return { kind: "logical", operator: node.operator, left: compileNode(node.left, source), right: compileNode(node.right, source) } as PrimitiveExpression;
  }
  if (node.type === "BinaryExpression" && ["===", "!==", "==", "!=", ">", ">=", "<", "<="].includes(node.operator)) {
    return { kind: "binary", operator: node.operator, left: compileNode(node.left, source), right: compileNode(node.right, source) } as PrimitiveExpression;
  }
  if (node.type === "ConditionalExpression") {
    return { kind: "conditional", test: compileNode(node.test, source), consequent: compileNode(node.consequent, source), alternate: compileNode(node.alternate, source) };
  }
  if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
    return { kind: "call", functionName: node.callee.name, arguments: (node.arguments ?? []).map((argument: any) => compileNode(argument, source)) };
  }
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) return { kind: "literal", value: node.quasis?.[0]?.value?.cooked ?? "" };
  return { kind: "unsupported", source };
}

export function compilePrimitiveExpression(source: string): PrimitiveExpression {
  try {
    const node = parseExpressionAt(source, 0, { ecmaVersion: "latest" }) as any;
    return compileNode(node, source);
  } catch {
    return { kind: "unsupported", source };
  }
}

function valueAt(scope: Record<string, unknown>, path: string): PrimitiveExpressionEvaluation {
  let value: unknown = scope;
  for (const segment of path.split(".")) {
    if (value === null || value === undefined || typeof value !== "object" || !(segment in value)) return { resolved: false };
    value = (value as Record<string, unknown>)[segment];
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return { resolved: false };
  return { resolved: true, value: value as JsonValue };
}

export function evaluatePrimitiveExpression(expression: PrimitiveExpression, scope: Record<string, unknown>): PrimitiveExpressionEvaluation {
  if (expression.kind === "unsupported") return { resolved: false };
  if (expression.kind === "literal") return { resolved: true, value: expression.value };
  if (expression.kind === "path") return valueAt(scope, expression.path);
  if (expression.kind === "unary") {
    const argument = evaluatePrimitiveExpression(expression.argument, scope); if (!argument.resolved) return argument;
    if (expression.operator === "!") return { resolved: true, value: !argument.value };
    if (typeof argument.value !== "number") return { resolved: false };
    return { resolved: true, value: expression.operator === "-" ? -argument.value : argument.value };
  }
  if (expression.kind === "logical") {
    const left = evaluatePrimitiveExpression(expression.left, scope); if (!left.resolved) return left;
    if (expression.operator === "&&") return left.value ? evaluatePrimitiveExpression(expression.right, scope) : left;
    if (expression.operator === "||") return left.value ? left : evaluatePrimitiveExpression(expression.right, scope);
    return left.value !== null ? left : evaluatePrimitiveExpression(expression.right, scope);
  }
  if (expression.kind === "binary") {
    const left = evaluatePrimitiveExpression(expression.left, scope), right = evaluatePrimitiveExpression(expression.right, scope);
    if (!left.resolved || !right.resolved) return { resolved: false };
    const a = left.value as any, b = right.value as any;
    const value = expression.operator === "===" ? a === b : expression.operator === "!==" ? a !== b : expression.operator === "==" ? a == b : expression.operator === "!=" ? a != b : expression.operator === ">" ? a > b : expression.operator === ">=" ? a >= b : expression.operator === "<" ? a < b : a <= b;
    return { resolved: true, value };
  }
  if (expression.kind === "call") {
    const functions = scope.__autoV2DisplayFunctions;
    if (!Array.isArray(functions)) return { resolved: false };
    const responsibility = functions.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).functionName === expression.functionName) as Record<string, unknown> | undefined;
    if (!responsibility || responsibility.operation !== "date-locale-string" || expression.arguments.length !== 1) return { resolved: false };
    const argument = evaluatePrimitiveExpression(expression.arguments[0], scope); if (!argument.resolved) return argument;
    if (!argument.value && "fallback" in responsibility) return { resolved: true, value: responsibility.fallback as JsonValue };
    const date = new Date(String(argument.value)); if (Number.isNaN(date.getTime())) return { resolved: false };
    return { resolved: true, value: date.toLocaleString(typeof responsibility.locale === "string" ? responsibility.locale : undefined) };
  }
  const test = evaluatePrimitiveExpression(expression.test, scope); if (!test.resolved) return test;
  return evaluatePrimitiveExpression(test.value ? expression.consequent : expression.alternate, scope);
}

export function bindPrimitiveExpression(expression: PrimitiveExpression, bindings: Record<string, unknown>): PrimitiveExpression {
  if (expression.kind === "path") {
    const root = expression.path.split(".")[0];
    if (!(root in bindings)) return expression;
    const resolved = valueAt(bindings, expression.path);
    return resolved.resolved ? { kind: "literal", value: resolved.value ?? null } : expression;
  }
  if (expression.kind === "unary") return { ...expression, argument: bindPrimitiveExpression(expression.argument, bindings) };
  if (expression.kind === "logical" || expression.kind === "binary") return { ...expression, left: bindPrimitiveExpression(expression.left, bindings), right: bindPrimitiveExpression(expression.right, bindings) };
  if (expression.kind === "conditional") return { ...expression, test: bindPrimitiveExpression(expression.test, bindings), consequent: bindPrimitiveExpression(expression.consequent, bindings), alternate: bindPrimitiveExpression(expression.alternate, bindings) };
  if (expression.kind === "call") return { ...expression, arguments: expression.arguments.map((argument) => bindPrimitiveExpression(argument, bindings)) };
  return expression;
}

export function primitiveExpressionPaths(expression: PrimitiveExpression): string[] {
  if (expression.kind === "path") return [expression.path];
  if (expression.kind === "unary") return primitiveExpressionPaths(expression.argument);
  if (expression.kind === "logical" || expression.kind === "binary") return [...new Set([...primitiveExpressionPaths(expression.left), ...primitiveExpressionPaths(expression.right)])];
  if (expression.kind === "conditional") return [...new Set([...primitiveExpressionPaths(expression.test), ...primitiveExpressionPaths(expression.consequent), ...primitiveExpressionPaths(expression.alternate)])];
  if (expression.kind === "call") return [...new Set(expression.arguments.flatMap(primitiveExpressionPaths))];
  return [];
}

export function compilePrimitiveText(value: string): PrimitiveTextSegment[] {
  const output: PrimitiveTextSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(/{{\s*([^}]+?)\s*}}/g)) {
    const index = match.index ?? 0;
    if (index > cursor) output.push({ kind: "text", value: value.slice(cursor, index) });
    output.push({ kind: "expression", expression: compilePrimitiveExpression(match[1]) });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) output.push({ kind: "text", value: value.slice(cursor) });
  return output;
}

export function renderPrimitiveText(segments: PrimitiveTextSegment[], scope: Record<string, unknown>): string {
  return segments.map((segment) => {
    if (segment.kind === "text") return segment.value ?? "";
    const result = segment.expression ? evaluatePrimitiveExpression(segment.expression, scope) : { resolved: false };
    return result.resolved && result.value !== null ? String(result.value) : "";
  }).join("");
}
