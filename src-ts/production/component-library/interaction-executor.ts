import type { JsonValue } from "../../types.js";
import type { SfcHandlerStateResponsibility, SfcStateWriteResponsibility } from "../../planning/sfc-state-responsibility.js";
import type { ComponentLibraryInteractionBinding } from "./contract.js";

export type ReviewedStateTransitionKind = "set-literal" | "toggle-boolean" | "increment" | "decrement";

export interface ReviewedStateTransition {
  readonly kind: ReviewedStateTransitionKind;
  readonly path: string;
  readonly value?: JsonValue;
  readonly sourceExpression: string;
}

export interface StateTransitionExecutionResult {
  readonly status: "materialized" | "blocked";
  readonly handler?: string;
  readonly event?: string;
  readonly state: Record<string, JsonValue>;
  readonly transition?: ReviewedStateTransition;
  readonly mutationTarget?: string;
  readonly renderInvalidation?: { readonly kind: "state-path"; readonly target: string };
  readonly blockers: readonly string[];
}

function cloneState(state: Record<string, JsonValue>): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(state)) as Record<string, JsonValue>;
}

function normalizePath(value: string): string {
  return value.trim().replace(/^this\./, "").replace(/\.value$/, "");
}

function readPath(state: Record<string, JsonValue>, path: string): JsonValue | undefined {
  let current: JsonValue = state;
  for (const segment of normalizePath(path).split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, JsonValue>)[segment];
  }
  return current;
}

function writePath(state: Record<string, JsonValue>, path: string, value: JsonValue): void {
  const segments = normalizePath(path).split(".").filter(Boolean);
  if (segments.length === 0) throw new Error("state write path is empty");
  let current = state;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing === undefined || existing === null) current[segment] = {};
    if (typeof current[segment] !== "object" || Array.isArray(current[segment])) throw new Error(`state path traverses a non-object: ${path}`);
    current = current[segment] as Record<string, JsonValue>;
  }
  current[segments.at(-1)!] = value;
}

function literalFromExpression(expression: string): JsonValue | undefined {
  const match = expression.match(/=\s*(true|false|null|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*$/);
  if (!match) return undefined;
  const literal = match[1];
  if (literal === "true") return true;
  if (literal === "false") return false;
  if (literal === "null") return null;
  if (/^-?\d/.test(literal)) return Number(literal);
  return literal.slice(1, -1).replace(/\\([\\'])/g, "$1");
}

function sameStatePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function transitionFor(write: SfcStateWriteResponsibility): ReviewedStateTransition | undefined {
  const expression = write.expression.replace(/\s+/g, " ").trim();
  const path = normalizePath(write.path);
  const literal = write.value ?? literalFromExpression(expression);
  if (literal !== undefined && new RegExp(`^(?:this\\.)?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.value)?\\s*=`).test(expression)) {
    return { kind: "set-literal", path, value: literal, sourceExpression: write.expression };
  }
  if (new RegExp(`^(?:this\\.)?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.value)?\\s*=\\s*!\\s*(?:this\\.)?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.value)?$`).test(expression)) {
    return { kind: "toggle-boolean", path, sourceExpression: write.expression };
  }
  if (new RegExp(`^(?:\\+\\+)?(?:this\\.)?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.value)?(?:\\+\\+)?$`).test(expression) && /\+\+/.test(expression)) {
    return { kind: "increment", path, sourceExpression: write.expression };
  }
  if (new RegExp(`^(?:--)?(?:this\\.)?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.value)?(?:--)?$`).test(expression) && /--/.test(expression)) {
    return { kind: "decrement", path, sourceExpression: write.expression };
  }
  return undefined;
}

export function executeReviewedStateWrite(
  write: SfcStateWriteResponsibility,
  state: Record<string, JsonValue>,
): StateTransitionExecutionResult {
  const nextState = cloneState(state);
  const transition = transitionFor(write);
  if (!transition) return { status: "blocked", state: nextState, blockers: [`unsupported state expression: ${write.expression}`] };
  const current = readPath(nextState, transition.path);
  try {
    if (transition.kind === "set-literal") writePath(nextState, transition.path, transition.value ?? null);
    else if (transition.kind === "toggle-boolean") {
      if (typeof current !== "boolean") return { status: "blocked", state: nextState, blockers: [`toggle target is not boolean: ${transition.path}`] };
      writePath(nextState, transition.path, !current);
    } else {
      if (typeof current !== "number") return { status: "blocked", state: nextState, blockers: [`counter target is not numeric: ${transition.path}`] };
      writePath(nextState, transition.path, transition.kind === "increment" ? current + 1 : current - 1);
    }
  } catch (error) {
    return { status: "blocked", state: nextState, blockers: [error instanceof Error ? error.message : String(error)] };
  }
  return {
    status: "materialized",
    state: nextState,
    transition,
    mutationTarget: transition.path,
    renderInvalidation: { kind: "state-path", target: transition.path },
    blockers: [],
  };
}

export function executeReviewedInteraction(
  binding: ComponentLibraryInteractionBinding,
  handler: SfcHandlerStateResponsibility,
  state: Record<string, JsonValue>,
): StateTransitionExecutionResult {
  if (!binding.reviewed) return { status: "blocked", handler: handler.handler, event: binding.event, state: cloneState(state), blockers: [`interaction binding is not reviewed: ${binding.id}`] };
  const writes = handler.writes;
  if (writes.length !== 1) return { status: "blocked", handler: handler.handler, event: binding.event, state: cloneState(state), blockers: [`handler ${handler.handler} has ${writes.length} state writes; reviewed executor currently requires exactly one`] };
  const result = executeReviewedStateWrite(writes[0], state);
  return { ...result, handler: handler.handler, event: binding.event };
}

export function findHandlerForInteraction(
  binding: ComponentLibraryInteractionBinding,
  handlers: readonly SfcHandlerStateResponsibility[],
): SfcHandlerStateResponsibility | undefined {
  const expression = binding.expression.trim();
  const match = expression.match(/^([A-Za-z_$][\w$]*)\s*(?:\([^)]*\))?$/);
  if (!match) return undefined;
  return handlers.find((handler) => handler.handler === match[1]);
}

export function stateWriteMatchesBinding(binding: ComponentLibraryInteractionBinding, write: SfcStateWriteResponsibility): boolean {
  return sameStatePath(binding.target, write.path) || binding.expression.includes(write.path);
}
