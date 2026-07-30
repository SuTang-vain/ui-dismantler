import type { SkillManifest } from "../skills/contract.js";

export const TASK_PROFILE_CONTRACT_VERSION = "1.0" as const;

export interface TaskProfile {
  readonly id: string;
  readonly contractVersion: typeof TASK_PROFILE_CONTRACT_VERSION;
  readonly summary: string;
  readonly requiredSkills: readonly string[];
  readonly optionalSkills: readonly string[];
  readonly qualityGates: readonly string[];
}

export interface ResolvedTaskProfile {
  readonly profile: TaskProfile;
  readonly enabledOptionalSkills: readonly string[];
  readonly skills: readonly SkillManifest[];
  readonly qualityGates: readonly string[];
}

export function defineTaskProfile(profile: TaskProfile): TaskProfile {
  return profile;
}
