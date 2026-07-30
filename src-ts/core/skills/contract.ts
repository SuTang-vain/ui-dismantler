import type { ResponsibilityGraphDelta } from "../responsibility/graph.js";

export const SKILL_CONTRACT_VERSION = "1.0" as const;
export const SKILL_EXECUTION_EVIDENCE_VERSION = "1.0" as const;

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

export interface SkillExecutionEvidence {
  readonly schemaVersion: typeof SKILL_EXECUTION_EVIDENCE_VERSION;
  readonly skillId: string;
  readonly skillVersion: string;
  readonly contractVersion: SkillContractVersion;
  readonly status: "succeeded" | "failed";
  readonly startedAt: string;
  readonly durationMs: number;
  readonly stages: readonly SkillStage[];
  readonly consumes: readonly string[];
  readonly produces: readonly string[];
  readonly resolvedDependencies: readonly string[];
  readonly qualityGates: readonly string[];
  readonly sideEffects: readonly SkillSideEffects[];
  readonly error?: string;
}

export interface SkillExecutionResult<Output> {
  readonly output: Output;
  readonly evidence: SkillExecutionEvidence;
}

export class SkillExecutionError extends Error {
  readonly evidence: SkillExecutionEvidence;

  constructor(message: string, evidence: SkillExecutionEvidence, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SkillExecutionError";
    this.evidence = evidence;
  }
}

export function defineSkill<Input, Output>(skill: DismantlingSkill<Input, Output>): DismantlingSkill<Input, Output> {
  return skill;
}
