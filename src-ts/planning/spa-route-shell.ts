import type {
  SpaRouterContractConfig,
  SpaRouterContractReport,
  SpaRouterRoleValue,
  SpaRouterScenario,
  SpaRouterStep,
} from "../evaluation/spa-router.js";

export interface SpaRouteShellRouteNode {
  route: string;
  pattern: string;
  scenarios: string[];
  entry: boolean;
  final: boolean;
  assertions: Array<{ scenarioId: string; visibleText?: string; visibleSelector?: string }>;
  visualStates: Array<{ scenarioId: string; anchor?: string; region?: string; viewports?: string[]; styleTargets: string[] }>;
}

export interface SpaRouteShellTransition {
  scenarioId: string;
  stepIndex: number;
  action: SpaRouterStep["action"] | "guard-redirect";
  from: string;
  to: string;
  target?: string;
}

export interface SpaRouteShellPlan {
  schemaVersion: "1.0";
  kind: "spa-route-shell-plan";
  reviewRequired: true;
  generatedCode: false;
  source: {
    mode: "single" | "reference-generated";
    configScenarios: number;
    reportIncluded: boolean;
    reportPassed?: boolean;
  };
  routes: SpaRouteShellRouteNode[];
  transitions: SpaRouteShellTransition[];
  selectorMappings: Array<{ scenarioId: string; purpose: string; reference?: string; generated?: string }>;
  fixtureDependencies: Array<{
    method: string;
    hostname?: string;
    path?: string;
    resourceType?: string;
    query?: Record<string, string | string[]>;
    requestHeaders?: string[];
    responseContentType?: string;
    binary: boolean;
  }>;
  capabilities: {
    historyBack: boolean;
    historyForward: boolean;
    reload: boolean;
    dynamicInputRoutes: boolean;
    roleSpecificSelectors: boolean;
    reviewedVisualStates: number;
  };
  measurementTemplate: {
    modelCalls: number | null;
    generationMs: number | null;
    manualEdits: number | null;
    manualEditedLines: number | null;
    repairIterations: number | null;
    qualityRuns: number | null;
  };
  reviewReasons: string[];
}

function roleValue(value: SpaRouterRoleValue | undefined, role: "reference" | "generated"): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return role === "generated" ? value.generated ?? value.default ?? value.reference : value.reference ?? value.default ?? value.generated;
}

function routeOf(value: string, baseUrl: string): string {
  const url = new URL(value, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  return `${url.pathname}${url.search}${url.hash}`;
}

function routeFromTargetSelector(target: string | undefined, baseUrl: string): string | undefined {
  if (!target) return undefined;
  const match = target.match(/\[href\s*=\s*["']([^"']+)["']\]/i);
  if (!match || !match[1].startsWith("/")) return undefined;
  return routeOf(match[1], baseUrl);
}

function routePattern(route: string, scenario: SpaRouterScenario): string {
  let pattern = route;
  for (const step of scenario.steps) {
    if (step.action !== "input" || !step.value) continue;
    const encoded = encodeURIComponent(step.value);
    if (pattern.includes(encoded)) pattern = pattern.replaceAll(encoded, ":value");
    else if (pattern.includes(step.value)) pattern = pattern.replaceAll(step.value, ":value");
  }
  return pattern;
}

function contentType(headers: Record<string, string> | undefined): string | undefined {
  const entry = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "content-type");
  return entry?.[1];
}

function collectSelectorMappings(config: SpaRouterContractConfig): SpaRouteShellPlan["selectorMappings"] {
  const mappings: SpaRouteShellPlan["selectorMappings"] = [];
  const add = (scenarioId: string, purpose: string, value: SpaRouterRoleValue | undefined): void => {
    if (!value || typeof value === "string") return;
    const reference = roleValue(value, "reference"), generated = roleValue(value, "generated");
    if (reference === generated) return;
    mappings.push({ scenarioId, purpose, reference, generated });
  };
  for (const scenario of config.scenarios) {
    scenario.steps.forEach((step, index) => add(scenario.id, `step[${index}].target`, step.target));
    add(scenario.id, "assertions.visibleSelector", scenario.assertions.visibleSelector);
    add(scenario.id, "assertions.absentSelector", scenario.assertions.absentSelector);
    add(scenario.id, "assertions.selectorCount.target", scenario.assertions.selectorCount?.target);
    add(scenario.id, "assertions.inputValue.target", scenario.assertions.inputValue?.target);
    add(scenario.id, "visual.screenshotAnchor", scenario.visual?.screenshotAnchor);
    add(scenario.id, "visual.screenshotRegion", scenario.visual?.screenshotRegion);
    scenario.visual?.styleTargets?.forEach((target) => add(scenario.id, `visual.styleTargets.${target.id}`, target.selector));
  }
  return mappings;
}

