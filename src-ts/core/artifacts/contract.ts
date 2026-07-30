export interface SkillArtifactReference<Value = unknown> {
  readonly id: string;
  readonly contract: string;
  readonly producerSkillId: string;
  readonly producerSkillVersion: string;
  readonly value: Value;
}

export interface SkillInputBinding {
  readonly consumerSkillId: string;
  readonly inputContract: string;
  readonly inputPath: string;
  readonly artifactContract: string;
  readonly outputPath?: string;
  readonly reviewed: true;
}
