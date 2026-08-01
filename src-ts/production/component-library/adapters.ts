import { sha256, type ComponentLibraryBuildPlan, type ComponentLibraryBuildPlanInput, type ComponentLibraryDataBinding, type ComponentLibraryInteractionBinding } from "./contract.js";
import { createComponentLibraryBuildPlan } from "./planner.js";
import type { ComponentPlanningReport } from "../../planning/components.js";
import type { VisualTargetPlan } from "../../planning/visual-target-plan.js";
import type { SfcStateResponsibility } from "../../planning/sfc-state-responsibility.js";
import type { DataSurfaceManifest } from "../../skills/data-surface-manifest/contract.js";
import { executeReviewedStateWrite } from "./interaction-executor.js";
import { materializeOwnerSourceStyles } from "../../planning/scoped-style-materializer.js";
import { compilePrimitiveDom } from "../../planning/primitive-dom-compiler.js";
import type { PrimitiveDomCompilationGraph } from "../../skills/primitive-dom.js";
import type { PrimitiveDomNode } from "../../planning/primitive-dom-compiler.js";

export interface ComponentLibraryProjectionOptions {
  readonly sourceRoot: string;
  readonly libraryName: string;
  readonly packageName: string;
}

export interface PrimitiveDomProjectionOptions extends ComponentLibraryProjectionOptions {
  readonly additionalStyleCss?: string;
  readonly additionalReviewReasons?: readonly string[];
}

function packageSlug(value: string): string {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "component-library";
}

