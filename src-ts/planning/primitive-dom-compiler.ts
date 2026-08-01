import type {
  ElementUiPrimitiveKind,
  SfcTemplateContentToken,
  SfcTemplateNode,
  SfcTemplateStructure,
} from "./sfc-template-structure.js";

export type PrimitiveRenderStrategy =
  | "native" | "form" | "form-field" | "input" | "checkbox" | "button" | "tag" | "tabs" | "tab-pane"
  | "layout-row" | "layout-column" | "radio-group" | "radio-button" | "table" | "table-column"
  | "card" | "progress" | "dialog" | "tooltip" | "custom-component";

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
  conditionDirective?: { kind: "if" | "else-if" | "else" | "show"; expression?: string };
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
  provenance: "source-inline-style" | "element-ui-primitive" | "responsive-span" | "utility-class";
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
  "a", "abbr", "address", "article", "aside", "audio", "b", "blockquote", "br", "button", "canvas", "caption", "code",
  "col", "colgroup", "data", "datalist", "dd", "details", "dialog", "div", "dl", "dt", "em", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "iframe", "img", "input",
  "label", "legend", "li", "main", "mark", "meter", "nav", "ol", "option", "optgroup", "output", "p", "picture", "pre",
  "progress", "q", "s", "section", "select", "small", "source", "span", "strong", "sub", "summary", "sup", "table", "tbody",
  "td", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "u", "ul", "video",
]);

const strategyByPrimitive: Partial<Record<ElementUiPrimitiveKind, PrimitiveRenderStrategy>> = {
  "layout-row": "layout-row", "layout-column": "layout-column", form: "form", "form-field": "form-field", input: "input", checkbox: "checkbox",
  button: "button", "radio-group": "radio-group", "radio-button": "radio-button", tag: "tag", tabs: "tabs", "tab-pane": "tab-pane",
  table: "table", "table-column": "table-column", card: "card", progress: "progress", dialog: "dialog", tooltip: "tooltip",
};

