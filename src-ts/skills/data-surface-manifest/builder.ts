import { hashCanonicalValue } from "./serializer.js";
import type { JsonValue } from "../../types.js";
import type { ApiFixtureResponsibilityGraph, ApiFixtureResponsibility } from "../../planning/api-fixture-responsibility.js";
import type { StaticExpressionValue } from "../../planning/static-expression.js";
import type { SfcVisualComponentResponsibility } from "../../planning/sfc-visual-responsibility.js";
import type { DataCardinalityResponsibilityGraph, ComponentDataCardinalityResponsibility } from "../data-cardinality.js";
import type {
  DataSurface,
  DataSurfaceEvidence,
  DataSurfaceField,
  DataSurfaceItemKind,
  DataSurfaceManifest,
  DataSurfaceManifestUnresolved,
  DataSurfaceReference,
  DataSurfaceShape,
  DataSurfaceManifestIdentityInput,
} from "./contract.js";

export interface DataSurfaceManifestInput {
  readonly components: readonly SfcVisualComponentResponsibility[];
  readonly cardinality: DataCardinalityResponsibilityGraph;
  readonly api: ApiFixtureResponsibilityGraph;
  readonly identity?: DataSurfaceManifestIdentityInput;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function valueHash(value: JsonValue | StaticExpressionValue): string {
  return hashCanonicalValue(value);
}

function isReferenceValue(value: StaticExpressionValue): value is { $reference: string } {
  return !Array.isArray(value) && value !== null && typeof value === "object" && "$reference" in value;
}

function isUnsupportedValue(value: StaticExpressionValue): value is { $unsupported: string } {
  return !Array.isArray(value) && value !== null && typeof value === "object" && "$unsupported" in value;
}

function itemKind(values: readonly JsonValue[]): DataSurfaceItemKind {
  if (values.length === 0) return "unknown";
  const kinds = new Set(values.map((value) => value !== null && typeof value === "object" && !Array.isArray(value) ? "record" : "scalar"));
  return kinds.size === 1 ? [...kinds][0] as "record" | "scalar" : "mixed";
}

function shapeOfJson(value: JsonValue, evidence: string): DataSurfaceShape {
  if (Array.isArray(value)) return { kind: "collection", itemKind: itemKind(value), cardinality: value.length, evidence: [evidence] };
  if (value !== null && typeof value === "object") return { kind: "record", itemKind: "record", cardinality: 1, evidence: [evidence] };
  if (value === null) return { kind: "unknown", itemKind: "unknown", cardinality: null, evidence: [evidence] };
  return { kind: "scalar", itemKind: "scalar", cardinality: 1, evidence: [evidence] };
}

function shapeOfStatic(value: StaticExpressionValue, evidence: string): DataSurfaceShape {
  if (isReferenceValue(value) || isUnsupportedValue(value)) return { kind: "unknown", itemKind: "unknown", cardinality: null, evidence: [evidence] };
  return shapeOfJson(value as JsonValue, evidence);
}

function recordFields(value: JsonValue | StaticExpressionValue): string[] {
  if (Array.isArray(value)) return unique(value.flatMap((item) => item !== null && typeof item === "object" && !Array.isArray(item) && !isReferenceValue(item as StaticExpressionValue) && !isUnsupportedValue(item as StaticExpressionValue) ? Object.keys(item) : []));
  if (value !== null && typeof value === "object" && !isReferenceValue(value as StaticExpressionValue) && !isUnsupportedValue(value as StaticExpressionValue)) return Object.keys(value).sort();
  return [];
}

function referencesIn(value: StaticExpressionValue, path: string, bindings: Readonly<Record<string, StaticExpressionValue>>): DataSurfaceReference[] {
  if (isReferenceValue(value)) {
    const root = value.$reference.split(".")[0] ?? value.$reference;
    return [{ fromPath: path, target: value.$reference, kind: "static-expression", resolved: root in bindings }];
  }
  if (isUnsupportedValue(value) || value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => referencesIn(item, `${path}[${index}]`, bindings));
  return Object.entries(value).flatMap(([key, item]) => referencesIn(item, path ? `${path}.${key}` : key, bindings));
}

function unresolvedStatic(value: StaticExpressionValue, path: string): string[] {
  if (isUnsupportedValue(value)) return [`unsupported static expression at ${path}: ${value.$unsupported}`];
  if (value === null || typeof value !== "object" || isReferenceValue(value)) return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => unresolvedStatic(item, `${path}[${index}]`));
  return Object.entries(value).flatMap(([key, item]) => unresolvedStatic(item, path ? `${path}.${key}` : key));
}

