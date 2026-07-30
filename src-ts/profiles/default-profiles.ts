import { defineTaskProfile } from "../core/profiles/contract.js";
import { TaskProfileRegistry } from "../core/profiles/registry.js";
import type { SkillRegistry } from "../core/skills/registry.js";

export const sourcePageProfile = defineTaskProfile({
  id: "source-page",
  contractVersion: "1.0",
  summary: "Analyze the deterministic source manifest with optional handler and state responsibility evidence.",
  requiredSkills: ["source-structure"],
  optionalSkills: ["state-responsibility"],
  qualityGates: [],
});

export const spaApplicationProfile = defineTaskProfile({
  id: "spa-application",
  contractVersion: "1.0",
  summary: "Compose source, state, route-contract, and optional authentication responsibility capabilities for SPA tasks.",
  requiredSkills: ["source-structure", "state-responsibility", "spa-router"],
  optionalSkills: ["auth-guard"],
  qualityGates: ["navigation-integrity", "runtime-network-stability", "blocking-handles"],
});

export const dataBackedSpaProfile = defineTaskProfile({
  id: "data-backed-spa",
  contractVersion: "1.0",
  summary: "Compose reviewed SPA route, transport proxy, API response-flow, data cardinality, Data Surface Manifest, and optional authentication responsibilities.",
  requiredSkills: ["source-structure", "component-ownership", "data-cardinality", "state-responsibility", "spa-router", "transport-proxy", "api-responsibility", "data-surface-manifest"],
  optionalSkills: ["auth-guard"],
  qualityGates: ["navigation-integrity", "browser-request-prefix-preserved", "reviewed-fixture-only", "runtime-network-stability", "blocking-handles"],
});

export function createDefaultTaskProfileRegistry(skills: SkillRegistry): TaskProfileRegistry {
  return new TaskProfileRegistry(skills)
    .register(sourcePageProfile)
    .register(spaApplicationProfile)
    .register(dataBackedSpaProfile);
}