const primitiveClasses: Partial<Record<ElementUiPrimitiveKind, string[]>> = {
  "layout-row": ["el-row"], "layout-column": ["el-col"], form: ["el-form"], "form-field": ["el-form-item"], input: ["el-input"], checkbox: ["el-checkbox"],
  button: ["el-button"], "radio-group": ["el-radio-group"], "radio-button": ["el-radio-button"], tag: ["el-tag"], tabs: ["el-tabs"], "tab-pane": ["el-tab-pane"],
  table: ["el-table", "el-table--fit", "el-table--enable-row-hover", "el-table--enable-row-transition"], "table-column": [],
  card: ["el-card", "is-always-shadow"], progress: ["el-progress", "el-progress--line"], dialog: ["el-dialog"], tooltip: ["el-tooltip"],
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
  const allowed = new Set(["accept", "action", "alt", "autocomplete", "checked", "clearable", "show-password", "link", "class-name", "cols", "content", "disabled", "download", "for", "form", "height", "href", "id", "label", "manual", "max", "maxlength", "method", "min", "minlength", "multiple", "name", "pattern", "placeholder", "placement", "poster", "prop", "readonly", "ref", "rel", "required", "role", "rows", "selected", "size", "src", "step", "tabindex", "target", "title", "type", "value", "width"]);
  return Object.fromEntries(Object.entries(node.attributes).filter(([name]) => allowed.has(name) || name.startsWith(":") || name.startsWith("aria-") || name.startsWith("data-") || name.startsWith("v-model") || name === "v-permission"));
}
function nodeStrategy(node: SfcTemplateNode): PrimitiveRenderStrategy {
  if (node.primitive) return strategyByPrimitive[node.primitive.kind] ?? "native";
  if (nativeTags.has(node.tag.toLowerCase())) return "native";
  return "custom-component";
}
function renderTag(node: SfcTemplateNode, strategy: PrimitiveRenderStrategy): string {
  if (strategy === "form") return "form";
  if (strategy === "input") return "input";
  if (strategy === "checkbox") return "label";
  if (strategy === "button") return "button";
  if (strategy === "tag") return "span";
  if (["layout-row", "layout-column", "form-field", "radio-group", "tabs", "tab-pane", "table", "table-column", "card", "progress", "dialog", "tooltip", "custom-component"].includes(strategy)) return "div";
  if (strategy === "radio-button") return "label";
  return nativeTags.has(node.tag.toLowerCase()) ? node.tag.toLowerCase() : "div";
}
function classesFor(node: SfcTemplateNode): string[] {
  const kind = node.primitive?.kind;
  const classes = [...node.classes, ...(kind ? primitiveClasses[kind] ?? [] : [])];
  const type = node.attributes.type;
  if (kind === "button" && typeof type === "string") classes.push(`el-button--${type}`);
  if (kind === "button" && node.attributes.link === true) classes.push("is-link");
  if (kind === "tag" && typeof type === "string") classes.push(`el-tag--${type}`);
  if (kind === "tabs" && type === "border-card") classes.push("el-tabs--border-card");
  const status = node.attributes.status;
  if (kind === "progress" && typeof status === "string") classes.push(`is-${status}`);
  return unique(classes);
}
function primitiveRules(node: PrimitiveDomNode): PrimitiveStyleRule[] {
  const selector = `[data-primitive-node="${node.id}"]`;
  const rules: PrimitiveStyleRule[] = [];
  if (Object.keys(node.inlineStyle).length) rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: node.inlineStyle, provenance: "source-inline-style" });
  if (node.primitiveKind === "layout-row") rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: { display: "flex", "flex-wrap": "wrap" }, provenance: "element-ui-primitive" });
  const utilities: Record<string, string> = {};
  for (const name of node.classes) {
    if (name === "flex") utilities.display = "flex";
    else if (name === "flex-row") utilities["flex-direction"] = "row";
    else if (name === "items-center") utilities["align-items"] = "center";
    else if (name === "justify-center") utilities["justify-content"] = "center";
    else if (name === "m-0") utilities.margin = "0";
    else if (name === "mx-auto") { utilities["margin-left"] = "auto"; utilities["margin-right"] = "auto"; }
    else if (name === "ml-4") utilities["margin-left"] = "1rem";
    else if (name === "mb-10") utilities["margin-bottom"] = "2.5rem";
    else {
      const arbitrary = /^(w|h)-\[([^\]]+)\]$/.exec(name);
      if (arbitrary) utilities[arbitrary[1] === "w" ? "width" : "height"] = arbitrary[2];
    }
  }
  if (Object.keys(utilities).length) rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: utilities, provenance: "utility-class" });
  if (node.classes.includes("container")) {
    rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: { width: "100%" }, provenance: "utility-class" });
    for (const [media, width] of [["(min-width:640px)", "640px"], ["(min-width:768px)", "768px"], ["(min-width:1024px)", "1024px"], ["(min-width:1280px)", "1280px"], ["(min-width:1536px)", "1536px"]] as const) rules.push({ sourceNodeId: node.sourceNodeId, selector, declarations: { "max-width": width }, media, provenance: "utility-class" });
  }
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
      conditions: source.conditions, conditionDirective: typeof source.attributes["v-if"] === "string" ? { kind: "if", expression: source.attributes["v-if"] } : typeof source.attributes["v-else-if"] === "string" ? { kind: "else-if", expression: source.attributes["v-else-if"] } : source.attributes["v-else"] === true ? { kind: "else" } : typeof source.attributes["v-show"] === "string" ? { kind: "show", expression: source.attributes["v-show"] } : undefined,
      loops: source.loops, slot: source.slot, primitiveKind: source.primitive?.kind, responsiveSpans,
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

