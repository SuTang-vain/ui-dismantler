import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const ARTIFACT_ROOT_ENV = "UI_DISMANTLER_ARTIFACT_ROOT";

export type RuntimeArtifactDirectorySource = "external-root" | "explicit-absolute" | "system-temp";

export interface RuntimeArtifactDirectory {
  readonly path: string;
  readonly retained: boolean;
  readonly source: RuntimeArtifactDirectorySource;
  cleanup(): void;
}

export interface RuntimeArtifactDirectoryOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly repositoryRoot?: string;
  readonly tempRoot?: string;
}

export function normalizeArtifactScope(scope: string): string {
  const normalized = scope
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return normalized || "run";
}

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function createUniqueDirectory(root: string, scope: string): string {
  const resolvedRoot = resolve(root);
  mkdirSync(resolvedRoot, { recursive: true });
  return mkdtempSync(resolve(resolvedRoot, `${normalizeArtifactScope(scope)}-`));
}

function retainedDirectory(path: string, source: RuntimeArtifactDirectorySource): RuntimeArtifactDirectory {
  mkdirSync(path, { recursive: true });
  return { path, retained: true, source, cleanup() {} };
}

function temporaryDirectory(root: string, scope: string): RuntimeArtifactDirectory {
  const path = createUniqueDirectory(root, scope);
  let cleaned = false;
  return {
    path,
    retained: false,
    source: "system-temp",
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      rmSync(path, { recursive: true, force: true });
    },
  };
}

/**
 * Resolves a runtime-only artifact directory without allowing repository-relative
 * configuration to write back into source cases.
 *
 * Precedence:
 * 1. UI_DISMANTLER_ARTIFACT_ROOT (retained for CI collection)
 * 2. an explicit absolute path outside repositoryRoot (retained)
 * 3. a unique directory below the system temporary artifact root (cleaned locally)
 */
export function resolveRuntimeArtifactDirectory(
  configuredPath: string | undefined,
  scope: string,
  options: RuntimeArtifactDirectoryOptions = {},
): RuntimeArtifactDirectory {
  const environment = options.environment ?? process.env;
  const externalRoot = environment[ARTIFACT_ROOT_ENV]?.trim();
  if (externalRoot) {
    if (!isAbsolute(externalRoot)) throw new Error(`${ARTIFACT_ROOT_ENV} must be an absolute path`);
    return retainedDirectory(createUniqueDirectory(externalRoot, scope), "external-root");
  }

  if (configuredPath && isAbsolute(configuredPath)) {
    const explicitPath = resolve(configuredPath);
    if (!options.repositoryRoot || !isWithin(options.repositoryRoot, explicitPath)) {
      return retainedDirectory(explicitPath, "explicit-absolute");
    }
  }

  const tempRoot = options.tempRoot ?? resolve(tmpdir(), "ui-dismantler-artifacts");
  return temporaryDirectory(tempRoot, scope);
}

export function createRegressionArtifactDirectory(
  caseId: string,
  options: RuntimeArtifactDirectoryOptions = {},
): RuntimeArtifactDirectory {
  return resolveRuntimeArtifactDirectory(undefined, `regression-${caseId}`, options);
}
