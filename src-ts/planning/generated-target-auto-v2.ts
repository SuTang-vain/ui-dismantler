import type { SpaRouteShellPlan, SpaRouteShellRouteNode } from "./spa-route-shell.js";
import type { VisualTargetPlan, VisualTargetOwnerPlan } from "./visual-target-plan.js";
import type { RouterSfcResponsibilityGraph } from "./router-sfc-responsibility.js";
import { compilePrimitiveDom, materializeElementUiPrimitiveCss, materializePrimitiveCss, type PrimitiveDomCompilation, type PrimitiveDomNode } from "./primitive-dom-compiler.js";
import { materializeOwnerSourceStyles, type OwnerSourceStyleMaterialization } from "./scoped-style-materializer.js";
import {
  bindPrimitiveExpression,
  compilePrimitiveExpression,
  compilePrimitiveText,
  evaluatePrimitiveExpression,
  primitiveExpressionPaths,
  renderPrimitiveText,
  type PrimitiveExpression,
} from "./primitive-expression.js";
import type { JsonValue } from "../types.js";
import type { SfcVisualResponsibilityGraph } from "./sfc-visual-responsibility.js";

export interface AutoV2GeneratedFile {
  path: string;
  content: string;
  lines: number;
}

export interface AutoV2SourceBundle {
  routePlan: SpaRouteShellPlan;
  visualPlan: VisualTargetPlan;
  routerSfc: RouterSfcResponsibilityGraph;
  sfcVisual?: SfcVisualResponsibilityGraph;
  apiFixture?: { metrics?: Record<string, unknown> };
  spaAuth?: { metrics?: Record<string, unknown>; contracts?: unknown };
  transportProxy?: { metrics?: Record<string, unknown> };
}

export interface AutoV2QualitySummary {
  available: boolean;
  passed: boolean | null;
  navigationIntegrity: number | null;
  computedStyle: number | null;
  pixelDiff: number | null;
  runtimeErrors: number | null;
  requiredNetworkFailures: number | null;
  stabilityFailures: number | null;
  blockingHandlesAfterClose: number | null;
}

export interface AutoV2QualityComparison {
  comparable: boolean;
  routeComparable: boolean;
  manual: AutoV2QualitySummary;
  generated: AutoV2QualitySummary;
  generatedMinusManual: {
    computedStyle: number | null;
    pixelDiff: number | null;
    navigationIntegrity: number | null;
  };
  detail: string;
}

export interface GeneratedTargetAutoV2Artifact {
  schemaVersion: "1.0";
  kind: "generated-target-auto-v2";
  reviewRequired: true;
  fullGeneratedApplication: false;
  generatedVisualDom: true;
  source: {
    routerSfcGraphKind: RouterSfcResponsibilityGraph["kind"];
    routeBindings: number;
    resolvedRoutes: number;
    visualBoundaries: number;
    visualOwners: number;
    sfcVisualMetrics: Record<string, unknown> | null;
    apiFixtureMetrics: Record<string, unknown> | null;
    spaAuthMetrics: Record<string, unknown> | null;
    transportProxyMetrics: Record<string, unknown> | null;
  };
  files: AutoV2GeneratedFile[];
  metrics: {
    generatedFiles: number;
    generatedLines: number;
    generatedBytes: number;
    routeEntries: number;
    visualBoundaries: number;
    visualOwners: number;
    compiledOwnerRoots: number;
    generatedVisualNodes: number;
    generatedInteractionBindings: number;
    globalStyleSheetsMaterialized: number;
    sourceStyleSheetsAvailable: number;
    sourceStyleSheetsMaterialized: number;
    sourceStyleSheetsFailed: number;
    sourceStyleRulesMaterialized: number;
    sourceStyleSelectorsMaterialized: number;
    initialStateBindings: number;
    executableInteractionBindings: number;
    executableStateWrites: number;
    runtimeConditionBindings: number;
    reviewedFixtureBindings: number;
    generatedLoopInstances: number;
    resolvedTextBindings: number;
    unresolvedTextBindings: number;
    inferredFixtureSelections: number;
    modelCalls: 0;
    manualEdits: 0;
    manualEditedLines: 0;
    repairIterations: 0;
    generationMs: number | null;
  };
  qualityComparison: AutoV2QualityComparison;
  costComparison: {
    manualReviewedTarget: { manualEditedLines: number | null; repairIterations: number | null };
    autoV2FirstPass: { generatedLines: number; generatedBytes: number; manualEditedLines: 0; repairIterations: 0; modelCalls: 0; generationMs: number | null };
    detail: string;
  };
  limitations: string[];
}

export interface AutoV2GenerationOptions {
  manualQualityReport?: unknown;
  generatedQualityReport?: unknown;
  manualEditedLines?: number;
  repairIterations?: number;
  generationMs?: number;
}

