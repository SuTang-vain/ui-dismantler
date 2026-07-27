export type ElementUiPrimitiveKind =
  | "layout-row" | "layout-column" | "form" | "form-field" | "input" | "button"
  | "radio-group" | "radio-button" | "tag" | "tabs" | "tab-pane" | "table"
  | "table-column" | "card" | "progress" | "dialog" | "tooltip";

export interface ElementUiPrimitive {
  kind: ElementUiPrimitiveKind;
  sourceTag: string;
  props: Record<string, string | true>;
  responsiveSpans?: Partial<Record<"xs" | "sm" | "md" | "lg" | "xl", string>>;
  reviewReasons: string[];
}

export interface SfcTemplateEmbeddedAsset {
  kind: "svg";
  name: string;
  sourcePath: string;
  viewBox: string;
  markup: string;
}

export type SfcTemplateContentToken =
  | { kind: "text"; value: string }
  | { kind: "node"; nodeId: string };

export interface SfcTemplateNode {
  id: string;
  order: number;
  parentId?: string;
  depth: number;
  tag: string;
  componentName: string;
  classes: string[];
  attributes: Record<string, string | true>;
  inlineStyle: Record<string, string>;
  conditions: string[];
  loops: string[];
  slot?: string;
  content: SfcTemplateContentToken[];
  embeddedAssets?: SfcTemplateEmbeddedAsset[];
  primitive?: ElementUiPrimitive;
}

export interface SfcTemplateStructure {
  roots: string[];
  nodes: SfcTemplateNode[];
  componentOrder: string[];
  primitiveCounts: Partial<Record<ElementUiPrimitiveKind, number>>;
  inlineVisualDeclarations: number;
  conditionalRegions: number;
  repeatedRegions: number;
  slotOwners: number;
  responsiveGridNodes: number;
}

const primitiveByTag: Record<string, ElementUiPrimitiveKind> = {
  "el-row": "layout-row", "el-col": "layout-column", "el-form": "form", "el-form-item": "form-field",
  "el-input": "input", "el-button": "button", "el-radio-group": "radio-group", "el-radio-button": "radio-button",
  "el-tag": "tag", "el-tabs": "tabs", "el-tab-pane": "tab-pane", "el-table": "table",
  "el-table-column": "table-column", "el-card": "card", "el-progress": "progress", "el-dialog": "dialog", "el-tooltip": "tooltip",
};

