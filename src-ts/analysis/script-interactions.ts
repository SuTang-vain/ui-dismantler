import { parse, type AnyNode } from "acorn";
import { fullAncestor, simple } from "acorn-walk";
import type { Interaction, UIStateTransition } from "../types.js";

interface SelectorBinding {
  selector: string;
  kind: "single" | "collection" | "dynamic";
}

interface BindingRecord {
  name: string;
  init?: any;
  binding?: SelectorBinding;
  scope: AnyNode;
  start: number;
  ancestors: AnyNode[];
}

interface ExtractionContext {
  document: Document;
  stableSelector: (element: Element) => string;
  ast: AnyNode;
  bindings: Map<string, SelectorBinding>;
  bindingRecords: Map<string, BindingRecord[]>;
  parameterBindingCache: Map<any, Map<string, SelectorBinding | null>>;
  dataNames: Set<string>;
  functions: Map<string, any>;
}

export interface ScriptInteractionExtraction {
  interactions: Interaction[];
  parsed: boolean;
  parseError?: string;
}

const EVENT_PROPERTIES = new Set(["onclick", "onchange", "oninput", "onkeydown", "onkeyup", "onsubmit", "onmouseenter", "onmouseleave", "onfocus", "onblur"]);
const MUTATION_METHODS = new Set(["add", "remove", "replace", "toggle", "setAttribute", "removeAttribute", "toggleAttribute", "append", "appendChild", "prepend", "replaceChildren", "remove", "focus", "blur", "showModal", "close", "scrollBy", "scrollTo"]);
const MUTATION_PROPERTIES = new Set(["className", "hidden", "innerHTML", "innerText", "textContent", "value", "checked", "disabled", "open", "src", "href", "scrollLeft", "scrollTop"]);
const MAX_CALL_DEPTH = 2;
const IGNORED_DATA_NAMES = new Set(["document", "window", "console", "Math", "JSON", "Array", "Object", "String", "Number", "Boolean", "Date", "Set", "Map", "Promise", "Element", "HTMLElement"]);

function propertyName(node: any): string | null {
  if (!node) return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.property?.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  return null;
}

function staticString(node: any, substitutions = new Map<string, any>()): string | null {
  if (!node) return null;
  if (node.type === "Identifier" && substitutions.has(node.name)) return staticString(substitutions.get(node.name), substitutions);
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) return node.quasis?.[0]?.value?.cooked ?? "";
  return null;
}

function memberPath(node: any): string | null {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression") return null;
  const object = memberPath(node.object);
  const property = propertyName(node);
  return object && property ? `${object}.${property}` : null;
}

function returnedExpression(handler: any): any | null {
  if (!handler) return null;
  if (handler.type === "ArrowFunctionExpression" && handler.body?.type !== "BlockStatement") return handler.body;
  let result: any | null = null;
  simple(handler.body ?? handler, { ReturnStatement(node: any) { if (!result && node.argument) result = node.argument; } });
  return result;
}

function resolveFunction(node: any, context: ExtractionContext): any | null {
  if (!node) return null;
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression" && propertyName(node.callee) === "bind") return resolveFunction(node.callee.object, context);
  const path = memberPath(node);
  return path ? context.functions.get(path) ?? null : null;
}

function enclosingScopes(ancestors: AnyNode[]): AnyNode[] {
  return ancestors.filter((node: any) => node.type === "Program" || ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type));
}

function lexicalBinding(name: string, useNode: any, ancestors: AnyNode[], context: ExtractionContext, seen: Set<string>): SelectorBinding | null {
  if (seen.has(name)) return null;
  const scopes = enclosingScopes(ancestors);
  const records = (context.bindingRecords.get(name) ?? [])
    .filter((record) => scopes.includes(record.scope) && record.start <= (useNode?.start ?? Number.MAX_SAFE_INTEGER))
    .sort((left, right) => {
      const scopeDifference = scopes.indexOf(right.scope) - scopes.indexOf(left.scope);
      return scopeDifference || right.start - left.start;
    });
  const record = records[0];
  if (!record) return null;
  if (record.binding) return record.binding;
  return queryBinding(record.init, context, record.ancestors, new Set([...seen, name]));
}

