import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  analyzeSfcStateResponsibilities,
  type SfcStateResponsibility,
} from "../planning/sfc-state-responsibility.js";

export interface StateResponsibilitySkillInput {
  script: string;
}

export type StateResponsibilityAnalyzer = (script: string) => SfcStateResponsibility;

export function createStateResponsibilitySkill(analyzer: StateResponsibilityAnalyzer = analyzeSfcStateResponsibilities): DismantlingSkill<StateResponsibilitySkillInput, SfcStateResponsibility> {
  return defineSkill({
    manifest: {
      id: "state-responsibility",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for structural SFC handler, state-write, and display dependency analysis.",
      stages: ["analyze"],
      consumes: ["sfc-script-source"],
      optionalConsumes: [],
      produces: ["sfc-state-responsibility"],
      requires: ["source-structure"],
      optionalDependencies: [],
      qualityGates: ["state-write-evidence", "unresolved-state-review"],
      sideEffects: ["none"],
    },
    async execute(input) {
      return analyzer(input.script);
    },
  });
}

export const stateResponsibilitySkill = createStateResponsibilitySkill();
