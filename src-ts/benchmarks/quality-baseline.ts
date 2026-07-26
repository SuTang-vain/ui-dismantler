#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BrowserExecutionTelemetry } from "../evaluation/browser.js";
import { runQualityGate, type QualityGateReport } from "../workflow/pipeline.js";
import { summarizeNumbers, type NumericSummary } from "./statistics.js";

interface BenchmarkCase {
  id: string;
  htmlPath: string;
  libDir: string;
  manifestPath: string;
  scenarioPath: string;
}

export interface BenchmarkSample {
  caseId: string;
  round: number;
  passed: boolean;
  scores: QualityGateReport["scores"];
  failedGates: string[];
  timing: QualityGateReport["telemetry"]["timing"];
  browserTiming?: BrowserExecutionTelemetry["timing"];
  browserShutdown?: BrowserExecutionTelemetry["browserShutdown"];
  fastShutdownConfirmed?: boolean;
  blockingHandlesAfterClose?: number;
  stabilityFailureDetails: Array<{ matrix: string; viewport: string; role: "reference" | "library"; message: string }>;
  workload: QualityGateReport["telemetry"]["workload"];
  browserWorkload?: BrowserExecutionTelemetry["workload"];
  quality: {
    worstSelectorCoverage: number | null;
    worstComputedStyle: number | null;
    worstPixelDiff: number | null;
    runtimeErrors: number;
    stabilityFailures: number;
    resourceFailures: number;
    externalAvailabilityFailures: number;
    navigationFailures: number;
    worstNavigationIntegrity: number | null;
  };
}

export interface CaseAggregate {
  samples: number;
  passedRuns: number;
  failedRuns: number;
  failureRate: number;
  stabilityFailureRuns: number;
  stabilityFailureRate: number;
  runtimeErrorRuns: number;
  resourceFailureRuns: number;
  timing: Record<string, NumericSummary>;
  browserTiming: Record<string, NumericSummary>;
  quality: Record<string, NumericSummary>;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDir, "../..");
const casePath = (...parts: string[]): string => resolve(repositoryRoot, ...parts);

export const DEFAULT_BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "blackpink",
    htmlPath: casePath("examples/cases/blackpink-star-group-ts/original.html"),
    libDir: casePath("examples/cases/blackpink-star-group-ts/lib"),
    manifestPath: casePath("examples/cases/blackpink-star-group-ts/manifest.json"),
    scenarioPath: casePath("examples/cases/blackpink-star-group-ts/scenarios.json"),
  },
  {
    id: "babelo",
    htmlPath: casePath("examples/dispatch-experiments/babelo-landing/source/index.html"),
    libDir: casePath("examples/dispatch-experiments/babelo-landing/lib"),
    manifestPath: casePath("examples/dispatch-experiments/babelo-landing/manifest.json"),
    scenarioPath: casePath("examples/dispatch-experiments/babelo-landing/scenarios.json"),
  },
  {
    id: "qinshihuang",
    htmlPath: casePath("examples/cases/qinshihuang-0716-ts/original.html"),
    libDir: casePath("examples/cases/qinshihuang-0716-ts/lib"),
    manifestPath: casePath("examples/cases/qinshihuang-0716-ts/manifest.json"),
    scenarioPath: casePath("examples/cases/qinshihuang-0716-ts/scenarios.json"),
  },
  {
    id: "sandadui",
    htmlPath: casePath("examples/cases/sandadui-graph-ts/original.html"),
    libDir: casePath("examples/cases/sandadui-graph-ts/lib"),
    manifestPath: casePath("examples/cases/sandadui-graph-ts/manifest.json"),
    scenarioPath: casePath("examples/cases/sandadui-graph-ts/scenarios.json"),
  },
];