function json(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

function nodeChildren(nodes: readonly PrimitiveDomNode[], node: PrimitiveDomNode): PrimitiveDomNode[] {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const orderedIds = node.content.filter((token): token is { kind: "node"; nodeId: string } => token.kind === "node").map((token) => token.nodeId);
  const contentChildren = orderedIds.map((id) => byId.get(id)).filter((candidate): candidate is PrimitiveDomNode => Boolean(candidate));
  const listed = new Set(contentChildren.map((candidate) => candidate.id));
  const implicitChildren = nodes.filter((candidate) => candidate.parentId === node.id && !listed.has(candidate.id)).sort((left, right) => left.order - right.order);
  return [...contentChildren, ...implicitChildren];
}

function serializedNode(node: PrimitiveDomNode, nodes: readonly PrimitiveDomNode[]): Record<string, unknown> {
  return {
    id: node.id,
    renderTag: node.renderTag || "div",
    componentName: node.componentName,
    classes: node.classes,
    attributes: node.attributes,
    inlineStyle: node.inlineStyle,
    conditions: node.conditions,
    conditionDirective: node.conditionDirective,
    loops: node.loops,
    content: node.content.filter((token): token is { kind: "text"; value: string } => token.kind === "text"),
    children: nodeChildren(nodes, node).map((child) => serializedNode(child, nodes)),
  };
}

function primitiveRuntime(namespace: string, graph: PrimitiveDomCompilationGraph): string {
  const components = graph.components.map((component) => ({
    id: component.componentId,
    name: component.componentName,
    roots: component.compilation.roots.map((root) => component.compilation.nodes.find((node) => node.id === root)).filter(Boolean).map((node) => serializedNode(node!, component.compilation.nodes)),
  }));
  return `/* Generated from reviewed Primitive DOM evidence. No business data is embedded. */
(function (global) {
  "use strict";
  var COMPONENTS = JSON.parse(${JSON.stringify(JSON.stringify(components))});
  var INTERACTION_CONFIG = { initialState: {}, bindings: [], dataBindings: [] }; /*__UI_DISMANTLER_INTERACTION_CONFIG__*/
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function pathParts(path) { return String(path || "").replace(/^this\\./, "").replace(/\\.value$/, "").split(".").filter(Boolean); }
  function readPath(state, path) {
    var current = state; var parts = pathParts(path);
    for (var i = 0; i < parts.length; i += 1) { if (!current || typeof current !== "object") return undefined; current = current[parts[i]]; }
    return current;
  }
  function writePath(state, path, value) {
    var parts = pathParts(path); if (!parts.length) return;
    var current = state;
    for (var i = 0; i < parts.length - 1; i += 1) { if (!current[parts[i]] || typeof current[parts[i]] !== "object") current[parts[i]] = {}; current = current[parts[i]]; }
    current[parts[parts.length - 1]] = value;
  }
  function resolveValue(expression, state, data, scope) {
    var value = String(expression || "").trim().replace(/^\\+/, "");
    if ((value.charAt(0) === "\\\"" && value.charAt(value.length - 1) === "\\\"") || (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) return value.slice(1, -1);
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (/^-?\\d+(?:\\.\\d+)?$/.test(value)) return Number(value);
    var scopeValue = readPath(scope || {}, value); if (scopeValue !== undefined) return scopeValue;
    var dataValue = readPath(data || {}, value); if (dataValue !== undefined) return dataValue;
    return readPath(state || {}, value);
  }
  function evaluate(expression, state, data, scope) {
    var value = String(expression || "").trim();
    if (!value) return true;
    if (value.charAt(0) === "!") return !evaluate(value.slice(1), state, data, scope);
    var equality = value.match(/^(.+?)\\s*(!==|===|!=|==)\\s*(true|false|null|-?\\d+(?:\\.\\d+)?|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')$/);
    if (equality) { var left = resolveValue(equality[1], state, data, scope); var rightText = equality[3]; var right = rightText === "true" ? true : rightText === "false" ? false : rightText === "null" ? null : /^-?\\d/.test(rightText) ? Number(rightText) : rightText.slice(1, -1); return equality[2] === "===" || equality[2] === "==" ? left === right : left !== right; }
    if (/\\s+&&\\s+/.test(value)) return value.split(/\\s+&&\\s+/).every(function (part) { return evaluate(part, state, data, scope); });
    if (/\\s+\\|\\|\\s+/.test(value)) return value.split(/\\s+\\|\\|\\s+/).some(function (part) { return evaluate(part, state, data, scope); });
    return Boolean(resolveValue(value, state, data, scope));
  }
  function interpolate(text, state, data, scope) { return String(text).replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, function (_match, expression) { var value = resolveValue(expression, state, data, scope); return value === undefined || value === null ? "" : String(value); }); }
  function setAttributes(element, attributes, state, data, scope) {
    Object.keys(attributes || {}).forEach(function (name) {
      var value = attributes[name];
      if (name.indexOf("@") === 0 || name.indexOf("v-") === 0 || name.indexOf("#") === 0) {
        if (name === "v-model") { var model = resolveValue(value, state, data, scope); if (model !== undefined && "value" in element) element.value = String(model); }
        return;
      }
      if (name.indexOf(":") === 0) {
        var dynamicName = name.slice(1); var dynamicValue = resolveValue(value, state, data, scope);
        if (dynamicValue === undefined || dynamicValue === null || dynamicValue === false) return;
        if (dynamicName === "class" && typeof dynamicValue === "string") dynamicValue.split(/\\s+/).forEach(function (className) { if (className) element.classList.add(className); });
        else if (dynamicValue === true) element.setAttribute(dynamicName, "");
        else if (["string", "number", "boolean"].includes(typeof dynamicValue)) element.setAttribute(dynamicName, String(dynamicValue));
        return;
      }
      if (name === "class" || name === "className") return;
      if (value === true) element.setAttribute(name, "");
      else if (value !== false && value != null) element.setAttribute(name, String(value));
    });
  }
  function renderOne(spec, state, data, scope) {
    var directive = spec.conditionDirective;
    if (directive && directive.expression && (directive.kind === "if" || directive.kind === "else-if") && !evaluate(directive.expression, state, data, scope)) return null;
    var element = document.createElement(spec.renderTag || "div");
    element.setAttribute("data-primitive-node", spec.id);
    (spec.classes || []).forEach(function (name) { element.classList.add(name); });
    setAttributes(element, spec.attributes, state, data, scope);
    Object.keys(spec.inlineStyle || {}).forEach(function (name) { element.style.setProperty(name, spec.inlineStyle[name]); });
    if (directive && directive.kind === "show" && directive.expression && !evaluate(directive.expression, state, data, scope)) element.hidden = true;
    (spec.content || []).forEach(function (token) { element.appendChild(document.createTextNode(interpolate(token.value, state, data, scope))); });
    (spec.children || []).forEach(function (child) { render(child, state, data, scope).forEach(function (rendered) { element.appendChild(rendered); }); });
    return element;
  }
  function parseLoop(value) {
    var match = String(value || "").match(/^\\s*(?:\\(\\s*([A-Za-z_$][\\w$]*)(?:\\s*,\\s*([A-Za-z_$][\\w$]*))?(?:\\s*,\\s*([A-Za-z_$][\\w$]*))?\\s*\\)|([A-Za-z_$][\\w$]*))\\s+(?:in|of)\\s+(.+?)\\s*$/);
    if (!match) return null;
    var source = match[5].trim();
    if (!/^\\+?(?:-?\\d+(?:\\.\\d+)?|(?:this\\.)?[A-Za-z_$][\\w$]*(?:\\.value)?(?:\\.[A-Za-z_$][\\w$]*)*)$/.test(source)) return null;
    return { item: match[1] || match[4], second: match[2] || null, third: match[3] || null, source: source };
  }
  function collection(value) {
    if (Array.isArray(value)) return value.map(function (item, index) { return { value: item, index: index, key: index, kind: "array" }; });
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Array.from({ length: Math.floor(value) }, function (_unused, index) { return { value: index + 1, index: index, key: index, kind: "number" }; });
    if (value && typeof value === "object") return Object.keys(value).map(function (key, index) { return { value: value[key], index: index, key: key, kind: "object" }; });
    return [];
  }
  function render(spec, state, data, scope) {
    var loopValues = spec.loops || [];
    var loop = loopValues.length === 1 ? parseLoop(loopValues[0]) : null;
    if (!loop) { if (loopValues.length) return []; var single = renderOne(spec, state, data, scope || {}); return single ? [single] : []; }
    var source = resolveValue(loop.source, state, data, scope || {});
    return collection(source).flatMap(function (entry) {
      var local = Object.assign({}, scope || {}); local[loop.item] = entry.value;
      if (loop.second) local[loop.second] = entry.kind === "object" ? entry.key : entry.index;
      if (loop.third) local[loop.third] = entry.index;
      var rendered = renderOne(spec, state, data, local); return rendered ? [rendered] : [];
    });
  }
  function resolveComponent(options) { var requested = options && options.componentId; return COMPONENTS.filter(function (component) { return !requested || component.id === requested; })[0] || COMPONENTS[0]; }
  function applyTransition(instance, binding) {
    var transition = binding.executionEvidence;
    if (!transition || transition.status !== "verified" || !transition.transitionKind || !transition.mutationTarget) return false;
    var current = readPath(instance.state, transition.mutationTarget);
    if (transition.transitionKind === "set-literal") writePath(instance.state, transition.mutationTarget, transition.transitionValue);
    else if (transition.transitionKind === "toggle-boolean" && typeof current === "boolean") writePath(instance.state, transition.mutationTarget, !current);
    else if (transition.transitionKind === "increment" && typeof current === "number") writePath(instance.state, transition.mutationTarget, current + 1);
    else if (transition.transitionKind === "decrement" && typeof current === "number") writePath(instance.state, transition.mutationTarget, current - 1);
    else return false;
    return true;
  }
  function bindInteractions(instance) {
    (INTERACTION_CONFIG.bindings || []).forEach(function (binding) {
      if (!binding.sourceNodeId || !binding.event) return;
      instance.root.querySelectorAll('[data-primitive-node="' + binding.sourceNodeId.replace(/"/g, '\\"') + '"]').forEach(function (target) {
        target.addEventListener(binding.event, function (event) {
          if ((binding.modifiers || []).indexOf("prevent") >= 0) event.preventDefault();
          if ((binding.modifiers || []).indexOf("stop") >= 0) event.stopPropagation();
          if (!applyTransition(instance, binding)) return;
          renderInto(instance);
          instance.root.dispatchEvent(new CustomEvent("ui-dismantler:state-change", { detail: { target: binding.executionEvidence.mutationTarget } }));
        });
      });
    });
  }
  function renderInto(instance) {
    var component = instance.component;
    while (instance.root.firstChild) instance.root.removeChild(instance.root.firstChild);
    if (component) component.roots.forEach(function (child) { render(child, instance.state, instance.data, {}).forEach(function (rendered) { instance.root.appendChild(rendered); }); });
    bindInteractions(instance);
  }
  function create(options) {
    var settings = options || {}; var component = resolveComponent(settings); var root = document.createElement("section");
    root.className = "sg-component-library"; root.setAttribute("data-component-id", component ? component.id : "unresolved");
    var instance = { root: root, component: component, state: clone(INTERACTION_CONFIG.initialState || {}), data: settings.data || {} };
    if (settings.state && typeof settings.state === "object") Object.keys(settings.state).forEach(function (key) { instance.state[key] = settings.state[key]; });
    renderInto(instance);
    instance.unmount = function () { if (root.parentNode) root.parentNode.removeChild(root); };
    return instance;
  }
  var API = { components: COMPONENTS.map(function (component) { return { id: component.id, name: component.name }; }), create: create, mount: function (container, options) { if (!container) throw new Error("mount requires a container"); var instance = create(options || {}); container.appendChild(instance.root); return instance; } };
  global.${namespace} = API;
})(window);
`;
}

function primitiveStyles(graph: PrimitiveDomCompilationGraph, additionalStyleCss = ""): string {
  const rules = graph.components.flatMap((component) => component.compilation.styleRules).map((rule) => {
    const declarations = Object.entries(rule.declarations).map(([name, value]) => `${name}:${value}`).join(";");
    return `${rule.selector}{${declarations}}${rule.media ? `@media ${rule.media}{${rule.selector}{${declarations}}}` : ""}`;
  });
  return `:root{--sg-primary:#409eff;--sg-ink:#303133;--sg-muted:#909399;--sg-line:#dcdfe6;--sg-paper:#fff}
.sg-component-library{box-sizing:border-box;color:var(--sg-ink);background:var(--sg-paper);font-family:Arial,sans-serif;min-width:0}
.sg-component-library *{box-sizing:border-box}
${rules.join("\n")}
${additionalStyleCss}
@media (max-width:500px){.sg-component-library{max-width:100%;overflow-x:auto}}
@media (max-width:320px){.sg-component-library{font-size:14px}}
`;
}

function primitiveExample(namespace: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Component Library Template</title><link rel="stylesheet" href="../src/${packageSlug(namespace)}.css"></head><body><div id="mount"></div><script src="../src/${packageSlug(namespace)}.js"></script><script>${namespace}.mount(document.getElementById("mount"), {});</script></body></html>\n`;
}

function primitiveReadme(name: string, namespace: string): string {
  return `# ${name}\n\nThis component library was generated from reviewed Primitive DOM evidence.\n\n## API\n\n\`${namespace}.mount(container, options)\`\n\nBusiness data is not embedded in the publishable runtime.\n`;
}

export async function primitiveDomCompilationToBuildPlan(
  graph: PrimitiveDomCompilationGraph,
  options: PrimitiveDomProjectionOptions,
): Promise<ComponentLibraryBuildPlan> {
  const namespace = options.libraryName.replace(/[^A-Za-z0-9_$]/g, "") || "ComponentLibrary";
  const fileBase = packageSlug(namespace);
  const unresolved = [...graph.reviewReasons, ...(options.additionalReviewReasons ?? [])];
  for (const component of graph.components) {
    for (const node of component.compilation.nodes) {
      if (node.conditions.length) unresolved.push(`${component.componentName}:${node.id} conditional region requires state materialization`);
      if (node.loops.length) unresolved.push(`${component.componentName}:${node.id} repeated region requires reviewed collection binding`);
    }
    if (component.compilation.interactions.length) unresolved.push(`${component.componentName} interaction bindings require state transition execution evidence`);
  }
  const input: ComponentLibraryBuildPlanInput = {
    schemaVersion: "1.0",
    sourceRoot: options.sourceRoot,
    sourceHash: sha256(JSON.stringify(graph)),
    library: { name: options.libraryName, packageName: options.packageName },
    interactions: graph.components.flatMap((component) => component.compilation.interactions.map((binding): ComponentLibraryInteractionBinding => ({
      id: `${component.componentName}:${binding.sourceNodeId}:${binding.event}`,
      sourceNodeId: component.compilation.nodes.find((node) => node.sourceNodeId === binding.sourceNodeId)?.id ?? binding.sourceNodeId,
      event: binding.event,
      expression: binding.expression,
      target: binding.target,
      reviewed: false,
      materialized: false,
      provenance: [{ kind: "primitive-dom", reference: "primitive-dom-interaction-binding" }],
    }))),
    files: [
      { path: "package.json", role: "package-metadata", content: JSON.stringify({ name: options.packageName, version: "0.0.0", private: true, main: `src/${fileBase}.js`, style: `src/${fileBase}.css`, files: ["src", "README.md", "docs"] }, null, 2) + "\n", publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: `src/${fileBase}.js`, role: "runtime", content: primitiveRuntime(namespace, graph), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "primitive-dom", reference: "primitive-dom-compilation-graph" }] },
      { path: `src/${fileBase}.css`, role: "style", content: primitiveStyles(graph, options.additionalStyleCss), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "primitive-dom", reference: "primitive-style-rules" }] },
      { path: "README.md", role: "documentation", content: primitiveReadme(options.libraryName, namespace), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: "docs/设计规范.md", role: "documentation", content: "# 设计规范\n\n## 主题色\n\n组件使用 `--sg-*` 主题变量。\n", publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: "examples/template.html", role: "example", content: primitiveExample(namespace), publish: false, reviewed: true, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
    ],
    smoke: { runtimePath: `src/${fileBase}.js`, globalName: namespace, mountMethod: "mount", hostSelector: "#mount", options: {}, cleanupRequired: true },
    unresolved,
  };
  return await createComponentLibraryBuildPlan(input, options.sourceRoot);
}