export function generateSpaRouteShellPlan(config: SpaRouterContractConfig, report?: SpaRouterContractReport): SpaRouteShellPlan {
  const mode = config.referenceBaseUrl && config.generatedBaseUrl ? "reference-generated" : "single";
  const generatedBaseUrl = config.generatedBaseUrl ?? config.baseUrl;
  if (!generatedBaseUrl) throw new TypeError("route shell plan 需要 generatedBaseUrl 或 baseUrl");
  const observedResults = new Map((report?.generated?.results ?? report?.results ?? []).map((result) => [result.id, result]));
  const routes = new Map<string, SpaRouteShellRouteNode>();
  const transitions: SpaRouteShellTransition[] = [];
  const ensureRoute = (route: string, scenario: SpaRouterScenario, flags: { entry?: boolean; final?: boolean } = {}): SpaRouteShellRouteNode => {
    const existing = routes.get(route) ?? {
      route, pattern: routePattern(route, scenario), scenarios: [], entry: false, final: false, assertions: [], visualStates: [],
    };
    if (!existing.scenarios.includes(scenario.id)) existing.scenarios.push(scenario.id);
    existing.entry ||= Boolean(flags.entry); existing.final ||= Boolean(flags.final);
    routes.set(route, existing);
    return existing;
  };

  for (const scenario of config.scenarios) {
    const observed = observedResults.get(scenario.id);
    const entryRoute = routeOf(scenario.entryPath, generatedBaseUrl);
    const finalRoute = observed ? routeOf(observed.finalUrl, generatedBaseUrl) : roleValue(scenario.assertions.path, "generated") ? routeOf(roleValue(scenario.assertions.path, "generated")!, generatedBaseUrl) : entryRoute;
    ensureRoute(entryRoute, scenario, { entry: true });
    const finalNode = ensureRoute(finalRoute, scenario, { final: true });
    finalNode.assertions.push({
      scenarioId: scenario.id,
      visibleText: scenario.assertions.visibleText,
      visibleSelector: roleValue(scenario.assertions.visibleSelector, "generated"),
    });
    if (scenario.visual) finalNode.visualStates.push({
      scenarioId: scenario.id,
      anchor: roleValue(scenario.visual.screenshotAnchor, "generated"),
      region: roleValue(scenario.visual.screenshotRegion, "generated"),
      viewports: scenario.visual.viewports,
      styleTargets: (scenario.visual.styleTargets ?? []).map((target) => roleValue(target.selector, "generated")!).filter(Boolean),
    });

    let previousRoute = entryRoute;
    const observedSteps = observed?.stepRoutes ?? [];
    scenario.steps.forEach((step, stepIndex) => {
      const observedStep = observedSteps.find((candidate) => candidate.stepIndex === stepIndex);
      const nextRoute = observedStep ? routeOf(observedStep.route, generatedBaseUrl) : stepIndex === scenario.steps.length - 1 ? finalRoute : previousRoute;
      const target = roleValue(step.target, "generated");
      const requestedRoute = step.action === "click" ? routeFromTargetSelector(target, generatedBaseUrl) : undefined;
      ensureRoute(nextRoute, scenario, { final: nextRoute === finalRoute });
      if (requestedRoute && requestedRoute !== nextRoute) {
        ensureRoute(requestedRoute, scenario);
        transitions.push({ scenarioId: scenario.id, stepIndex, action: step.action, from: previousRoute, to: requestedRoute, target });
        transitions.push({ scenarioId: scenario.id, stepIndex, action: "guard-redirect", from: requestedRoute, to: nextRoute });
      } else if (nextRoute !== previousRoute || ["back", "forward", "reload"].includes(step.action)) transitions.push({
        scenarioId: scenario.id, stepIndex, action: step.action, from: previousRoute, to: nextRoute, target,
      });
      previousRoute = nextRoute;
    });
  }

  const selectorMappings = collectSelectorMappings(config);
  const reviewedVisualStates = config.scenarios.filter((scenario) => scenario.visual).length;
  return {
    schemaVersion: "1.0",
    kind: "spa-route-shell-plan",
    reviewRequired: true,
    generatedCode: false,
    source: { mode, configScenarios: config.scenarios.length, reportIncluded: Boolean(report), reportPassed: report?.passed },
    routes: [...routes.values()],
    transitions,
    selectorMappings,
    fixtureDependencies: (config.fixtures ?? []).map((fixture) => ({
      method: (fixture.method ?? "GET").toUpperCase(), hostname: fixture.hostname, path: fixture.path, resourceType: fixture.resourceType,
      query: fixture.query, requestHeaders: fixture.requestHeaders ? Object.keys(fixture.requestHeaders) : undefined,
      responseContentType: contentType(fixture.headers), binary: fixture.bodyBase64 !== undefined,
    })),
    capabilities: {
      historyBack: config.scenarios.some((scenario) => scenario.steps.some((step) => step.action === "back")),
      historyForward: config.scenarios.some((scenario) => scenario.steps.some((step) => step.action === "forward")),
      reload: config.scenarios.some((scenario) => scenario.steps.some((step) => step.action === "reload")),
      dynamicInputRoutes: [...routes.values()].some((route) => route.pattern !== route.route),
      roleSpecificSelectors: selectorMappings.length > 0,
      reviewedVisualStates,
    },
    measurementTemplate: { modelCalls: null, generationMs: null, manualEdits: null, manualEditedLines: null, repairIterations: null, qualityRuns: null },
    reviewReasons: [
      "route observations describe behavior, not production component boundaries",
      "guard and redirect intent must be reviewed before code generation",
      "visual selectors are acceptance targets and must not be treated as implementation selectors automatically",
      "fixture bodies may contain sensitive or environment-specific data and are intentionally summarized",
    ],
  };
}
