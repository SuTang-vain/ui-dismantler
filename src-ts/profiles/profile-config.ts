import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProfileExecutionInputProvider } from "../core/profiles/executor.js";

export const PROFILE_RUN_CONFIGURATION_SCHEMA_VERSION = "1.0" as const;

export interface ProfileRunConfiguration {
  readonly schemaVersion: typeof PROFILE_RUN_CONFIGURATION_SCHEMA_VERSION;
  readonly profileId: string;
  readonly enabledOptionalSkills: readonly string[];
  readonly inputProviders: readonly ProfileExecutionInputProvider[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`);
}

function parseProvider(value: unknown, index: number): ProfileExecutionInputProvider {
  if (!isRecord(value)) throw new Error(`inputProviders[${index}] must be an object`);
  const { contract, providerId, reviewed, inputPath } = value;
  if (typeof contract !== "string" || !contract.trim()) throw new Error(`inputProviders[${index}].contract must be a non-empty string`);
  if (typeof providerId !== "string" || !providerId.trim()) throw new Error(`inputProviders[${index}].providerId must be a non-empty string`);
  if (reviewed !== true && reviewed !== false) throw new Error(`inputProviders[${index}].reviewed must be a boolean`);
  if (typeof inputPath !== "string" || !inputPath.trim()) throw new Error(`inputProviders[${index}].inputPath must be a non-empty string`);
  if (!("value" in value)) throw new Error(`inputProviders[${index}].value is required`);
  return { contract, providerId, reviewed, inputPath, value: value.value };
}

export function parseProfileRunConfiguration(value: unknown): ProfileRunConfiguration {
  if (!isRecord(value)) throw new Error("Profile configuration must be an object");
  if (value.schemaVersion !== PROFILE_RUN_CONFIGURATION_SCHEMA_VERSION) {
    throw new Error(`Profile configuration schemaVersion must be ${PROFILE_RUN_CONFIGURATION_SCHEMA_VERSION}`);
  }
  if (typeof value.profileId !== "string" || !value.profileId.trim()) throw new Error("profileId must be a non-empty string");
  const enabledOptionalSkills = value.enabledOptionalSkills ?? [];
  assertStringArray(enabledOptionalSkills, "enabledOptionalSkills");
  const rawProviders = value.inputProviders ?? [];
  if (!Array.isArray(rawProviders)) throw new Error("inputProviders must be an array");
  const inputProviders = rawProviders.map(parseProvider);
  const contracts = inputProviders.map((provider) => provider.contract);
  if (new Set(contracts).size !== contracts.length) throw new Error("inputProviders must not contain duplicate contracts");
  return {
    schemaVersion: PROFILE_RUN_CONFIGURATION_SCHEMA_VERSION,
    profileId: value.profileId,
    enabledOptionalSkills,
    inputProviders,
  };
}

export async function readProfileRunConfiguration(path: string): Promise<ProfileRunConfiguration> {
  const absolutePath = resolve(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read Profile configuration ${absolutePath}: ${message}`);
  }
  return parseProfileRunConfiguration(parsed);
}
