import { bindSkillInput } from "../artifacts/binding.js";
import type { SkillArtifactReference, SkillInputBinding } from "../artifacts/contract.js";
import { SkillOutputStore } from "../artifacts/store.js";
import type { ResponsibilityGraphDelta } from "../responsibility/graph.js";
import { ResponsibilityGraphStore } from "../responsibility/store.js";
import type { SkillExecutionEvidence } from "./evidence.js";
import type { SkillRegistry } from "./registry.js";

export interface SkillContextExecutionResult<Output> {
  readonly output: Output;
  readonly evidence: SkillExecutionEvidence;
  readonly artifacts: readonly SkillArtifactReference<Output>[];
  readonly graphDelta: ResponsibilityGraphDelta | null;
}

export class SkillExecutionContext {
  readonly outputs: SkillOutputStore;
  readonly responsibilities: ResponsibilityGraphStore;
  private readonly registry: SkillRegistry;

  constructor(registry: SkillRegistry, outputs: SkillOutputStore = new SkillOutputStore(), responsibilities: ResponsibilityGraphStore = new ResponsibilityGraphStore()) {
    this.registry = registry;
    this.outputs = outputs;
    this.responsibilities = responsibilities;
  }

  bindInput<Input extends object>(skillId: string, baseInput: Input, bindings: readonly SkillInputBinding[]): Input {
    return bindSkillInput(skillId, baseInput, bindings, this.outputs);
  }

  async execute<Input, Output>(skillId: string, input: Input): Promise<SkillContextExecutionResult<Output>> {
    const manifest = this.registry.get(skillId);
    const result = await this.registry.executeWithEvidence<Input, Output>(skillId, input);
    const artifacts = this.outputs.publish(skillId, manifest.version, manifest.produces, result.output);
    const graphDelta = this.registry.projectResponsibilityGraph(skillId, result.output);
    if (graphDelta) this.responsibilities.publish(graphDelta);
    return { ...result, artifacts, graphDelta };
  }

  async executeBound<Input extends object, Output>(skillId: string, baseInput: Input, bindings: readonly SkillInputBinding[]): Promise<SkillContextExecutionResult<Output>> {
    return await this.execute<Input, Output>(skillId, this.bindInput(skillId, baseInput, bindings));
  }
}
