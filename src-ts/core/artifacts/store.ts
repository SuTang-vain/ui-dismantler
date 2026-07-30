import type { SkillArtifactReference } from "./contract.js";

export class SkillOutputStore {
  private readonly latestByContract = new Map<string, SkillArtifactReference>();
  private readonly allArtifacts: SkillArtifactReference[] = [];
  private sequence = 0;

  publish<Output>(skillId: string, skillVersion: string, contracts: readonly string[], output: Output): SkillArtifactReference<Output>[] {
    return contracts.map((contract) => {
      this.sequence += 1;
      const reference: SkillArtifactReference<Output> = {
        id: `${skillId}:${contract}:${this.sequence}`,
        contract,
        producerSkillId: skillId,
        producerSkillVersion: skillVersion,
        value: output,
      };
      this.latestByContract.set(contract, reference);
      this.allArtifacts.push(reference);
      return reference;
    });
  }

  has(contract: string): boolean {
    return this.latestByContract.has(contract);
  }

  get<Value = unknown>(contract: string): SkillArtifactReference<Value> {
    const artifact = this.latestByContract.get(contract);
    if (!artifact) throw new Error(`missing Skill artifact contract: ${contract}`);
    return artifact as SkillArtifactReference<Value>;
  }

  list(): SkillArtifactReference[] {
    return [...this.allArtifacts];
  }
}