export function materializeElementUiPrimitiveCss(compilation: PrimitiveDomCompilation): string {
  const kinds = new Set(compilation.nodes.map((node) => node.primitiveKind).filter(Boolean));
  const rules: string[] = [];
  if (kinds.has("table")) rules.push(`.el-table{position:relative;overflow:hidden;box-sizing:border-box;flex:1;width:100%;max-width:100%;background-color:#fff;font-size:14px;color:#606266}.el-table:before{content:"";position:absolute;background-color:#ebeef5;z-index:1;left:0;bottom:0;width:100%;height:1px}.el-table__header-wrapper,.el-table__body-wrapper{width:100%}.el-table__body-wrapper{overflow:hidden;position:relative}.el-table table{table-layout:fixed;border-collapse:separate;border-spacing:0;width:100%}.el-table th,.el-table td{padding:10px 0;min-width:0;box-sizing:border-box;text-overflow:ellipsis;vertical-align:middle;position:relative;text-align:left}.el-table th{overflow:hidden;user-select:none;background-color:#fff;color:#909399;font-weight:500}.el-table td,.el-table th.is-leaf{border-bottom:1px solid #ebeef5}.el-table .cell{box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:normal;word-break:break-all;line-height:23px;padding-left:10px;padding-right:10px}.el-table th.is-center,.el-table td.is-center{text-align:center}.el-table__row:hover>td{background-color:#f5f7fa}`);
  if (kinds.has("card")) rules.push(`.el-card{border:1px solid #ebeef5;background-color:#fff;color:#303133;transition:.3s}.el-card.is-always-shadow{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.el-card__header{padding:18px 20px;border-bottom:1px solid #ebeef5;box-sizing:border-box}.el-card__body{padding:20px}`);
  if (kinds.has("progress")) rules.push(`.el-progress{position:relative;line-height:1}.el-progress-bar{display:inline-block;vertical-align:middle;padding-right:50px;margin-right:-55px;width:100%;box-sizing:border-box}.el-progress-bar__outer{height:6px;border-radius:100px;background-color:#ebeef5;overflow:hidden;position:relative;vertical-align:middle}.el-progress-bar__inner{position:absolute;left:0;top:0;height:100%;background-color:#409eff;text-align:right;border-radius:100px;line-height:1;white-space:nowrap;transition:width .6s ease}.el-progress__text{font-size:14.4px;color:#606266;display:inline-block;vertical-align:middle;margin-left:10px;line-height:1}.el-progress.is-success .el-progress-bar__inner{background-color:#67c23a}.el-progress.is-success .el-progress__text{color:#67c23a}`);
  if (kinds.has("form") || kinds.has("form-field")) rules.push(`.el-form{--el-component-size:32px}.el-form[size="large"]{--el-component-size:40px}.el-form-item{display:flex;--font-size:14px;margin-bottom:22px}.el-form-item__content{display:flex;align-items:center;flex:1;line-height:var(--el-component-size);position:relative;font-size:var(--font-size);min-width:0}`);
  if (kinds.has("input")) rules.push(`.el-input{position:relative;font-size:14px;display:inline-flex;width:100%;line-height:var(--el-component-size,32px);box-sizing:border-box;vertical-align:middle}.el-input__wrapper{display:inline-flex;flex-grow:1;align-items:center;justify-content:center;padding:1px 11px;background-color:#fff;background-image:none;border-radius:4px;cursor:text;transition:box-shadow .2s cubic-bezier(.645,.045,.355,1);box-shadow:0 0 0 1px #dcdfe6 inset}.el-input__wrapper:hover{box-shadow:0 0 0 1px #c0c4cc inset}.el-input__inner{width:100%;flex-grow:1;color:#606266;font-size:inherit;height:calc(var(--el-component-size,32px) - 2px);line-height:calc(var(--el-component-size,32px) - 2px);padding:0;outline:none;border:none;background:none;box-sizing:border-box}.el-input__prefix,.el-input__suffix{display:inline-flex;white-space:nowrap;flex-shrink:0;height:100%;text-align:center;color:#a8abb2;transition:all .3s;pointer-events:none}.el-input__prefix{margin-right:6px}.el-input__suffix{margin-left:6px}.el-input__prefix-inner,.el-input__suffix-inner{display:inline-flex;align-items:center;justify-content:center}.el-input__icon{width:1em;height:1em;line-height:1em;display:inline-flex;align-items:center;justify-content:center}`);
  if (kinds.has("checkbox")) rules.push(`.el-checkbox{color:#606266;font-weight:500;font-size:14px;position:relative;cursor:pointer;display:inline-flex;align-items:center;white-space:nowrap;user-select:none;height:32px}.el-checkbox__input{white-space:nowrap;cursor:pointer;outline:none;display:inline-flex;position:relative}.el-checkbox__inner{display:inline-block;position:relative;border:1px solid #dcdfe6;border-radius:2px;box-sizing:border-box;width:14px;height:14px;background-color:#fff;z-index:1;transition:border-color .25s cubic-bezier(.71,-.46,.29,1.46),background-color .25s cubic-bezier(.71,-.46,.29,1.46)}.el-checkbox__original{opacity:0;outline:none;position:absolute;margin:0;width:0;height:0;z-index:-1}.el-checkbox__label{display:inline-block;padding-left:8px;line-height:1;font-size:14px}`);
  if (kinds.has("button")) rules.push(`.el-button{display:inline-flex;justify-content:center;align-items:center;line-height:1;height:var(--el-component-size,32px);white-space:nowrap;cursor:pointer;color:#606266;text-align:center;box-sizing:border-box;outline:none;transition:.1s;font-weight:500;user-select:none;vertical-align:middle;-webkit-appearance:none;background-color:#fff;border:1px solid #dcdfe6;border-radius:4px;padding:12px 19px;font-size:14px}.el-button>span{display:inline-flex;align-items:center}.el-button:hover{color:#409eff;border-color:#c6e2ff;background-color:#ecf5ff}.el-button--primary{color:#fff;background-color:#409eff;border-color:#409eff}.el-button.is-link{border-color:transparent;color:#409eff;background:transparent;padding:2px;height:auto}.el-button.is-link:hover{color:#79bbff;background:transparent;border-color:transparent}`);
  return rules.join("");
}
