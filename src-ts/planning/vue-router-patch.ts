import type { VueRouterResponsibilityGraph } from "./vue-router-responsibility.js";

export interface VueRouterPatchEdit {
  id: string;
  matched: boolean;
  count: number;
  detail: string;
}

export interface VueRouterIntegrationPatchMetrics {
  schemaVersion: "1.0";
  phase: "vue-router-integration-patch";
  deterministic: true;
  reviewRequired: true;
  applied: false;
  blocked: boolean;
  blockingReasons: string[];
  sourcePath: string | null;
  sourceLines: number;
  patchedLines: number;
  changedLines: number;
  changedHunks: number;
  edits: VueRouterPatchEdit[];
  responsibilitiesCovered: string[];
  responsibilitiesMissing: string[];
  modelCalls: 0;
  generatedCode: true;
  qualityRuns: 0;
  reviewReasons: string[];
}

export interface GeneratedVueRouterIntegrationPatch {
  adapter: string;
  source: string;
  patched: string;
  diff: string;
  metrics: VueRouterIntegrationPatchMetrics;
}

export interface GenerateVueRouterIntegrationPatchOptions {
  sourcePath?: string;
  importPath?: string;
}

function lineCount(value: string): number {
  return value === "" ? 0 : value.split("\n").length - (value.endsWith("\n") ? 1 : 0);
}

interface DiffOperation {
  type: "equal" | "delete" | "insert";
  line: string;
  oldLine: number;
  newLine: number;
}

function diffOperations(source: string, patched: string): DiffOperation[] {
  const before = source.split("\n"), after = patched.split("\n");
  const matrix = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = before[i] === after[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  const operations: DiffOperation[] = [];
  let i = 0, j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      operations.push({ type: "equal", line: before[i], oldLine: i + 1, newLine: j + 1 }); i += 1; j += 1;
    } else if (j >= after.length || (i < before.length && matrix[i + 1][j] >= matrix[i][j + 1])) {
      operations.push({ type: "delete", line: before[i], oldLine: i + 1, newLine: j + 1 }); i += 1;
    } else {
      operations.push({ type: "insert", line: after[j], oldLine: i + 1, newLine: j + 1 }); j += 1;
    }
  }
  return operations;
}

function diffHunks(operations: DiffOperation[], context = 3): Array<{ start: number; end: number }> {
  const changed = operations.map((operation, index) => operation.type === "equal" ? -1 : index).filter((index) => index >= 0);
  if (changed.length === 0) return [];
  const hunks: Array<{ start: number; end: number }> = [];
  for (const index of changed) {
    const start = Math.max(0, index - context), end = Math.min(operations.length, index + context + 1);
    const previous = hunks[hunks.length - 1];
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else hunks.push({ start, end });
  }
  return hunks;
}

function lineDiffStats(source: string, patched: string): { changedLines: number; changedHunks: number } {
  const operations = diffOperations(source, patched);
  return {
    changedLines: operations.filter((operation) => operation.type !== "equal").length,
    changedHunks: diffHunks(operations).length,
  };
}

function unifiedDiff(source: string, patched: string, sourceName: string, patchedName: string): string {
  const operations = diffOperations(source, patched);
  const hunks = diffHunks(operations);
  const output = [`--- ${sourceName}`, `+++ ${patchedName}`];
  for (const hunk of hunks) {
    const slice = operations.slice(hunk.start, hunk.end);
    const oldStart = slice.find((operation) => operation.type !== "insert")?.oldLine ?? slice[0].oldLine;
    const newStart = slice.find((operation) => operation.type !== "delete")?.newLine ?? slice[0].newLine;
    const oldCount = slice.filter((operation) => operation.type !== "insert").length;
    const newCount = slice.filter((operation) => operation.type !== "delete").length;
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const operation of slice) output.push(`${operation.type === "equal" ? " " : operation.type === "delete" ? "-" : "+"}${operation.line}`);
  }
  output.push("");
  return output.join("\n");
}

