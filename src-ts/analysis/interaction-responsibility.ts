import type { Interaction, InteractionResponsibility } from "../types.js";

const GESTURE_EVENTS = new Set([
  "pointerdown", "pointermove", "pointerup", "pointercancel",
  "touchstart", "touchmove", "touchend", "touchcancel",
  "mousedown", "mousemove", "mouseup",
  "dragstart", "drag", "dragenter", "dragover", "dragleave", "drop", "dragend",
  "wheel",
]);
const SCROLL_LIFECYCLE_EVENTS = new Set(["scroll", "scrollend"]);
const VIEWPORT_LIFECYCLE_EVENTS = new Set(["resize", "orientationchange"]);
const RESOURCE_LIFECYCLE_EVENTS = new Set(["load", "error", "DOMContentLoaded", "readystatechange"]);
const CUSTOM_LIFECYCLE_EVENTS = new Set(["scroll-call"]);
const LIFECYCLE_RESPONSIBILITIES = new Set<InteractionResponsibility>([
  "scroll-lifecycle", "viewport-lifecycle", "resource-lifecycle", "custom-lifecycle",
]);
const NAVIGATION_MUTATION = /(?:\bscroll(?:To|By)?\b|scrollLeft|scrollTop|location\b|history\.(?:pushState|replaceState)|navigate\b)/i;

export function classifyInteractionResponsibility(event: string): InteractionResponsibility {
  if (GESTURE_EVENTS.has(event)) return "gesture-protocol";
  if (SCROLL_LIFECYCLE_EVENTS.has(event)) return "scroll-lifecycle";
  if (VIEWPORT_LIFECYCLE_EVENTS.has(event)) return "viewport-lifecycle";
  if (RESOURCE_LIFECYCLE_EVENTS.has(event)) return "resource-lifecycle";
  if (CUSTOM_LIFECYCLE_EVENTS.has(event)) return "custom-lifecycle";
  return "user-action";
}

function semanticControlResponsibility(element: Element): InteractionResponsibility | null {
  if (element.matches("button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled=true]")) return "no-op-control";
  if (!element.matches("a")) return null;
  const href = element.getAttribute("href")?.trim() ?? "";
  if (!href || href === "#" || /^(?:javascript:\s*(?:void\s*\(\s*0\s*\)|;?)?)$/i.test(href)) return "no-op-control";
  return "navigation-action";
}

function hasApplicationStateEvidence(interaction: Pick<Interaction, "mutationTargets" | "stateTransitions" | "stateMutations">): boolean {
  if ((interaction.mutationTargets?.length ?? 0) > 0 || (interaction.stateTransitions?.length ?? 0) > 0) return true;
  return (interaction.stateMutations ?? []).some((mutation) => !NAVIGATION_MUTATION.test(mutation));
}

/**
 * Refine event-only responsibility with source DOM semantics after AST/semantic evidence is merged.
 * Navigation and inert controls remain auditable interactions, but do not require invented DOM-state
 * assertions. Any durable application-state evidence promotes the control back to user-action.
 */
export function refineInteractionResponsibility(document: Document, interaction: Interaction): InteractionResponsibility {
  const eventResponsibility = classifyInteractionResponsibility(interaction.event);
  if (eventResponsibility !== "user-action") return eventResponsibility;
  if (interaction.event !== "click" || interaction.trigger === "html" || interaction.trigger.startsWith("@")) return interaction.responsibility ?? eventResponsibility;
  let elements: Element[] = [];
  try { elements = [...document.querySelectorAll(interaction.trigger)]; } catch { return interaction.responsibility ?? eventResponsibility; }
  if (!elements.length) return interaction.responsibility ?? eventResponsibility;
  const semantic = elements.map(semanticControlResponsibility);
  if (semantic.some((item) => item === null) || new Set(semantic).size !== 1) return interaction.responsibility ?? eventResponsibility;
  const responsibility = semantic[0] as InteractionResponsibility;
  if (responsibility === "navigation-action" && hasApplicationStateEvidence(interaction)) return "user-action";
  if (responsibility === "no-op-control" && hasApplicationStateEvidence(interaction)) return "user-action";
  return responsibility;
}

export function interactionResponsibility(interaction: Pick<Interaction, "event" | "responsibility" | "lifecycle">): InteractionResponsibility {
  if (interaction.responsibility) return interaction.responsibility;
  if (interaction.lifecycle) {
    const classified = classifyInteractionResponsibility(interaction.event);
    return classified === "user-action" ? "custom-lifecycle" : classified;
  }
  return classifyInteractionResponsibility(interaction.event);
}

export function requiresInteractionScenario(interaction: Pick<Interaction, "event" | "responsibility" | "lifecycle">): boolean {
  const responsibility = interactionResponsibility(interaction);
  return responsibility === "user-action" || responsibility === "gesture-protocol";
}

export function requiresInteractionOwner(interaction: Pick<Interaction, "event" | "responsibility" | "lifecycle">): boolean {
  return requiresInteractionScenario(interaction);
}

export function contributesInteractionComplexity(interaction: Pick<Interaction, "event" | "responsibility" | "lifecycle">): boolean {
  return requiresInteractionScenario(interaction);
}

export function isInteractionEquivalenceEligible(interaction: Pick<Interaction, "event" | "responsibility" | "lifecycle">): boolean {
  return interactionResponsibility(interaction) === "user-action";
}

export function isLifecycleInteraction(interaction: Pick<Interaction, "event" | "responsibility" | "lifecycle">): boolean {
  return LIFECYCLE_RESPONSIBILITIES.has(interactionResponsibility(interaction));
}