function functionParameterBinding(name: string, ancestors: AnyNode[], context: ExtractionContext): SelectorBinding | null {
  const fn: any = [...ancestors].reverse().find((node: any) => ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type) && node.params?.some((parameter: any) => parameter.type === "Identifier" && parameter.name === name));
  if (!fn) return null;
  const parameterIndex = fn.params.findIndex((parameter: any) => parameter.type === "Identifier" && parameter.name === name);
  const inline = callbackParameterBinding(name, ancestors, context);
  if (inline) return inline;
  if (fn.type !== "FunctionDeclaration" || !fn.id?.name) return null;
  const cached = context.parameterBindingCache.get(fn)?.get(name);
  if (cached !== undefined) return cached;
  const candidates: SelectorBinding[] = [];
  fullAncestor(context.ast, (node: any, _state, callAncestors) => {
    if (node.type !== "CallExpression") return;
    if (node.callee?.type === "Identifier" && node.callee.name === fn.id.name) {
      const binding = queryBinding(node.arguments?.[parameterIndex], context, callAncestors);
      if (binding) candidates.push(binding);
      return;
    }
    if (parameterIndex === 0 && node.callee?.type === "MemberExpression" && ["forEach", "map", "filter", "find", "some", "every"].includes(propertyName(node.callee) ?? "") && node.arguments?.[0]?.type === "Identifier" && node.arguments[0].name === fn.id.name) {
      const binding = queryBinding(node.callee.object, context, callAncestors);
      if (binding) candidates.push(binding);
    }
  });
  const unique = [...new Map(candidates.map((candidate) => [`${candidate.kind}|${candidate.selector}`, candidate])).values()];
  const first = unique[0];
  const result = !first
    ? null
    : unique.length === 1
      ? first
      : unique.every((candidate) => candidate.kind !== "dynamic")
        ? { selector: unique.map((candidate) => candidate.selector).join(", "), kind: "collection" as const }
        : null;
  const cache = context.parameterBindingCache.get(fn) ?? new Map<string, SelectorBinding | null>();
  cache.set(name, result);
  context.parameterBindingCache.set(fn, cache);
  return result;
}

function returnedQueryBinding(returned: any, helper: any, invocation: any, context: ExtractionContext, ancestors: AnyNode[], seen: Set<string>): SelectorBinding | null {
  if (!returned) return null;
  const substitutions = new Map<string, any>();
  for (const [index, parameter] of (helper?.params ?? []).entries()) if (parameter.type === "Identifier") substitutions.set(parameter.name, invocation.arguments?.[index]);
  const unwrap = (node: any): SelectorBinding | null => {
    if (!node) return null;
    if (node.type === "CallExpression" && node.callee?.type === "MemberExpression" && propertyName(node.callee) === "from") return unwrap(node.arguments?.[0]);
    if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
      const method = propertyName(node.callee);
      if (method === "querySelector" || method === "querySelectorAll") {
        const selector = staticString(node.arguments?.[0], substitutions);
        return selector ? { selector, kind: method === "querySelectorAll" ? "collection" : "single" } : null;
      }
      if (method === "getElementById") {
        const id = staticString(node.arguments?.[0], substitutions);
        return id ? { selector: `#${id}`, kind: "single" } : null;
      }
    }
    return queryBinding(node, context, ancestors, seen);
  };
  return unwrap(returned);
}

