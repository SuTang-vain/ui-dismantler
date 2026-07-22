#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeHtml } from "./analysis/analyzer.js";
import { generateScenarios } from "./evaluation/scenarios.js";
import { evaluateBrowserQuality, evaluateLibrarySelectorCoverage } from "./evaluation/browser.js";
import { evaluateRoundtrip } from "./evaluation/roundtrip.js";
import { appendRuntimeSelectorCheck, validateLibrary } from "./validation/library.js";
import { runQualityGate, writeManifest, writeScenarioDocument } from "./workflow/pipeline.js";

function flag(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function has(args: string[], name: string): boolean { return args.includes(name); }
function optionalThreshold(args: string[], name: string): number | null | undefined {
  const raw = flag(args, name);
  if (raw === undefined) return undefined;
  if (["off", "none", "null"].includes(raw.toLowerCase())) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} 必须是 0..1 的数字，或 off`);
  return value;
}
function usage(): void {
  console.error(`ui-dismantler-ts\n\n命令:\n  analyze <html> --out <manifest> [--profile <name>] [--minimal]\n  validate <lib-dir>\n  scenarios <manifest> --out <scenarios.json>\n  roundtrip <html> --lib <lib-dir> [--out <report.json>]\n  quality <html> --lib <lib-dir> [--manifest <manifest>] [--scenarios <scenarios.json>] [--interaction-coverage <0..1|off>] [--out <report.json>]\n`);
}
function printValidation(report: ReturnType<typeof validateLibrary>): void {
  console.log(`校验目标: ${report.target}`);
  for (const result of report.results) console.log(`${result.passed ? "[PASS]" : "[FAIL]"} ${result.name}\n      ${result.detail}`);
  console.log(`\n结果: ${report.passed} 通过 / ${report.failed} 失败 / 共 ${report.total} 项`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help") { usage(); return command ? 0 : 2; }
  try {
    if (command === "analyze") {
      const html = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!html || !out) throw new Error("analyze 需要 <html> 和 --out");
      const manifest = analyzeHtml(html, { profile: flag(args, "--profile"), minimal: has(args, "--minimal") });
      await writeManifest(out, manifest);
      console.log(`✓ 已生成 manifest: ${resolve(out)}`);
      console.log(`  视图: ${manifest.structure.views.map((view) => view.type).join(", ") || "generic"}`);
      console.log(`  主题色令牌: ${manifest.theme.tokens.length} 个`);
      console.log(`  交互: ${manifest.interactions.length} 个`);
      if (manifest.warnings.length) console.log(`  ⚠ 告警: ${manifest.warnings.join("；")}`);
      return 0;
    }
    if (command === "validate") {
      const dir = args[0]; if (!dir) throw new Error("validate 需要 <lib-dir>");
      const staticReport = validateLibrary(dir);
      const runtime = has(args, "--no-runtime") ? null : await evaluateLibrarySelectorCoverage(dir);
      const report = runtime ? appendRuntimeSelectorCheck(staticReport, runtime.coverage ?? null) : staticReport;
      printValidation(report); return report.ok ? 0 : 1;
    }
    if (command === "scenarios") {
      const manifestPath = args[0]; const out = flag(args, "--out");
      if (!manifestPath || !out) throw new Error("scenarios 需要 <manifest> 和 --out");
      const document = generateScenarios(JSON.parse(await readFile(resolve(manifestPath), "utf8")));
      await writeScenarioDocument(out, document); console.log(`✓ 已生成 ${document.scenarios.length} 个候选场景: ${resolve(out)}`); return 0;
    }
    if (command === "roundtrip") {
      const html = args[0]; const lib = flag(args, "--lib"); if (!html || !lib) throw new Error("roundtrip 需要 <html> 和 --lib");
      const report = await evaluateRoundtrip(html, lib);
      const browser = has(args, "--no-visual") ? undefined : await evaluateBrowserQuality(html, lib);
      const fullReport = { ...report, browser };
      const out = flag(args, "--out"); const serialized = `${JSON.stringify(fullReport, null, 2)}\n`;
      if (out) await writeFile(resolve(out), serialized, "utf8"); console.log(serialized);
      return report.score && report.score.overall >= 0.85 && (!browser || browser.passed === true) ? 0 : 1;
    }
    if (command === "quality") {
      const html = args[0]; const lib = flag(args, "--lib"); if (!html || !lib) throw new Error("quality 需要 <html> 和 --lib");
      const interactionCoverage = optionalThreshold(args, "--interaction-coverage");
      const thresholds = interactionCoverage === undefined ? undefined : { interactionCoverage };
      const report = await runQualityGate({ htmlPath: html, libDir: lib, manifestPath: flag(args, "--manifest"), scenarioPath: flag(args, "--scenarios"), visual: !has(args, "--no-visual"), visualArtifactsDir: flag(args, "--visual-artifacts"), thresholds });
      const out = flag(args, "--out"); const serialized = `${JSON.stringify(report, null, 2)}\n`;
      if (out) await writeFile(resolve(out), serialized, "utf8"); for (const gate of report.gates) console.log(`${gate.passed ? "[PASS]" : "[FAIL]"} ${gate.id}: ${gate.detail}`); console.log(`\n质量门禁: ${report.passed ? "PASS" : "FAIL"}`); return report.passed ? 0 : 1;
    }
    usage(); return 2;
  } catch (error) { console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`); return 2; }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
