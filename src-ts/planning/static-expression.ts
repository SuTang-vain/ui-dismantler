import { parse, parseExpressionAt } from "acorn";
import { eraseTypeScriptStateSyntax } from "./sfc-state-responsibility.js";

export type StaticExpressionValue =
  | null
  | boolean
  | number
  | string
  | StaticExpressionValue[]
  | { [key: string]: StaticExpressionValue }
  | { $reference: string }
  | { $unsupported: string };

function memberPath(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type !== "MemberExpression") return undefined;
  const object = memberPath(node.object);
  const property = node.computed
    ? node.property?.type === "Literal" ? String(node.property.value) : undefined
    : node.property?.name;
  return object && property ? `${object}.${property}` : undefined;
}

function propertyName(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return undefined;
}

function sourceFor(node: any, source: string): string {
  if (typeof node?.start === "number" && typeof node?.end === "number") return source.slice(node.start, node.end).slice(0, 240);
  return node?.type ?? "unknown";
}

function encodeNode(node: any, source: string): StaticExpressionValue {
  if (!node) return null;
  if (node.type === "Literal") return node.value instanceof RegExp ? { $unsupported: sourceFor(node, source) } : node.value ?? null;
  if (node.type === "Identifier") {
    if (node.name === "undefined") return null;
    return { $reference: node.name };
  }
  if (node.type === "ThisExpression") return { $reference: "this" };
  if (node.type === "MemberExpression") return { $reference: memberPath(node) ?? sourceFor(node, source) };
  if (node.type === "ArrayExpression") return node.elements.map((item: any) => item ? encodeNode(item, source) : null);
  if (node.type === "ObjectExpression") {
    const output: Record<string, StaticExpressionValue> = {};
    for (const property of node.properties) {
      if (property.type === "SpreadElement") {
        output[`$spread:${Object.keys(output).length}`] = encodeNode(property.argument, source);
        continue;
      }
      const name = propertyName(property.key);
      if (!name) {
        output[`$computed:${Object.keys(output).length}`] = { $unsupported: sourceFor(property, source) };
        continue;
      }
      output[name] = encodeNode(property.value, source);
    }
    return output;
  }
  if (node.type === "UnaryExpression") {
    const value = encodeNode(node.argument, source);
    if (typeof value === "number") {
      if (node.operator === "-") return -value;
      if (node.operator === "+") return value;
      if (node.operator === "~") return ~value;
    }
    if (node.operator === "!") return !value;
    return { $unsupported: sourceFor(node, source) };
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value?.cooked ?? "";
  return { $unsupported: sourceFor(node, source) };
}

export function parseStaticExpression(source: string): StaticExpressionValue | undefined {
  try {
    const node = parseExpressionAt(source, 0, { ecmaVersion: "latest" }) as any;
    return encodeNode(node, source);
  } catch {
    return undefined;
  }
}

export function extractTopLevelStaticBindings(script: string): Record<string, StaticExpressionValue> {
  let source = script;
  let program: any;
  try {
    program = parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any;
  } catch {
    try {
      source = eraseTypeScriptStateSyntax(script);
      program = parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any;
    } catch {
      return {};
    }
  }
  const output: Record<string, StaticExpressionValue> = {};
  for (const statement of program.body ?? []) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations ?? []) {
      if (declaration.id?.type !== "Identifier" || !declaration.init) continue;
      output[declaration.id.name] = encodeNode(declaration.init, source);
    }
  }
  return output;
}

export function collectStaticReferences(value: StaticExpressionValue | undefined): string[] {
  const references = new Set<string>();
  const visit = (candidate: StaticExpressionValue | undefined): void => {
    if (candidate === undefined || candidate === null || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) { for (const item of candidate) visit(item); return; }
    if ("$reference" in candidate && typeof candidate.$reference === "string") { references.add(candidate.$reference); return; }
    for (const item of Object.values(candidate)) visit(item);
  };
  visit(value);
  return [...references].sort();
}

export function collectArrayCardinalities(value: StaticExpressionValue, path = ""): Array<{ path: string; count: number }> {
  const output: Array<{ path: string; count: number }> = [];
  const visit = (candidate: StaticExpressionValue, currentPath: string): void => {
    if (Array.isArray(candidate)) {
      output.push({ path: currentPath || "$", count: candidate.length });
      candidate.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (!candidate || typeof candidate !== "object" || "$reference" in candidate || "$unsupported" in candidate) return;
    for (const [key, item] of Object.entries(candidate)) visit(item, currentPath ? `${currentPath}.${key}` : key);
  };
  visit(value, path);
  return output;
}
