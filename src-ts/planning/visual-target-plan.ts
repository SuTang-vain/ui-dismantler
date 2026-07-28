import type { EChartsComponentResponsibility } from "./echarts-responsibility.js";
import type { SfcVisualComponentResponsibility, SfcVisualResponsibilityGraph, SfcVisualResourceEvidence } from "./sfc-visual-responsibility.js";
import type { SfcTemplateStructure } from "./sfc-template-structure.js";
import type { ApiFixtureResponsibility } from "./api-fixture-responsibility.js";
import type { SpaRouteShellPlan, SpaRouteShellRouteNode } from "./spa-route-shell.js";
import type { RouterSfcResponsibilityGraph } from "./router-sfc-responsibility.js";

export interface VisualTargetOwnerPlan {
  id: string;
  componentId: string;
  componentName: string;
  sourceFile: string;
  kind: "page" | "component" | "chart";
  parentOwnerId?: string;
  implementationSelector: string;
  acceptanceSelectors: string[];
  childComponents: string[];
  templateStructure: SfcTemplateStructure;
  dataCardinality: SfcVisualComponentResponsibility["dataCardinality"];
  stateResponsibility: SfcVisualComponentResponsibility["stateResponsibility"];
  apiFixtures: ApiFixtureResponsibility[];
  interactions: { events: string[]; models: string[]; conditions: string[]; loops: string[] };
  lifecycle: string[];
  responsiveMediaQueries: string[];
  sourceStyleSheets: Array<{ index: number; scoped: boolean; compiledCss?: string; compileStatus: "compiled" | "raw-css" | "failed" }>;
  runtimeDependencies: string[];
  chart?: {
    responsibilityId: string;
    themes: string[];
    chartTypes: string[];
    optionKeys: string[];
    optionSlices: EChartsComponentResponsibility["optionSlices"];
    staticBindings: EChartsComponentResponsibility["staticBindings"];
    dataSources: string[];
    capabilities: EChartsComponentResponsibility["capabilities"];
  };
  confidence: "high" | "medium";
  reviewReasons: string[];
}

export interface VisualResourceProfileProposal {
  profile: "dom" | "canvas";
  confidence: number;
  evidence: Array<{
    ownerId: string;
    sourceFile: string;
    kind: SfcVisualResourceEvidence["kind"] | "echarts-owner" | "dom-structure";
    detail: string;
  }>;
  reviewRequired: true;
}

export interface VisualTargetBoundaryPlan {
  id: string;
  route: string;
  scenarioIds: string[];
  rootOwnerId: string;
  acceptance: {
    visibleSelectors: string[];
    visibleText: string[];
    screenshotAnchors: string[];
    screenshotRegions: string[];
    styleTargets: string[];
    viewports: string[];
  };
  ownerIds: string[];
  resourceProfileProposal: VisualResourceProfileProposal;
  reviewRequired: true;
  reviewReasons: string[];
}

export interface VisualTargetPlan {
  schemaVersion: "1.0";
  kind: "visual-target-plan";
  reviewRequired: true;
  generatedCode: false;
  source: {
    sfcGraphKind: SfcVisualResponsibilityGraph["kind"];
    routePlanKind: SpaRouteShellPlan["kind"];
    sourceRoot: string;
    graphComponents: number;
    graphChartComponents: number;
    routerSfcGraphKind?: RouterSfcResponsibilityGraph["kind"];
    routerSfcResolvedRoutes?: number;
  };
  selectorPolicy: {
    implementationSelectorsIndependent: true;
    acceptanceSelectorsPreserved: true;
    implementationAttribute: "data-visual-owner";
  };
  boundaries: VisualTargetBoundaryPlan[];
  owners: VisualTargetOwnerPlan[];
  unresolved: Array<{ route: string; reason: string; candidates: string[] }>;
  metrics: {
    visualRoutes: number;
    boundaries: number;
    owners: number;
    chartOwners: number;
    responsiveOwners: number;
    interactiveOwners: number;
    apiFixtureOwners: number;
    canvasProfileProposals: number;
    domProfileProposals: number;
    unresolvedRoutes: number;
  };
  measurementTemplate: {
    modelCalls: number | null;
    generationMs: number | null;
    reviewMs: number | null;
    generatedLines: number | null;
    manualEdits: number | null;
    manualEditedLines: number | null;
    repairIterations: number | null;
    semanticRuns: number | null;
    visualRuns: number | null;
  };
  reviewReasons: string[];
}

