import type { ResponsibilityGraphDelta, ResponsibilityNode } from "../core/responsibility/graph.js";
import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import type { SpaRouterContractConfig } from "../evaluation/spa-router.js";
import {
  analyzeApiFixtureResponsibilities,
  type ApiFixtureResponsibilityGraph,
} from "../planning/api-fixture-responsibility.js";
import type { SfcVisualComponentResponsibility } from "../planning/sfc-visual-responsibility.js";
import type { JsonValue } from "../types.js";

export interface ApiResponsibilitySkillInput {
  sourceRoot: string;
  config: SpaRouterContractConfig;
  components: SfcVisualComponentResponsibility[];
}

export type ApiResponsibilityAnalyzer = (
  sourceRoot: string,
  config: SpaRouterContractConfig,
  components: SfcVisualComponentResponsibility[],
) => ApiFixtureResponsibilityGraph;

function apiNodeId(id: string): string {
  return `api-responsibility:${id}`;
}

export function projectApiResponsibilityDelta(graph: ApiFixtureResponsibilityGraph): ResponsibilityGraphDelta {
  const nodes: ResponsibilityNode[] = graph.responsibilities.map((responsibility) => {
    const attributes: Record<string, JsonValue> = {
      componentId: responsibility.componentId,
      componentName: responsibility.componentName,
      method: responsibility.apiCall.method,
      path: responsibility.apiCall.path,
      transportPrefixes: responsibility.apiCall.transportPrefixes,
      targetBinding: responsibility.consumption.targetBinding,
      responsePath: responsibility.consumption.responsePath,
      renderedFields: responsibility.renderedFields.map((field) => field.field),
      reviewedFixture: responsibility.fixture.reviewed,
      requestPath: responsibility.fixture.requestPath ?? null,
    };
    return {
      id: apiNodeId(responsibility.id),
      kind: "api-responsibility",
      owner: { file: responsibility.componentFile, symbol: responsibility.componentName },
      attributes,
      evidence: [{ source: responsibility.componentFile, detail: `${responsibility.apiCall.method} ${responsibility.apiCall.path}`, confidence: responsibility.confidence }],
      confidence: responsibility.confidence,
      reviewRequired: responsibility.reviewReasons.length > 0,
    };
  });
  const edges = graph.responsibilities.map((responsibility) => ({
    from: `component:${responsibility.componentId}`,
    to: apiNodeId(responsibility.id),
    relation: "consumes-api",
    evidence: [{ source: responsibility.componentFile, detail: `${responsibility.componentName} consumes ${responsibility.apiCall.path}`, confidence: responsibility.confidence }],
    reviewRequired: responsibility.reviewReasons.length > 0,
  }));
  const unresolved = [
    ...graph.unresolved.map((item) => ({ owner: `component:${item.componentId}`, reason: `${item.apiLocalName}: ${item.reason}` })),
    ...graph.reviewReasons.map((reason) => ({ reason, source: graph.sourceRoot })),
  ];
  return {
    schemaVersion: "1.0",
    skillId: "api-responsibility",
    sourceGraphKind: graph.kind,
    nodes,
    edges,
    unresolved,
    reviewRequired: graph.reviewRequired || unresolved.length > 0,
  };
}

export function createApiResponsibilitySkill(analyzer: ApiResponsibilityAnalyzer = analyzeApiFixtureResponsibilities): DismantlingSkill<ApiResponsibilitySkillInput, ApiFixtureResponsibilityGraph> {
  return defineSkill({
    manifest: {
      id: "api-responsibility",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for API endpoint, response-flow, reviewed fixture, and template-consumer responsibility analysis.",
      stages: ["analyze"],
      consumes: ["project-source-root", "spa-router-contract-config", "sfc-visual-responsibility-graph"],
      produces: ["api-fixture-responsibility-graph"],
      requires: ["source-structure", "component-ownership", "transport-proxy", "state-responsibility"],
      optionalDependencies: ["spa-router"],
      qualityGates: ["reviewed-fixture-only", "endpoint-response-consumer-evidence", "unresolved-api-review"],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return analyzer(input.sourceRoot, input.config, input.components);
    },
    projectResponsibilityGraph: projectApiResponsibilityDelta,
  });
}

export const apiResponsibilitySkill = createApiResponsibilitySkill();
