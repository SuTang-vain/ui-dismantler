import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import { validateLibrary } from "../validation/library.js";
import type { ValidationReport } from "../types.js";

/** Input contract for validating an already generated component library. */
export interface ComponentLibraryValidationSkillInput {
  libraryRoot: string;
}

export type ComponentLibraryValidator = (libraryRoot: string) => ValidationReport;

/**
 * Preserve the existing deterministic library validator as a first-class Skill.
 * This wrapper deliberately returns the historical ValidationReport unchanged;
 * package-boundary evidence remains a separate verification concern.
 */
export function createComponentLibraryValidationSkill(
  validator: ComponentLibraryValidator = validateLibrary,
): DismantlingSkill<ComponentLibraryValidationSkillInput, ValidationReport> {
  return defineSkill({
    manifest: {
      id: "component-library-validation",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "evaluation",
      summary: "Validate a generated component library against deterministic naming, token, data-separation, responsive, accessibility, theme, dependency, documentation, and class-alignment contracts.",
      stages: ["validate"],
      consumes: ["component-library-root"],
      optionalConsumes: [],
      produces: ["component-library-validation-report"],
      requires: [],
      optionalDependencies: [],
      qualityGates: [
        "naming",
        "variables",
        "data-separation",
        "responsive",
        "a11y",
        "theme",
        "no-deps",
        "docs",
        "class-alignment",
      ],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return validator(input.libraryRoot);
    },
  });
}

export const componentLibraryValidationSkill = createComponentLibraryValidationSkill();