const GENERIC_REGION_TOKENS = new Set(["className", "key", "password", "passwordType", "user", "visibility"]);

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function normalizedRoutePath(route: string): string {
  const hash = route.includes("#") ? route.slice(route.indexOf("#") + 1) : route;
  return (hash.split("?")[0] || "/").replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function routeTokens(route: string): string[] {
  return normalizedRoutePath(route).split("/").filter(Boolean).filter((token) => !["index", "page"].includes(token));
}

function pathTokens(component: SfcVisualComponentResponsibility): string[] {
  const expandedName = component.componentName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return `${component.file}/${expandedName}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function routeEvidenceClasses(route: SpaRouteShellRouteNode): string[] {
  const values = [
    ...route.assertions.map((assertion) => assertion.visibleSelector),
    ...route.visualStates.flatMap((state) => [state.anchor, state.region, ...state.styleTargets]),
  ].filter((value): value is string => Boolean(value));
  return unique(values.flatMap((value) => [...value.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1])));
}

function componentLiteralText(component: SfcVisualComponentResponsibility): string {
  return component.templateStructure.nodes.flatMap((node) => node.content)
    .filter((item): item is Extract<typeof item, { kind: "text" }> => item.kind === "text")
    .map((item) => item.value.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

function routeSegments(route: string): string[] {
  return normalizedRoutePath(route).split("/").filter(Boolean);
}

function routePatternMatches(actual: string, pattern: string): boolean {
  const actualSegments = routeSegments(actual);
  const patternSegments = routeSegments(pattern);
  if (actualSegments.length !== patternSegments.length) return false;
  return patternSegments.every((segment, index) => segment.startsWith(":") || segment === "*" || segment === actualSegments[index]);
}

function normalizeSourceFile(file: string): string {
  return file.replace(/^src\//, "").replace(/^\.\//, "");
}

function routerSfcRoot(route: SpaRouteShellRouteNode, components: SfcVisualComponentResponsibility[], routerGraph?: RouterSfcResponsibilityGraph): { root?: SfcVisualComponentResponsibility; candidates: string[]; blocked?: string } {
  if (!routerGraph) return { candidates: [] };
  const matches = routerGraph.routes.filter((binding) => routePatternMatches(route.route, binding.path));
  if (matches.length === 0) return { candidates: [], blocked: "route is absent from the router-to-SFC graph" };
  const binding = matches[0];
  if (!binding.sfcFile || binding.resolution === "unresolved") {
    return { candidates: matches.map((item) => `${item.path} -> unresolved`), blocked: `router component for ${binding.path} is unresolved` };
  }
  const expected = normalizeSourceFile(binding.sfcFile);
  const ranked = components
    .map((component) => ({ component, score: normalizeSourceFile(component.file) === expected || normalizeSourceFile(component.file).endsWith(`/${expected}`) ? 100 : 0 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.component.file.localeCompare(b.component.file));
  if (ranked.length === 0) return { candidates: [`${binding.path} -> ${binding.sfcFile}`], blocked: `SFC graph does not contain router owner ${binding.sfcFile}` };
  return { root: ranked[0].component, candidates: ranked.map((item) => `${item.component.file} (${item.score})`) };
}

function rootScore(route: SpaRouteShellRouteNode, component: SfcVisualComponentResponsibility): number {
  const routeParts = routeTokens(route.route);
  const componentParts = new Set(pathTokens(component));
  let score = routeParts.reduce((sum, token) => sum + (componentParts.has(token) ? 20 : 0), 0);
  const path = component.file.toLowerCase();
  const name = component.componentName.toLowerCase();
  const sourceClasses = new Set([...component.visualRegions, ...component.styles.flatMap((style) => style.classSelectors)]);
  const evidenceClassMatches = routeEvidenceClasses(route).filter((className) => sourceClasses.has(className)).length;
  score += Math.min(evidenceClassMatches, 3) * 30;
  const literalText = componentLiteralText(component);
  if (route.assertions.some((assertion) => assertion.visibleText && literalText.includes(assertion.visibleText))) score += 35;
  if (path.includes("/views/") || path.startsWith("views/")) score += 2;
  if (routeParts.at(-1) && name.includes(routeParts.at(-1)!)) score += 12;
  if (path.endsWith("/index.vue")) score += 3;
  if (path.includes("/components/")) score -= 10;
  return score;
}

function selectRoot(route: SpaRouteShellRouteNode, components: SfcVisualComponentResponsibility[], routerGraph?: RouterSfcResponsibilityGraph): { root?: SfcVisualComponentResponsibility; candidates: string[]; blocked?: string } {
  const graphSelection = routerSfcRoot(route, components, routerGraph);
  if (routerGraph) return graphSelection;
  const ranked = components
    .map((component) => ({ component, score: rootScore(route, component) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.component.file.localeCompare(b.component.file));
  const root = ranked[0]?.score >= 20 ? ranked[0].component : undefined;
  return { root, candidates: ranked.slice(0, 5).map((item) => `${item.component.file} (${item.score})`) };
}

function selectorCandidates(component: SfcVisualComponentResponsibility): string[] {
  const classes = unique([
    ...component.visualRegions,
    ...component.styles.flatMap((style) => style.classSelectors),
  ]).filter((value) => !GENERIC_REGION_TOKENS.has(value) && /^[A-Za-z_][\w-]*$/.test(value));
  return classes.map((value) => `.${value}`);
}

function resolveChild(component: SfcVisualComponentResponsibility, childName: string, components: SfcVisualComponentResponsibility[]): SfcVisualComponentResponsibility | undefined {
  const direct = components.filter((candidate) => candidate.componentName.toLowerCase() === childName.toLowerCase());
  if (direct.length === 1) return direct[0];
  const componentDirectory = component.file.split("/").slice(0, -1).join("/");
  return direct.sort((a, b) => {
    const aLocal = a.file.startsWith(componentDirectory) ? 1 : 0;
    const bLocal = b.file.startsWith(componentDirectory) ? 1 : 0;
    return bLocal - aLocal || a.file.localeCompare(b.file);
  })[0];
}

function collectOwnedComponents(root: SfcVisualComponentResponsibility, components: SfcVisualComponentResponsibility[]): Array<{ component: SfcVisualComponentResponsibility; parentId?: string }> {
  const output: Array<{ component: SfcVisualComponentResponsibility; parentId?: string }> = [];
  const seen = new Set<string>();
  const visit = (component: SfcVisualComponentResponsibility, parentId?: string): void => {
    if (seen.has(component.id)) return;
    seen.add(component.id);
    output.push({ component, parentId });
    for (const childName of component.childComponents) {
      const child = resolveChild(component, childName, components);
      if (child) visit(child, component.id);
    }
  };
  visit(root);
  return output;
}

function ownerPlan(component: SfcVisualComponentResponsibility, parentComponentId: string | undefined, rootId: string, graph: SfcVisualResponsibilityGraph): VisualTargetOwnerPlan[] {
  const parentOwnerId = parentComponentId ? `visual:${parentComponentId}` : undefined;
  const base: VisualTargetOwnerPlan = {
    id: `visual:${component.id}`,
    componentId: component.id,
    componentName: component.componentName,
    sourceFile: component.file,
    kind: component.id === rootId ? "page" : "component",
    parentOwnerId,
    implementationSelector: `[data-visual-owner="${component.id}"]`,
    acceptanceSelectors: selectorCandidates(component),
    childComponents: component.childComponents,
    templateStructure: component.templateStructure,
    dataCardinality: component.dataCardinality,
    stateResponsibility: component.stateResponsibility,
    apiFixtures: graph.apiFixtures?.responsibilities.filter((item) => item.componentId === component.id) ?? [],
    interactions: component.bindings,
    lifecycle: component.lifecycle,
    responsiveMediaQueries: unique(component.styles.flatMap((style) => style.mediaQueries)),
    sourceStyleSheets: component.styles.map((style) => ({ index: style.index, scoped: style.scoped, compiledCss: style.compiledCss, compileStatus: style.compileStatus })),
    runtimeDependencies: component.runtimeDependencies,
    confidence: component.confidence,
    reviewReasons: component.reviewReasons,
  };
  const chartOwners = component.chartResponsibilityIds.flatMap((chartId): VisualTargetOwnerPlan[] => {
    const chart = graph.echarts.components.find((candidate) => candidate.id === chartId);
    if (!chart) return [];
    return [{
      id: `visual:${chart.id}`,
      componentId: chart.id,
      componentName: chart.componentName,
      sourceFile: chart.file,
      kind: "chart",
      parentOwnerId: base.id,
      implementationSelector: `[data-visual-owner="${chart.id}"]`,
      acceptanceSelectors: base.acceptanceSelectors,
      childComponents: [],
      templateStructure: { roots: [], nodes: [], componentOrder: [], primitiveCounts: {}, inlineVisualDeclarations: 0, conditionalRegions: 0, repeatedRegions: 0, slotOwners: 0, responsiveGridNodes: 0 },
      dataCardinality: component.dataCardinality,
      stateResponsibility: component.stateResponsibility,
      apiFixtures: [],
      interactions: { events: chart.interactions, models: [], conditions: [], loops: [] },
      lifecycle: chart.lifecycle,
      responsiveMediaQueries: base.responsiveMediaQueries,
      sourceStyleSheets: [],
      runtimeDependencies: ["echarts", ...chart.themes.map((theme) => `echarts-theme:${theme}`)],
      chart: {
        responsibilityId: chart.id,
        themes: chart.themes,
        chartTypes: chart.chartTypes,
        optionKeys: chart.optionKeys,
        optionSlices: chart.optionSlices,
        staticBindings: chart.staticBindings,
        dataSources: chart.dataSources,
        capabilities: chart.capabilities,
      },
      confidence: chart.confidence,
      reviewReasons: ["chart geometry and canvas/SVG output require browser visual validation"],
    }];
  });
  return [base, ...chartOwners];
}


function resourceProfileProposal(owners: VisualTargetOwnerPlan[], components: SfcVisualComponentResponsibility[]): VisualResourceProfileProposal {
  const evidence: VisualResourceProfileProposal["evidence"] = [];
  const ownerComponents = new Map(components.map((component) => [component.id, component]));
  for (const owner of owners) {
    if (owner.kind === "chart" && owner.runtimeDependencies.some((dependency) => dependency === "echarts")) {
      evidence.push({ ownerId: owner.id, sourceFile: owner.sourceFile, kind: "echarts-owner", detail: `ECharts owner ${owner.componentName} initializes reviewed chart output` });
    }
    const component = ownerComponents.get(owner.componentId);
    for (const item of component?.visualResourceEvidence ?? []) {
      evidence.push({ ownerId: owner.id, sourceFile: item.sourceFile, kind: item.kind, detail: `${item.detail} (line ${item.line})` });
    }
  }
  const deduplicated = evidence.filter((item, index, items) => items.findIndex((candidate) => candidate.ownerId === item.ownerId && candidate.kind === item.kind && candidate.detail === item.detail) === index);
  const confidenceByKind: Record<VisualResourceProfileProposal["evidence"][number]["kind"], number> = {
    "webgl-context": 0.99,
    "echarts-owner": 0.96,
    "zrender-runtime": 0.96,
    "canvas-api": 0.94,
    "canvas-element": 0.88,
    "request-animation-frame": 0.62,
    "dom-structure": 0.9,
  };
  const canvasKinds = new Set<VisualResourceProfileProposal["evidence"][number]["kind"]>(["webgl-context", "echarts-owner", "zrender-runtime", "canvas-api", "canvas-element"]);
  const canvasEvidence = deduplicated.filter((item) => canvasKinds.has(item.kind));
  if (canvasEvidence.length > 0) {
    return {
      profile: "canvas",
      confidence: Number(Math.max(...canvasEvidence.map((item) => confidenceByKind[item.kind])).toFixed(2)),
      evidence: deduplicated,
      reviewRequired: true,
    };
  }
  const domEvidence = deduplicated.length > 0 ? deduplicated : owners.slice(0, 4).map((owner) => ({
    ownerId: owner.id,
    sourceFile: owner.sourceFile,
    kind: "dom-structure" as const,
    detail: `owner ${owner.componentName} exposes DOM/SVG structure without Canvas, WebGL, ZRender, or ECharts responsibility evidence`,
  }));
  const confidence = owners.every((owner) => owner.confidence === "high") ? 0.9 : 0.78;
  return { profile: "dom", confidence, evidence: domEvidence, reviewRequired: true };
}

export function generateVisualTargetPlan(sfcGraph: SfcVisualResponsibilityGraph, routePlan: SpaRouteShellPlan, routerGraph?: RouterSfcResponsibilityGraph): VisualTargetPlan {
  const visualRoutes = routePlan.routes.filter((route) => route.visualStates.length > 0);
  const ownersById = new Map<string, VisualTargetOwnerPlan>();
  const boundaries: VisualTargetBoundaryPlan[] = [];
  const unresolved: VisualTargetPlan["unresolved"] = [];

  for (const route of visualRoutes) {
    const selected = selectRoot(route, sfcGraph.components, routerGraph);
    if (!selected.root) {
      unresolved.push({ route: route.route, reason: selected.blocked ?? "no SFC root reached the minimum route ownership score", candidates: selected.candidates });
      continue;
    }
    const owned = collectOwnedComponents(selected.root, sfcGraph.components);
    const ownerIds: string[] = [];
    for (const item of owned) {
      for (const owner of ownerPlan(item.component, item.parentId, selected.root.id, sfcGraph)) {
        ownersById.set(owner.id, owner);
        ownerIds.push(owner.id);
      }
    }
    const states = route.visualStates;
    const boundaryOwners = unique(ownerIds).map((ownerId) => ownersById.get(ownerId)).filter((owner): owner is VisualTargetOwnerPlan => Boolean(owner));
    boundaries.push({
      id: `boundary:${normalizedRoutePath(route.route).replaceAll("/", ":") || "root"}`,
      route: route.route,
      scenarioIds: unique([...route.scenarios, ...states.map((state) => state.scenarioId)]),
      rootOwnerId: `visual:${selected.root.id}`,
      acceptance: {
        visibleSelectors: unique(route.assertions.map((assertion) => assertion.visibleSelector)),
        visibleText: unique(route.assertions.map((assertion) => assertion.visibleText)),
        screenshotAnchors: unique(states.map((state) => state.anchor)),
        screenshotRegions: unique(states.map((state) => state.region)),
        styleTargets: unique(states.flatMap((state) => state.styleTargets)),
        viewports: unique(states.flatMap((state) => state.viewports ?? ["desktop", "tablet", "mobile"])),
      },
      ownerIds: unique(ownerIds),
      resourceProfileProposal: resourceProfileProposal(boundaryOwners, sfcGraph.components),
      reviewRequired: true,
      reviewReasons: unique([
        "implementation selectors are generated independently from acceptance selectors",
        ...owned.flatMap((item) => item.component.reviewReasons),
      ]),
    });
  }

  const owners = [...ownersById.values()].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.id.localeCompare(b.id));
  return {
    schemaVersion: "1.0",
    kind: "visual-target-plan",
    reviewRequired: true,
    generatedCode: false,
    source: {
      sfcGraphKind: sfcGraph.kind,
      routePlanKind: routePlan.kind,
      sourceRoot: sfcGraph.sourceRoot,
      graphComponents: sfcGraph.metrics.components,
      graphChartComponents: sfcGraph.metrics.chartComponents,
      ...(routerGraph ? { routerSfcGraphKind: routerGraph.kind, routerSfcResolvedRoutes: routerGraph.metrics.resolvedRoutes } : {}),
    },
    selectorPolicy: {
      implementationSelectorsIndependent: true,
      acceptanceSelectorsPreserved: true,
      implementationAttribute: "data-visual-owner",
    },
    boundaries,
    owners,
    unresolved,
    metrics: {
      visualRoutes: visualRoutes.length,
      boundaries: boundaries.length,
      owners: owners.length,
      chartOwners: owners.filter((owner) => owner.kind === "chart").length,
      responsiveOwners: owners.filter((owner) => owner.responsiveMediaQueries.length > 0).length,
      interactiveOwners: owners.filter((owner) => owner.interactions.events.length + owner.interactions.models.length > 0).length,
      apiFixtureOwners: owners.filter((owner) => owner.apiFixtures.length > 0).length,
      canvasProfileProposals: boundaries.filter((boundary) => boundary.resourceProfileProposal.profile === "canvas").length,
      domProfileProposals: boundaries.filter((boundary) => boundary.resourceProfileProposal.profile === "dom").length,
      unresolvedRoutes: unresolved.length,
    },
    measurementTemplate: {
      modelCalls: null,
      generationMs: null,
      reviewMs: null,
      generatedLines: null,
      manualEdits: null,
      manualEditedLines: null,
      repairIterations: null,
      semanticRuns: null,
      visualRuns: null,
    },
    reviewReasons: [
      "the plan proves visual ownership but does not authorize copying the reviewed target implementation",
      "acceptance selectors remain external quality-gate inputs and must not be used as implementation ownership evidence",
      ...(routerGraph ? ["route roots use router-to-import-to-SFC evidence; acceptance selectors never determine ownership when the graph is provided; unresolved bindings remain blocked"] : ["router-to-SFC evidence was not provided; route root selection remains review-only heuristic"]),
      "chart and responsive responsibilities require the same Semantic Gold+ matrix after generation",
    ],
  };
}