function queryBinding(node: any, context: ExtractionContext, ancestors: AnyNode[] = [], seen = new Set<string>()): SelectorBinding | null {
  if (!node) return null;
  if (node.type === "ChainExpression") return queryBinding(node.expression, context, ancestors, seen);
  if (node.type === "Identifier") return context.bindings.get(node.name) ?? functionParameterBinding(node.name, ancestors, context) ?? lexicalBinding(node.name, node, ancestors, context, seen);
  if (node.type === "MemberExpression" && ["target", "currentTarget"].includes(propertyName(node) ?? "")) return queryBinding(node.object, context, ancestors, seen);
  if (node.type === "CallExpression") {
    if (node.callee?.type === "MemberExpression" && propertyName(node.callee) === "from") return queryBinding(node.arguments?.[0], context, ancestors, seen);
    const helper = resolveFunction(node.callee, context);
    const returned = returnedExpression(helper);
    if (returned) {
      const binding = returnedQueryBinding(returned, helper, node, context, ancestors, seen);
      if (binding) return binding;
    }
  }
  if (node.type !== "CallExpression" || node.callee?.type !== "MemberExpression") return null;
  const method = propertyName(node.callee);
  if (method === "querySelector" || method === "querySelectorAll") {
    const selector = staticString(node.arguments?.[0]);
    return selector ? { selector, kind: method === "querySelectorAll" ? "collection" : "single" } : null;
  }
  if (method === "getElementById") {
    const id = staticString(node.arguments?.[0]);
    return id ? { selector: `#${id}`, kind: "single" } : { selector: "@dynamic-id", kind: "dynamic" };
  }
  if (method === "closest" || method === "matches") {
    const selector = staticString(node.arguments?.[0]);
    return selector ? { selector, kind: "single" } : null;
  }
  return null;
}

function callbackParameterBinding(name: string, ancestors: AnyNode[], context: ExtractionContext): SelectorBinding | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node: any = ancestors[index];
    if (!["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"].includes(node.type)) continue;
    const parameterIndex = node.params?.findIndex((parameter: any) => parameter.type === "Identifier" && parameter.name === name) ?? -1;
    if (parameterIndex < 0) continue;
    const parent: any = ancestors[index - 1];
    if (parent?.type !== "CallExpression" || parent.callee?.type !== "MemberExpression") continue;
    const method = propertyName(parent.callee);
    if (!["forEach", "map", "filter", "find", "some", "every"].includes(method ?? "")) continue;
    return queryBinding(parent.callee.object, context, ancestors.slice(0, index - 1));
  }
  return null;
}

function selectorElements(binding: SelectorBinding, context: ExtractionContext): Array<{ selector: string; element?: Element }> {
  if (binding.kind === "dynamic") return [{ selector: binding.selector }];
  try {
    const elements = [...context.document.querySelectorAll(binding.selector)];
    if (elements.length) return elements.map((element) => ({ selector: context.stableSelector(element), element }));
    if (binding.kind === "collection") return [];
  } catch { /* Keep raw dynamic selector evidence. */ }
  return [{ selector: binding.selector }];
}

function receiverBinding(node: any, ancestors: AnyNode[], context: ExtractionContext): SelectorBinding | null {
  if (!node) return null;
  if (node.type === "MemberExpression") {
    const property = propertyName(node);
    if (property === "classList" || property === "style" || property === "dataset") return queryBinding(node.object, context, ancestors);
  }
  return queryBinding(node, context, ancestors);
}

function sourceSlice(script: string, node: any, limit = 100): string {
  if (!node || !Number.isInteger(node.start) || !Number.isInteger(node.end)) return "";
  return script.slice(node.start, node.end).replace(/\s+/g, " ").slice(0, limit);
}

function staticValue(node: any): string | number | boolean | null | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && ["string", "number", "boolean"].includes(typeof node.value)) return node.value;
  if (node.type === "Literal" && node.value === null) return null;
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) return node.quasis?.[0]?.value?.cooked ?? "";
  if (node.type === "UnaryExpression" && node.operator === "!" && node.argument?.type === "Literal") return !node.argument.value;
  return undefined;
}