interface ParsedCollectionLoop {
  readonly aliases: readonly string[];
  readonly source: string;
  readonly normalizedSource: string;
  readonly literalCardinality: boolean;
}

function parseCollectionLoop(loop: string): ParsedCollectionLoop | undefined {
  const match = loop.match(/^\s*(?:\(\s*([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*\)|([A-Za-z_$][\w$]*))\s+(?:in|of)\s+(.+?)\s*$/);
  if (!match) return undefined;
  const source = match[5].trim();
  const literalCardinality = /^\+?\d+(?:\.\d+)?$/.test(source);
  const pathSource = /^\+?(?:this\.)?[A-Za-z_$][\w$]*(?:\.value)?(?:\.[A-Za-z_$][\w$]*)*$/.test(source);
  if (!literalCardinality && !pathSource) return undefined;
  return {
    aliases: [match[1] ?? match[4], match[2], match[3]].filter((alias): alias is string => Boolean(alias)),
    source,
    normalizedSource: source.replace(/^\+/, "").replace(/^this\./, "").replace(/\.value(?=\.|$)/, ""),
    literalCardinality,
  };
}

function collectionBindingsCoverLoops(graph: PrimitiveDomCompilationGraph, bindings: readonly ComponentLibraryDataBinding[]): boolean {
  const loops = graph.components.flatMap((component) => component.compilation.nodes.flatMap((node) => node.loops.map((loop) => ({ componentId: component.componentId, loop: parseCollectionLoop(loop) }))));
  if (loops.length === 0) return true;
  const reviewedProps = bindings.filter((binding) => binding.materialized && binding.reviewed && binding.sourceKind === "component-prop");
  return loops.every(({ componentId, loop }) => {
    if (!loop) return false;
    if (loop.literalCardinality) return true;
    return reviewedProps.some((binding) => {
      if (binding.ownerId !== componentId) return false;
      const target = binding.targetBinding.replace(/^this\./, "").replace(/\.value(?=\.|$)/, "");
      return loop.normalizedSource === target || loop.normalizedSource.startsWith(`${target}.`);
    });
  });
}

function handlerName(expression: string): string | undefined {
  return expression.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:\([^)]*\))?$/)?.[1];
}

