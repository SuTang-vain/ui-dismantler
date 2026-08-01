import { sha256, type ComponentLibraryBuildPlan, type ComponentLibraryBuildPlanInput, type ComponentLibraryDataBinding, type ComponentLibraryInteractionBinding, type ComponentLibraryQualityContract } from "./contract.js";
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
import { materializeReviewedComponentStyles, type ReviewedComponentStyleArtifact } from "./style-artifact.js";
import type { ComponentLibraryStateEvidenceMap } from "./state-artifact.js";

export interface ComponentLibraryProjectionOptions {
  readonly sourceRoot: string;
  readonly libraryName: string;
  readonly packageName: string;
  readonly quality?: ComponentLibraryQualityContract;
}

export interface PrimitiveDomProjectionOptions extends ComponentLibraryProjectionOptions {
  readonly additionalStyleCss?: string;
  readonly additionalReviewReasons?: readonly string[];
  readonly styleArtifact?: ReviewedComponentStyleArtifact;
}

export interface ComponentLibraryEnrichmentEvidence {
  readonly state?: SfcStateResponsibility;
  readonly stateMap?: ComponentLibraryStateEvidenceMap;
  readonly dataSurface?: DataSurfaceManifest;
  readonly primitiveGraph?: PrimitiveDomCompilationGraph;
  readonly runtimeOptions?: unknown;
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
  var INTERACTION_CONFIG = { initialState: {}, initialStateByOwner: {}, bindings: [], dataBindings: [] }; /*__UI_DISMANTLER_INTERACTION_CONFIG__*/
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function pathParts(path) { return String(path || "").replace(/^this\\./, "").split(".").filter(Boolean); }
  function statePathParts(path) { return pathParts(path).filter(function (part) { return part !== "value"; }); }
  function readPath(state, path) {
    var current = state; var parts = pathParts(path);
    for (var i = 0; i < parts.length; i += 1) { if (!current || typeof current !== "object") return undefined; current = current[parts[i]]; }
    return current;
  }
  function readStatePath(state, path) {
    var current = state; var parts = statePathParts(path);
    for (var i = 0; i < parts.length; i += 1) { if (!current || typeof current !== "object") return undefined; current = current[parts[i]]; }
    return current;
  }
  function writePath(state, path, value) {
    var parts = statePathParts(path); if (!parts.length) return;
    var current = state;
    for (var i = 0; i < parts.length - 1; i += 1) { if (!current[parts[i]] || typeof current[parts[i]] !== "object") current[parts[i]] = {}; current = current[parts[i]]; }
    current[parts[parts.length - 1]] = value;
  }
  function writeDataPath(data, path, value) {
    var parts = pathParts(path); if (!parts.length) return;
    var current = data;
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
    return readStatePath(state || {}, value);
  }
  function evaluate(expression, state, data, scope) {
    var value = String(expression || "").trim();
    if (!value) return true;
    if (/\\s+\\|\\|\\s+/.test(value)) return value.split(/\\s+\\|\\|\\s+/).some(function (part) { return evaluate(part, state, data, scope); });
    if (/\\s+&&\\s+/.test(value)) return value.split(/\\s+&&\\s+/).every(function (part) { return evaluate(part, state, data, scope); });
    if (value.charAt(0) === "!") return !evaluate(value.slice(1), state, data, scope);
    var equality = value.match(/^(.+?)\\s*(!==|===|!=|==)\\s*(true|false|null|-?\\d+(?:\\.\\d+)?|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')$/);
    if (equality) { var left = resolveValue(equality[1], state, data, scope); var rightText = equality[3]; var right = rightText === "true" ? true : rightText === "false" ? false : rightText === "null" ? null : /^-?\\d/.test(rightText) ? Number(rightText) : rightText.slice(1, -1); return equality[2] === "===" || equality[2] === "==" ? left === right : left !== right; }
    return Boolean(resolveValue(value, state, data, scope));
  }
  function interpolate(text, state, data, scope) { return String(text).replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, function (_match, expression) { var value = resolveValue(expression, state, data, scope); return value === undefined || value === null ? "" : String(value); }); }
  function setAttributes(element, attributes, state, data, scope) {
    var modelPath = null;
    Object.keys(attributes || {}).forEach(function (name) {
      var value = attributes[name];
      if (name.indexOf("@") === 0 || name.indexOf("v-") === 0 || name.indexOf("#") === 0) {
        if (name === "v-model") modelPath = String(value || "").trim();
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
    if (modelPath) {
      var model = resolveValue(modelPath, state, data, scope);
      element.setAttribute("data-ui-dismantler-model", modelPath);
      if ((element.type === "checkbox" || element.type === "radio") && "checked" in element) element.checked = Boolean(model);
      else if (model !== undefined && model !== null && "value" in element) element.value = String(model);
    }
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
    if (!/^\\+?(?:\\d+|(?:this\\.)?[A-Za-z_$][\\w$]*(?:\\.value)?(?:\\.[A-Za-z_$][\\w$]*)*)$/.test(source)) return null;
    return { item: match[1] || match[4], second: match[2] || null, third: match[3] || null, source: source };
  }
  function collection(value) {
    if (Array.isArray(value)) return value.map(function (item, index) { return { value: item, index: index, key: index, kind: "array" }; });
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return Array.from({ length: value }, function (_unused, index) { return { value: index + 1, index: index, key: index, kind: "number" }; });
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
  function bindModels(instance) {
    if (instance.modelsBound) return;
    instance.modelsBound = true;
    function update(event) {
      var target = event.target;
      if (!target || !target.getAttribute || !instance.root.contains(target)) return;
      var path = target.getAttribute("data-ui-dismantler-model");
      if (!path) return;
      var value = target.type === "checkbox" || target.type === "radio" ? Boolean(target.checked) : target.value;
      var nodeId = target.getAttribute("data-primitive-node");
      var selectionStart = typeof target.selectionStart === "number" ? target.selectionStart : null;
      var selectionEnd = typeof target.selectionEnd === "number" ? target.selectionEnd : null;
      writePath(instance.state, path, value);
      renderInto(instance);
      if (nodeId) {
        var replacement = instance.root.querySelector('[data-primitive-node="' + nodeId.replace(/"/g, '\\"') + '"]');
        if (replacement && replacement.focus) {
          replacement.focus();
          if (selectionStart !== null && selectionEnd !== null && replacement.setSelectionRange) replacement.setSelectionRange(selectionStart, selectionEnd);
        }
      }
      instance.root.dispatchEvent(new CustomEvent("ui-dismantler:state-change", { detail: { target: path, source: "v-model" } }));
    }
    instance.root.addEventListener("input", update);
    instance.root.addEventListener("change", update);
  }
  function bindInteractions(instance) {
    (INTERACTION_CONFIG.bindings || []).forEach(function (binding) {
      if (!binding.sourceNodeId || !binding.event) return;
      if (binding.ownerId && instance.component && binding.ownerId !== instance.component.id) return;
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
    bindModels(instance);
  }
  function adapterValueError(binding, value) {
    var shape = binding.shape || {}; var kind = shape.kind;
    if (kind === "collection" && (!value || typeof value !== "object")) return "expected collection";
    if (kind === "record" && (!value || typeof value !== "object" || Array.isArray(value))) return "expected record";
    if (kind === "scalar" && value !== null && typeof value === "object") return "expected scalar";
    if (kind === "collection" && typeof shape.cardinality === "number") {
      var size = Array.isArray(value) ? value.length : Object.keys(value).length;
      if (size !== shape.cardinality) return "expected cardinality " + shape.cardinality + " but received " + size;
    }
    var records = kind === "collection" ? (Array.isArray(value) ? value : Object.keys(value || {}).map(function (key) { return value[key]; })) : [value];
    for (var i = 0; i < records.length; i += 1) {
      for (var j = 0; j < (binding.fields || []).length; j += 1) if (readPath(records[i], binding.fields[j]) === undefined) return "missing field " + binding.fields[j];
    }
    return null;
  }
  function applyAdapters(instance, settings) {
    var adapters = settings.adapters && typeof settings.adapters === "object" ? settings.adapters : {};
    var bindings = (INTERACTION_CONFIG.dataBindings || []).filter(function (binding) { return binding.sourceKind === "reviewed-api-fixture" && (!binding.ownerId || !instance.component || binding.ownerId === instance.component.id); });
    var pending = [];
    bindings.forEach(function (binding) {
      var key = binding.adapterKey || binding.id;
      if (!Object.prototype.hasOwnProperty.call(adapters, key)) { instance.missingAdapters.push(key); return; }
      function accept(value) {
        var error = adapterValueError(binding, value);
        if (error) { instance.adapterErrors.push(key + ": " + error); return; }
        writeDataPath(instance.data, binding.targetBinding, value);
      }
      try {
        var provided = typeof adapters[key] === "function" ? adapters[key]({ id: binding.id, ownerId: binding.ownerId, targetBinding: binding.targetBinding, shape: binding.shape, fields: binding.fields || [] }) : adapters[key];
        if (provided && typeof provided.then === "function") {
          pending.push(Promise.resolve(provided).then(accept).catch(function (error) { instance.adapterErrors.push(String(error && error.message || error)); }));
        } else accept(provided);
      } catch (error) { instance.adapterErrors.push(String(error && error.message || error)); }
    });
    return pending;
  }
  function create(options) {
    var settings = options || {}; var component = resolveComponent(settings); var root = document.createElement("section");
    root.className = "sg-component-library"; root.setAttribute("data-component-id", component ? component.id : "unresolved");
    var ownerState = component && INTERACTION_CONFIG.initialStateByOwner ? INTERACTION_CONFIG.initialStateByOwner[component.id] : undefined;
    var instance = { root: root, component: component, state: clone(ownerState || INTERACTION_CONFIG.initialState || {}), data: clone(settings.data || {}), missingAdapters: [], adapterErrors: [] };
    if (settings.state && typeof settings.state === "object") Object.keys(settings.state).forEach(function (key) { instance.state[key] = settings.state[key]; });
    var pendingAdapters = applyAdapters(instance, settings);
    renderInto(instance);
    instance.ready = pendingAdapters.length ? Promise.all(pendingAdapters).then(function () { renderInto(instance); return instance; }) : Promise.resolve(instance);
    instance.unmount = function () { if (root.parentNode) root.parentNode.removeChild(root); };
    return instance;
  }
  var API = { components: COMPONENTS.map(function (component) { return { id: component.id, name: component.name }; }), dataBindings: (INTERACTION_CONFIG.dataBindings || []).map(function (binding) { return { id: binding.id, ownerId: binding.ownerId, targetBinding: binding.targetBinding, sourceKind: binding.sourceKind, adapterKey: binding.adapterKey || null, fields: binding.fields || [], shape: binding.shape || null }; }), create: create, mount: function (container, options) { if (!container) throw new Error("mount requires a container"); var instance = create(options || {}); container.appendChild(instance.root); return instance; } };
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
  const reviewedStyles = options.styleArtifact ? materializeReviewedComponentStyles(graph, options.styleArtifact) : undefined;
  const unresolved = [...graph.reviewReasons, ...(options.additionalReviewReasons ?? []), ...(reviewedStyles?.reviewReasons ?? [])];
  for (const component of graph.components) {
    for (const node of component.compilation.nodes) {
      if (node.conditions.length) unresolved.push(`${component.componentName}:${node.id} conditional region requires state materialization`);
      if (Object.keys(node.attributes).some((name) => name.startsWith("v-model"))) unresolved.push(`${component.componentName}:${node.id} model binding requires reviewed state materialization`);
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
      ownerId: component.componentId,
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
      { path: `src/${fileBase}.css`, role: "style", content: primitiveStyles(graph, [options.additionalStyleCss, reviewedStyles?.css].filter(Boolean).join("\n")), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "primitive-dom", reference: "primitive-style-rules" }, ...(options.additionalStyleCss ? [{ kind: "source-style" as const, reference: "reviewed-additional-style-css" }] : []), ...(reviewedStyles?.provenance ?? [])] },
      { path: "README.md", role: "documentation", content: primitiveReadme(options.libraryName, namespace), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: "docs/设计规范.md", role: "documentation", content: "# 设计规范\n\n## 主题色\n\n组件使用 `--sg-*` 主题变量。\n", publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: "examples/template.html", role: "example", content: primitiveExample(namespace), publish: false, reviewed: true, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
    ],
    smoke: { runtimePath: `src/${fileBase}.js`, globalName: namespace, mountMethod: "mount", hostSelector: "#mount", options: {}, cleanupRequired: true },
    ...(options.quality ? { quality: options.quality } : {}),
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
  const literalCardinality = /^\+?\d+$/.test(source);
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
  const reviewedProps = bindings.filter((binding) => binding.materialized && binding.reviewed && ((binding.sourceKind === "component-prop" && binding.runtimeInput === "data") || (binding.sourceKind === "reviewed-api-fixture" && binding.runtimeInput === "adapter")));
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

function normalizeRuntimePath(path: string): string {
  return path.trim().replace(/^this\./, "").replace(/\.value(?=\.|$)/g, "");
}

function simpleRuntimePath(expression: string): string | undefined {
  const normalized = normalizeRuntimePath(expression);
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(normalized) ? normalized : undefined;
}

function conditionDependencies(expression: string): string[] | undefined {
  const value = expression.trim();
  if (!value) return undefined;
  const combine = (parts: string[]): string[] | undefined => {
    const dependencies = parts.map(conditionDependencies);
    return dependencies.every((item): item is string[] => Boolean(item)) ? [...new Set(dependencies.flat())] : undefined;
  };
  if (/\s+\|\|\s+/.test(value)) return combine(value.split(/\s+\|\|\s+/));
  if (/\s+&&\s+/.test(value)) return combine(value.split(/\s+&&\s+/));
  if (value.startsWith("!")) return conditionDependencies(value.slice(1));
  const equality = value.match(/^(.+?)\s*(?:!==|===)\s*(?:true|false|null|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/);
  if (equality) { const path = simpleRuntimePath(equality[1]); return path ? [path] : undefined; }
  if (/^(?:true|false|null|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(value)) return [];
  const path = simpleRuntimePath(value);
  return path ? [path] : undefined;
}

function hasInitialStatePath(state: SfcStateResponsibility["initialState"], path: string): boolean {
  let current: import("../../types.js").JsonValue = state;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !(part in current)) return false;
    current = (current as Record<string, import("../../types.js").JsonValue>)[part];
  }
  return true;
}

interface PrimitiveStateEvidence {
  readonly conditionsReady: boolean;
  readonly modelsReady: boolean;
  readonly pathsByOwner: ReadonlyMap<string, readonly string[]>;
}

function primitiveStateEvidence(graph: PrimitiveDomCompilationGraph, states: ReadonlyMap<string, SfcStateResponsibility>): PrimitiveStateEvidence {
  const pathsByOwner = new Map<string, readonly string[]>();
  let conditionsReady = true;
  let modelsReady = true;
  for (const component of graph.components) {
    const conditionalNodes = component.compilation.nodes.filter((node) => node.conditions.length > 0);
    const modelNodes = component.compilation.nodes.filter((node) => Object.keys(node.attributes).some((name) => name.startsWith("v-model")));
    if (conditionalNodes.length === 0 && modelNodes.length === 0) continue;
    const state = states.get(component.componentId);
    const stateReady = Boolean(state?.parsed && state.unresolvedWrites.length === 0);
    if (!stateReady || !state) {
      if (conditionalNodes.length > 0) conditionsReady = false;
      if (modelNodes.length > 0) modelsReady = false;
      continue;
    }
    const paths = new Set<string>();
    for (const node of conditionalNodes) {
      const directive = node.conditionDirective;
      if (!directive || !["if", "show"].includes(directive.kind) || !directive.expression) { conditionsReady = false; continue; }
      const dependencies = conditionDependencies(directive.expression);
      if (!dependencies || dependencies.some((path) => !hasInitialStatePath(state.initialState, path))) { conditionsReady = false; continue; }
      dependencies.forEach((path) => paths.add(path));
    }
    for (const node of modelNodes) {
      const bindings = Object.entries(node.attributes).filter(([name]) => name.startsWith("v-model"));
      if (bindings.length !== 1 || bindings[0][0] !== "v-model" || typeof bindings[0][1] !== "string") { modelsReady = false; continue; }
      const path = simpleRuntimePath(bindings[0][1]);
      if (!path || !hasInitialStatePath(state.initialState, path)) { modelsReady = false; continue; }
      paths.add(path);
    }
    if (paths.size > 0) pathsByOwner.set(component.componentId, [...paths].sort());
  }
  return { conditionsReady, modelsReady, pathsByOwner };
}

function handlerName(expression: string): string | undefined {
  return expression.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:\([^)]*\))?$/)?.[1];
}

const LEGACY_STATE_OWNER = "__legacy__";

function resolveOwnerStates(
  plan: ComponentLibraryBuildPlan,
  evidence: ComponentLibraryEnrichmentEvidence,
  primitiveGraphMatchesPlan: boolean,
): { states: Map<string, SfcStateResponsibility>; blockers: string[] } {
  const states = new Map<string, SfcStateResponsibility>();
  const reviewedOwners = new Set<string>();
  const blockers: string[] = [];
  if (evidence.state && evidence.stateMap) blockers.push("state-responsibility: provide either state or stateMap, not both");
  const knownOwners = new Set<string>();
  if (evidence.primitiveGraph && primitiveGraphMatchesPlan) evidence.primitiveGraph.components.forEach((component) => knownOwners.add(component.componentId));
  else plan.interactions.forEach((binding) => { if (binding.ownerId) knownOwners.add(binding.ownerId); });
  if (evidence.stateMap) {
    if (evidence.stateMap.schemaVersion !== "1.0" || evidence.stateMap.kind !== "component-state-evidence-map" || !Array.isArray(evidence.stateMap.entries)) {
      blockers.push("state-responsibility: invalid component state evidence map contract");
      return { states, blockers };
    }
    blockers.push(...(evidence.stateMap.unresolved ?? []).map((reason) => `state-responsibility unresolved: ${reason}`));
    const derivedReviewRequired = (evidence.stateMap.unresolved?.length ?? 0) > 0 || evidence.stateMap.entries.some((entry) => !entry?.reviewed);
    if (evidence.stateMap.reviewRequired !== derivedReviewRequired) blockers.push(`state-responsibility: state map reviewRequired must equal derived state ${derivedReviewRequired}`);
    for (const entry of evidence.stateMap.entries) {
      if (!entry || !entry.responsibility) { blockers.push("state-responsibility: state map entry requires responsibility"); continue; }
      if (!entry.ownerId.trim()) { blockers.push("state-responsibility: state map ownerId must not be empty"); continue; }
      if (!entry.reviewed) { blockers.push(`state-responsibility: state map owner requires review ${entry.ownerId}`); continue; }
      if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.some((item: string) => !item.trim())) { blockers.push(`state-responsibility: state map evidence is missing ${entry.ownerId}`); continue; }
      if (states.has(entry.ownerId)) { blockers.push(`state-responsibility: duplicate state owner ${entry.ownerId}`); continue; }
      if (knownOwners.size > 0 && !knownOwners.has(entry.ownerId)) { blockers.push(`state-responsibility: unknown state owner ${entry.ownerId}`); continue; }
      states.set(entry.ownerId, entry.responsibility);
      reviewedOwners.add(entry.ownerId);
    }
  } else if (evidence.state) {
    if (knownOwners.size === 1) states.set([...knownOwners][0], evidence.state);
    else if (knownOwners.size === 0 && plan.interactions.length <= 1) states.set(LEGACY_STATE_OWNER, evidence.state);
    else blockers.push(`state-responsibility: unscoped state evidence is ambiguous across ${knownOwners.size || plan.interactions.length} owners; provide stateMap`);
  }
  for (const [ownerId, state] of states) {
    if (!state.parsed) blockers.push(`state-responsibility:${ownerId}: state responsibility is not parsed`);
    if (!reviewedOwners.has(ownerId)) blockers.push(...state.reviewReasons.map((reason) => `state-responsibility:${ownerId}: ${reason}`));
    blockers.push(...state.unresolvedWrites.map((write) => `state-responsibility:${ownerId} unresolved write ${write.handler}:${write.path}`));
  }
  return { states, blockers };
}

function stateForBinding(binding: ComponentLibraryInteractionBinding, states: ReadonlyMap<string, SfcStateResponsibility>): SfcStateResponsibility | undefined {
  if (binding.ownerId) return states.get(binding.ownerId);
  if (states.has(LEGACY_STATE_OWNER)) return states.get(LEGACY_STATE_OWNER);
  return states.size === 1 ? states.values().next().value : undefined;
}

function scalarStateForRuntime(state: SfcStateResponsibility["initialState"], bindings: readonly ComponentLibraryInteractionBinding[], conditionPaths: readonly string[]): Record<string, import("../../types.js").JsonValue> {
  const output: Record<string, import("../../types.js").JsonValue> = {};
  const normalize = (path: string): string[] => path.replace(/^this\./, "").split(".").filter((part) => Boolean(part) && part !== "value");
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
  const paths = new Set(conditionPaths);
  for (const binding of bindings) if (binding.executionEvidence?.mutationTarget) paths.add(binding.executionEvidence.mutationTarget);
  for (const target of paths) {
    const value = read(target);
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) write(target, value as import("../../types.js").JsonValue);
  }
  return output;
}

function injectInteractionRuntime(
  plan: ComponentLibraryBuildPlan,
  interactions: readonly ComponentLibraryInteractionBinding[],
  dataBindings: readonly ComponentLibraryDataBinding[],
  states: ReadonlyMap<string, SfcStateResponsibility>,
  statePathsByOwner: ReadonlyMap<string, readonly string[]> = new Map(),
): { files: ComponentLibraryBuildPlan["files"]; interactions: ComponentLibraryInteractionBinding[]; dataBindings: ComponentLibraryDataBinding[]; runtimePatched: boolean } {
  const runtimeIndex = plan.files.findIndex((file) => file.role === "runtime" && file.content.includes("/*__UI_DISMANTLER_INTERACTION_CONFIG__*/"));
  if (runtimeIndex < 0) return { files: plan.files, interactions: [...interactions], dataBindings: [...dataBindings], runtimePatched: false };
  const materializableInteractions = interactions.filter((binding) => binding.sourceNodeId && binding.executionEvidence?.status === "verified" && binding.reviewed);
  const materializableData = dataBindings.filter((binding) => ["component-prop", "reviewed-api-fixture"].includes(binding.sourceKind) && binding.reviewed && !binding.materialized);
  const statePathCount = [...statePathsByOwner.values()].reduce((sum, paths) => sum + paths.length, 0);
  if (materializableInteractions.length === 0 && materializableData.length === 0 && statePathCount === 0) return { files: plan.files, interactions: [...interactions], dataBindings: [...dataBindings], runtimePatched: false };
  const materializedInteractions = interactions.map((binding) => materializableInteractions.includes(binding) ? { ...binding, materialized: true } : binding);
  const materializedDataBindings = dataBindings.map((binding) => materializableData.includes(binding) ? { ...binding, materialized: true } : binding);
  const initialStateByOwner: Record<string, Record<string, import("../../types.js").JsonValue>> = {};
  for (const [ownerId, state] of states) {
    const ownerBindings = materializedInteractions.filter((binding) => binding.ownerId === ownerId || (!binding.ownerId && states.size === 1));
    initialStateByOwner[ownerId] = scalarStateForRuntime(state.initialState, ownerBindings, statePathsByOwner.get(ownerId) ?? []);
  }
  const stateEntries = Object.entries(initialStateByOwner);
  const config = {
    initialState: stateEntries.length === 1 ? stateEntries[0][1] : {},
    initialStateByOwner: Object.fromEntries(stateEntries.filter(([ownerId]) => ownerId !== LEGACY_STATE_OWNER)),
    bindings: materializedInteractions.filter((binding) => binding.materialized),
    dataBindings: materializedDataBindings.filter((binding) => binding.materialized).map((binding) => ({ id: binding.id, ownerId: binding.ownerId, targetBinding: binding.targetBinding, sourceKind: binding.sourceKind, runtimeInput: binding.runtimeInput, adapterKey: binding.adapterKey, fields: binding.fields, shape: binding.shape })),
  };
  const files = [...plan.files];
  const runtime = files[runtimeIndex];
  const marker = /var INTERACTION_CONFIG = \{ initialState: \{\}, (?:initialStateByOwner: \{\}, )?bindings: \[\], dataBindings: \[\] \}; \/\*__UI_DISMANTLER_INTERACTION_CONFIG__\*\//;
  const content = runtime.content.replace(marker, `var INTERACTION_CONFIG = JSON.parse(${JSON.stringify(JSON.stringify(config))}); /*__UI_DISMANTLER_INTERACTION_CONFIG__*/`);
  files[runtimeIndex] = { ...runtime, content, contentHash: sha256(content) };
  return { files, interactions: materializedInteractions, dataBindings: materializedDataBindings, runtimePatched: content !== runtime.content };
}

export function enrichComponentLibraryBuildPlan(
  plan: ComponentLibraryBuildPlan,
  evidence: ComponentLibraryEnrichmentEvidence,
): ComponentLibraryBuildPlan {
  let interactions: ComponentLibraryInteractionBinding[] = [...plan.interactions];
  const dataBindings: ComponentLibraryDataBinding[] = [...plan.dataBindings];
  let unresolved = [...plan.unresolved];
  let files = [...plan.files];
  const smoke = evidence.runtimeOptions === undefined ? plan.smoke : { ...plan.smoke, options: evidence.runtimeOptions };
  const primitiveGraphMatchesPlan = evidence.primitiveGraph ? plan.identity.sourceHash === sha256(JSON.stringify(evidence.primitiveGraph)) : false;
  if (evidence.primitiveGraph && !primitiveGraphMatchesPlan) unresolved.push("primitive-dom: graph identity does not match build plan sourceHash");
  const ownerStates = resolveOwnerStates(plan, evidence, primitiveGraphMatchesPlan);
  unresolved.push(...ownerStates.blockers);
  if (ownerStates.states.size > 0) {
    interactions = interactions.map((binding): ComponentLibraryInteractionBinding => {
      const state = stateForBinding(binding, ownerStates.states);
      const name = handlerName(binding.expression);
      const handler = name && state ? state.handlers.find((candidate) => candidate.handler === name) : undefined;
      if (!state || !handler) return binding;
      if (handler.writes.length !== 1) {
        return {
          ...binding,
          reviewed: false,
          materialized: false,
          executionEvidence: { status: "blocked", blockers: [`handler ${handler.handler} has ${handler.writes.length} state writes; reviewed runtime requires exactly one`] },
          provenance: [...binding.provenance, { kind: "state-responsibility", reference: `owner:${binding.ownerId ?? LEGACY_STATE_OWNER}:handler:${handler.handler}:line:${handler.sourceLine}` }],
        };
      }
      const write = handler.writes[0];
      const execution = executeReviewedStateWrite(write, state.initialState);
      return {
        ...binding,
        id: `${binding.id}:${write.path}`,
        target: write.path,
        reviewed: write.confidence === "high" && execution.status === "materialized",
        materialized: false,
        executionEvidence: {
          status: execution.status === "materialized" ? "verified" : "blocked",
          ...(execution.transition ? { transitionKind: execution.transition.kind } : {}),
          ...(execution.mutationTarget ? { mutationTarget: execution.mutationTarget } : {}),
          ...(execution.transition?.value !== undefined ? { transitionValue: execution.transition.value } : {}),
          blockers: execution.blockers,
        },
        provenance: [...binding.provenance, { kind: "state-responsibility", reference: `owner:${binding.ownerId ?? LEGACY_STATE_OWNER}:handler:${handler.handler}:line:${handler.sourceLine}` }],
      };
    });
  }
  if (evidence.dataSurface) {
    unresolved.push(...evidence.dataSurface.unresolved.map((item) => `data-surface: ${item.reason}`));
    unresolved.push(...evidence.dataSurface.surfaces.flatMap((surface) => surface.unresolved.map((reason) => `data-surface:${surface.id}: ${reason}`)));
    for (const surface of evidence.dataSurface.surfaces) {
      const sourceKind = surface.source.stateInitial ? "state-initial" : surface.source.primary;
      const runtimeInput = surface.source.primary === "component-prop" ? "data" : surface.source.primary === "reviewed-api-fixture" ? "adapter" : undefined;
      const sourceReviewed = surface.source.primary !== "reviewed-api-fixture" || surface.source.api?.reviewed === true;
      dataBindings.push({
        id: surface.id,
        ownerId: surface.owner.componentId,
        sourceKind,
        targetBinding: surface.injection.target,
        fields: surface.fields.map((field) => field.path),
        shape: { kind: surface.shape.kind, itemKind: surface.shape.itemKind, cardinality: surface.shape.cardinality },
        reviewed: !surface.reviewRequired && surface.injection.reviewed && sourceReviewed,
        materialized: false,
        ...(runtimeInput ? { runtimeInput } : {}),
        ...(runtimeInput === "adapter" ? { adapterKey: surface.id } : {}),
        externalOnly: true,
        provenance: [{ kind: "data-surface-manifest", reference: surface.id }],
      });
    }
  }
  const stateEvidence = evidence.primitiveGraph && primitiveGraphMatchesPlan
    ? primitiveStateEvidence(evidence.primitiveGraph, ownerStates.states)
    : { conditionsReady: true, modelsReady: true, pathsByOwner: new Map<string, readonly string[]>() };
  if (ownerStates.states.size > 0 || evidence.dataSurface || stateEvidence.pathsByOwner.size > 0) {
    const injected = injectInteractionRuntime(plan, interactions, dataBindings, ownerStates.states, stateEvidence.pathsByOwner);
    files = [...injected.files];
    interactions = injected.interactions;
    dataBindings.splice(0, dataBindings.length, ...injected.dataBindings);
    if (interactions.length > 0 && interactions.every((binding) => binding.materialized)) {
      unresolved = unresolved.filter((reason) => !reason.includes("interaction bindings require state transition execution evidence"));
    }
  }
  const hasLoopBlockers = unresolved.some((reason) => reason.includes("repeated region requires reviewed collection binding") || reason.includes("v-for cardinality requires data-source evidence"));
  const loopsReady = !hasLoopBlockers || Boolean(evidence.primitiveGraph && primitiveGraphMatchesPlan && collectionBindingsCoverLoops(evidence.primitiveGraph, dataBindings));
  if (loopsReady) unresolved = unresolved.filter((reason) => !reason.includes("repeated region requires reviewed collection binding") && !reason.includes("v-for cardinality requires data-source evidence"));
  const hasConditionBlockers = unresolved.some((reason) => reason.includes("conditional region requires state materialization"));
  const conditionsReady = !hasConditionBlockers || Boolean(evidence.primitiveGraph && primitiveGraphMatchesPlan && stateEvidence.conditionsReady);
  if (conditionsReady) unresolved = unresolved.filter((reason) => !reason.includes("conditional region requires state materialization"));
  const hasModelBlockers = unresolved.some((reason) => reason.includes("model binding requires reviewed state materialization"));
  const modelsReady = !hasModelBlockers || Boolean(evidence.primitiveGraph && primitiveGraphMatchesPlan && stateEvidence.modelsReady);
  if (modelsReady) unresolved = unresolved.filter((reason) => !reason.includes("model binding requires reviewed state materialization"));
  const bindingsReady = interactions.every((binding) => binding.reviewed && binding.materialized) && dataBindings.every((binding) => binding.reviewed && binding.materialized) && loopsReady && conditionsReady && modelsReady;
  const reviewRequired = unresolved.length > 0 || !bindingsReady;
  if (!reviewRequired) files = files.map((file) => ["runtime", "style", "package-metadata", "documentation"].includes(file.role) ? { ...file, reviewed: true } : file);
  const configurationHash = sha256(JSON.stringify({ base: plan.identity.configurationHash, files: files.map((file) => ({ path: file.path, contentHash: file.contentHash, reviewed: file.reviewed })), interactions, dataBindings, smoke, unresolved }));
  return {
    ...plan,
    identity: { ...plan.identity, configurationHash },
    files,
    interactions,
    dataBindings,
    smoke,
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
    ...(options.quality ? { quality: options.quality } : {}),
    unresolved,
  };
  return await createComponentLibraryBuildPlan(input, options.sourceRoot);
}