function transitionForCall(node: any, binding: SelectorBinding, script: string): UIStateTransition | null {
  const method = propertyName(node.callee);
  const source = sourceSlice(script, node);
  const value = staticValue(node.arguments?.[0]);
  if (["add", "remove", "toggle", "replace"].includes(method ?? "") && propertyName(node.callee.object) === "classList") {
    const nextValue = method === "replace" ? staticValue(node.arguments?.[1]) : value;
    return { target: binding.selector, kind: "class", operation: method as "add" | "remove" | "toggle" | "replace", name: typeof value === "string" ? value : undefined, value: nextValue, confidence: typeof value === "string" ? 0.96 : 0.68, source };
  }
  if (["setAttribute", "removeAttribute", "toggleAttribute"].includes(method ?? "")) {
    const operation = method === "setAttribute" ? "set" : method === "removeAttribute" ? "remove" : "toggle";
    return { target: binding.selector, kind: "attribute", operation, name: typeof value === "string" ? value : undefined, value: method === "setAttribute" ? staticValue(node.arguments?.[1]) : undefined, confidence: typeof value === "string" ? 0.94 : 0.66, source };
  }
  if (method === "showModal" || method === "close") return { target: binding.selector, kind: "property", operation: method === "showModal" ? "open" : "close", name: "open", value: method === "showModal", confidence: 0.98, source };
  if (method === "focus" || method === "blur") return { target: binding.selector, kind: "focus", operation: method, value: method === "focus", confidence: 0.98, source };
  if (method === "scrollBy" || method === "scrollTo") return { target: binding.selector, kind: "property", operation: "set", name: "scroll-position", confidence: 0.82, source };
  if (["append", "appendChild", "prepend", "replaceChildren"].includes(method ?? "")) return { target: binding.selector, kind: "structure", operation: "append", confidence: 0.72, source };
  if (method === "remove") return { target: binding.selector, kind: "structure", operation: "remove-node", confidence: 0.9, source };
  return null;
}

function transitionForAssignment(node: any, binding: SelectorBinding, script: string): UIStateTransition | null {
  const direct = propertyName(node.left);
  const styleProperty = node.left.object?.type === "MemberExpression" && propertyName(node.left.object) === "style" ? propertyName(node.left) : null;
  const value = staticValue(node.right);
  const source = sourceSlice(script, node);
  if (styleProperty) return { target: binding.selector, kind: "style", operation: "set", name: styleProperty, value, confidence: value === undefined ? 0.65 : 0.92, source };
  if (direct === "className") return { target: binding.selector, kind: "class", operation: "set", name: typeof value === "string" ? value : undefined, value, confidence: value === undefined ? 0.62 : 0.9, source };
  if (["innerHTML", "innerText", "textContent"].includes(direct ?? "")) return { target: binding.selector, kind: "content", operation: "set", name: direct ?? undefined, value, confidence: value === undefined ? 0.64 : 0.9, source };
  if (direct && MUTATION_PROPERTIES.has(direct)) return { target: binding.selector, kind: "property", operation: "set", name: direct, value, confidence: value === undefined ? 0.64 : 0.9, source };
  return null;
}

function identifierNames(node: any, names = new Set<string>()): Set<string> {
  if (!node) return names;
  simple(node, { Identifier(identifier: any) { names.add(identifier.name); } });
  return names;
}

function branchAllowsPropagation(ancestors: AnyNode[], node: any, guardVariable?: string): boolean {
  if (!guardVariable) return true;
  for (const conditional of ancestors as any[]) {
    if (conditional.type !== "IfStatement" || !Number.isInteger(node.start)) continue;
    const inConsequent = conditional.consequent && node.start >= conditional.consequent.start && node.end <= conditional.consequent.end;
    const inAlternate = conditional.alternate && node.start >= conditional.alternate.start && node.end <= conditional.alternate.end;
    if (!inConsequent && !inAlternate) continue;
    const names = identifierNames(conditional.test);
    if (inConsequent && names.has(guardVariable) && conditional.test.type === "Identifier") continue;
    return false;
  }
  return true;
}

