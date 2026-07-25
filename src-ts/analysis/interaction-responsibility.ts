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
const NATIVE_COMMANDS = new Set(["toggle-popover", "show-popover", "hide-popover", "show-modal", "close", "request-close"]);
const executableScriptCache = new WeakMap<Document, boolean>();

function documentHasExecutableScripts(document: Document): boolean {
  const cached = executableScriptCache.get(document);
  if (cached !== undefined) return cached;
  const present = [...document.scripts].some((script) => {
    const type = (script.getAttribute("type") ?? "").trim().toLowerCase().split(";")[0];
    return !type || type === "module" || /^(?:text|application)\/(?:java|ecma)script$/.test(type);
  });
  executableScriptCache.set(document, present);
  return present;
}

export function classifyInteractionResponsibility(event: string): InteractionResponsibility {
  if (GESTURE_EVENTS.has(event)) return "gesture-protocol";
  if (SCROLL_LIFECYCLE_EVENTS.has(event)) return "scroll-lifecycle";
  if (VIEWPORT_LIFECYCLE_EVENTS.has(event)) return "viewport-lifecycle";
  if (RESOURCE_LIFECYCLE_EVENTS.has(event)) return "resource-lifecycle";
  if (CUSTOM_LIFECYCLE_EVENTS.has(event)) return "custom-lifecycle";
  return "user-action";
}

const persistentHiddenCache = new WeakMap<Element, boolean>();

function hasPersistentAuthorHiddenStyle(document: Document, element: Element): boolean {
  const cached = persistentHiddenCache.get(element);
  if (cached !== undefined) return cached;
  let hidden = element.hasAttribute("hidden");
  if (!hidden) {
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of [...rules]) {
        const candidate = rule as CSSStyleRule;
        if (!candidate.selectorText || candidate.style?.getPropertyValue("display").trim().toLowerCase() !== "none" || candidate.style.getPropertyPriority("display") !== "important") continue;
        try {
          if (element.matches(candidate.selectorText)) { hidden = true; break; }
        } catch { /* Invalid or unsupported selector evidence is ignored. */ }
      }
      if (hidden) break;
    }
  }
  persistentHiddenCache.set(element, hidden);
  return hidden;
}

function semanticControlResponsibility(document: Document, element: Element): InteractionResponsibility | null {
  if (element.matches("button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled=true]")) return "no-op-control";
  if (!documentHasExecutableScripts(document)) {
    let ancestor: Element | null = element;
    while (ancestor) {
      if (hasPersistentAuthorHiddenStyle(document, ancestor)) return "no-op-control";
      ancestor = ancestor.parentElement;
    }
  }
  if (element.matches("a")) {
    const href = element.getAttribute("href")?.trim() ?? "";
    if (!href || href === "#" || /^(?:javascript:\s*(?:void\s*\(\s*0\s*\)|;?)?)$/i.test(href)) return "no-op-control";
    return "navigation-action";
  }
  if (!element.matches("button")) return null;

  const command = element.getAttribute("command")?.trim().toLowerCase() ?? "";
  if ((command && NATIVE_COMMANDS.has(command)) || element.hasAttribute("popovertarget")) {
    const targetId = element.getAttribute("commandfor") || element.getAttribute("popovertarget");
    const target = targetId ? document.getElementById(targetId) : null;
    if (!documentHasExecutableScripts(document) && target && hasPersistentAuthorHiddenStyle(document, target)) return "no-op-control";
    return null;
  }
  const type = element.getAttribute("type")?.trim().toLowerCase() ?? "submit";
  if (element.closest("form") && (type === "submit" || type === "reset")) return null;

  // A saved/static document with no executable scripts cannot give a plain button
  // durable application semantics. Keep native inputs/details/commands above active,
  // but classify captured decorative controls as auditable no-ops.
  if (!documentHasExecutableScripts(document)) return "no-op-control";
  return null;
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
  const semantic = elements.map((element) => semanticControlResponsibility(document, element));
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
