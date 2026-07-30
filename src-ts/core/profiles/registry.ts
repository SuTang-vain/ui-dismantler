import { TASK_PROFILE_CONTRACT_VERSION, type ResolvedTaskProfile, type TaskProfile } from "./contract.js";
import type { SkillRegistry } from "../skills/registry.js";

function assertIdentifier(value: string, label: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${label} must use lowercase kebab-case: ${value}`);
}

function assertProfile(profile: TaskProfile): void {
  assertIdentifier(profile.id, "profile id");
  if (profile.contractVersion !== TASK_PROFILE_CONTRACT_VERSION) {
    throw new Error(`profile ${profile.id} requires unsupported contract ${profile.contractVersion}`);
  }
  if (!profile.summary.trim()) throw new Error(`profile ${profile.id} must declare a summary`);
  if (profile.requiredSkills.length === 0) throw new Error(`profile ${profile.id} must declare at least one required skill`);
  const fields: Array<[string, readonly string[]]> = [
    ["required skills", profile.requiredSkills],
    ["optional skills", profile.optionalSkills],
    ["quality gates", profile.qualityGates],
  ];
  for (const [label, values] of fields) {
    if (new Set(values).size !== values.length) throw new Error(`profile ${profile.id} declares duplicate ${label}`);
  }
  const required = new Set(profile.requiredSkills);
  const overlap = profile.optionalSkills.find((skill) => required.has(skill));
  if (overlap) throw new Error(`profile ${profile.id} declares ${overlap} as both required and optional`);
  for (const skill of [...profile.requiredSkills, ...profile.optionalSkills]) assertIdentifier(skill, `skill of profile ${profile.id}`);
}

export class TaskProfileRegistry {
  private readonly profiles = new Map<string, TaskProfile>();
  private readonly skills: SkillRegistry;

  constructor(skills: SkillRegistry) {
    this.skills = skills;
  }

  register(profile: TaskProfile): this {
    assertProfile(profile);
    if (this.profiles.has(profile.id)) throw new Error(`profile already registered: ${profile.id}`);
    for (const skill of [...profile.requiredSkills, ...profile.optionalSkills]) {
      if (!this.skills.has(skill)) throw new Error(`profile ${profile.id} references unregistered skill: ${skill}`);
    }
    this.profiles.set(profile.id, profile);
    return this;
  }

  get(id: string): TaskProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`unknown profile: ${id}`);
    return profile;
  }

  list(): TaskProfile[] {
    return [...this.profiles.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  resolve(id: string, enabledOptionalSkills: readonly string[] = []): ResolvedTaskProfile {
    const profile = this.get(id);
    if (new Set(enabledOptionalSkills).size !== enabledOptionalSkills.length) {
      throw new Error(`profile ${id} received duplicate optional skills`);
    }
    for (const skill of enabledOptionalSkills) {
      if (!profile.optionalSkills.includes(skill)) throw new Error(`profile ${id} does not declare optional skill: ${skill}`);
    }
    const skills = this.skills.resolve([...profile.requiredSkills, ...enabledOptionalSkills]);
    const qualityGates = [...new Set([...profile.qualityGates, ...skills.flatMap((skill) => skill.qualityGates)])];
    return { profile, enabledOptionalSkills: [...enabledOptionalSkills], skills, qualityGates };
  }
}
