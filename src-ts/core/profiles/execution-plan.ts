import type { SkillInputBinding } from "../artifacts/contract.js";
import type { ReviewedBindingRegistry } from "../artifacts/registry.js";
import type { SkillManifest } from "../skills/contract.js";
import type { TaskProfileRegistry } from "./registry.js";

export interface ProfileInputProvider {
  readonly contract: string;
  readonly providerId: string;
  readonly reviewed: boolean;
}

export interface ProfileExecutionInputStatus {
  readonly contract: string;
  readonly required: boolean;
  readonly source: "provider" | "artifact" | "unreviewed" | "missing";
  readonly providerId?: string;
  readonly binding?: SkillInputBinding;
}

export interface ProfileExecutionStep {
  readonly index: number;
  readonly skillId: string;
  readonly dependencies: readonly string[];
  readonly blockedDependencies: readonly string[];
  readonly inputs: readonly ProfileExecutionInputStatus[];
  readonly produces: readonly string[];
  readonly ready: boolean;
}

export interface ProfileExecutionPlan {
  readonly schemaVersion: "1.0";
  readonly profileId: string;
  readonly enabledOptionalSkills: readonly string[];
  readonly steps: readonly ProfileExecutionStep[];
  readonly blockers: readonly string[];
  readonly ready: boolean;
  readonly reviewRequired: true;
}

export interface ProfileExecutionPlanOptions {
  readonly enabledOptionalSkills?: readonly string[];
  readonly inputProviders?: readonly ProfileInputProvider[];
  readonly existingArtifactContracts?: readonly string[];
}

function providerMap(providers: readonly ProfileInputProvider[]): Map<string, ProfileInputProvider> {
  const output = new Map<string, ProfileInputProvider>();
  for (const provider of providers) {
    if (output.has(provider.contract)) throw new Error(`duplicate Profile input provider: ${provider.contract}`);
    output.set(provider.contract, provider);
  }
  return output;
}

function inputStatus(
  skill: SkillManifest,
  contract: string,
  required: boolean,
  providers: Map<string, ProfileInputProvider>,
  artifacts: Set<string>,
  bindings: ReviewedBindingRegistry,
): ProfileExecutionInputStatus {
  const provider = providers.get(contract);
  if (provider) return { contract, required, source: provider.reviewed ? "provider" : "unreviewed", providerId: provider.providerId };
  const binding = bindings.get(skill.id, contract);
  if (binding && artifacts.has(binding.artifactContract)) return { contract, required, source: "artifact", binding };
  return { contract, required, source: "missing" };
}

export class ProfileExecutionPlanner {
  private readonly profiles: TaskProfileRegistry;
  private readonly bindings: ReviewedBindingRegistry;

  constructor(profiles: TaskProfileRegistry, bindings: ReviewedBindingRegistry) {
    this.profiles = profiles;
    this.bindings = bindings;
  }

  plan(profileId: string, options: ProfileExecutionPlanOptions = {}): ProfileExecutionPlan {
    const resolved = this.profiles.resolve(profileId, options.enabledOptionalSkills ?? []);
    const providers = providerMap(options.inputProviders ?? []);
    const artifacts = new Set(options.existingArtifactContracts ?? []);
    const readySkills = new Set<string>();
    const steps: ProfileExecutionStep[] = [];
    const blockers: string[] = [];

    for (const [index, skill] of resolved.skills.entries()) {
      const blockedDependencies = skill.requires.filter((dependency) => !readySkills.has(dependency));
      const inputs = [
        ...skill.consumes.map((contract) => inputStatus(skill, contract, true, providers, artifacts, this.bindings)),
        ...skill.optionalConsumes.map((contract) => inputStatus(skill, contract, false, providers, artifacts, this.bindings)),
      ];
      const missingRequired = inputs.filter((input) => input.required && ["missing", "unreviewed"].includes(input.source));
      const ready = blockedDependencies.length === 0 && missingRequired.length === 0;
      if (ready) {
        readySkills.add(skill.id);
        for (const contract of skill.produces) artifacts.add(contract);
      } else {
        for (const dependency of blockedDependencies) blockers.push(`${skill.id} is blocked by dependency ${dependency}`);
        for (const input of missingRequired) blockers.push(input.source === "unreviewed" ? `${skill.id} has unreviewed input contract ${input.contract}` : `${skill.id} is missing input contract ${input.contract}`);
      }
      steps.push({ index, skillId: skill.id, dependencies: skill.requires, blockedDependencies, inputs, produces: skill.produces, ready });
    }

    return {
      schemaVersion: "1.0",
      profileId,
      enabledOptionalSkills: resolved.enabledOptionalSkills,
      steps,
      blockers: [...new Set(blockers)],
      ready: steps.every((step) => step.ready),
      reviewRequired: true,
    };
  }
}