function normalizeTag(tag: string): string {
  return tag.includes("-") ? tag.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join("") : tag;
}
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
function parseAttributes(source: string): Record<string, string | true> {
  const output: Record<string, string | true> = {};
  const regex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(regex)) output[match[1]] = match[2] ?? match[3] ?? match[4] ?? true;
  return output;
}
function parseStyle(value: string | true | undefined): Record<string, string> {
  if (typeof value !== "string") return {};
  return Object.fromEntries(value.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf(":"); return index < 0 ? [item, ""] : [item.slice(0, index).trim(), item.slice(index + 1).trim()];
  }));
}
function classes(attributes: Record<string, string | true>): string[] {
  const literal = typeof attributes.class === "string" ? attributes.class.split(/\s+/) : [];
  const bound = typeof attributes[":class"] === "string" ? [...attributes[":class"].matchAll(/["']([A-Za-z_][\w-]*)["']/g)].map((item) => item[1]) : [];
  return unique([...literal, ...bound]);
}
function primitive(tag: string, attributes: Record<string, string | true>): ElementUiPrimitive | undefined {
  const kind = primitiveByTag[tag.toLowerCase()]; if (!kind) return undefined;
  const props = Object.fromEntries(Object.entries(attributes).filter(([name]) => !["class", "style"].includes(name) && !name.startsWith("@")));
  const responsiveSpans = kind === "layout-column" ? Object.fromEntries(["xs", "sm", "md", "lg", "xl"].flatMap((name) => {
    const value = attributes[`:${name}`] ?? attributes[name]; return value === undefined ? [] : [[name, String(value)]];
  })) : undefined;
  const reviewReasons = ["Element UI primitive requires stable DOM/CSS mapping"];
  if (responsiveSpans && Object.keys(responsiveSpans).length) reviewReasons.push("responsive grid spans require viewport-specific layout validation");
  return { kind, sourceTag: tag, props, responsiveSpans: responsiveSpans as ElementUiPrimitive["responsiveSpans"], reviewReasons };
}
function appendText(node: SfcTemplateNode | undefined, source: string): void {
  if (!node || !source || !source.trim()) return;
  const value = source.replace(/\s+/g, " ");
  if (value.trim()) node.content.push({ kind: "text", value });
}

export function analyzeSfcTemplateStructure(template: string): SfcTemplateStructure {
  const source = template.replace(/<!--[\s\S]*?-->/g, "");
  const nodes: SfcTemplateNode[] = [], roots: string[] = [], stack: string[] = [];
  const byId = new Map<string, SfcTemplateNode>();
  const tagRegex = /<\s*(\/)?\s*([A-Za-z][\w-]*)([^>]*?)(\/?)\s*>/g;
  let cursor = 0;
  for (const match of source.matchAll(tagRegex)) {
    appendText(byId.get(stack.at(-1) ?? ""), source.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;
    const closing = Boolean(match[1]), tag = match[2], attributeSource = match[3] ?? "", selfClosing = Boolean(match[4]) || /^(?:input|img|br|hr|meta|link)$/i.test(tag);
    if (closing) {
      const index = [...stack].reverse().findIndex((id) => byId.get(id)?.tag.toLowerCase() === tag.toLowerCase());
      if (index >= 0) stack.splice(stack.length - 1 - index);
      continue;
    }
    const attributes = parseAttributes(attributeSource), id = `template:${nodes.length + 1}`, parentId = stack.at(-1);
    const node: SfcTemplateNode = {
      id, order: nodes.length, parentId, depth: stack.length, tag, componentName: normalizeTag(tag), classes: classes(attributes), attributes,
      inlineStyle: parseStyle(attributes.style),
      conditions: unique(["v-if", "v-else-if", "v-show"].flatMap((name) => typeof attributes[name] === "string" ? [attributes[name]] : [])),
      loops: typeof attributes["v-for"] === "string" ? [attributes["v-for"]] : [],
      slot: typeof attributes.slot === "string" ? attributes.slot : typeof attributes["v-slot"] === "string" ? attributes["v-slot"] : undefined,
      content: [], primitive: primitive(tag, attributes),
    };
    nodes.push(node); byId.set(id, node);
    if (parentId) byId.get(parentId)?.content.push({ kind: "node", nodeId: id }); else roots.push(id);
    if (!selfClosing) stack.push(id);
  }
  appendText(byId.get(stack.at(-1) ?? ""), source.slice(cursor));
  const componentOrder = nodes.filter((node) => /^[A-Z]/.test(node.componentName) || node.tag.includes("-")).map((node) => node.componentName);
  const primitiveCounts: SfcTemplateStructure["primitiveCounts"] = {};
  for (const node of nodes) if (node.primitive) primitiveCounts[node.primitive.kind] = (primitiveCounts[node.primitive.kind] ?? 0) + 1;
  return {
    roots, nodes, componentOrder, primitiveCounts,
    inlineVisualDeclarations: nodes.reduce((sum, node) => sum + Object.keys(node.inlineStyle).length, 0),
    conditionalRegions: nodes.filter((node) => node.conditions.length > 0).length,
    repeatedRegions: nodes.filter((node) => node.loops.length > 0).length,
    slotOwners: nodes.filter((node) => node.slot).length,
    responsiveGridNodes: nodes.filter((node) => node.primitive?.responsiveSpans && Object.keys(node.primitive.responsiveSpans).length > 0).length,
  };
}
