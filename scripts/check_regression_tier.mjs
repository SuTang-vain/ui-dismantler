#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tier = process.argv[2];
if (tier !== "gold" && tier !== "nightly") {
  console.error("usage: node scripts/check_regression_tier.mjs <gold|nightly>");
  process.exitCode = 2;
} else {
  const starmapSource = process.env.UI_DISMANTLER_STARMAP_SOURCE;
  if (!starmapSource) {
    console.error(`[${tier}] UI_DISMANTLER_STARMAP_SOURCE is required so the formal Starmap Gold+ case cannot be silently skipped.`);
    process.exitCode = 1;
  } else {
    const sourceRoot = resolve(starmapSource);
    const identityPath = resolve(repositoryRoot, "examples/spa-router-regressions/starmap/source-identity.json");
    if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
      console.error(`[${tier}] Starmap source directory does not exist: ${sourceRoot}`);
      process.exitCode = 1;
    } else {
      const identity = JSON.parse(readFileSync(identityPath, "utf8"));
      for (const [relativePath, expectedHash] of Object.entries(identity.files)) {
        const absolute = resolve(sourceRoot, relativePath);
        if (!existsSync(absolute) || !statSync(absolute).isFile()) {
          console.error(`[${tier}] Starmap source file is missing: ${absolute}`);
          process.exitCode = 1;
          break;
        }
        const actualHash = execFileSync("shasum", ["-a", "256", absolute], { encoding: "utf8" }).trim().split(/\s+/)[0];
        if (actualHash !== expectedHash) {
          console.error(`[${tier}] Starmap source identity mismatch for ${relativePath}: expected ${expectedHash}, received ${actualHash}`);
          process.exitCode = 1;
          break;
        }
      }
      if (!process.exitCode) console.log(`[${tier}] locked Starmap source verified: ${sourceRoot}`);
    }
  }

  const source = process.env.UI_DISMANTLER_VUE_ELEMENT_ADMIN_SOURCE;
  if (!source) {
    console.error(`[${tier}] UI_DISMANTLER_VUE_ELEMENT_ADMIN_SOURCE is required so the formal Vue Element Admin Gold+ case cannot be silently skipped.`);
    process.exitCode = 1;
  } else {
    const sourceRoot = resolve(source);
    if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
      console.error(`[${tier}] Vue Element Admin source directory does not exist: ${sourceRoot}`);
      process.exitCode = 1;
    } else {
      const lockPath = resolve(repositoryRoot, "examples/spa-router-regressions/vue-element-admin/source-lock.json");
      const lockedCommit = JSON.parse(readFileSync(lockPath, "utf8")).commit;
      let actualCommit = "";
      try {
        actualCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
      } catch (error) {
        console.error(`[${tier}] failed to read Vue Element Admin source commit: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
      if (actualCommit && actualCommit !== lockedCommit) {
        console.error(`[${tier}] Vue Element Admin source identity mismatch: expected ${lockedCommit}, received ${actualCommit}`);
        process.exitCode = 1;
      } else if (actualCommit) {
        console.log(`[${tier}] locked Vue Element Admin source verified: ${actualCommit}`);
      }
    }
  }
}
