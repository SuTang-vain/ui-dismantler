import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  evaluateSpaRouterContract,
  type SpaRouterContractConfig,
  type SpaRouterContractReport,
} from "../evaluation/spa-router.js";

export interface SpaRouterSkillInput {
  config: SpaRouterContractConfig;
  options?: { executablePath?: string };
}

export type SpaRouterEvaluator = (
  config: SpaRouterContractConfig,
  options?: { executablePath?: string },
) => Promise<SpaRouterContractReport>;

export function createSpaRouterSkill(evaluator: SpaRouterEvaluator = evaluateSpaRouterContract): DismantlingSkill<SpaRouterSkillInput, SpaRouterContractReport> {
  return defineSkill({
    manifest: {
      id: "spa-router",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "evaluation",
      summary: "Compatibility wrapper for the existing reference/generated SPA route contract evaluator.",
      stages: ["validate"],
      consumes: ["spa-router-contract-config"],
      produces: ["spa-router-contract-report"],
      requires: [],
      optionalDependencies: ["source-structure"],
      qualityGates: [
        "semantic-route-contract",
        "strict-route-contract",
        "navigation-integrity",
        "runtime-network-stability",
        "blocking-handles",
      ],
      sideEffects: ["filesystem", "browser", "network"],
    },
    async execute(input) {
      return evaluator(input.config, input.options);
    },
  });
}

export const spaRouterSkill = createSpaRouterSkill();
