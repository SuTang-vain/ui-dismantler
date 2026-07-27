import { readFileSync } from "node:fs";
import type { SpaRouteShellPlan } from "./spa-route-shell.js";

export interface SpaRouteShellPatchEdit {
  id: string;
  matched: boolean;
  count: number;
  detail: string;
}

export interface SpaRouteShellIntegrationPatchMetrics {
  schemaVersion: "1.0";
  phase: "route-shell-integration-patch";
  deterministic: true;
  reviewRequired: true;
  applied: false;
  sourcePath: string | null;
  sourceLines: number;
  patchedLines: number;
  changedLines: number;
  changedHunks: number;
  edits: SpaRouteShellPatchEdit[];
  blocked: boolean;
  blockingReasons: string[];
  modelCalls: 0;
  generatedCode: true;
  qualityRuns: 0;
  reviewReasons: string[];
}

export interface GenerateSpaRouteShellPatchOptions {
  sourcePath?: string;
  importPath?: string;
}

export interface GeneratedSpaRouteShellIntegrationPatch {
  source: string;
  patched: string;
  diff: string;
  metrics: SpaRouteShellIntegrationPatchMetrics;
}

function lineCount(value: string): number {
  return value === "" ? 0 : value.split("\n").length - (value.endsWith("\n") ? 1 : 0);
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))].length;
}

function replaceOnce(source: string, pattern: RegExp, replacement: string): { value: string; count: number } {
  const count = countMatches(source, pattern);
  return { value: source.replace(pattern, replacement), count };
}


function lineDiffStats(source: string, patched: string): { changedLines: number; changedHunks: number } {
  const before = source.split("\n"), after = patched.split("\n");
  const matrix = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) matrix[i][j] = before[i] === after[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  }
  let i = 0, j = 0, changedLines = 0, changedHunks = 0, inHunk = false;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { i += 1; j += 1; inHunk = false; continue; }
    if (!inHunk) { changedHunks += 1; inHunk = true; }
    if (i >= before.length) { j += 1; changedLines += 1; continue; }
    if (j >= after.length) { i += 1; changedLines += 1; continue; }
    if (matrix[i + 1][j] >= matrix[i][j + 1]) i += 1;
    else j += 1;
    changedLines += 1;
  }
  return { changedLines, changedHunks };
}

function unifiedDiff(source: string, patched: string, sourceName: string, patchedName: string): { value: string; changedLines: number; changedHunks: number } {
  if (source === patched) return { value: `--- ${sourceName}\n+++ ${patchedName}\n`, changedLines: 0, changedHunks: 0 };
  const before = source.split("\n"), after = patched.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const beforeChunk = before.slice(prefix, before.length - suffix), afterChunk = after.slice(prefix, after.length - suffix);
  const oldStart = prefix + 1, newStart = prefix + 1;
  const hunk = [
    `@@ -${oldStart},${beforeChunk.length} +${newStart},${afterChunk.length} @@`,
    ...beforeChunk.map((line) => `-${line}`),
    ...afterChunk.map((line) => `+${line}`),
  ];
  return {
    value: [`--- ${sourceName}`, `+++ ${patchedName}`, ...hunk, ""].join("\n"),
    changedLines: Math.max(beforeChunk.length, afterChunk.length),
    changedHunks: 1,
  };
}

