import { SkillRegistry } from "../core/skills/registry.js";
import { apiResponsibilitySkill } from "./api-responsibility.js";
import { authGuardSkill } from "./auth-guard.js";
import { componentOwnershipSkill } from "./component-ownership.js";
import { componentLibraryValidationSkill } from "./component-library-validation.js";
import { dataCardinalitySkill } from "./data-cardinality.js";
import { dataSurfaceManifestSkill } from "./data-surface-manifest/skill.js";
import { lifecyclePollingSkill } from "./lifecycle-polling.js";
import { primitiveDomSkill } from "./primitive-dom.js";
import { sourceStructureSkill } from "./source-structure.js";
import { spaRouterSkill } from "./spa-router.js";
import { stateResponsibilitySkill } from "./state-responsibility.js";
import { transportProxySkill } from "./transport-proxy.js";
import { visualEvaluationSkill } from "./visual-evaluation.js";

export function createDefaultSkillRegistry(): SkillRegistry {
  return new SkillRegistry()
    .register(sourceStructureSkill)
    .register(stateResponsibilitySkill)
    .register(spaRouterSkill)
    .register(componentOwnershipSkill)
    .register(componentLibraryValidationSkill)
    .register(dataCardinalitySkill)
    .register(dataSurfaceManifestSkill)
    .register(lifecyclePollingSkill)
    .register(primitiveDomSkill)
    .register(transportProxySkill)
    .register(apiResponsibilitySkill)
    .register(authGuardSkill)
    .register(visualEvaluationSkill);
}