function fieldsFor(
  componentId: string,
  renderedFields: readonly string[],
  fixture: JsonValue | undefined,
  staticValue: StaticExpressionValue | undefined,
  stateValue: JsonValue | undefined,
): DataSurfaceField[] {
  const rendered = new Set(renderedFields);
  const fixtureFields = new Set(fixture === undefined ? [] : recordFields(fixture));
  const staticFields = new Set(staticValue === undefined ? [] : recordFields(staticValue));
  const stateFields = new Set(stateValue === undefined ? [] : recordFields(stateValue));
  return unique([...rendered, ...fixtureFields, ...staticFields, ...stateFields]).map((path) => ({
    path,
    consumers: rendered.has(path) ? [componentId] : [],
    evidence: [
      ...(rendered.has(path) ? ["rendered-field" as const] : []),
      ...(fixtureFields.has(path) ? ["fixture-shape" as const] : []),
      ...(staticFields.has(path) ? ["static-shape" as const] : []),
      ...(stateFields.has(path) ? ["state-shape" as const] : []),
    ],
  }));
}

function applySliceLimit(shape: DataSurfaceShape, responsibility: ApiFixtureResponsibility): DataSurfaceShape {
  const limit = responsibility.consumption.sliceLimit;
  if (limit === undefined || shape.cardinality === null || shape.kind !== "collection") return shape;
  return { ...shape, cardinality: Math.min(shape.cardinality, limit), evidence: [...shape.evidence, `slice limit ${limit}`] };
}

function apiSurface(
  responsibility: ApiFixtureResponsibility,
  component: SfcVisualComponentResponsibility | undefined,
  cardinality: ComponentDataCardinalityResponsibility | undefined,
): DataSurface {
  const staticBindings = cardinality?.responsibility.staticBindings ?? {};
  const target = responsibility.consumption.targetBinding;
  const staticValue = staticBindings[target];
  const stateValue = component?.stateResponsibility.initialState[target];
  const fixture = responsibility.fixture.materializedValue;
  const shape = applySliceLimit(shapeOfJson(fixture, `reviewed fixture ${responsibility.fixture.bodyHash}`), responsibility);
  const references = staticValue === undefined ? [] : referencesIn(staticValue, target, staticBindings);
  const unresolved = unique([
    ...responsibility.reviewReasons,
    ...(staticValue === undefined ? [] : unresolvedStatic(staticValue, target)),
    ...references.filter((reference) => !reference.resolved).map((reference) => `unresolved static reference: ${reference.target}`),
    ...(shape.kind === "unknown" ? ["reviewed fixture shape is unknown"] : []),
    ...(component === undefined ? [`component ownership missing for ${responsibility.componentId}`] : []),
  ]);
  const evidence: DataSurfaceEvidence[] = [
    { source: responsibility.componentFile, detail: `${responsibility.apiCall.method} ${responsibility.apiCall.path} writes ${target}`, confidence: responsibility.confidence },
    { source: responsibility.componentFile, detail: `fixture ${responsibility.fixture.bodyHash} materializes ${responsibility.consumption.responsePath}`, confidence: "high" },
    ...(stateValue === undefined ? [] : [{ source: responsibility.componentFile, detail: `${target} has component state initialization evidence`, confidence: "high" as const }]),
  ];
  return {
    id: `api:${responsibility.id}`,
    owner: {
      componentId: responsibility.componentId,
      componentName: responsibility.componentName,
      componentFile: responsibility.componentFile,
    },
    source: {
      primary: "reviewed-api-fixture",
      api: {
        responsibilityId: responsibility.id,
        method: responsibility.apiCall.method,
        path: responsibility.apiCall.path,
        ...(responsibility.fixture.requestPath ? { requestPath: responsibility.fixture.requestPath } : {}),
        responsePath: responsibility.consumption.responsePath,
        bodyHash: responsibility.fixture.bodyHash,
        reviewed: true,
        transportPrefixes: unique(responsibility.apiCall.transportPrefixes.map((prefix) => prefix.value)),
      },
      ...(staticValue === undefined ? {} : { static: { binding: target, valueHash: valueHash(staticValue) } }),
      ...(stateValue === undefined ? {} : { stateInitial: { binding: target, valueHash: valueHash(stateValue) } }),
    },
    shape,
    fields: fieldsFor(responsibility.componentId, responsibility.renderedFields.map((field) => field.field), fixture, staticValue, stateValue),
    consumers: [{
      componentId: responsibility.componentId,
      componentName: responsibility.componentName,
      componentFile: responsibility.componentFile,
      targetBinding: target,
      responsePath: responsibility.consumption.responsePath,
      renderedFields: unique(responsibility.renderedFields.map((field) => field.field)),
    }],
    injection: {
      kind: "state-binding",
      target,
      sourcePath: responsibility.consumption.responsePath,
      reviewed: unresolved.length === 0 && responsibility.confidence === "high" && component !== undefined,
    },
    references,
    evidence,
    unresolved,
    reviewRequired: unresolved.length > 0 || responsibility.confidence !== "high" || component === undefined,
  };
}

