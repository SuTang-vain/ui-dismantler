import type { EChartsComponentResponsibility } from "./echarts-responsibility.js";
import type { SfcVisualComponentResponsibility, SfcVisualResponsibilityGraph } from "./sfc-visual-responsibility.js";
import type { SfcTemplateStructure } from "./sfc-template-structure.js";
import type { SpaRouteShellPlan, SpaRouteShellRouteNode } from "./spa-route-shell.js";

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
    dataSources: string[];
    capabilities: EChartsComponentResponsibility["capabilities"];
  };
  confidence: "high" | "medium";
  reviewReasons: string[];
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
  return `${component.file}/${component.componentName}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function rootScore(route: SpaRouteShellRouteNode, component: SfcVisualComponentResponsibility): number {
  const routeParts = routeTokens(route.route);
  const componentParts = new Set(pathTokens(component));
  let score = routeParts.reduce((sum, token) => sum + (componentParts.has(token) ? 20 : 0), 0);
  const path = component.file.toLowerCase();
  const name = component.componentName.toLowerCase();
  if (path.includes("/views/") || path.startsWith("views/")) score += 2;
  if (routeParts.at(-1) && name.includes(routeParts.at(-1)!)) score += 12;
  if (routeParts.includes("dashboard") && /views\/dashboard\/admin\/index\.vue$/.test(path)) score += 40;
  if (routeParts.includes("login") && /views\/login\/index\.vue$/.test(path)) score += 40;
  if (routeParts.includes("permission") && routeParts.includes("directive") && /views\/permission\/directive\.vue$/.test(path)) score += 40;
  if (path.endsWith("/index.vue")) score += 3;
  if (path.includes("/components/")) score -= 10;
  return score;
}

function selectRoot(route: SpaRouteShellRouteNode, components: SfcVisualComponentResponsibility[]): { root?: SfcVisualComponentResponsibility; candidates: string[] } {
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
        dataSources: chart.dataSources,
        capabilities: chart.capabilities,
      },
      confidence: chart.confidence,
      reviewReasons: ["chart geometry and canvas/SVG output require browser visual validation"],
    }];
  });
  return [base, ...chartOwners];
}

export function generateVisualTargetPlan(sfcGraph: SfcVisualResponsibilityGraph, routePlan: SpaRouteShellPlan): VisualTargetPlan {
  const visualRoutes = routePlan.routes.filter((route) => route.visualStates.length > 0);
  const ownersById = new Map<string, VisualTargetOwnerPlan>();
  const boundaries: VisualTargetBoundaryPlan[] = [];
  const unresolved: VisualTargetPlan["unresolved"] = [];

  for (const route of visualRoutes) {
    const selected = selectRoot(route, sfcGraph.components);
    if (!selected.root) {
      unresolved.push({ route: route.route, reason: "no SFC root reached the minimum route ownership score", candidates: selected.candidates });
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
      "chart and responsive responsibilities require the same Semantic Gold+ matrix after generation",
    ],
  };
}
