import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ComponentLibraryQualityContract } from "./contract.js";

export type ComponentLibrarySourceReadinessStatus = "ready" | "review-required" | "blocked";
export type ComponentLibrarySourceReadinessSeverity = "warning" | "review" | "blocker";

export interface ComponentLibrarySourceReadinessIssue {
  readonly id:
    | "source-unreadable"
    | "runtime-shell"
    | "missing-local-resource"
    | "remote-critical-resource"
    | "canvas-profile-required"
    | "webgl-profile-required";
  readonly severity: ComponentLibrarySourceReadinessSeverity;
  readonly detail: string;
  readonly reference?: string;
}

export interface ComponentLibrarySourceReadinessReport {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-source-readiness-report";
  readonly sourcePath: string;
  readonly resourceProfile: "dom" | "canvas";
  readonly status: ComponentLibrarySourceReadinessStatus;
  readonly metrics: {
    readonly sourceBytes: number;
    readonly visibleTextCharacters: number;
    readonly inlineStyleBytes: number;
    readonly inlineScriptBytes: number;
    readonly criticalResourceReferences: number;
    readonly missingLocalResources: number;
    readonly remoteCriticalResources: number;
    readonly canvasSignals: number;
    readonly webglSignals: number;
  };
  readonly issues: readonly ComponentLibrarySourceReadinessIssue[];
  readonly ready: boolean;
}

interface ResourceReference {
  readonly kind: "script" | "stylesheet";
  readonly value: string;
  readonly remote: boolean;
  readonly required: boolean;
}

function attributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of source.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function resourceReferences(html: string): ResourceReference[] {
  const result: ResourceReference[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    const value = attrs.get("src")?.trim();
    if (!value) continue;
    const remote = /^(?:https?:)?\/\//i.test(value);
    const type = attrs.get("type")?.toLowerCase() ?? "";
    const optionalTransport = attrs.has("async") && type !== "module";
    result.push({ kind: "script", value, remote, required: !optionalTransport });
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    const value = attrs.get("href")?.trim();
    if (!value || !rel.includes("stylesheet")) continue;
    result.push({ kind: "stylesheet", value, remote: /^(?:https?:)?\/\//i.test(value), required: true });
  }
  return result;
}

function inlineBytes(html: string, tag: "style" | "script"): number {
  let total = 0;
  const expression = tag === "style" ? /<style\b[^>]*>([\s\S]*?)<\/style>/gi : /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(expression)) total += Buffer.byteLength(match[1] ?? "");
  return total;
}

function visibleTextCharacters(html: string): number {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|template|svg)\b[\s\S]*?<\/(?:script|style|template|svg)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|ensp|emsp);/gi, " ")
    .replace(/&[a-z0-9#]+;/gi, "x")
    .replace(/\s+/g, "");
  return [...stripped].length;
}

function signalCount(source: string, expressions: readonly RegExp[]): number {
  return expressions.reduce((total, expression) => total + (source.match(expression)?.length ?? 0), 0);
}

function localReference(value: string): boolean {
  return Boolean(value)
    && !/^(?:[a-z]+:|\/\/|#|data:|blob:|javascript:)/i.test(value)
    && !value.includes("{{")
    && !value.includes("<%=");
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function assessComponentLibrarySourceReadiness(
  quality: ComponentLibraryQualityContract,
): Promise<ComponentLibrarySourceReadinessReport> {
  const sourcePath = resolve(quality.originalHtmlPath);
  const issues: ComponentLibrarySourceReadinessIssue[] = [];
  let html = "";
  try {
    html = await readFile(sourcePath, "utf8");
  } catch (error) {
    issues.push({ id: "source-unreadable", severity: "blocker", detail: error instanceof Error ? error.message : String(error), reference: sourcePath });
  }
  const references = resourceReferences(html);
  const critical = references.filter((reference) => reference.required);
  const remoteCritical = critical.filter((reference) => reference.remote);
  const missingLocal: ResourceReference[] = [];
  for (const reference of critical.filter((item) => !item.remote && localReference(item.value))) {
    const clean = reference.value.split(/[?#]/, 1)[0];
    if (!await exists(resolve(dirname(sourcePath), clean))) missingLocal.push(reference);
  }
  const textCharacters = visibleTextCharacters(html);
  const styleBytes = inlineBytes(html, "style");
  const scriptBytes = inlineBytes(html, "script");
  const canvasSignals = signalCount(html, [/<canvas\b/gi, /getContext\s*\(\s*["']2d["']/gi, /CanvasRenderingContext2D/g]);
  const webglSignals = signalCount(html, [/getContext\s*\(\s*["']webgl2?["']/gi, /WebGLRenderer/g, /WebGLRenderingContext/g, /\bTHREE\./g, /fragmentShader|vertexShader/g]);
  const unresolvedCriticalResources = remoteCritical.length + missingLocal.length;
  const shellLike = html.length > 0
    && textCharacters < 80
    && styleBytes < 256
    && unresolvedCriticalResources > 0;
  if (shellLike) {
    issues.push({
      id: "runtime-shell",
      severity: "blocker",
      detail: `source HTML contains only ${textCharacters} visible characters and depends on ${unresolvedCriticalResources} unresolved critical bundle(s); materialize or freeze the reference runtime before component production`,
      reference: sourcePath,
    });
  }
  for (const reference of missingLocal) {
    issues.push({ id: "missing-local-resource", severity: "blocker", detail: `critical ${reference.kind} resource is missing`, reference: reference.value });
  }
  for (const reference of remoteCritical) {
    issues.push({
      id: "remote-critical-resource",
      severity: shellLike ? "blocker" : "review",
      detail: `critical ${reference.kind} resource is remote and is not frozen with the source`,
      reference: reference.value,
    });
  }
  const resourceProfile = quality.resourceProfile ?? "dom";
  if (webglSignals > 0 && resourceProfile !== "canvas") {
    issues.push({ id: "webgl-profile-required", severity: "blocker", detail: "WebGL responsibility requires a reviewed canvas resource profile" });
  } else if (canvasSignals > 0 && resourceProfile !== "canvas") {
    issues.push({ id: "canvas-profile-required", severity: "review", detail: "Canvas responsibility requires review before DOM-only production can be accepted" });
  }
  const status: ComponentLibrarySourceReadinessStatus = issues.some((issue) => issue.severity === "blocker")
    ? "blocked"
    : issues.some((issue) => issue.severity === "review")
      ? "review-required"
      : "ready";
  return {
    schemaVersion: "1.0",
    kind: "component-library-source-readiness-report",
    sourcePath,
    resourceProfile,
    status,
    metrics: {
      sourceBytes: Buffer.byteLength(html),
      visibleTextCharacters: textCharacters,
      inlineStyleBytes: styleBytes,
      inlineScriptBytes: scriptBytes,
      criticalResourceReferences: critical.length,
      missingLocalResources: missingLocal.length,
      remoteCriticalResources: remoteCritical.length,
      canvasSignals,
      webglSignals,
    },
    issues,
    ready: status === "ready",
  };
}
