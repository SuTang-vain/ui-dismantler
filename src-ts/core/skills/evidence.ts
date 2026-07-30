import type { SkillContractVersion, SkillSideEffects, SkillStage } from "./contract.js";

export const SKILL_EXECUTION_EVIDENCE_VERSION = "1.0" as const;

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
  readonly optionalConsumes: readonly string[];
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