function file(path: string, content: string): AutoV2GeneratedFile {
  const normalized = content.trimStart().replace(/\s+$/, "") + "\n";
  return { path, content: normalized, lines: normalized.split("\n").length - 1 };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

function normalizePath(path: string): string {
  const hash = path.includes("#") ? path.slice(path.indexOf("#") + 1) : path;
  const query = hash.split("?")[0] || "/";
  return query.startsWith("/") ? query : `/${query}`;
}

function routeMatches(path: string, pattern: string): boolean {
  const actual = normalizePath(path).split("/").filter(Boolean);
  const expected = normalizePath(pattern).split("/").filter(Boolean);
  if (actual.length !== expected.length) return false;
  return expected.every((segment, index) => segment.startsWith(":") || segment === "*" || segment === actual[index]);
}

interface AutoV2RouteRecord {
  path: string;
  name: string | null;
  componentFile: string | null;
  dynamic: boolean;
  resolution: string;
  confidence: string;
  visualBoundary: string | null;
  ownerIds: string[];
  screenshotAnchors: string[];
  viewports: string[];
}

function routeRecord(bundle: AutoV2SourceBundle): AutoV2RouteRecord[] {
  const boundaries = bundle.visualPlan.boundaries;
  return bundle.routerSfc.routes.map((route) => {
    const boundary = boundaries.find((candidate) => routeMatches(candidate.route, route.path));
    return {
      path: route.path,
      name: route.name,
      componentFile: route.sfcFile,
      dynamic: route.dynamic,
      resolution: route.resolution,
      confidence: route.confidence,
      visualBoundary: boundary?.id ?? null,
      ownerIds: boundary?.ownerIds ?? [],
      screenshotAnchors: boundary?.acceptance.screenshotAnchors ?? [],
      viewports: boundary?.acceptance.viewports ?? [],
    };
  });
}

function escapeHtml(value: string): string { return value.replace(/[&<>"\']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

interface AutoV2RuntimeConditionBinding { key: string; expression: PrimitiveExpression }
interface AutoV2RuntimeInteractionBinding {
  sourceNodeId: string;
  event: string;
  modifiers: string[];
  writes: Array<{ path: string; value: JsonValue }>;
}
interface AutoV2RuntimeModelBinding { sourceNodeId: string; path: string; event: "input" | "change"; numeric: boolean; checkbox: boolean }
interface AutoV2OwnerRuntime {
  initialState: Record<string, JsonValue>;
  displayFunctions: VisualTargetOwnerPlan["stateResponsibility"]["displayFunctions"];
  conditions: AutoV2RuntimeConditionBinding[];
  interactions: AutoV2RuntimeInteractionBinding[];
  models: AutoV2RuntimeModelBinding[];
}
interface AutoV2RenderMetrics {
  renderedNodes: number;
  generatedLoopInstances: number;
  reviewedFixtureBindings: number;
  runtimeConditionBindings: number;
  executableInteractionBindings: number;
  executableStateWrites: number;
  resolvedTextBindings: number;
  unresolvedTextBindings: number;
  inferredFixtureSelections: number;
}

function cloneJson<T extends JsonValue | Record<string, JsonValue>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setStatePath(target: Record<string, JsonValue>, path: string, value: JsonValue): void {
  const parts = path.replace(/\.value(?=\.|$)/g, "").split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, JsonValue> = target;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!existing || Array.isArray(existing) || typeof existing !== "object") current[part] = {};
    current = current[part] as Record<string, JsonValue>;
  }
  current[parts.at(-1)!] = cloneJson(value);
}

function initialOwnerState(owner: VisualTargetOwnerPlan): { state: Record<string, JsonValue>; fixtureBindings: number } {
  const state = cloneJson(owner.stateResponsibility?.initialState ?? {});
  let fixtureBindings = 0;
  for (const responsibility of owner.apiFixtures) {
    const value = responsibility.fixture.materializedValue;
    if (value === undefined) continue;
    setStatePath(state, responsibility.consumption.targetBinding, value);
    fixtureBindings += 1;
  }
  return { state, fixtureBindings };
}

function handlerName(expression: string): string | undefined {
  return expression.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:\(|$)/)?.[1];
}

function normalizeModelPath(value: string): string {
  return value.replace(/\.value(?=\.|$)/g, "").trim();
}

function loopDefinition(value: string | undefined): { aliases: string[]; collection: PrimitiveExpression } | undefined {
  const match = value?.match(/^\s*(?:\(([^)]+)\)|([A-Za-z_$][\w$]*))\s+(?:in|of)\s+(.+)$/);
  if (!match) return undefined;
  const aliases = (match[1] ?? match[2]).split(",").map((part) => part.trim()).filter(Boolean);
  return aliases.length > 0 ? { aliases, collection: compilePrimitiveExpression(match[3].trim()) } : undefined;
}

function effectiveConditionExpressions(compilation: PrimitiveDomCompilation): Map<string, PrimitiveExpression> {
  const output = new Map<string, PrimitiveExpression>();
  const groups = new Map<string, PrimitiveDomNode[]>();
  for (const node of compilation.nodes) {
    const key = node.parentId ?? "<roots>";
    const list = groups.get(key) ?? []; list.push(node); groups.set(key, list);
  }
  for (const siblings of groups.values()) {
    let chain: string[] = [];
    for (const node of siblings.sort((left, right) => left.order - right.order)) {
      const directive = node.conditionDirective;
      if (!directive) { chain = []; continue; }
      if (directive.kind === "if") {
        chain = directive.expression ? [directive.expression] : [];
        if (directive.expression) output.set(node.sourceNodeId, compilePrimitiveExpression(directive.expression));
      } else if (directive.kind === "else-if") {
        const expression = directive.expression ?? "false";
        const previous = chain.length > 0 ? chain.map((item) => `(${item})`).join(" || ") : "false";
        output.set(node.sourceNodeId, compilePrimitiveExpression(`!(${previous}) && (${expression})`));
        chain.push(expression);
      } else if (directive.kind === "else") {
        const previous = chain.length > 0 ? chain.map((item) => `(${item})`).join(" || ") : "false";
        output.set(node.sourceNodeId, compilePrimitiveExpression(`!(${previous})`));
        chain = [];
      } else if (directive.expression) {
        output.set(node.sourceNodeId, compilePrimitiveExpression(directive.expression));
        chain = [];
      }
    }
  }
  return output;
}