function scalarStateForBindings(state: SfcStateResponsibility["initialState"], bindings: readonly ComponentLibraryInteractionBinding[]): Record<string, import("../../types.js").JsonValue> {
  const output: Record<string, import("../../types.js").JsonValue> = {};
  const normalize = (path: string): string[] => path.replace(/^this\./, "").replace(/\.value$/, "").split(".").filter(Boolean);
  const read = (path: string): import("../../types.js").JsonValue | undefined => {
    let current: import("../../types.js").JsonValue = state;
    for (const part of normalize(path)) {
      if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, import("../../types.js").JsonValue>)[part];
    }
    return current;
  };
  const write = (path: string, value: import("../../types.js").JsonValue): void => {
    const parts = normalize(path); let current = output;
    for (const part of parts.slice(0, -1)) { if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) current[part] = {}; current = current[part] as Record<string, import("../../types.js").JsonValue>; }
    if (parts.length) current[parts.at(-1)!] = value;
  };
  for (const binding of bindings) {
    const target = binding.executionEvidence?.mutationTarget;
    if (!target) continue;
    const value = read(target);
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) write(target, value as import("../../types.js").JsonValue);
  }
  return output;
}

function injectInteractionRuntime(
  plan: ComponentLibraryBuildPlan,
  interactions: readonly ComponentLibraryInteractionBinding[],
  dataBindings: readonly ComponentLibraryDataBinding[],
  state: SfcStateResponsibility["initialState"],
): { files: ComponentLibraryBuildPlan["files"]; interactions: ComponentLibraryInteractionBinding[]; dataBindings: ComponentLibraryDataBinding[]; runtimePatched: boolean } {
  const runtimeIndex = plan.files.findIndex((file) => file.role === "runtime" && file.content.includes("/*__UI_DISMANTLER_INTERACTION_CONFIG__*/"));
  if (runtimeIndex < 0) return { files: plan.files, interactions: [...interactions], dataBindings: [...dataBindings], runtimePatched: false };
  const materializableInteractions = interactions.filter((binding) => binding.sourceNodeId && binding.executionEvidence?.status === "verified" && binding.reviewed);
  const materializableData = dataBindings.filter((binding) => binding.sourceKind === "component-prop" && binding.reviewed && !binding.materialized);
  if (materializableInteractions.length === 0 && materializableData.length === 0) return { files: plan.files, interactions: [...interactions], dataBindings: [...dataBindings], runtimePatched: false };
  const materializedInteractions = interactions.map((binding) => materializableInteractions.includes(binding) ? { ...binding, materialized: true } : binding);
  const materializedDataBindings = dataBindings.map((binding) => materializableData.includes(binding) ? { ...binding, materialized: true } : binding);
  const config = {
    initialState: scalarStateForBindings(state, materializedInteractions),
    bindings: materializedInteractions.filter((binding) => binding.materialized),
    dataBindings: materializedDataBindings.filter((binding) => binding.materialized).map((binding) => ({ id: binding.id, targetBinding: binding.targetBinding, sourceKind: binding.sourceKind })),
  };
  const files = [...plan.files];
  const runtime = files[runtimeIndex];
  const content = runtime.content.replace(/var INTERACTION_CONFIG = \{ initialState: \{\}, bindings: \[\], dataBindings: \[\] \}; \/\*__UI_DISMANTLER_INTERACTION_CONFIG__\*\//, `var INTERACTION_CONFIG = JSON.parse(${JSON.stringify(JSON.stringify(config))}); /*__UI_DISMANTLER_INTERACTION_CONFIG__*/`);
  files[runtimeIndex] = { ...runtime, content, contentHash: sha256(content) };
  return { files, interactions: materializedInteractions, dataBindings: materializedDataBindings, runtimePatched: content !== runtime.content };
}

export function enrichComponentLibraryBuildPlan(
  plan: ComponentLibraryBuildPlan,
  evidence: { readonly state?: SfcStateResponsibility; readonly dataSurface?: DataSurfaceManifest; readonly primitiveGraph?: PrimitiveDomCompilationGraph },
): ComponentLibraryBuildPlan {
  let interactions: ComponentLibraryInteractionBinding[] = [...plan.interactions];
  const dataBindings: ComponentLibraryDataBinding[] = [...plan.dataBindings];
  let unresolved = [...plan.unresolved];
  let files = [...plan.files];
  if (evidence.state) {
    unresolved.push(...evidence.state.reviewReasons.map((reason) => `state-responsibility: ${reason}`));
    unresolved.push(...evidence.state.unresolvedWrites.map((write) => `state-responsibility unresolved write ${write.handler}:${write.path}`));
    const mappedHandlers = new Set<string>();
    interactions = interactions.flatMap((binding) => {
      const name = handlerName(binding.expression);
      const handler = name ? evidence.state!.handlers.find((candidate) => candidate.handler === name) : undefined;
      if (!handler) return [binding];
      mappedHandlers.add(handler.handler);
      return handler.writes.map((write, index): ComponentLibraryInteractionBinding => {
        const execution = executeReviewedStateWrite(write, evidence.state!.initialState);
        return {
          ...binding,
          id: `${binding.id}:${write.path}:${index}`,
          target: write.path,
          reviewed: write.confidence === "high",
          materialized: false,
          executionEvidence: {
            status: execution.status === "materialized" ? "verified" : "blocked",
            ...(execution.transition ? { transitionKind: execution.transition.kind } : {}),
            ...(execution.mutationTarget ? { mutationTarget: execution.mutationTarget } : {}),
            ...(execution.transition?.value !== undefined ? { transitionValue: execution.transition.value } : {}),
            blockers: execution.blockers,
          },
          provenance: [...binding.provenance, { kind: "state-responsibility", reference: `handler:${handler.handler}:line:${handler.sourceLine}` }],
        };
      });
    });
    for (const handler of evidence.state.handlers.filter((candidate) => !mappedHandlers.has(candidate.handler))) {
      for (const write of handler.writes) {
        const execution = executeReviewedStateWrite(write, evidence.state.initialState);
        interactions.push({
          id: `state:${handler.handler}:${write.path}`,
          event: "state-write",
          expression: write.expression,
          target: write.path,
          reviewed: write.confidence === "high",
          materialized: false,
          executionEvidence: {
            status: execution.status === "materialized" ? "verified" : "blocked",
            ...(execution.transition ? { transitionKind: execution.transition.kind } : {}),
            ...(execution.mutationTarget ? { mutationTarget: execution.mutationTarget } : {}),
            ...(execution.transition?.value !== undefined ? { transitionValue: execution.transition.value } : {}),
            blockers: execution.blockers,
          },
          provenance: [{ kind: "state-responsibility", reference: `handler:${handler.handler}:line:${handler.sourceLine}` }],
        });
      }
    }
  }
  if (evidence.dataSurface) {
    unresolved.push(...evidence.dataSurface.unresolved.map((item) => `data-surface: ${item.reason}`));
    unresolved.push(...evidence.dataSurface.surfaces.flatMap((surface) => surface.unresolved.map((reason) => `data-surface:${surface.id}: ${reason}`)));
    for (const surface of evidence.dataSurface.surfaces) {
      const sourceKind = surface.source.stateInitial ? "state-initial" : surface.source.primary;
      dataBindings.push({
        id: surface.id,
        ownerId: surface.owner.componentId,
        sourceKind,
        targetBinding: surface.injection.target,
        fields: surface.fields.map((field) => field.path),
        shape: { kind: surface.shape.kind, itemKind: surface.shape.itemKind, cardinality: surface.shape.cardinality },
        reviewed: !surface.reviewRequired && surface.injection.reviewed,
        materialized: surface.source.primary === "component-prop" && !surface.reviewRequired && surface.injection.reviewed,
        externalOnly: true,
        provenance: [{ kind: "data-surface-manifest", reference: surface.id }],
      });
    }
  }
  if (evidence.state || evidence.dataSurface) {
    const injected = injectInteractionRuntime(plan, interactions, dataBindings, evidence.state?.initialState ?? {});
    files = [...injected.files];
    interactions = injected.interactions;
    dataBindings.splice(0, dataBindings.length, ...injected.dataBindings);
    if (interactions.length > 0 && interactions.every((binding) => binding.materialized)) {
      unresolved = unresolved.filter((reason) => !reason.includes("interaction bindings require state transition execution evidence"));
    }
  }
  const primitiveGraphMatchesPlan = evidence.primitiveGraph ? plan.identity.sourceHash === sha256(JSON.stringify(evidence.primitiveGraph)) : false;
  if (evidence.primitiveGraph && !primitiveGraphMatchesPlan) unresolved.push("primitive-dom: graph identity does not match build plan sourceHash");
  const loopsReady = evidence.primitiveGraph ? primitiveGraphMatchesPlan && collectionBindingsCoverLoops(evidence.primitiveGraph, dataBindings) : true;
  if (loopsReady) unresolved = unresolved.filter((reason) => !reason.includes("repeated region requires reviewed collection binding") && !reason.includes("v-for cardinality requires data-source evidence"));
  const bindingsReady = interactions.every((binding) => binding.reviewed && binding.materialized) && dataBindings.every((binding) => binding.reviewed && binding.materialized) && loopsReady;
  const reviewRequired = unresolved.length > 0 || !bindingsReady;
  if (!reviewRequired) files = files.map((file) => ["runtime", "style", "package-metadata", "documentation"].includes(file.role) ? { ...file, reviewed: true } : file);
  const configurationHash = sha256(JSON.stringify({ base: plan.identity.configurationHash, files: files.map((file) => ({ path: file.path, contentHash: file.contentHash, reviewed: file.reviewed })), interactions, dataBindings, unresolved }));
  return {
    ...plan,
    identity: { ...plan.identity, configurationHash },
    files,
    interactions,
    dataBindings,
    unresolved,
    reviewRequired,
  };
}

export async function visualTargetPlanToBuildPlan(
  plan: VisualTargetPlan,
  options: ComponentLibraryProjectionOptions,
): Promise<ComponentLibraryBuildPlan> {
  const styleReports = plan.owners.map((owner) => materializeOwnerSourceStyles(owner));
  const compilationComponents = plan.owners.map((owner) => {
    const compilation = compilePrimitiveDom(owner.templateStructure, owner.id);
    return {
      componentId: owner.componentId,
      componentName: owner.componentName,
      componentFile: owner.sourceFile,
      compilation,
      reviewRequired: true,
    };
  });
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0",
    kind: "primitive-dom-compilation-graph",
    components: compilationComponents,
    metrics: {
      components: compilationComponents.length,
      sourceNodes: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.sourceNodes, 0),
      compiledNodes: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.compiledNodes, 0),
      primitiveNodes: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.primitiveNodes, 0),
      inlineStyleRules: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.inlineStyleRules, 0),
      responsiveRules: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.responsiveRules, 0),
      interactionBindings: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.interactionBindings, 0),
      unsupportedPrimitiveNodes: compilationComponents.reduce((sum, item) => sum + item.compilation.metrics.unsupportedPrimitiveNodes, 0),
    },
    reviewReasons: [
      "VisualTargetPlan is review-only and generatedCode is false",
      ...plan.reviewReasons,
      ...plan.owners.flatMap((owner) => owner.reviewReasons.map((reason) => `${owner.componentName}: ${reason}`)),
      ...styleReports.flatMap((report) => report.reviewReasons),
    ],
    reviewRequired: true,
  };
  return await primitiveDomCompilationToBuildPlan(graph, {
    ...options,
    additionalStyleCss: styleReports.map((report) => report.css).filter(Boolean).join("\n"),
    additionalReviewReasons: [
      `visual target plan contains ${plan.boundaries.length} reviewed route boundary/boundaries`,
      `visual target plan contains ${plan.owners.length} visual owner(s)`,
    ],
  });
}