function staticSurface(
  component: SfcVisualComponentResponsibility,
  cardinality: ComponentDataCardinalityResponsibility,
  binding: string,
  value: StaticExpressionValue,
): DataSurface {
  const shape = shapeOfStatic(value, `module static binding ${binding}`);
  const stateValue = component.stateResponsibility.initialState[binding];
  const references = referencesIn(value, binding, cardinality.responsibility.staticBindings);
  const unresolved = unique([
    ...unresolvedStatic(value, binding),
    ...references.filter((reference) => !reference.resolved).map((reference) => `unresolved static reference: ${reference.target}`),
    ...(shape.kind === "unknown" ? [`static binding ${binding} has unknown shape`] : []),
  ]);
  return {
    id: `static:${component.id}:${binding}`,
    owner: { componentId: component.id, componentName: component.componentName, componentFile: component.file },
    source: {
      primary: "module-static-binding",
      static: { binding, valueHash: valueHash(value) },
      ...(stateValue === undefined ? {} : { stateInitial: { binding, valueHash: valueHash(stateValue) } }),
    },
    shape,
    fields: fieldsFor(component.id, [], undefined, value, stateValue),
    consumers: [{
      componentId: component.id,
      componentName: component.componentName,
      componentFile: component.file,
      targetBinding: binding,
      renderedFields: [],
    }],
    injection: { kind: "component-static-binding", target: binding, reviewed: unresolved.length === 0 },
    references,
    evidence: [{ source: component.file, detail: `${binding} is a component-owned static data collection`, confidence: "high" }],
    unresolved,
    reviewRequired: unresolved.length > 0,
  };
}

function staticSurfaceBindings(cardinality: ComponentDataCardinalityResponsibility): string[] {
  const bindings = new Set<string>();
  for (const evidence of cardinality.responsibility.cardinalities) {
    if (evidence.source !== "module-static-binding" || evidence.count < 0) continue;
    const root = evidence.path.split(".")[0];
    if (root && root in cardinality.responsibility.staticBindings) bindings.add(root);
  }
  return [...bindings].sort();
}

function deriveIdentity(input: DataSurfaceManifestInput): DataSurfaceManifest["identity"] {
  const overrides = input.identity ?? {};
  const sourceRoot = overrides.sourceRoot ?? input.api.sourceRoot;
  const sourceHash = overrides.sourceHash ?? hashCanonicalValue(input.components.map((component) => ({ id: component.id, file: component.file, dataCardinality: component.dataCardinality, state: component.stateResponsibility })));
  const fixtureHash = overrides.fixtureHash ?? hashCanonicalValue(input.api.responsibilities.map((responsibility) => ({ id: responsibility.id, bodyHash: responsibility.fixture.bodyHash, requestPath: responsibility.fixture.requestPath })));
  const configurationHash = overrides.configurationHash ?? hashCanonicalValue(input.api.responsibilities.map((responsibility) => ({ id: responsibility.id, method: responsibility.apiCall.method, path: responsibility.apiCall.path, responsePath: responsibility.consumption.responsePath, targetBinding: responsibility.consumption.targetBinding, transportPrefixes: responsibility.apiCall.transportPrefixes })));
  return {
    contractVersion: "1.0",
    sourceRoot,
    sourceHash,
    sourceHashKind: overrides.sourceHashKind ?? (overrides.sourceHash ? "source-content" : "responsibility-graph"),
    ...(overrides.sourceCommit ? { sourceCommit: overrides.sourceCommit } : {}),
    fixtureHash,
    fixtureHashKind: overrides.fixtureHashKind ?? (overrides.fixtureHash ? "fixture-content" : "responsibility-graph"),
    configurationHash,
    configurationHashKind: overrides.configurationHashKind ?? (overrides.configurationHash ? "configuration-content" : "responsibility-graph"),
    skillVersions: {
      "component-ownership": "1.0.0",
      "data-cardinality": "1.0.0",
      "api-responsibility": "1.0.0",
      "data-surface-manifest": "1.0.0",
      ...(overrides.skillVersions ?? {}),
    },
    ...(overrides.generatedAt ? { generatedAt: overrides.generatedAt } : {}),
  };
}