function collectHandlerEvidence(handler: any, script: string, outerAncestors: AnyNode[], context: ExtractionContext, visited = new Set<any>(), callDepth = 0, guardVariable?: string): Pick<Interaction, "mutationTargets" | "stateMutations" | "stateTransitions" | "dataDependencies"> {
  const targets = new Set<string>();
  const mutations = new Set<string>();
  const transitions: UIStateTransition[] = [];
  const dependencies = new Set<string>();
  const locals = new Set<string>();
  if (!handler || visited.has(handler)) return { mutationTargets: [], stateMutations: [], stateTransitions: [], dataDependencies: [] };
  visited.add(handler);
  const inheritedBindings = new Map(context.bindings);
  const scopedContext: ExtractionContext = { ...context, bindings: new Map(context.bindings), functions: new Map(context.functions) };
  collectBindings(handler, scopedContext);
  for (const [name, binding] of inheritedBindings) scopedContext.bindings.set(name, binding);
  for (const parameter of handler.params ?? []) if (parameter.type === "Identifier") locals.add(parameter.name);
  simple(handler, { VariableDeclarator(node: any) { if (node.id?.type === "Identifier") locals.add(node.id.name); } });
  fullAncestor(handler, (node: any, _state, localAncestors) => {
    const ancestors = [...outerAncestors, ...localAncestors];
    if (node.type === "CallExpression") {
      const nestedHandler = resolveFunction(node.callee, scopedContext);
      if (callDepth < MAX_CALL_DEPTH && nestedHandler && branchAllowsPropagation(ancestors, node, guardVariable)) {
        const nestedContext: ExtractionContext = { ...scopedContext, bindings: new Map(scopedContext.bindings), functions: new Map(scopedContext.functions) };
        for (const [index, parameter] of (nestedHandler.params ?? []).entries()) {
          if (parameter.type !== "Identifier") continue;
          const argumentBinding = queryBinding(node.arguments?.[index], scopedContext, ancestors);
          if (argumentBinding) nestedContext.bindings.set(parameter.name, argumentBinding);
        }
        const nested = collectHandlerEvidence(nestedHandler, script, ancestors, nestedContext, new Set(visited), callDepth + 1, guardVariable);
        for (const target of nested.mutationTargets ?? []) targets.add(target);
        for (const mutation of nested.stateMutations ?? []) mutations.add(mutation);
        transitions.push(...(nested.stateTransitions ?? []));
        for (const dependency of nested.dataDependencies ?? []) dependencies.add(dependency);
      }
      if (node.callee?.type !== "MemberExpression") return;
      const method = propertyName(node.callee);
      if (!MUTATION_METHODS.has(method ?? "")) return;
      const receiver = ["add", "replace", "toggle"].includes(method ?? "") || (method === "remove" && propertyName(node.callee.object) === "classList") ? node.callee.object?.object : node.callee.object;
      const binding = receiverBinding(receiver, ancestors, scopedContext);
      if (binding) {
        targets.add(binding.selector);
        const transition = transitionForCall(node, binding, script);
        if (transition) transitions.push(transition);
      }
      mutations.add(sourceSlice(script, node));
    }
    if (node.type === "AssignmentExpression") {
      if (node.left?.type !== "MemberExpression") return;
      const direct = propertyName(node.left);
      const styleProperty = node.left.object?.type === "MemberExpression" && propertyName(node.left.object) === "style" ? propertyName(node.left) : null;
      if (!MUTATION_PROPERTIES.has(direct ?? "") && !styleProperty && direct !== "className") return;
      const receiver = styleProperty ? node.left.object.object : node.left.object;
      const binding = receiverBinding(receiver, ancestors, scopedContext);
      if (binding) {
        targets.add(binding.selector);
        const transition = transitionForAssignment(node, binding, script);
        if (transition) transitions.push(transition);
      }
      mutations.add(sourceSlice(script, node));
    }
    if (node.type === "Identifier") {
      if (locals.has(node.name) || IGNORED_DATA_NAMES.has(node.name)) return;
      if (scopedContext.dataNames.has(node.name) || /^[A-Z][A-Z0-9_]{1,}$/.test(node.name)) dependencies.add(node.name);
    }
  });
  const uniqueTransitions = transitions.filter((item, index, items) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index).slice(0, 20);
  return { mutationTargets: [...targets], stateMutations: [...mutations].slice(0, 20), stateTransitions: uniqueTransitions, dataDependencies: [...dependencies] };
}

