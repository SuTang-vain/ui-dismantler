import type { SkillRegistry } from "../skills/registry.js";
import type { SkillInputBinding } from "./contract.js";

export class ReviewedBindingRegistry {
  private readonly bindings = new Map<string, SkillInputBinding>();
  private readonly skills: SkillRegistry;

  constructor(skills: SkillRegistry) {
    this.skills = skills;
  }

  register(binding: SkillInputBinding): this {
    const consumer = this.skills.get(binding.consumerSkillId);
    if (!consumer.consumes.includes(binding.inputContract) && !consumer.optionalConsumes.includes(binding.inputContract)) {
      throw new Error(`binding input contract ${binding.inputContract} is not consumed by ${binding.consumerSkillId}`);
    }
    if (!this.skills.list().some((skill) => skill.produces.includes(binding.artifactContract))) {
      throw new Error(`binding artifact contract has no registered producer: ${binding.artifactContract}`);
    }
    const key = `${binding.consumerSkillId}:${binding.inputContract}`;
    if (this.bindings.has(key)) throw new Error(`binding already registered: ${key}`);
    this.bindings.set(key, binding);
    return this;
  }

  get(consumerSkillId: string, inputContract: string): SkillInputBinding | null {
    return this.bindings.get(`${consumerSkillId}:${inputContract}`) ?? null;
  }

  list(): SkillInputBinding[] {
    return [...this.bindings.values()].sort((left, right) => `${left.consumerSkillId}:${left.inputContract}`.localeCompare(`${right.consumerSkillId}:${right.inputContract}`));
  }
}
