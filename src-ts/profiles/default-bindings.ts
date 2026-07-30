import { ReviewedBindingRegistry } from "../core/artifacts/registry.js";
import type { SkillRegistry } from "../core/skills/registry.js";

export function createDefaultReviewedBindingRegistry(skills: SkillRegistry): ReviewedBindingRegistry {
  return new ReviewedBindingRegistry(skills)
    .register({
      consumerSkillId: "api-responsibility",
      inputContract: "sfc-visual-responsibility-graph",
      inputPath: "components",
      artifactContract: "sfc-visual-responsibility-graph",
      outputPath: "components",
      reviewed: true,
    });
}