function literalStrings(node: any, values = new Set<string>()): Set<string> {
  if (!node) return values;
  if (node.type === "Literal" && typeof node.value === "string") values.add(node.value);
  if (node.type === "TemplateElement" && typeof node.value?.cooked === "string") values.add(node.value.cooked);
  for (const key of ["left", "right", "consequent", "alternate"]) if (node[key]) literalStrings(node[key], values);
  for (const part of node.quasis ?? []) literalStrings(part, values);
  return values;
}

function dynamicClassBinding(node: any, ancestors: AnyNode[]): SelectorBinding | null {
  if (node.type !== "AssignmentExpression" || node.left?.type !== "MemberExpression" || propertyName(node.left) !== "className" || node.left.object?.type !== "Identifier") return null;
  const classes = [...literalStrings(node.right)].flatMap((value) => value.match(/[A-Za-z_][\w-]*/g) ?? []).filter((value) => !["on", "active", "open", "center"].includes(value));
  const base = classes[0];
  if (!base) return null;
  const enclosing = [...ancestors].reverse().find((ancestor: any) => ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(ancestor.type)) as any;
  const guardedAway = enclosing?.body?.body?.some((statement: any) => statement.type === "IfStatement" && statement.test?.type === "UnaryExpression" && statement.test.operator === "!" && statement.test.argument?.type === "Identifier" && statement.test.argument.name === "center");
  const hasCenterVariant = [...literalStrings(node.right)].some((value) => /\bcenter\b/.test(value));
  return { selector: `.${base}${guardedAway && hasCenterVariant ? ":not(.center)" : ""}`, kind: "dynamic" };
}

function bindingScope(ancestors: AnyNode[]): AnyNode {
  return [...ancestors].reverse().find((node: any) => node.type === "Program" || ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) ?? ancestors[0];
}

function addBindingRecord(context: ExtractionContext, record: BindingRecord): void {
  context.bindingRecords.set(record.name, [...(context.bindingRecords.get(record.name) ?? []), record]);
}

function collectBindings(ast: AnyNode, context: ExtractionContext): void {
  fullAncestor(ast, (node: any, _state, ancestors) => {
    if (node.type === "FunctionDeclaration" && node.id?.name) context.functions.set(node.id.name, node);
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      addBindingRecord(context, { name: node.id.name, init: node.init, scope: bindingScope(ancestors.slice(0, -1)), start: node.start ?? 0, ancestors: [...ancestors] });
      if (node.init?.type === "ArrayExpression" || node.init?.type === "ObjectExpression") context.dataNames.add(node.id.name);
      if (node.init?.type === "FunctionExpression" || node.init?.type === "ArrowFunctionExpression") context.functions.set(node.id.name, node.init);
      if (node.init?.type === "ObjectExpression") {
        for (const property of node.init.properties ?? []) {
          const name = propertyName({ property: property.key, computed: property.computed });
          if (name && ["FunctionExpression", "ArrowFunctionExpression"].includes(property.value?.type)) context.functions.set(`${node.id.name}.${name}`, property.value);
        }
      }
    }
    if (node.type === "AssignmentExpression") {
      if (node.left?.type === "Identifier") addBindingRecord(context, { name: node.left.name, init: node.right, scope: bindingScope(ancestors.slice(0, -1)), start: node.start ?? 0, ancestors: [...ancestors] });
      const path = memberPath(node.left);
      if (path && ["FunctionExpression", "ArrowFunctionExpression"].includes(node.right?.type)) context.functions.set(path, node.right);
    }
    const dynamic = dynamicClassBinding(node, ancestors);
    if (dynamic && node.left.object.type === "Identifier") addBindingRecord(context, { name: node.left.object.name, binding: dynamic, scope: bindingScope(ancestors.slice(0, -1)), start: node.start ?? 0, ancestors: [...ancestors] });
  });
}

interface DelegatedTrigger {
  binding: SelectorBinding;
  variable?: string;
}