export async function componentPlanningReportToBuildPlan(
  report: ComponentPlanningReport,
  options: ComponentLibraryProjectionOptions,
): Promise<ComponentLibraryBuildPlan> {
  const unresolved = [
    "ComponentPlanningReport does not contain executable DOM topology or publishable style materialization",
    "ComponentPlanningReport requires a reviewed component materializer before runtime generation",
    ...report.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}: ${issue.detail}`),
  ];
  const input: ComponentLibraryBuildPlanInput = {
    schemaVersion: "1.0",
    sourceRoot: options.sourceRoot,
    sourceHash: sha256(JSON.stringify(report)),
    library: { name: options.libraryName, packageName: options.packageName },
    files: [
      { path: "package.json", role: "package-metadata", content: JSON.stringify({ name: options.packageName, version: "0.0.0", private: true, files: ["src", "README.md", "docs"] }, null, 2) + "\n", publish: true, reviewed: false, provenance: [{ kind: "component-plan", reference: "component-planning-report" }] },
      { path: "README.md", role: "documentation", content: `# ${options.libraryName}\n\nThis plan is blocked until component ownership and runtime materialization are reviewed.\n`, publish: true, reviewed: false, provenance: [{ kind: "component-plan", reference: "component-planning-report" }] },
      { path: ".ui-dismantler/component-planning-report.json", role: "evidence", content: JSON.stringify(report, null, 2) + "\n", publish: false, reviewed: true, provenance: [{ kind: "component-plan", reference: "component-planning-report" }] },
    ],
    smoke: { runtimePath: "src/index.js", globalName: "ComponentLibrary", mountMethod: "mount", hostSelector: "#mount", options: {}, cleanupRequired: true },
    unresolved,
  };
  return await createComponentLibraryBuildPlan(input, options.sourceRoot);
}
