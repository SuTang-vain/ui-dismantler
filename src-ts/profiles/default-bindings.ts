import { ReviewedBindingRegistry } from "../core/artifacts/registry.js";
import type { SkillRegistry } from "../core/skills/registry.js";

export function createDefaultReviewedBindingRegistry(skills: SkillRegistry): ReviewedBindingRegistry {
  return new ReviewedBindingRegistry(skills)
    .register({
      consumerSkillId: "primitive-dom",
      inputContract: "sfc-visual-responsibility-graph",
      inputPath: "graph",
      artifactContract: "sfc-visual-responsibility-graph",
      reviewed: true,
    })
    .register({
      consumerSkillId: "lifecycle-polling",
      inputContract: "sfc-visual-responsibility-graph",
      inputPath: "graph",
      artifactContract: "sfc-visual-responsibility-graph",
      reviewed: true,
    })
    .register({
      consumerSkillId: "data-surface-manifest",
      inputContract: "sfc-visual-responsibility-graph",
      inputPath: "components",
      artifactContract: "sfc-visual-responsibility-graph",
      outputPath: "components",
      reviewed: true,
    })
    .register({
      consumerSkillId: "data-surface-manifest",
      inputContract: "data-cardinality-responsibility-graph",
      inputPath: "cardinality",
      artifactContract: "data-cardinality-responsibility-graph",
      reviewed: true,
    })
    .register({
      consumerSkillId: "data-surface-manifest",
      inputContract: "api-fixture-responsibility-graph",
      inputPath: "api",
      artifactContract: "api-fixture-responsibility-graph",
      reviewed: true,
    })
    .register({
      consumerSkillId: "data-cardinality",
      inputContract: "sfc-visual-responsibility-graph",
      inputPath: "components",
      artifactContract: "sfc-visual-responsibility-graph",
      outputPath: "components",
      reviewed: true,
    })
    .register({
      consumerSkillId: "api-responsibility",
      inputContract: "sfc-visual-responsibility-graph",
      inputPath: "components",
      artifactContract: "sfc-visual-responsibility-graph",
      outputPath: "components",
      reviewed: true,
    });
}