export function generateSpaRouteShellIntegrationPatch(plan: SpaRouteShellPlan, source: string, options: GenerateSpaRouteShellPatchOptions = {}): GeneratedSpaRouteShellIntegrationPatch {
  const importPath = options.importPath ?? "./generated/router.js";
  let patched = source;
  const edits: SpaRouteShellPatchEdit[] = [];
  const record = (id: string, count: number, detail: string): void => { edits.push({ id, matched: count > 0, count, detail }); };

  const importEdit = replaceOnce(patched, /^import \{ createRouter \} from [^;]+;\n\n/m, "");
  if (importEdit.count === 0) {
    patched = `import { createRouter } from "${importPath}";\n\n${patched}`;
    record("router-import", 1, "inserted createRouter import");
  } else {
    patched = `import { createRouter } from "${importPath}";\n\n${importEdit.value}`;
    record("router-import", importEdit.count, "normalized existing createRouter import");
  }

  const navigate = replaceOnce(patched, /  const navigate = \(path, replace = false\) => \{[\s\S]*?  \};\n/, "  let router;\n");
  patched = navigate.value;
  record("local-navigate-helper", navigate.count, "replaced local pushState/replaceState helper with router handle");

  const libraryBranch = replaceOnce(patched, /      if \(href === ['"]\/library['"]\) return navigate\(['"]\/login['"]\);\n      navigate\(href\);/, "      router.navigate(href, { source: 'auto-router' });");
  patched = libraryBranch.value;
  record("guard-navigation", libraryBranch.count, "delegated observed guard redirect to generated guard table");

  const genericNavigate = replaceOnce(patched, /(?<!router\.)navigate\(href\);/g, "router.navigate(href, { source: 'auto-router' });");
  patched = genericNavigate.value;
  record("link-navigation", genericNavigate.count, "delegated link navigation to generated router");

  const back = replaceOnce(patched, /history\.back\(\)/g, "router.back()");
  patched = back.value;
  record("history-back", back.count, "delegated history back to generated router");

  const forward = replaceOnce(patched, /history\.forward\(\)/g, "router.forward()");
  patched = forward.value;
  record("history-forward", forward.count, "delegated history forward to generated router");

  const search = replaceOnce(patched, /navigate\(`\/search\/\$\{encodeURIComponent\(event\.currentTarget\.value\)\}`\);/g, "router.navigate(`/search/${encodeURIComponent(event.currentTarget.value)}`, { source: 'auto-router' });");
  patched = search.value;
  record("dynamic-input-navigation", search.count, "delegated dynamic input route to generated router");

  const lifecycle = replaceOnce(patched, /  history\.replaceState\(\{ source: ['"]generated['"], route: routePath\(\) \}, ['"]['"], routePath\(\)\);\n  addEventListener\(['"]popstate['"], render\);\n  render\(\);/, "  history.replaceState({ source: 'auto-router', route: routePath() }, '', routePath());\n  router = createRouter({ onRoute: render });");
  patched = lifecycle.value;
  record("router-lifecycle", lifecycle.count, "replaced manual popstate/render bootstrap with generated router lifecycle");

  const blockingReasons: string[] = [];
  if (plan.capabilities.historyBack && !edits.find((edit) => edit.id === "history-back")?.matched) blockingReasons.push("plan requires history.back but source pattern was not found");
  if (plan.capabilities.historyForward && !edits.find((edit) => edit.id === "history-forward")?.matched) blockingReasons.push("plan requires history.forward but source pattern was not found");
  if (plan.capabilities.dynamicInputRoutes && !edits.find((edit) => edit.id === "dynamic-input-navigation")?.matched) blockingReasons.push("plan contains dynamic input routes but source pattern was not found");
  if (plan.transitions.some((transition) => transition.action === "guard-redirect") && !edits.find((edit) => edit.id === "guard-navigation")?.matched) blockingReasons.push("plan contains guard redirect but source guard pattern was not found");
  if (edits.some((edit) => edit.id === "router-lifecycle" && !edit.matched)) blockingReasons.push("router lifecycle bootstrap pattern was not found");
  const diff = unifiedDiff(source, patched, options.sourcePath ?? "app.js", `${options.sourcePath ?? "app.js"}.generated`);
  const lineStats = lineDiffStats(source, patched);
  const metrics: SpaRouteShellIntegrationPatchMetrics = {
    schemaVersion: "1.0", phase: "route-shell-integration-patch", deterministic: true,
    reviewRequired: true, applied: false, sourcePath: options.sourcePath ?? null,
    sourceLines: lineCount(source), patchedLines: lineCount(patched), changedLines: lineStats.changedLines, changedHunks: lineStats.changedHunks,
    edits, blocked: blockingReasons.length > 0, blockingReasons, modelCalls: 0, generatedCode: true, qualityRuns: 0,
    reviewReasons: [
      "the patch is a preview and is never applied automatically",
      "the visual DOM and CSS remain owned by the source route shell",
      "guard redirect rewrites require human approval",
      "the patched application must run the same Semantic Gold+ and visual matrix before acceptance",
    ],
  };
  return { source, patched, diff: diff.value, metrics };
}

export function generateSpaRouteShellIntegrationPatchFromFile(plan: SpaRouteShellPlan, sourcePath: string, options: Omit<GenerateSpaRouteShellPatchOptions, "sourcePath"> = {}): GeneratedSpaRouteShellIntegrationPatch {
  return generateSpaRouteShellIntegrationPatch(plan, readFileSync(sourcePath, "utf8"), { ...options, sourcePath });
}
