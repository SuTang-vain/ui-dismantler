import type { ResponsibilityGraphDelta } from "../responsibility/graph.js";

export const SKILL_CONTRACT_VERSION = "1.0" as const;

export type SkillContractVersion = typeof SKILL_CONTRACT_VERSION;
export type SkillKind = "analysis" | "planning" | "generation" | "evaluation" | "integration";
export type SkillStage = "detect" | "analyze" | "plan" | "generate" | "validate";
export type SkillSideEffects = "none" | "filesystem" | "browser" | "network";

export interface SkillManifest {
  readonly id: string;
  readonly version: string;
  readonly contractVersion: SkillContractVersion;
  readonly kind: SkillKind;
  readonly summary: string;
  readonly stages: readonly SkillStage[];
  readonly consumes: readonly string[];
  readonly optionalConsumes: readonly string[];
  readonly produces: readonly string[];
  readonly requires: readonly string[];
  readonly optionalDependencies: readonly string[];
  readonly qualityGates: readonly string[];
  readonly sideEffects: readonly SkillSideEffects[];
}

export interface DismantlingSkill<Input, Output> {
  readonly manifest: SkillManifest;
  execute(input: Input): Promise<Output>;
  projectResponsibilityGraph?(output: Output): ResponsibilityGraphDelta;
}

export function defineSkill<Input, Output>(skill: DismantlingSkill<Input, Output>): DismantlingSkill<Input, Output> {
  return skill;
}
