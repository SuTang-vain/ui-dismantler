import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import type { SpaRouterContractConfig } from "../evaluation/spa-router.js";
import {
  analyzeApiFixtureResponsibilities,
  type ApiFixtureResponsibilityGraph,
} from "../planning/api-fixture-responsibility.js";
import type { SfcVisualComponentResponsibility } from "../planning/sfc-visual-responsibility.js";

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

export function createApiResponsibilitySkill(analyzer: ApiResponsibilityAnalyzer = analyzeApiFixtureResponsibilities): DismantlingSkill<ApiResponsibilitySkillInput, ApiFixtureResponsibilityGraph> {
  return defineSkill({
    manifest: {
      id: "api-responsibility",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for API endpoint, response-flow, reviewed fixture, and template-consumer responsibility analysis.",
      stages: ["analyze"],
      consumes: ["project-source-root", "spa-router-contract-config", "sfc-visual-component-responsibility"],
      produces: ["api-fixture-responsibility-graph"],
      requires: ["source-structure", "transport-proxy", "state-responsibility"],
      optionalDependencies: ["spa-router"],
      qualityGates: ["reviewed-fixture-only", "endpoint-response-consumer-evidence", "unresolved-api-review"],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return analyzer(input.sourceRoot, input.config, input.components);
    },
  });
}

export const apiResponsibilitySkill = createApiResponsibilitySkill();
