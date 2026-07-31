import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertComponentLibraryBuildPlan, type ComponentLibraryBuildPlan } from "./contract.js";

export interface ComponentLibraryMaterializationReport {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-materialization-report";
  readonly outputRoot: string;
  readonly filesWritten: number;
  readonly publishableFiles: number;
  readonly nonPublishableFiles: number;
  readonly bytesWritten: number;
  readonly status: "succeeded";
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function materializeComponentLibrary(
  plan: ComponentLibraryBuildPlan,
  outputRoot: string,
  options: { overwrite?: boolean } = {},
): Promise<ComponentLibraryMaterializationReport> {
  assertComponentLibraryBuildPlan(plan);
  if (plan.reviewRequired) throw new Error("Component Library Build Plan requires review before materialization");
  const absoluteRoot = resolve(outputRoot);
  if (await exists(absoluteRoot)) {
    const entries = await readdir(absoluteRoot);
    if (entries.length > 0 && !options.overwrite) throw new Error(`Component library output directory is not empty: ${absoluteRoot}`);
    if (entries.length > 0) await rm(absoluteRoot, { recursive: true, force: true });
  }
  await mkdir(absoluteRoot, { recursive: true });
  for (const file of plan.files) {
    const destination = resolve(absoluteRoot, file.path);
    if (destination !== absoluteRoot && !destination.startsWith(`${absoluteRoot}/`)) throw new Error(`Planned file escapes output root: ${file.path}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
  const evidenceRoot = resolve(absoluteRoot, ".ui-dismantler");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(resolve(evidenceRoot, "build-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const report: ComponentLibraryMaterializationReport = {
    schemaVersion: "1.0",
    kind: "component-library-materialization-report",
    outputRoot: absoluteRoot,
    filesWritten: plan.files.length,
    publishableFiles: plan.files.filter((file) => file.publish).length,
    nonPublishableFiles: plan.files.filter((file) => !file.publish).length,
    bytesWritten: plan.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0),
    status: "succeeded",
  };
  await writeFile(resolve(evidenceRoot, "materialization.report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