function rounded(value: number): number { return Number(value.toFixed(6)); }
function argument(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function numericArgument(args: string[], name: string, fallback: number): number {
  const raw = argument(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new TypeError(`${name} must be an integer in 1..20`);
  return value;
}

function numericRecord(samples: BenchmarkSample[], select: (sample: BenchmarkSample) => Record<string, number> | undefined): Record<string, NumericSummary> {
  const keys = new Set(samples.flatMap((sample) => Object.keys(select(sample) ?? {})));
  return Object.fromEntries([...keys].sort().map((key) => [key, summarizeNumbers(samples.map((sample) => select(sample)?.[key] ?? 0))]));
}

export function aggregateBenchmarkSamples(samples: BenchmarkSample[]): Record<string, CaseAggregate> {
  const caseIds = [...new Set(samples.map((sample) => sample.caseId))];
  return Object.fromEntries(caseIds.map((caseId) => {
    const selected = samples.filter((sample) => sample.caseId === caseId);
    const failedRuns = selected.filter((sample) => !sample.passed).length;
    const stabilityFailureRuns = selected.filter((sample) => sample.quality.stabilityFailures > 0).length;
    const runtimeErrorRuns = selected.filter((sample) => sample.quality.runtimeErrors > 0).length;
    const resourceFailureRuns = selected.filter((sample) => sample.quality.resourceFailures > 0).length;
    const quality = numericRecord(selected, (sample) => ({
      overall: sample.scores.overall,
      visual: sample.scores.visual ?? 0,
      worstSelectorCoverage: sample.quality.worstSelectorCoverage ?? 0,
      worstComputedStyle: sample.quality.worstComputedStyle ?? 0,
      worstPixelDiff: sample.quality.worstPixelDiff ?? 0,
      runtimeErrors: sample.quality.runtimeErrors,
      stabilityFailures: sample.quality.stabilityFailures,
      resourceFailures: sample.quality.resourceFailures,
      navigationFailures: sample.quality.navigationFailures,
      worstNavigationIntegrity: sample.quality.worstNavigationIntegrity ?? 0,
    }));
    return [caseId, {
      samples: selected.length,
      passedRuns: selected.length - failedRuns,
      failedRuns,
      failureRate: rounded(failedRuns / selected.length),
      stabilityFailureRuns,
      stabilityFailureRate: rounded(stabilityFailureRuns / selected.length),
      runtimeErrorRuns,
      resourceFailureRuns,
      timing: numericRecord(selected, (sample) => sample.timing as unknown as Record<string, number>),
      browserTiming: numericRecord(selected, (sample) => sample.browserTiming as unknown as Record<string, number> | undefined),
      quality,
    } satisfies CaseAggregate];
  }));
}

function stabilityDetailsFromReport(report: QualityGateReport): Array<{ matrix: string; viewport: string; role: "reference" | "library"; message: string }> {
  const matrices = [
    ...(report.browserMatrix ? [{ id: "initial", report: report.browserMatrix }] : []),
    ...(report.scenarioVisualMatrices ?? []).map((matrix) => ({ id: `scenario:${matrix.scenarioId}`, report: matrix })),
  ];
  return matrices.flatMap(({ id, report: matrix }) => matrix.viewports.flatMap((viewport) => viewport.stabilityFailureDetails.map((failure) => ({ matrix: id, viewport: viewport.id, role: failure.role, message: failure.message }))));
}

function sampleFromReport(caseId: string, round: number, report: QualityGateReport): BenchmarkSample {
  const initial = report.browserMatrix;
  const scenario = report.scenarioVisualMatrices ?? [];
  const minimum = (head: number | undefined, values: number[]): number | null => head === undefined ? null : Math.min(head, ...values);
  const maximum = (head: number | undefined, values: number[]): number | null => head === undefined ? null : Math.max(head, ...values);
  return {
    caseId,
    round,
    passed: report.passed,
    scores: report.scores,
    failedGates: report.gates.filter((gate) => !gate.passed).map((gate) => gate.id),
    timing: report.telemetry.timing,
    browserTiming: report.telemetry.browser?.timing,
    browserShutdown: report.telemetry.browser?.browserShutdown,
    fastShutdownConfirmed: report.telemetry.browser?.fastShutdownConfirmed,
    blockingHandlesAfterClose: report.telemetry.browser?.activeHandlesAfterClose.totalBlockingHandles,
    stabilityFailureDetails: stabilityDetailsFromReport(report),
    workload: report.telemetry.workload,
    browserWorkload: report.telemetry.browser?.workload,
    quality: {
      worstSelectorCoverage: minimum(initial?.worstSelectorCoverage, scenario.map((matrix) => matrix.worstSelectorCoverage)),
      worstComputedStyle: minimum(initial?.worstComputedStyle, scenario.map((matrix) => matrix.worstComputedStyle)),
      worstPixelDiff: maximum(initial?.worstPixelDiff, scenario.map((matrix) => matrix.worstPixelDiff)),
      runtimeErrors: (initial?.runtimeErrors ?? 0) + scenario.reduce((sum, matrix) => sum + matrix.runtimeErrors, 0),
      stabilityFailures: (initial?.stabilityFailures ?? 0) + scenario.reduce((sum, matrix) => sum + matrix.stabilityFailures, 0),
      resourceFailures: (initial?.resourceFailures ?? 0) + scenario.reduce((sum, matrix) => sum + matrix.resourceFailures, 0),
      externalAvailabilityFailures: (initial?.externalAvailabilityFailures ?? 0) + scenario.reduce((sum, matrix) => sum + matrix.externalAvailabilityFailures, 0),
      navigationFailures: (initial?.navigationFailures ?? 0) + scenario.reduce((sum, matrix) => sum + matrix.navigationFailures, 0),
      worstNavigationIntegrity: minimum(initial?.worstNavigationIntegrity, scenario.map((matrix) => matrix.worstNavigationIntegrity)),
    },
  };
}

export async function runQualityBaseline(options: { cases: BenchmarkCase[]; runs: number; outputPath: string }): Promise<{ passed: boolean; samples: BenchmarkSample[]; aggregates: Record<string, CaseAggregate> }> {
  const artifactsRoot = await mkdtemp(resolve(tmpdir(), "ui-dismantler-quality-baseline-"));
  const samples: BenchmarkSample[] = [];
  try {
    for (let round = 1; round <= options.runs; round += 1) {
      for (const item of options.cases) {
        process.stdout.write(`[baseline] round ${round}/${options.runs} ${item.id} ... `);
        const report = await runQualityGate({
          htmlPath: item.htmlPath,
          libDir: item.libDir,
          manifestPath: item.manifestPath,
          scenarioPath: item.scenarioPath,
          visualArtifactsDir: resolve(artifactsRoot, `${item.id}-round-${round}`),
          browserMode: "shared-browser",
          browserConcurrency: 1,
          browserResourceCache: "run-local",
          browserShutdown: "fast-kill",
          browserStability: "adaptive",
          thresholds: { interactionCoverage: 1 },
        });
        const sample = sampleFromReport(item.id, round, report);
        samples.push(sample);
        process.stdout.write(`${sample.passed ? "PASS" : "FAIL"} ${sample.timing.totalMs.toFixed(1)}ms stability=${sample.quality.stabilityFailures}\n`);
      }
    }
  } finally {
    await rm(artifactsRoot, { recursive: true, force: true });
  }
  const aggregates = aggregateBenchmarkSamples(samples);
  const result = { passed: samples.every((sample) => sample.passed), samples, aggregates };
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify({ schemaVersion: "1.0", measuredAt: new Date().toISOString(), configuration: { runs: options.runs, browserMode: "shared-browser", browserConcurrency: 1, browserResourceCache: "run-local", browserStability: "adaptive", browserShutdown: "fast-kill", interactionCoverage: 1, caseOrder: options.cases.map((item) => item.id) }, ...result }, null, 2)}\n`, "utf8");
  return result;
}

async function main(args: string[]): Promise<number> {
  const runs = numericArgument(args, "--runs", 3);
  const requested = (argument(args, "--cases") ?? DEFAULT_BENCHMARK_CASES.map((item) => item.id).join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const cases = requested.map((id) => {
    const item = DEFAULT_BENCHMARK_CASES.find((candidate) => candidate.id === id);
    if (!item) throw new TypeError(`unknown benchmark case: ${id}`);
    return item;
  });
  const outputPath = resolve(argument(args, "--out") ?? casePath("examples/performance-baselines/quality-baseline.json"));
  const result = await runQualityBaseline({ cases, runs, outputPath });
  for (const [caseId, aggregate] of Object.entries(result.aggregates)) {
    console.log(`[baseline] ${caseId}: median=${aggregate.timing.totalMs.median}ms stddev=${aggregate.timing.totalMs.standardDeviation}ms stabilityFailureRate=${aggregate.stabilityFailureRate}`);
  }
  console.log(`[baseline] report: ${outputPath}`);
  return result.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error); process.exitCode = 2; });
}
