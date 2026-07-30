import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  analyzeTransportProxyResponsibilities,
  type TransportProxyResponsibilityGraph,
} from "../planning/api-fixture-responsibility.js";

export interface TransportProxySkillInput {
  sourceRoot: string;
}

export type TransportProxyAnalyzer = (sourceRoot: string) => TransportProxyResponsibilityGraph;

export function createTransportProxySkill(analyzer: TransportProxyAnalyzer = analyzeTransportProxyResponsibilities): DismantlingSkill<TransportProxySkillInput, TransportProxyResponsibilityGraph> {
  return defineSkill({
    manifest: {
      id: "transport-proxy",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for scoped Vite and Webpack proxy transport responsibility analysis.",
      stages: ["analyze"],
      consumes: ["project-source-root"],
      produces: ["transport-proxy-responsibility-graph"],
      requires: ["source-structure"],
      optionalDependencies: [],
      qualityGates: ["browser-request-prefix-preserved", "upstream-rewrite-audit-only", "unresolved-proxy-review"],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return analyzer(input.sourceRoot);
    },
  });
}

export const transportProxySkill = createTransportProxySkill();