function isExclusionClosest(node: any, ancestors: AnyNode[]): boolean {
  return ancestors.some((ancestor: any) => {
    if (ancestor.type !== "IfStatement" || !ancestor.test || !ancestor.consequent) return false;
    const inTest = Number.isInteger(node.start) && node.start >= ancestor.test.start && node.end <= ancestor.test.end;
    if (!inTest) return false;
    return ancestor.consequent.type === "ReturnStatement"
      || (ancestor.consequent.type === "BlockStatement" && ancestor.consequent.body?.some((statement: any) => statement.type === "ReturnStatement"));
  });
}

function delegatedTriggerBindings(handler: any): DelegatedTrigger[] {
  const delegated: DelegatedTrigger[] = [];
  if (!handler) return delegated;
  fullAncestor(handler, (node: any, _state, localAncestors) => {
    if (node.type !== "CallExpression" || node.callee?.type !== "MemberExpression" || propertyName(node.callee) !== "closest") return;
    const selector = staticString(node.arguments?.[0]);
    const eventParameter = handler.params?.[0]?.type === "Identifier" ? handler.params[0].name : null;
    const receiver = node.callee.object;
    const directEventTarget = receiver?.type === "MemberExpression" && propertyName(receiver) === "target" && receiver.object?.type === "Identifier" && receiver.object.name === eventParameter;
    if (!selector || !directEventTarget || isExclusionClosest(node, localAncestors) || delegated.some((item) => item.binding.selector === selector)) return;
    const parent: any = localAncestors[localAncestors.length - 2];
    const variable = parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier"
      ? parent.id.name
      : parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier" ? parent.left.name : undefined;
    delegated.push({ binding: { selector, kind: "collection" }, variable });
  });
  return delegated;
}
function eventHandler(node: any): { event: string; receiver: any; handler: any } | null {
  if (node.type === "AssignmentExpression" && node.left?.type === "MemberExpression") {
    const property = propertyName(node.left);
    if (property && EVENT_PROPERTIES.has(property)) return { event: property.slice(2), receiver: node.left.object, handler: node.right };
  }
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression" && propertyName(node.callee) === "addEventListener") {
    const event = staticString(node.arguments?.[0]);
    if (event) return { event, receiver: node.callee.object, handler: node.arguments?.[1] };
  }
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "addEventListener") {
    const event = staticString(node.arguments?.[0]);
    if (event) return { event, receiver: { type: "Identifier", name: "window", start: node.callee.start, end: node.callee.end }, handler: node.arguments?.[1] };
  }
  return null;
}

function resolveDynamicTarget(target: string, element?: Element): string {
  if (target !== "@dynamic-id" || !element) return target;
  const linked = element.getAttribute("data-p") || element.getAttribute("data-target") || element.getAttribute("aria-controls");
  return linked ? `#${linked.replace(/^#/, "")}` : target;
}

function resolveRelativeTransitionTarget(target: string, triggerSelector: string): string {
  if (target === "@trigger") return triggerSelector;
  if (!target.startsWith("@trigger ")) return target;
  return `${triggerSelector}${target.slice("@trigger".length)}`;
}

function mergeInteraction(items: Interaction[], interaction: Interaction): void {
  const baseTrigger = interaction.trigger.replace(/:not\([^)]*\)/g, "");
  const existing = items.find((item) => item.event === interaction.event && (item.trigger === interaction.trigger || item.trigger.replace(/:not\([^)]*\)/g, "") === baseTrigger));
  if (!existing) { items.push(interaction); return; }
  existing.mutationTargets = [...new Set([...(existing.mutationTargets ?? []), ...(interaction.mutationTargets ?? [])])];
  existing.stateMutations = [...new Set([...(existing.stateMutations ?? []), ...(interaction.stateMutations ?? [])])];
  existing.stateTransitions = [...(existing.stateTransitions ?? []), ...(interaction.stateTransitions ?? [])].filter((item, index, items) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);
  existing.dataDependencies = [...new Set([...(existing.dataDependencies ?? []), ...(interaction.dataDependencies ?? [])])];
  existing.analysis = "ast";
  existing.confidence = Math.max(existing.confidence ?? 0, interaction.confidence ?? 0);
}