export function buildDataSurfaceManifest(input: DataSurfaceManifestInput): DataSurfaceManifest {
  const identity = deriveIdentity(input);
  const components = new Map(input.components.map((component) => [component.id, component]));
  const cardinalities = new Map(input.cardinality.components.map((component) => [component.componentId, component]));
  const consumedStaticBindings = new Set<string>();
  const surfaces: DataSurface[] = [];

  for (const responsibility of input.api.responsibilities) {
    const cardinality = cardinalities.get(responsibility.componentId);
    surfaces.push(apiSurface(responsibility, components.get(responsibility.componentId), cardinality));
    consumedStaticBindings.add(`${responsibility.componentId}:${responsibility.consumption.targetBinding}`);
  }

  for (const component of input.components) {
    const cardinality = cardinalities.get(component.id);
    if (!cardinality) continue;
    for (const binding of staticSurfaceBindings(cardinality)) {
      if (consumedStaticBindings.has(`${component.id}:${binding}`)) continue;
      const value = cardinality.responsibility.staticBindings[binding];
      if (value !== undefined) surfaces.push(staticSurface(component, cardinality, binding, value));
    }
  }

  surfaces.sort((left, right) => left.id.localeCompare(right.id));
  const linkedResponseFlows = new Set(input.api.responseFlows.filter((flow) => input.api.responsibilities.some((responsibility) =>
    responsibility.componentFile === flow.consumerFile
    && responsibility.consumption.targetBinding === flow.targetBinding
    && responsibility.apiCall.method === flow.endpoint.method
    && responsibility.apiCall.path === flow.endpoint.path,
  )).map((flow) => flow.id));
  const unresolved: DataSurfaceManifestUnresolved[] = [
    ...input.api.unresolved.map((item): DataSurfaceManifestUnresolved => ({ owner: `component:${item.componentId}`, reason: `${item.apiLocalName}: ${item.reason}` })),
    ...input.api.responseFlows.filter((flow) => !linkedResponseFlows.has(flow.id)).map((flow): DataSurfaceManifestUnresolved => ({
      source: flow.consumerFile,
      reason: `response flow ${flow.id} has no reviewed fixture-backed data surface`,
    })),
    ...input.api.reviewReasons.map((reason): DataSurfaceManifestUnresolved => ({ source: input.api.sourceRoot, reason })),
    ...input.cardinality.components.flatMap((component) => component.responsibility.unresolvedReferences.map((reference): DataSurfaceManifestUnresolved => ({
      owner: `component:${component.componentId}`,
      source: component.componentFile,
      reason: `unresolved repeated data reference: ${reference}`,
    }))),
  ];
  unresolved.sort((left, right) => `${left.owner ?? ""}:${left.reason}`.localeCompare(`${right.owner ?? ""}:${right.reason}`));

  return {
    schemaVersion: "1.0",
    kind: "data-surface-manifest",
    identity,
    library: { sourceRoot: identity.sourceRoot, framework: "vue-sfc" },
    surfaces,
    unresolved,
    metrics: {
      surfaces: surfaces.length,
      apiSurfaces: surfaces.filter((surface) => surface.source.primary === "reviewed-api-fixture").length,
      staticSurfaces: surfaces.filter((surface) => surface.source.primary === "module-static-binding").length,
      reviewedFixtures: surfaces.filter((surface) => surface.source.api?.reviewed).length,
      fields: surfaces.reduce((total, surface) => total + surface.fields.length, 0),
      references: surfaces.reduce((total, surface) => total + surface.references.length, 0),
      unresolved: unresolved.length + surfaces.reduce((total, surface) => total + surface.unresolved.length, 0),
    },
    reviewRequired: unresolved.length > 0 || surfaces.some((surface) => surface.reviewRequired),
  };
}
