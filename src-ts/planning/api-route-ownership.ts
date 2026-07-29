import { spaRouterFixturePathMatches, type SpaRouterContractConfig, type SpaRouterFixture } from "../evaluation/spa-router.js";
import type { JsonValue } from "../types.js";
import type { ApiFixtureResponsibilityGraph, ApiResponseFlowEvidence } from "./api-fixture-responsibility.js";
import type { RouterSfcResponsibilityGraph, RouterSfcRouteBinding } from "./router-sfc-responsibility.js";

export interface ApiRouteRecordShape {
  shape: "route-record-array" | "route-record-object" | "unknown";
  cardinality: number | null;
  observedItemCount: number | null;
  fields: string[];
  evidence: string[];
}

export interface ApiRouteOwnershipMatch {
  routePath: string;
  routeKind: RouterSfcRouteBinding["routeKind"];
  layoutChain: string[];
  leafOwners: string[];
  visualOwnerProven: boolean;
}

export interface ApiRouteOwnershipLink {
  id: string;
  flowId: string;
  endpoint: ApiResponseFlowEvidence["endpoint"];
  consumerFile: string;
  targetBinding: string;
  responsePath: string;
  mutation: "router.addRoute" | "router.addRoutes" | "unresolved";
  shape: ApiRouteRecordShape;
  routeOwnership: {
    matches: ApiRouteOwnershipMatch[];
    requiresReview: boolean;
  };
  fixture: {
    matched: boolean;
    index: number | null;
  };
  confidence: "high" | "medium" | "low";
  reviewReasons: string[];
}

export interface ApiRouteOwnershipGraph {
  schemaVersion: "1.0";
  kind: "api-route-ownership-graph";
  reviewRequired: true;
  sourceRoot: string;
  links: ApiRouteOwnershipLink[];
  unresolved: Array<{ flowId: string; reason: string }>;
  metrics: {
    responseFlows: number;
    dynamicRouteFlows: number;
    routeLinks: number;
    reviewedFixtures: number;
    routeRecordFixtures: number;
    matchedRouteRecords: number;
    unresolvedFlows: number;
    unresolvedRouteRecords: number;
  };
  reviewReasons: string[];
}

function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function valueAtPath(value: JsonValue | undefined, path: string): JsonValue | undefined {
  if (!path) return value;
  let current: JsonValue | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function methodOf(fixture: SpaRouterFixture): string { return (fixture.method ?? "GET").toUpperCase(); }

function fixtureFor(
  config: SpaRouterContractConfig,
  endpoint: ApiResponseFlowEvidence["endpoint"],
  requestPathCandidates: string[],
): { fixture: SpaRouterFixture; index: number } | undefined {
  const fixtures = config.fixtures ?? [];
  const paths = [endpoint.path, ...requestPathCandidates];
  const index = fixtures.findIndex((fixture) => methodOf(fixture) === endpoint.method.toUpperCase() && fixture.body !== undefined && paths.some((path) => spaRouterFixturePathMatches(path, fixture)));
  return index < 0 ? undefined : { fixture: fixtures[index], index };
}

function routeRecordValues(value: JsonValue | undefined): { records: Array<{ [key: string]: JsonValue }>; shape: ApiRouteRecordShape["shape"]; observedItemCount: number | null } {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord);
    const isRouteArray = records.length === value.length && records.length > 0 && records.every((record) => typeof record.path === "string" || typeof record.name === "string" || Array.isArray(record.children));
    return { records, shape: isRouteArray ? "route-record-array" : "unknown", observedItemCount: value.length };
  }
  if (isRecord(value)) {
    const isRouteObject = typeof value.path === "string" || typeof value.name === "string" || Array.isArray(value.children);
    return { records: isRouteObject ? [value] : [], shape: isRouteObject ? "route-record-object" : "unknown", observedItemCount: 1 };
  }
  return { records: [], shape: "unknown", observedItemCount: null };
}

function collectFields(records: Array<{ [key: string]: JsonValue }>): string[] {
  const fields = new Set<string>();
  const visit = (record: { [key: string]: JsonValue }): void => {
    for (const key of Object.keys(record)) fields.add(key);
    if (Array.isArray(record.children)) for (const child of record.children) if (isRecord(child)) visit(child);
  };
  for (const record of records) visit(record);
  return [...fields].sort();
}

function joinPath(parent: string | null, recordPath: string): string {
  if (recordPath.startsWith("/")) return recordPath || "/";
  if (!parent || parent === "/") return `/${recordPath.replace(/^\/+/, "")}`;
  return `${parent.replace(/\/+$/, "")}/${recordPath.replace(/^\/+/, "")}`;
}

function routePaths(records: Array<{ [key: string]: JsonValue }>, parent: string | null = null): string[] {
  const output: string[] = [];
  for (const record of records) {
    const rawPath = typeof record.path === "string" ? record.path : "";
    const path = rawPath ? joinPath(parent, rawPath) : parent;
    if (path) output.push(path);
    if (Array.isArray(record.children)) output.push(...routePaths(record.children.filter(isRecord), path ?? parent));
  }
  return output;
}

