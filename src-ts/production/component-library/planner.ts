import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION,
  assertComponentLibraryBuildPlan,
  sha256,
  type ComponentLibraryBuildFile,
  type ComponentLibraryBuildFileInput,
  type ComponentLibraryBuildPlan,
  type ComponentLibraryBuildPlanInput,
} from "./contract.js";

async function materializeFile(input: ComponentLibraryBuildFileInput, baseDirectory: string): Promise<ComponentLibraryBuildFile> {
  if ((input.sourcePath === undefined) === (input.content === undefined)) {
    throw new Error(`Build file ${input.path} must declare exactly one of sourcePath or content`);
  }
  const content = input.content ?? await readFile(resolve(baseDirectory, input.sourcePath!), "utf8");
  return {
    path: input.path,
    role: input.role,
    content,
    contentHash: sha256(content),
    publish: input.publish,
    reviewed: input.reviewed,
    provenance: input.provenance,
  };
}

export async function createComponentLibraryBuildPlan(input: ComponentLibraryBuildPlanInput, configPath: string): Promise<ComponentLibraryBuildPlan> {
  if (input.schemaVersion !== COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION) {
    throw new Error(`Component Library build configuration schemaVersion must be ${COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION}`);
  }
  const baseDirectory = dirname(resolve(configPath));
  const files = await Promise.all(input.files.map((file) => materializeFile(file, baseDirectory)));
  const unresolved = [...(input.unresolved ?? [])];
  const normalizedConfiguration = JSON.stringify({
    schemaVersion: input.schemaVersion,
    sourceRoot: input.sourceRoot,
    sourceHash: input.sourceHash ?? null,
    library: input.library,
    files: files.map(({ path, role, contentHash, publish, reviewed, provenance }) => ({ path, role, contentHash, publish, reviewed, provenance })),
    smoke: input.smoke,
    quality: input.quality ?? null,
    unresolved,
  });
  const plan: ComponentLibraryBuildPlan = {
    schemaVersion: COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION,
    kind: "component-library-build-plan",
    identity: {
      sourceRoot: input.sourceRoot,
      sourceHash: input.sourceHash ?? sha256(files.map((file) => `${file.path}:${file.contentHash}`).sort().join("\n")),
      configurationHash: sha256(normalizedConfiguration),
    },
    library: input.library,
    files,
    smoke: input.smoke,
    ...(input.quality ? { quality: input.quality } : {}),
    unresolved,
    reviewRequired: unresolved.length > 0 || files.some((file) => !file.reviewed),
  };
  assertComponentLibraryBuildPlan(plan);
  return plan;
}