function expressionTouchesDynamicState(expression: PrimitiveExpression, dynamicPaths: Set<string>): boolean {
  return primitiveExpressionPaths(expression).some((path) => [...dynamicPaths].some((dynamic) => path === dynamic || path.startsWith(`${dynamic}.`) || dynamic.startsWith(`${path}.`)));
}

function dynamicClassMap(value: string | true | undefined): Array<{ name: string; expression: PrimitiveExpression }> {
  if (typeof value !== "string") return [];
  const object = value.trim().match(/^\{([\s\S]*)\}$/)?.[1];
  if (!object) return [];
  return [...object.matchAll(/(?:^|,)\s*['"]?([A-Za-z_][\w-]*)['"]?\s*:\s*([^,}]+)/g)].map((match) => ({ name: match[1], expression: compilePrimitiveExpression(match[2].trim()) }));
}

function inferReviewedFixtureSelections(owner: VisualTargetOwnerPlan, compilation: PrimitiveDomCompilation, state: Record<string, JsonValue>): number {
  const unresolvedPaths = new Set((owner.stateResponsibility?.unresolvedWrites ?? []).map((write) => write.path));
  if (unresolvedPaths.size === 0) return 0;
  const nodeById = new Map(compilation.nodes.map((node) => [node.id, node]));
  const isWithin = (candidate: PrimitiveDomNode, root: PrimitiveDomNode): boolean => {
    if (candidate.id === root.id) return true;
    let parent = candidate.parentId;
    while (parent) { if (parent === root.id) return true; parent = nodeById.get(parent)?.parentId; }
    return false;
  };
  let inferred = 0;
  for (const loopNode of compilation.nodes.filter((node) => node.loops.length > 0)) {
    const loop = loopDefinition(loopNode.loops[0]);
    if (!loop || loop.collection.kind !== "path") continue;
    const collection = evaluatePrimitiveExpression(loop.collection, state);
    if (!collection.resolved || !Array.isArray(collection.value) || collection.value.length === 0) continue;
    const alias = loop.aliases[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const descendants = compilation.nodes.filter((node) => isWithin(node, loopNode));
    const sources = descendants.flatMap((node) => [typeof node.attributes[":class"] === "string" ? node.attributes[":class"] : "", ...node.conditions]);
    const equality = sources.flatMap((source) => {
      const direct = source.match(new RegExp(`([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\s*={2,3}\\s*${alias}\\.([A-Za-z_$][\\w$]*)`));
      const reverse = source.match(new RegExp(`${alias}\\.([A-Za-z_$][\\w$]*)\\s*={2,3}\\s*([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)`));
      return direct ? [{ statePath: direct[1], itemField: direct[2] }] : reverse ? [{ statePath: reverse[2], itemField: reverse[1] }] : [];
    }).find((candidate) => unresolvedPaths.has(candidate.statePath));
    if (!equality) continue;
    const predicateFields = [...new Set(sources.flatMap((source) => [...source.matchAll(new RegExp(`${alias}\\.([A-Za-z_$][\\w$]*)`, "g"))].map((match) => match[1])).filter((field) => field !== equality.itemField))];
    for (const predicateField of predicateFields) {
      const matches = collection.value.filter((item) => item && typeof item === "object" && !Array.isArray(item) && Boolean((item as Record<string, JsonValue>)[predicateField]));
      if (matches.length !== 1) continue;
      const selected = (matches[0] as Record<string, JsonValue>)[equality.itemField];
      if (selected === undefined) continue;
      setStatePath(state, equality.statePath, selected);
      inferred += 1;
      break;
    }
  }
  return inferred;
}

function renderPrimitiveCompilation(compilation: PrimitiveDomCompilation, owner: VisualTargetOwnerPlan): { html: string; css: string; nodes: number; interactions: number; runtime: AutoV2OwnerRuntime; metrics: AutoV2RenderMetrics } {
  const nodes = new Map(compilation.nodes.map((node) => [node.sourceNodeId, node]));
  const children = new Map<string, PrimitiveDomNode[]>();
  for (const node of compilation.nodes) {
    if (!node.parentId) continue;
    const parentSourceId = compilation.nodes.find((candidate) => candidate.id === node.parentId)?.sourceNodeId;
    if (!parentSourceId) continue;
    const list = children.get(parentSourceId) ?? []; list.push(node); children.set(parentSourceId, list);
  }
  const eventsBySource = new Map<string, string[]>();
  for (const interaction of compilation.interactions) eventsBySource.set(interaction.sourceNodeId, [...(eventsBySource.get(interaction.sourceNodeId) ?? []), interaction.event]);
  const { state, fixtureBindings } = initialOwnerState(owner);
  const inferredFixtureSelections = inferReviewedFixtureSelections(owner, compilation, state);
  const dynamicPaths = new Set<string>([
    ...(owner.stateResponsibility?.handlers ?? []).flatMap((handler) => handler.writes.map((write) => write.path)),
    ...(owner.stateResponsibility?.unresolvedWrites ?? []).map((write) => write.path),
    ...owner.interactions.models.map(normalizeModelPath),
  ]);
  const conditionExpressions = effectiveConditionExpressions(compilation);
  const conditions: AutoV2RuntimeConditionBinding[] = [];
  const metrics: AutoV2RenderMetrics = {
    renderedNodes: 0, generatedLoopInstances: 0, reviewedFixtureBindings: fixtureBindings, runtimeConditionBindings: 0,
    executableInteractionBindings: 0, executableStateWrites: 0, resolvedTextBindings: 0, unresolvedTextBindings: 0, inferredFixtureSelections,
  };
  let conditionIndex = 0;

  const handlerMap = new Map((owner.stateResponsibility?.handlers ?? []).map((handler) => [handler.handler, handler]));
  const compiledNodeId = new Map(compilation.nodes.map((node) => [node.sourceNodeId, node.id]));
  const interactions: AutoV2RuntimeInteractionBinding[] = compilation.interactions.flatMap((interaction) => {
    const name = handlerName(interaction.expression), handler = name ? handlerMap.get(name) : undefined;
    const writes = (handler?.writes ?? []).filter((write) => write.value !== undefined).map((write) => ({ path: write.path, value: write.value! }));
    if (writes.length === 0) return [];
    metrics.executableInteractionBindings += 1; metrics.executableStateWrites += writes.length;
    return [{ sourceNodeId: compiledNodeId.get(interaction.sourceNodeId) ?? interaction.sourceNodeId, event: interaction.event, modifiers: interaction.modifiers, writes }];
  });
  const models: AutoV2RuntimeModelBinding[] = compilation.nodes.flatMap((node) => {
    const model = node.attributes["v-model"];
    if (typeof model !== "string") return [];
    const inputType = String(node.attributes.type ?? "");
    return [{ sourceNodeId: node.id, path: normalizeModelPath(model), event: node.renderTag === "select" || inputType === "checkbox" || inputType === "radio" ? "change" as const : "input" as const, numeric: /\.number\b/.test(model), checkbox: inputType === "checkbox" }];
  });

  const scopeFor = (context: Record<string, unknown>): Record<string, unknown> => ({ ...state, ...context, __autoV2DisplayFunctions: owner.stateResponsibility?.displayFunctions ?? [] });
  const renderText = (value: string, context: Record<string, unknown>): string => {
    const segments = compilePrimitiveText(value);
    for (const segment of segments) {
      if (segment.kind !== "expression" || !segment.expression) continue;
      const result = evaluatePrimitiveExpression(segment.expression, scopeFor(context));
      if (result.resolved) metrics.resolvedTextBindings += 1; else metrics.unresolvedTextBindings += 1;
    }
    return escapeHtml(renderPrimitiveText(segments, scopeFor(context)));
  };
  const renderAttributes = (node: PrimitiveDomNode, context: Record<string, unknown>, instance: string, conditionKey?: string): string => {
    const attributes: string[] = [`data-primitive-node="${escapeHtml(node.id)}"`, `data-auto-v2-owner="${escapeHtml(owner.id)}"`, `data-auto-v2-instance="${escapeHtml(instance)}"`];
    if (conditionKey) attributes.push(`data-auto-v2-condition="${escapeHtml(conditionKey)}"`);
    const dynamicClasses = dynamicClassMap(node.attributes[":class"]);
    const dynamicNames = new Set(dynamicClasses.map((item) => item.name));
    const classes = node.classes.filter((name) => !dynamicNames.has(name));
    for (const item of dynamicClasses) {
      const result = evaluatePrimitiveExpression(bindPrimitiveExpression(item.expression, context), scopeFor(context));
      if (result.resolved && result.value) classes.push(item.name);
    }
    if (classes.length > 0) attributes.push(`class="${escapeHtml([...new Set(classes)].join(" "))}"`);
    for (const [name, value] of Object.entries(node.attributes)) {
      if (name.startsWith("@") || name.startsWith("v-") || name.startsWith("#") || name === "class" || name === "style" || name === ":class") continue;
      if (name.startsWith(":")) {
        const result = evaluatePrimitiveExpression(bindPrimitiveExpression(compilePrimitiveExpression(String(value)), context), scopeFor(context));
        if (!result.resolved || result.value === false || result.value === null) continue;
        attributes.push(result.value === true ? escapeHtml(name.slice(1)) : `${escapeHtml(name.slice(1))}="${escapeHtml(String(result.value))}"`);
        continue;
      }
      attributes.push(value === true ? escapeHtml(name) : `${escapeHtml(name)}="${escapeHtml(String(value))}"`);
    }
    const model = node.attributes["v-model"];
    if (typeof model === "string") {
      const result = evaluatePrimitiveExpression(compilePrimitiveExpression(normalizeModelPath(model)), scopeFor(context));
      if (result.resolved) {
        if (String(node.attributes.type ?? "") === "checkbox") { if (result.value) attributes.push("checked"); }
        else if (result.value !== null && !attributes.some((item) => item.startsWith("value="))) attributes.push(`value="${escapeHtml(String(result.value))}"`);
      }
    }
    const style = Object.entries(node.inlineStyle).map(([name, value]) => `${name}:${value}`).join(";");
    if (style) attributes.push(`style="${escapeHtml(style)}"`);
    const events = eventsBySource.get(node.sourceNodeId) ?? [];
    if (events.length > 0) attributes.push(`data-auto-v2-events="${escapeHtml(events.join(","))}"`);
    return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  };

  const renderNode = (node: PrimitiveDomNode, context: Record<string, unknown>, instance: string): string => {
    const loop = loopDefinition(node.loops[0]);
    if (loop) {
      const expression = bindPrimitiveExpression(loop.collection, context), result = evaluatePrimitiveExpression(expression, scopeFor(context));
      const values = result.resolved && Array.isArray(result.value) ? result.value : [null];
      if (result.resolved && Array.isArray(result.value)) metrics.generatedLoopInstances += values.length;
      return values.map((value, index) => {
        const next = { ...context, [loop.aliases[0]]: value } as Record<string, unknown>;
        if (loop.aliases[1]) next[loop.aliases[1]] = index;
        return renderSingle(node, next, `${instance}-${index}`);
      }).join("");
    }
    return renderSingle(node, context, instance);
  };
  const renderSingle = (node: PrimitiveDomNode, context: Record<string, unknown>, instance: string): string => {
    const condition = conditionExpressions.get(node.sourceNodeId);
    let conditionKey: string | undefined;
    if (condition) {
      const bound = bindPrimitiveExpression(condition, context);
      if (expressionTouchesDynamicState(bound, dynamicPaths)) {
        conditionKey = `${owner.id}:${node.sourceNodeId}:${conditionIndex++}`;
        conditions.push({ key: conditionKey, expression: bound }); metrics.runtimeConditionBindings += 1;
      } else {
        const result = evaluatePrimitiveExpression(bound, scopeFor(context));
        if (!result.resolved || !result.value) return "";
      }
    }
    metrics.renderedNodes += 1;
    const childBySource = new Map((children.get(node.sourceNodeId) ?? []).map((child) => [child.sourceNodeId, child]));
    const tokens = node.content.map((token) => token.kind === "text" ? renderText(token.value, context) : (childBySource.get(token.nodeId) ? renderNode(childBySource.get(token.nodeId)!, context, `${instance}-${childBySource.get(token.nodeId)!.order}`) : "")).join("");
    const fallbackChildren = tokens || (children.get(node.sourceNodeId) ?? []).sort((left, right) => left.order - right.order).map((child) => renderNode(child, context, `${instance}-${child.order}`)).join("");
    const attributes = renderAttributes(node, context, instance, conditionKey);
    const voidTag = new Set(["input", "img", "br", "hr", "meta", "link"]).has(node.renderTag);
    return voidTag ? `<${node.renderTag}${attributes}>` : `<${node.renderTag}${attributes}>${fallbackChildren}</${node.renderTag}>`;
  };
  const html = compilation.roots.map((rootId, index) => nodes.get(rootId) ? renderNode(nodes.get(rootId)!, {}, `root-${index}`) : "").join("");
  return {
    html,
    css: `${materializeElementUiPrimitiveCss(compilation)}${materializePrimitiveCss(compilation)}`,
    nodes: metrics.renderedNodes,
    interactions: compilation.interactions.length,
    runtime: { initialState: state, displayFunctions: owner.stateResponsibility?.displayFunctions ?? [], conditions, interactions, models },
    metrics,
  };
}

interface GeneratedOwnerRender {
  html: string;
  css: string;
  nodes: number;
  interactions: number;
  runtime: AutoV2OwnerRuntime;
  renderMetrics: AutoV2RenderMetrics;
  sourceStyles: OwnerSourceStyleMaterialization;
}

function ownerMarkup(owner: VisualTargetOwnerPlan): GeneratedOwnerRender {
  const label = owner.componentName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const compilation = compilePrimitiveDom(owner.templateStructure, `auto-v2-${owner.id}`);
  const rendered = renderPrimitiveCompilation(compilation, owner);
  const sourceStyles = materializeOwnerSourceStyles(owner);
  const body = rendered.html || `<div class="auto-v2-owner-body" data-auto-v2-node="${escapeHtml(owner.componentId)}"></div>`;
  return { ...rendered, renderMetrics: rendered.metrics, sourceStyles, css: `${rendered.css}${sourceStyles.css}`, html: `<section class="auto-v2-owner" data-visual-owner="${escapeHtml(owner.id)}" data-source-file="${escapeHtml(owner.sourceFile)}"><header>${escapeHtml(label)}</header><div class="auto-v2-owner-body">${body}</div></section>` };
}

function generatedApp(bundle: AutoV2SourceBundle): string {
  const records = routeRecord(bundle);
  const ownerRenders = Object.fromEntries(bundle.visualPlan.owners.map((owner) => [owner.id, ownerMarkup(owner)]));
  const ownerMarkupById = Object.fromEntries(Object.entries(ownerRenders).map(([id, render]) => [id, render.html]));
  const ownerRuntimeById = Object.fromEntries(Object.entries(ownerRenders).map(([id, render]) => [id, render.runtime]));
  const initial = normalizePath(bundle.routePlan.routes.find((route) => route.entry)?.route ?? records[0]?.path ?? "/");
  return `const ROUTES=${json(records)};
const OWNER_MARKUP=${json(ownerMarkupById)};
const OWNER_RUNTIME=${json(ownerRuntimeById)};
const BOUNDARIES=${json(Object.fromEntries(bundle.visualPlan.boundaries.map((boundary) => [boundary.id, { route: boundary.route, ownerIds: boundary.ownerIds }])))};
const app=document.getElementById('app');
const OWNER_STATE={};
const clone=(value)=>JSON.parse(JSON.stringify(value));
const stateFor=(owner)=>{if(OWNER_STATE[owner])return OWNER_STATE[owner];const state=clone(OWNER_RUNTIME[owner]?.initialState||{});state.__autoV2DisplayFunctions=clone(OWNER_RUNTIME[owner]?.displayFunctions||[]);return OWNER_STATE[owner]=state};
const getPath=(scope,path)=>{let value=scope;for(const part of path.split('.')){if(value==null||typeof value!=='object'||!(part in value))return [false,null];value=value[part]}return [true,value]};
const setPath=(scope,path,value)=>{const parts=path.split('.').filter(Boolean);let target=scope;for(const part of parts.slice(0,-1)){if(!target[part]||typeof target[part]!=='object'||Array.isArray(target[part]))target[part]={};target=target[part]}target[parts[parts.length-1]]=clone(value)};
const evalExpr=(expr,scope)=>{if(!expr)return [false,null];if(expr.kind==='literal')return [true,expr.value];if(expr.kind==='path')return getPath(scope,expr.path);if(expr.kind==='unsupported')return [false,null];if(expr.kind==='unary'){const a=evalExpr(expr.argument,scope);if(!a[0])return a;if(expr.operator==='!')return [true,!a[1]];return typeof a[1]==='number'?[true,expr.operator==='-'?-a[1]:a[1]]:[false,null]}if(expr.kind==='logical'){const a=evalExpr(expr.left,scope);if(!a[0])return a;if(expr.operator==='&&')return a[1]?evalExpr(expr.right,scope):a;if(expr.operator==='||')return a[1]?a:evalExpr(expr.right,scope);return a[1]!=null?a:evalExpr(expr.right,scope)}if(expr.kind==='binary'){const a=evalExpr(expr.left,scope),b=evalExpr(expr.right,scope);if(!a[0]||!b[0])return [false,null];return [true,expr.operator==='==='?a[1]===b[1]:expr.operator==='!=='?a[1]!==b[1]:expr.operator==='=='?a[1]==b[1]:expr.operator==='!='?a[1]!=b[1]:expr.operator==='>'?a[1]>b[1]:expr.operator==='>='?a[1]>=b[1]:expr.operator==='<'?a[1]<b[1]:a[1]<=b[1]]}if(expr.kind==='call'){const fn=(scope.__autoV2DisplayFunctions||[]).find((item)=>item.functionName===expr.functionName);if(!fn||fn.operation!=='date-locale-string'||expr.arguments.length!==1)return [false,null];const a=evalExpr(expr.arguments[0],scope);if(!a[0])return a;if(!a[1]&&Object.prototype.hasOwnProperty.call(fn,'fallback'))return [true,fn.fallback];const date=new Date(String(a[1]));return Number.isNaN(date.getTime())?[false,null]:[true,date.toLocaleString(fn.locale||undefined)]}if(expr.kind==='conditional'){const test=evalExpr(expr.test,scope);return test[0]?evalExpr(test[1]?expr.consequent:expr.alternate,scope):test}return [false,null]};
const applyConditions=(owner)=>{const root=document.querySelector('[data-visual-owner="'+owner+'"]');if(!root)return;const state=stateFor(owner);for(const binding of OWNER_RUNTIME[owner]?.conditions||[]){for(const node of root.querySelectorAll('[data-auto-v2-condition]')){if(node.getAttribute('data-auto-v2-condition')!==binding.key)continue;const result=evalExpr(binding.expression,state);node.hidden=result[0]?!result[1]:true}}};
const bindOwner=(owner)=>{const root=document.querySelector('[data-visual-owner="'+owner+'"]');if(!root)return;const runtime=OWNER_RUNTIME[owner]||{},state=stateFor(owner);for(const binding of runtime.interactions||[]){for(const node of root.querySelectorAll('[data-primitive-node="'+binding.sourceNodeId+'"]'))node.addEventListener(binding.event,(event)=>{if(binding.modifiers.includes('self')&&event.target!==node)return;for(const write of binding.writes)setPath(state,write.path,write.value);applyConditions(owner)})}for(const binding of runtime.models||[]){for(const node of root.querySelectorAll('[data-primitive-node="'+binding.sourceNodeId+'"]'))node.addEventListener(binding.event,()=>{let value=binding.checkbox?node.checked:node.value;if(binding.numeric&&value!=='')value=Number(value);setPath(state,binding.path,value);applyConditions(owner)})}applyConditions(owner)};
const normalize=(value)=>{const hash=value.includes('#')?value.slice(value.indexOf('#')+1):value;const path=(hash.split('?')[0]||'/');return path.startsWith('/')?path:'/'+path};
const matches=(path,pattern)=>{const a=normalize(path).split('/').filter(Boolean),b=normalize(pattern).split('/').filter(Boolean);return a.length===b.length&&b.every((part,index)=>part.startsWith(':')||part==='*'||part===a[index])};
const routeFor=(path)=>ROUTES.find((route)=>matches(path,route.path))||ROUTES[0];
const render=()=>{const path=normalize(location.pathname+location.search),route=routeFor(path);const owners=(route.ownerIds||[]).map((id)=>OWNER_MARKUP['visual:'+id]||OWNER_MARKUP[id]||'').join('');const marker=owners?'':'<span class="auto-v2-route-marker" aria-hidden="true"></span>';app.innerHTML='<nav class="auto-v2-nav">'+ROUTES.map((item)=>'<a href="'+item.path+'" data-auto-v2-route="'+item.path+'">'+(item.name||item.path)+'</a>').join('')+'</nav><main data-auto-v2-route="'+route.path+'" data-auto-v2-component="'+(route.componentFile||'')+'"><h1>'+((route.name||route.path))+'</h1>'+marker+owners+'</main>';document.title=route.name||route.path;document.querySelectorAll('[data-auto-v2-route]').forEach((node)=>node.addEventListener('click',(event)=>{if(node.tagName==='A'){event.preventDefault();history.pushState({autoV2:true,route:node.getAttribute('href')},'',node.getAttribute('href'));render()}}));for(const id of route.ownerIds||[])bindOwner(id)};
history.replaceState({autoV2:true,route:${JSON.stringify(initial)}},'',location.href);addEventListener('popstate',render);render();
void BOUNDARIES;`;
}

function globalStyleContext(bundle: AutoV2SourceBundle): { css: string; styleSheets: number } {
  const roots = (bundle.sfcVisual?.components ?? []).filter((component) => component.templateStructure.nodes.some((node) => node.componentName === "RouterView" || node.tag.toLowerCase() === "router-view"));
  const sheets = roots.flatMap((component) => component.styles.filter((style) => !style.scoped && style.compileStatus !== "failed" && style.compiledCss).map((style) => style.compiledCss!));
  return { css: sheets.join("\n"), styleSheets: sheets.length };
}

function generatedStyles(bundle: AutoV2SourceBundle): string {
  const ownerCss = bundle.visualPlan.owners.map((owner) => ownerMarkup(owner).css).filter(Boolean).join("");
  const globalCss = globalStyleContext(bundle).css;
  return `:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#263238;background:#fff}*{box-sizing:border-box}html,body,#app{margin:0;min-height:100%}body{min-height:100vh}[hidden]{display:none!important}.auto-v2-nav{position:fixed;right:8px;top:8px;z-index:2147483647;opacity:0;display:flex;gap:4px;padding:4px;background:rgba(38,50,56,.92);border-radius:4px}.auto-v2-nav a{color:#fff;text-decoration:none;font-size:11px;padding:3px 5px}.auto-v2-nav a:hover{text-decoration:underline}main{max-width:none;margin:0;padding:0}main>h1,.auto-v2-owner>header{display:none}.auto-v2-route-marker{display:block;width:1px;height:1px;opacity:0;pointer-events:none}.auto-v2-owner,.auto-v2-owner-body{display:contents}${globalCss}${ownerCss}`;
}


function generatedIndex(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generated Target Auto v2</title><link rel="stylesheet" href="/styles.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>`;
}

function generatedServer(): string {
  return `import { createServer } from 'node:http';import { readFile } from 'node:fs/promises';import { extname,join } from 'node:path';import { fileURLToPath } from 'node:url';const root=join(fileURLToPath(new URL('.',import.meta.url)),'public');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};createServer(async(req,res)=>{try{const pathname=new URL(req.url||'/', 'http://localhost').pathname;const path=join(root,pathname==='/'?'index.html':pathname);const body=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{const body=await readFile(join(root,'index.html'));res.writeHead(200,{'content-type':types['.html'],'cache-control':'no-store'});res.end(body)}}).listen(Number(process.env.PORT||9530),'127.0.0.1',()=>console.log('generated-target-auto-v2 http://127.0.0.1:'+Number(process.env.PORT||9530)));`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function qualitySummary(report: unknown): AutoV2QualitySummary {
  if (!report || typeof report !== "object") return { available: false, passed: null, navigationIntegrity: null, computedStyle: null, pixelDiff: null, runtimeErrors: null, requiredNetworkFailures: null, stabilityFailures: null, blockingHandlesAfterClose: null };
  const value = report as Record<string, any>;
  return {
    available: true,
    passed: typeof value.passed === "boolean" ? value.passed : null,
    navigationIntegrity: numberOrNull(value.navigationIntegrity?.rate),
    computedStyle: numberOrNull(value.visualMatrix?.worstComputedStyle),
    pixelDiff: numberOrNull(value.visualMatrix?.worstPixelDiff),
    runtimeErrors: numberOrNull(value.runtimeErrors),
    requiredNetworkFailures: numberOrNull(value.requiredNetworkFailures),
    stabilityFailures: numberOrNull(value.visualMatrix?.stabilityFailures ?? value.stabilityFailures),
    blockingHandlesAfterClose: numberOrNull(value.telemetry?.activeHandlesAfterClose?.totalBlockingHandles),
  };
}

function delta(manual: number | null, generated: number | null): number | null {
  return manual === null || generated === null ? null : Number((generated - manual).toFixed(6));
}

function compareQuality(manualReport: unknown, generatedReport: unknown): AutoV2QualityComparison {
  const manual = qualitySummary(manualReport);
  const generated = qualitySummary(generatedReport);
  const routeComparable = manual.available && generated.available && manual.navigationIntegrity !== null && generated.navigationIntegrity !== null;
  const comparable = routeComparable && manual.computedStyle !== null && generated.computedStyle !== null && manual.pixelDiff !== null && generated.pixelDiff !== null;
  return {
    comparable,
    routeComparable,
    manual,
    generated,
    generatedMinusManual: { computedStyle: delta(manual.computedStyle, generated.computedStyle), pixelDiff: delta(manual.pixelDiff, generated.pixelDiff), navigationIntegrity: delta(manual.navigationIntegrity, generated.navigationIntegrity) },
    detail: comparable ? "report-level quality comparison; formal Gold+ gates remain authoritative" : routeComparable ? "Semantic route reports are comparable, but generated visual Gold+ fields are absent; no visual-equivalence claim" : "quality reports were not supplied; auto-v2 is a review candidate and does not claim visual equivalence",
  };
}

export function generateGeneratedTargetAutoV2(bundle: AutoV2SourceBundle, options: AutoV2GenerationOptions = {}): GeneratedTargetAutoV2Artifact {
  const files = [file("public/index.html", generatedIndex()), file("public/app.js", generatedApp(bundle)), file("public/styles.css", generatedStyles(bundle)), file("server.mjs", generatedServer())];
  const ownerRenders = bundle.visualPlan.owners.map((owner) => ownerMarkup(owner));
  const compiledOwnerRoots = bundle.visualPlan.owners.length;
  const globalStyleSheetsMaterialized = globalStyleContext(bundle).styleSheets;
  const generatedVisualNodes = ownerRenders.reduce((sum, render) => sum + render.nodes, 0);
  const generatedInteractionBindings = ownerRenders.reduce((sum, render) => sum + render.interactions, 0);
  const sourceStyleSheetsAvailable = ownerRenders.reduce((sum, render) => sum + render.sourceStyles.metrics.styleSheetsAvailable, 0);
  const sourceStyleSheetsMaterialized = ownerRenders.reduce((sum, render) => sum + render.sourceStyles.metrics.styleSheetsMaterialized, 0);
  const sourceStyleSheetsFailed = ownerRenders.reduce((sum, render) => sum + render.sourceStyles.metrics.styleSheetsFailed, 0);
  const sourceStyleRulesMaterialized = ownerRenders.reduce((sum, render) => sum + render.sourceStyles.metrics.rulesMaterialized, 0);
  const sourceStyleSelectorsMaterialized = ownerRenders.reduce((sum, render) => sum + render.sourceStyles.metrics.selectorsMaterialized, 0);
  const initialStateBindings = ownerRenders.reduce((sum, render) => sum + Object.keys(render.runtime.initialState).length, 0);
  const executableInteractionBindings = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.executableInteractionBindings, 0);
  const executableStateWrites = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.executableStateWrites, 0);
  const runtimeConditionBindings = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.runtimeConditionBindings, 0);
  const reviewedFixtureBindings = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.reviewedFixtureBindings, 0);
  const generatedLoopInstances = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.generatedLoopInstances, 0);
  const resolvedTextBindings = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.resolvedTextBindings, 0);
  const unresolvedTextBindings = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.unresolvedTextBindings, 0);
  const inferredFixtureSelections = ownerRenders.reduce((sum, render) => sum + render.renderMetrics.inferredFixtureSelections, 0);
  return {
    schemaVersion: "1.0",
    kind: "generated-target-auto-v2",
    reviewRequired: true,
    fullGeneratedApplication: false,
    generatedVisualDom: true,
    source: {
      routerSfcGraphKind: bundle.routerSfc.kind,
      routeBindings: bundle.routerSfc.metrics.routeBindings,
      resolvedRoutes: bundle.routerSfc.metrics.resolvedRoutes,
      visualBoundaries: bundle.visualPlan.metrics.boundaries,
      visualOwners: bundle.visualPlan.metrics.owners,
      sfcVisualMetrics: bundle.sfcVisual?.metrics ?? null,
      apiFixtureMetrics: bundle.apiFixture?.metrics ?? null,
      spaAuthMetrics: bundle.spaAuth?.metrics ?? null,
      transportProxyMetrics: bundle.transportProxy?.metrics ?? null,
    },
    files,
    metrics: {
      generatedFiles: files.length,
      generatedLines: files.reduce((sum, item) => sum + item.lines, 0),
      generatedBytes: files.reduce((sum, item) => sum + Buffer.byteLength(item.content, "utf8"), 0),
      routeEntries: bundle.routerSfc.routes.length,
      visualBoundaries: bundle.visualPlan.metrics.boundaries,
      visualOwners: bundle.visualPlan.metrics.owners,
      compiledOwnerRoots,
      generatedVisualNodes,
      generatedInteractionBindings,
      globalStyleSheetsMaterialized,
      sourceStyleSheetsAvailable,
      sourceStyleSheetsMaterialized,
      sourceStyleSheetsFailed,
      sourceStyleRulesMaterialized,
      sourceStyleSelectorsMaterialized,
      initialStateBindings,
      executableInteractionBindings,
      executableStateWrites,
      runtimeConditionBindings,
      reviewedFixtureBindings,
      generatedLoopInstances,
      resolvedTextBindings,
      unresolvedTextBindings,
      inferredFixtureSelections,
      modelCalls: 0,
      manualEdits: 0,
      manualEditedLines: 0,
      repairIterations: 0,
      generationMs: options.generationMs ?? null,
    },
    qualityComparison: compareQuality(options.manualQualityReport, options.generatedQualityReport),
    costComparison: {
      manualReviewedTarget: { manualEditedLines: options.manualEditedLines ?? null, repairIterations: options.repairIterations ?? null },
      autoV2FirstPass: { generatedLines: files.reduce((sum, item) => sum + item.lines, 0), generatedBytes: files.reduce((sum, item) => sum + Buffer.byteLength(item.content, "utf8"), 0), manualEditedLines: 0, repairIterations: 0, modelCalls: 0, generationMs: options.generationMs ?? null },
      detail: "manual values are reviewed inputs; auto-v2 first-pass values are deterministic generation telemetry",
    },
    limitations: [
      "auto-v2 is a responsibility-guided route and visual-owner shell, not a full business-page implementation",
      "router ownership comes from route-to-import-to-SFC evidence; unresolved bindings must block dispatch",
      "owner roots are compiled from primitive template evidence; unsupported primitives remain explicit review boundaries",
      "compiled source styles are selector-scoped to their visual owner; failed stylesheet parsing remains an explicit review boundary",
      "only explicitly reviewed API fixture values are eligible for initial data and loop materialization",
      "handler state writes and conditional rendering remain executable only when structural AST evidence is available",
      "the first Semantic and Gold+ run must be recorded before any manual repair; current artifact does not claim visual equivalence",
    ],
  };
}
