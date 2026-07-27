import type {
  ElementUiPrimitiveKind,
  SfcTemplateContentToken,
  SfcTemplateNode,
  SfcTemplateStructure,
} from "./sfc-template-structure.js";

export type PrimitiveRenderStrategy =
  | "native" | "form" | "form-field" | "input" | "button" | "tag" | "tabs" | "tab-pane"
  | "layout-row" | "layout-column" | "radio-group" | "radio-button" | "dialog" | "tooltip" | "custom-component";

export interface PrimitiveDomNode {
  id: string;
  sourceNodeId: string;
  parentId?: string;
  order: number;
  sourceTag: string;
  componentName: string;
  renderTag: string;
  renderStrategy: PrimitiveRenderStrategy;
  classes: string[];
  attributes: Record<string, string | true>;
  inlineStyle: Record<string, string>;
  content: SfcTemplateContentToken[];
  embeddedAssets?: SfcTemplateNode["embeddedAssets"];
  conditions: string[];
  loops: string[];
  slot?: string;
  primitiveKind?: ElementUiPrimitiveKind;
  responsiveSpans?: Partial<Record<"xs" | "sm" | "md" | "lg" | "xl", number>>;
}

export interface PrimitiveStyleRule {
  sourceNodeId: string;
  selector: string;
  declarations: Record<string, string>;
  media?: string;
  provenance: "source-inline-style" | "element-ui-primitive" | "responsive-span";
}

export interface PrimitiveInteractionBinding {
  sourceNodeId: string;
  event: string;
  expression: string;
  modifiers: string[];
  target: string;
}

export interface PrimitiveDomCompilation {
  schemaVersion: "1.0";
  kind: "primitive-dom-compilation";
  roots: string[];
  nodes: PrimitiveDomNode[];
  styleRules: PrimitiveStyleRule[];
  interactions: PrimitiveInteractionBinding[];
  metrics: {
    sourceNodes: number;
    compiledNodes: number;
    primitiveNodes: number;
    inlineStyleRules: number;
    responsiveRules: number;
    interactionBindings: number;
    unsupportedPrimitiveNodes: number;
  };
  reviewReasons: string[];
}

const nativeTags = new Set([
  "a", "article", "aside", "b", "br", "button", "div", "footer", "form", "h1", "h2", "h3", "h4", "header",
  "i", "img", "input", "label", "li", "main", "nav", "p", "section", "small", "span", "strong", "table", "tbody",
  "td", "th", "thead", "tr", "ul",
]);

const strategyByPrimitive: Partial<Record<ElementUiPrimitiveKind, PrimitiveRenderStrategy>> = {
  "layout-row": "layout-row", "layout-column": "layout-column", form: "form", "form-field": "form-field", input: "input",
  button: "button", "radio-group": "radio-group", "radio-button": "radio-button", tag: "tag", tabs: "tabs", "tab-pane": "tab-pane", dialog: "dialog", tooltip: "tooltip",
};