export function extractScriptInteractions(script: string, document: Document, stableSelector: (element: Element) => string): ScriptInteractionExtraction {
  let ast: AnyNode;
  try { ast = parse(script, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true }) as AnyNode; }
  catch (scriptError) {
    try { ast = parse(script, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }) as AnyNode; }
    catch (moduleError) { return { interactions: [], parsed: false, parseError: `${scriptError instanceof Error ? scriptError.message : scriptError}; ${moduleError instanceof Error ? moduleError.message : moduleError}` }; }
  }
  const context: ExtractionContext = { document, stableSelector, ast, bindings: new Map(), bindingRecords: new Map(), parameterBindingCache: new Map(), dataNames: new Set(), functions: new Map() };
  collectBindings(ast, context);
  const interactions: Interaction[] = [];
  fullAncestor(ast, (node: any, _state, ancestors) => {
    const registration = eventHandler(node);
    if (!registration) return;
    const resolvedHandler = resolveFunction(registration.handler, context) ?? registration.handler;
    const delegated = delegatedTriggerBindings(resolvedHandler);
    const registrationBinding = queryBinding(registration.receiver, context, ancestors);
    const globalBindings: DelegatedTrigger[] = registration.receiver?.type === "Identifier" && registration.receiver.name === "window"
      ? registration.event === "scroll-call"
        ? [{ binding: { selector: "[data-scroll-call]", kind: "collection" } }]
        : [{ binding: { selector: "html", kind: "single" } }]
      : [];
    const triggers: DelegatedTrigger[] = delegated.length ? delegated : registrationBinding ? [{ binding: registrationBinding }] : globalBindings;
    if (!triggers.length) return;
    for (const delegatedTrigger of triggers) {
      const triggerBinding = delegatedTrigger.binding;
      const handlerContext: ExtractionContext = { ...context, bindings: new Map(context.bindings), functions: new Map(context.functions) };
      if (resolvedHandler?.params?.[0]?.type === "Identifier") handlerContext.bindings.set(resolvedHandler.params[0].name, { selector: "@trigger", kind: "single" });
      if (registration.receiver?.type === "Identifier" && !["window", "document"].includes(registration.receiver.name)) handlerContext.bindings.set(registration.receiver.name, { selector: "@trigger", kind: "single" });
      if (delegatedTrigger.variable) handlerContext.bindings.set(delegatedTrigger.variable, { selector: "@trigger", kind: "single" });
      const handlerAncestors = [...ancestors, resolvedHandler].filter(Boolean) as AnyNode[];
      const evidence = collectHandlerEvidence(resolvedHandler, script, handlerAncestors, handlerContext, new Set(), 0, delegatedTrigger.variable);
      for (const { selector, element } of selectorElements(triggerBinding, context)) {
        const mutationTargets = (evidence.mutationTargets ?? []).map((target) => resolveRelativeTransitionTarget(resolveDynamicTarget(target, element), selector));
        const stateTransitions = (evidence.stateTransitions ?? []).map((transition) => ({ ...transition, target: resolveRelativeTransitionTarget(resolveDynamicTarget(transition.target, element), selector) }));
        const target = mutationTargets.find((item) => item !== selector && item !== "@dynamic-id");
        mergeInteraction(interactions, {
          trigger: selector,
          event: registration.event,
          action: evidence.stateMutations?.[0] || `AST event handler for ${registration.event}`,
          target,
          mutationTargets,
          stateMutations: evidence.stateMutations,
          stateTransitions,
          dataDependencies: evidence.dataDependencies,
          source: "script-assignment",
          analysis: "ast",
          lifecycle: ["resize", "orientationchange", "scroll", "scrollend", "scroll-call", "load", "error", "DOMContentLoaded"].includes(registration.event),
          confidence: triggerBinding.kind === "dynamic" ? 0.72 : 0.94,
          fingerprint: `${registration.event}|${selector}|script-assignment`,
        });
      }
    }
  });
  return { interactions, parsed: true };
}