function ownershipForPath(path: string, routerGraph: RouterSfcResponsibilityGraph): ApiRouteOwnershipMatch | undefined {
  const candidates = routerGraph.routes.filter((route) => route.path === path);
  if (!candidates.length) return undefined;
  const route = candidates.find((candidate) => candidate.routeKind === "visual-leaf") ?? candidates.find((candidate) => candidate.visualOwnerProven) ?? candidates[0];
  const leafOwners = routerGraph.routes
    .filter((candidate) => candidate.routeKind === "visual-leaf" && (candidate.path === path || (route.routeKind === "layout-owner" && candidate.path.startsWith(`${path}/`))))
    .map((candidate) => candidate.sfcFile)
    .filter((file): file is string => Boolean(file));
  return {
    routePath: route.path,
    routeKind: route.routeKind,
    layoutChain: route.layoutChain,
    leafOwners: [...new Set([...(route.sfcFile && route.routeKind === "visual-leaf" ? [route.sfcFile] : []), ...leafOwners])],
    visualOwnerProven: route.visualOwnerProven,
  };
}

function linkFlow(flow: ApiResponseFlowEvidence, apiGraph: ApiFixtureResponsibilityGraph, config: SpaRouterContractConfig, routerGraph: RouterSfcResponsibilityGraph): ApiRouteOwnershipLink {
  const reasons: string[] = [...flow.reviewReasons];
  const requestPathCandidates = apiGraph.responsibilities
    .filter((responsibility) => responsibility.apiCall.method === flow.endpoint.method && responsibility.apiCall.path === flow.endpoint.path)
    .flatMap((responsibility) => responsibility.apiCall.transportPathCandidates);
  const fixtureMatch = fixtureFor(config, flow.endpoint, requestPathCandidates);
  if (!fixtureMatch) reasons.push("no reviewed fixture matches the route API endpoint; route record shape remains unresolved");
  const responseValue = valueAtPath(fixtureMatch?.fixture.body, flow.responsePath);
  const extracted = routeRecordValues(responseValue);
  const matches = extracted.shape === "unknown" ? [] : routePaths(extracted.records).map((path) => ownershipForPath(path, routerGraph)).filter((match): match is ApiRouteOwnershipMatch => Boolean(match));
  const paths = extracted.shape === "unknown" ? [] : routePaths(extracted.records);
  const unresolvedPaths = paths.filter((path) => !matches.some((match) => match.routePath === path));
  if (extracted.shape === "unknown") reasons.push("reviewed response does not prove a route-record object or array");
  if (extracted.shape !== "unknown" && extracted.records.length === 0) reasons.push("route-record fixture has no records; nested route ownership cannot be proven");
  if (unresolvedPaths.length) reasons.push(`route records have no Router-to-SFC owner: ${unresolvedPaths.join(", ")}`);
  if (!matches.length) reasons.push("no route-record path matched the Router-to-SFC responsibility graph");
  const mutation = flow.routeMutations.includes("addRoutes") ? "router.addRoutes" : flow.routeMutations.includes("addRoute") ? "router.addRoute" : "unresolved";
  return {
    id: `api-route-link:${flow.id}`,
    flowId: flow.id,
    endpoint: flow.endpoint,
    consumerFile: flow.consumerFile,
    targetBinding: flow.targetBinding,
    responsePath: flow.responsePath,
    mutation,
    shape: {
      shape: extracted.shape,
      cardinality: extracted.shape === "unknown" ? null : extracted.records.length,
      observedItemCount: extracted.observedItemCount,
      fields: extracted.shape === "unknown" ? [] : collectFields(extracted.records),
      evidence: ["reviewed fixture response body", `response path: ${flow.responsePath}`, ...(extracted.shape !== "unknown" ? ["route path/name/children structure observed"] : [])],
    },
    routeOwnership: { matches, requiresReview: true },
    fixture: { matched: Boolean(fixtureMatch), index: fixtureMatch?.index ?? null },
    confidence: matches.length && extracted.shape !== "unknown" ? "high" : fixtureMatch ? "medium" : "low",
    reviewReasons: [...new Set(reasons)],
  };
}

export function linkApiRouteOwnership(
  apiGraph: ApiFixtureResponsibilityGraph,
  routerGraph: RouterSfcResponsibilityGraph,
  config: SpaRouterContractConfig,
): ApiRouteOwnershipGraph {
  const flows = apiGraph.responseFlows.filter((flow) => flow.flowKind === "dynamic-route-injection");
  const links = flows.map((flow) => linkFlow(flow, apiGraph, config, routerGraph));
  const unresolved = links.flatMap((link) => link.reviewReasons.some((reason) => /unresolved|no reviewed fixture|no route-record|no Router-to-SFC/.test(reason)) ? [{ flowId: link.flowId, reason: link.reviewReasons.join("; ") }] : []);
  return {
    schemaVersion: "1.0",
    kind: "api-route-ownership-graph",
    reviewRequired: true,
    sourceRoot: apiGraph.sourceRoot,
    links,
    unresolved,
    metrics: {
      responseFlows: apiGraph.responseFlows.length,
      dynamicRouteFlows: flows.length,
      routeLinks: links.length,
      reviewedFixtures: links.filter((link) => link.fixture.matched).length,
      routeRecordFixtures: links.filter((link) => link.shape.shape !== "unknown").length,
      matchedRouteRecords: links.reduce((count, link) => count + link.routeOwnership.matches.length, 0),
      unresolvedFlows: unresolved.length,
      unresolvedRouteRecords: links.reduce((count, link) => count + link.reviewReasons.filter((reason) => reason.startsWith("route records have no Router-to-SFC owner")).length, 0),
    },
    reviewReasons: [
      "route API data is linked to Router-to-SFC ownership only through reviewed response fixtures and explicit route mutation evidence",
      "transport prefix candidates may match reviewed browser fixture paths, while upstream proxy rewrites are never used as browser fixture paths",
      "unresolved route shape or ownership remains explicit and cannot authorize generated visual ownership",
    ],
  };
}