const primitiveClasses: Partial<Record<ElementUiPrimitiveKind, string[]>> = {
  "layout-row": ["el-row"], "layout-column": ["el-col"], form: ["el-form"], "form-field": ["el-form-item"], input: ["el-input"],
  button: ["el-button"], "radio-group": ["el-radio-group"], "radio-button": ["el-radio-button"], tag: ["el-tag"], tabs: ["el-tabs"], "tab-pane": ["el-tab-pane"], dialog: ["el-dialog"], tooltip: ["el-tooltip"],
};

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function numberSpan(value: string | undefined): number | undefined {
  const match = value?.match(/(?:span\s*:\s*)?(\d+)/); return match ? Number(match[1]) : undefined;
}
function eventBinding(node: SfcTemplateNode): PrimitiveInteractionBinding[] {
  return Object.entries(node.attributes).flatMap(([name, value]) => {
    if (!name.startsWith("@") || typeof value !== "string") return [];
    const [event, ...modifiers] = name.slice(1).split(".");
    return [{ sourceNodeId: node.id, event, expression: value, modifiers, target: `[data-primitive-node="${node.id}"]` }];
  });
}
function mappedAttributes(node: SfcTemplateNode): Record<string, string | true> {
  const allowed = new Set(["autocomplete", "content", "label", "manual", "name", "placeholder", "placement", "prop", "ref", "size", "tabindex", "title", "type", "value"]);
  return Object.fromEntries(Object.entries(node.attributes).filter(([name]) => allowed.has(name) || name.startsWith(":") || name === "v-model" || name === "v-permission"));
}
function nodeStrategy(node: SfcTemplateNode): PrimitiveRenderStrategy {
  if (node.primitive) return strategyByPrimitive[node.primitive.kind] ?? "native";
  if (nativeTags.has(node.tag.toLowerCase())) return "native";
  return "custom-component";
}
function renderTag(node: SfcTemplateNode, strategy: PrimitiveRenderStrategy): string {
  if (strategy === "form") return "form";
  if (strategy === "input") return "input";
  if (strategy === "button") return "button";
  if (strategy === "tag") return "span";
  if (["layout-row", "layout-column", "form-field", "radio-group", "tabs", "tab-pane", "dialog", "tooltip", "custom-component"].includes(strategy)) return "div";
  if (strategy === "radio-button") return "label";
  return nativeTags.has(node.tag.toLowerCase()) ? node.tag.toLowerCase() : "div";
}
function classesFor(node: SfcTemplateNode): string[] {
  const kind = node.primitive?.kind;
  const classes = [...node.classes, ...(kind ? primitiveClasses[kind] ?? [] : [])];
  const type = node.attributes.type;
  if (kind === "button" && typeof type === "string") classes.push(`el-button--${type}`);
  if (kind === "tag" && typeof type === "string") classes.push(`el-tag--${type}`);
  if (kind === "tabs" && type === "border-card") classes.push("el-tabs--border-card");
  return unique(classes);
}
function primitiveRules(node: PrimitiveDomNode): PrimitiveStyleRule[] {
  const selector = `[data-primitive-node="${node.id}"]`;
  const rules: PrimitiveStyleRule[] = [];
  if (Object.keys(node.inlineStyle).length) rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: node.inlineStyle, provenance: "source-inline-style" });
  if (node.primitiveKind === "layout-row") rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: { display: "flex", "flex-wrap": "wrap" }, provenance: "element-ui-primitive" });
  for (const [viewport, span] of Object.entries(node.responsiveSpans ?? {})) {
    const media = viewport === "xs" ? "(max-width:767px)" : viewport === "sm" ? "(min-width:768px)" : viewport === "md" ? "(min-width:992px)" : viewport === "lg" ? "(min-width:1200px)" : "(min-width:1920px)";
    const width = `${(span / 24) * 100}%`;
    rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: { width, "max-width": width, "flex-basis": width }, media, provenance: "responsive-span" });
  }
  return rules;
}

export function compilePrimitiveDom(structure: SfcTemplateStructure, scope = "component"): PrimitiveDomCompilation {
  const nodes = structure.nodes.map((source): PrimitiveDomNode => {
    const strategy = nodeStrategy(source);
    const responsiveSpans = source.primitive?.responsiveSpans
      ? Object.fromEntries(Object.entries(source.primitive.responsiveSpans).flatMap(([name, value]) => {
        const span = numberSpan(value); return span === undefined ? [] : [[name, span]];
      })) as PrimitiveDomNode["responsiveSpans"]
      : undefined;
    return {
      id: `${scope}:${source.id}`, sourceNodeId: source.id, parentId: source.parentId ? `${scope}:${source.parentId}` : undefined,
      order: source.order, sourceTag: source.tag, componentName: source.componentName, renderTag: renderTag(source, strategy), renderStrategy: strategy,
      classes: classesFor(source), attributes: mappedAttributes(source), inlineStyle: source.inlineStyle, content: source.content, embeddedAssets: source.embeddedAssets,
      conditions: source.conditions, loops: source.loops, slot: source.slot, primitiveKind: source.primitive?.kind, responsiveSpans,
    };
  });
  const styleRules = nodes.flatMap(primitiveRules);
  const interactions = structure.nodes.flatMap(eventBinding);
  const unsupportedPrimitiveNodes = structure.nodes.filter((node) => node.primitive && !strategyByPrimitive[node.primitive.kind]).length;
  return {
    schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: structure.roots, nodes, styleRules, interactions,
    metrics: {
      sourceNodes: structure.nodes.length, compiledNodes: nodes.length, primitiveNodes: nodes.filter((node) => node.primitiveKind).length,
      inlineStyleRules: styleRules.filter((rule) => rule.provenance === "source-inline-style").length,
      responsiveRules: styleRules.filter((rule) => rule.provenance === "responsive-span").length,
      interactionBindings: interactions.length, unsupportedPrimitiveNodes,
    },
    reviewReasons: unique([
      ...(unsupportedPrimitiveNodes ? ["unsupported Element UI primitives require a reviewed renderer"] : []),
      ...(structure.repeatedRegions ? ["v-for cardinality requires data-source evidence"] : []),
      ...(structure.conditionalRegions ? ["conditional visibility requires state-contract validation"] : []),
    ]),
  };
}

export function materializePrimitiveCss(compilation: PrimitiveDomCompilation): string {
  const declarations = (values: Record<string, string>) => Object.entries(values).map(([name, value]) => `${name}:${value}`).join(";");
  return compilation.styleRules.map((rule) => `${rule.media ? `@media ${rule.media}{` : ""}${rule.selector}{${declarations(rule.declarations)}}${rule.media ? "}" : ""}`).join("");
}
