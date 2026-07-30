import { createHash } from "node:crypto";
import { assertDataSurfaceManifest } from "./validator.js";
import type { DataSurfaceManifest } from "./contract.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}

export function hashCanonicalValue(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function serializeDataSurfaceManifest(manifest: DataSurfaceManifest): string {
  assertDataSurfaceManifest(manifest);
  return `${JSON.stringify(canonicalize(manifest), null, 2)}\n`;
}
