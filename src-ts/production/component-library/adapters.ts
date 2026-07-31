import { sha256, type ComponentLibraryBuildPlan, type ComponentLibraryBuildPlanInput } from "./contract.js";
import { createComponentLibraryBuildPlan } from "./planner.js";
import type { ComponentPlanningReport } from "../../planning/components.js";
import type { PrimitiveDomCompilationGraph } from "../../skills/primitive-dom.js";
import type { PrimitiveDomNode } from "../../planning/primitive-dom-compiler.js";

export interface ComponentLibraryProjectionOptions {
  readonly sourceRoot: string;
  readonly libraryName: string;
  readonly packageName: string;
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
  function setAttributes(element, attributes) {
    Object.keys(attributes || {}).forEach(function (name) {
      if (name.indexOf("@") === 0 || name.indexOf(":") === 0 || name.indexOf("v-") === 0 || name.indexOf("#") === 0) return;
      var value = attributes[name];
      if (name === "class" || name === "className") return;
      if (value === true) element.setAttribute(name, "");
      else if (value !== false && value != null) element.setAttribute(name, String(value));
    });
  }
  function render(spec) {
    var element = document.createElement(spec.renderTag || "div");
    element.setAttribute("data-primitive-node", spec.id);
    (spec.classes || []).forEach(function (name) { element.classList.add(name); });
    setAttributes(element, spec.attributes);
    Object.keys(spec.inlineStyle || {}).forEach(function (name) { element.style.setProperty(name, spec.inlineStyle[name]); });
    (spec.content || []).forEach(function (token) { element.appendChild(document.createTextNode(token.value)); });
    (spec.children || []).forEach(function (child) { element.appendChild(render(child)); });
    return element;
  }
  function resolveComponent(options) {
    var requested = options && options.componentId;
    return COMPONENTS.filter(function (component) { return !requested || component.id === requested; })[0] || COMPONENTS[0];
  }
  function create(options) {
    var component = resolveComponent(options || {});
    var root = document.createElement("section");
    root.className = "sg-component-library";
    root.setAttribute("data-component-id", component ? component.id : "unresolved");
    if (component) component.roots.forEach(function (child) { root.appendChild(render(child)); });
    return {
      root: root,
      unmount: function () { if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }
  var API = {
    components: COMPONENTS.map(function (component) { return { id: component.id, name: component.name }; }),
    create: create,
    mount: function (container, options) {
      if (!container) throw new Error("mount requires a container");
      var instance = create(options || {});
      container.appendChild(instance.root);
      return instance;
    }
  };
  global.${namespace} = API;
})(window);
`;
}

function primitiveStyles(graph: PrimitiveDomCompilationGraph): string {
  const rules = graph.components.flatMap((component) => component.compilation.styleRules).map((rule) => {
    const declarations = Object.entries(rule.declarations).map(([name, value]) => `${name}:${value}`).join(";");
    return `${rule.selector}{${declarations}}${rule.media ? `@media ${rule.media}{${rule.selector}{${declarations}}}` : ""}`;
  });
  return `:root{--sg-primary:#409eff;--sg-ink:#303133;--sg-muted:#909399;--sg-line:#dcdfe6;--sg-paper:#fff}
.sg-component-library{box-sizing:border-box;color:var(--sg-ink);background:var(--sg-paper);font-family:Arial,sans-serif;min-width:0}
.sg-component-library *{box-sizing:border-box}
${rules.join("\n")}
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
  options: ComponentLibraryProjectionOptions,
): Promise<ComponentLibraryBuildPlan> {
  const namespace = options.libraryName.replace(/[^A-Za-z0-9_$]/g, "") || "ComponentLibrary";
  const fileBase = packageSlug(namespace);
  const unresolved = [...graph.reviewReasons];
  for (const component of graph.components) {
    for (const node of component.compilation.nodes) {
      if (node.conditions.length || node.loops.length) unresolved.push(`${component.componentName}:${node.id} conditional or repeated region requires state/data materialization`);
    }
    if (component.compilation.interactions.length) unresolved.push(`${component.componentName} interaction bindings require state transition execution evidence`);
  }
  const input: ComponentLibraryBuildPlanInput = {
    schemaVersion: "1.0",
    sourceRoot: options.sourceRoot,
    sourceHash: sha256(JSON.stringify(graph)),
    library: { name: options.libraryName, packageName: options.packageName },
    files: [
      { path: "package.json", role: "package-metadata", content: JSON.stringify({ name: options.packageName, version: "0.0.0", private: true, main: `src/${fileBase}.js`, style: `src/${fileBase}.css`, files: ["src", "README.md", "docs"] }, null, 2) + "\n", publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: `src/${fileBase}.js`, role: "runtime", content: primitiveRuntime(namespace, graph), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "primitive-dom", reference: "primitive-dom-compilation-graph" }] },
      { path: `src/${fileBase}.css`, role: "style", content: primitiveStyles(graph), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "primitive-dom", reference: "primitive-style-rules" }] },
      { path: "README.md", role: "documentation", content: primitiveReadme(options.libraryName, namespace), publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: "docs/设计规范.md", role: "documentation", content: "# 设计规范\n\n## 主题色\n\n组件使用 `--sg-*` 主题变量。\n", publish: true, reviewed: unresolved.length === 0, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
      { path: "examples/template.html", role: "example", content: primitiveExample(namespace), publish: false, reviewed: true, provenance: [{ kind: "generated-metadata", reference: "primitive-dom-compilation" }] },
    ],
    smoke: { runtimePath: `src/${fileBase}.js`, globalName: namespace, mountMethod: "mount", hostSelector: "#mount", options: {}, cleanupRequired: true },
    unresolved,
  };
  return await createComponentLibraryBuildPlan(input, options.sourceRoot);
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