function adapterSource(): string {
  return `/**\n * Review-only Vue Router contract observer.\n * It observes the framework-owned router; it does not replace route matching, guards,\n * dynamic route injection, router-view rendering, or visual component ownership.\n */\nexport function installVueRouterContractAdapter(router, hooks = {}) {\n  if (!router || typeof router.afterEach !== "function") {\n    throw new TypeError("installVueRouterContractAdapter requires a Vue Router instance");\n  }\n  const onNavigation = typeof hooks.onNavigation === "function" ? hooks.onNavigation : () => {};\n  router.afterEach((to, from) => {\n    onNavigation({\n      type: "afterEach",\n      to: { path: to.path, fullPath: to.fullPath, name: to.name || null },\n      from: { path: from.path, fullPath: from.fullPath, name: from.name || null },\n    });\n  });\n  return {\n    dispose() {},\n    frameworkOwned: true,\n    replacementApplied: false,\n  };\n}\n`;
}

export function generateVueRouterIntegrationPatch(
  graph: VueRouterResponsibilityGraph,
  source: string,
  options: GenerateVueRouterIntegrationPatchOptions = {},
): GeneratedVueRouterIntegrationPatch {
  const importPath = options.importPath ?? "@/router/vue-router-contract-adapter";
  const edits: VueRouterPatchEdit[] = [];
  const record = (id: string, count: number, detail: string): void => { edits.push({ id, matched: count > 0, count, detail }); };
  const importLine = `import { installVueRouterContractAdapter } from '${importPath}'`;
  let patched = source;
  const hasImport = new RegExp(`import\\s+\\{\\s*installVueRouterContractAdapter\\s*\\}\\s+from\\s+['\"]${importPath.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}['\"]`).test(source);
  if (!hasImport) {
    patched = `${importLine}\n${patched}`;
    record("adapter-import", 1, "inserted review-only Vue Router contract observer import");
  } else record("adapter-import", 1, "existing observer import reused");

  const hook = `\n\n// Review-only contract observation; Vue Router remains the source of truth.\ninstallVueRouterContractAdapter(router, {\n  onNavigation: ({ to, from }) => {\n    if (typeof window !== 'undefined') window.__UI_DISMANTLER_ROUTE_STATE__ = { to, from };\n  }\n});\n`;
  const afterEachPattern = /router\.afterEach\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\n\}\)/m;
  if (!/installVueRouterContractAdapter\s*\(\s*router/.test(patched)) {
    const match = patched.match(afterEachPattern);
    if (match && match.index !== undefined) {
      const insertionPoint = match.index + match[0].length;
      patched = `${patched.slice(0, insertionPoint)}${hook}${patched.slice(insertionPoint)}`;
      record("after-hook-installation", 1, "attached observer after framework-owned router hook");
    } else record("after-hook-installation", 0, "could not find a safe afterEach insertion boundary");
  } else record("after-hook-installation", 1, "existing observer installation reused");

  const requiredKinds = ["router-construction", "route-table", "guard-before-each", "guard-redirect", "guard-dynamic-route-injection", "router-view-rendering"] as const;
  const covered = requiredKinds.filter((kind) => graph.responsibilities.some((item) => item.kind === kind));
  const missing = requiredKinds.filter((kind) => !covered.includes(kind));
  const blockingReasons = [...graph.blockers];
  if (!edits.find((edit) => edit.id === "after-hook-installation")?.matched) blockingReasons.push("no safe framework-owned afterEach boundary was found for the review-only observer");
  if (missing.length > 0) blockingReasons.push(`responsibility graph is incomplete: ${missing.join(", ")}`);
  const diff = unifiedDiff(source, patched, options.sourcePath ?? "permission.js", `${options.sourcePath ?? "permission.js"}.generated`);
  const lineStats = lineDiffStats(source, patched);
  const metrics: VueRouterIntegrationPatchMetrics = {
    schemaVersion: "1.0",
    phase: "vue-router-integration-patch",
    deterministic: true,
    reviewRequired: true,
    applied: false,
    blocked: blockingReasons.length > 0,
    blockingReasons,
    sourcePath: options.sourcePath ?? null,
    sourceLines: lineCount(source),
    patchedLines: lineCount(patched),
    changedLines: lineStats.changedLines,
    changedHunks: lineStats.changedHunks,
    edits,
    responsibilitiesCovered: covered,
    responsibilitiesMissing: missing,
    modelCalls: 0,
    generatedCode: true,
    qualityRuns: 0,
    reviewReasons: [
      "the observer is review-only and is never applied automatically",
      "Vue Router remains responsible for matching, history, guards, and dynamic route injection",
      "the observer records route state only; it does not generate visual DOM or CSS",
      "the patched source must pass the same Semantic Gold+ and route-state visual matrix before acceptance",
    ],
  };
  return { adapter: adapterSource(), source, patched, diff, metrics };
}
