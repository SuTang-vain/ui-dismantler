import { SkillRegistry } from "../core/skills/registry.js";
import { apiResponsibilitySkill } from "./api-responsibility.js";
import { authGuardSkill } from "./auth-guard.js";
import { sourceStructureSkill } from "./source-structure.js";
import { spaRouterSkill } from "./spa-router.js";
import { stateResponsibilitySkill } from "./state-responsibility.js";
import { transportProxySkill } from "./transport-proxy.js";

export function createDefaultSkillRegistry(): SkillRegistry {
  return new SkillRegistry()
    .register(sourceStructureSkill)
    .register(stateResponsibilitySkill)
    .register(spaRouterSkill)
    .register(transportProxySkill)
    .register(apiResponsibilitySkill)
    .register(authGuardSkill);
}
