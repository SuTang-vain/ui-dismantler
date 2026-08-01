# Repository Guidelines

## Project Structure & Module Organization

- `src-ts/` is the TypeScript implementation: shared contracts in `core/`, composable capabilities in `skills/`, analysis/planning in `analysis/` and `planning/`, component output in `production/`, and quality logic in `evaluation/` and `validation/`.
- `src-ts/tests/` contains Node tests named `*.test.ts`.
- `src/skill/` and `src/ui_dismantler/` retain the legacy Python validation boundary; preserve compatibility during migration.
- `scripts/` contains verification tools, `benchmark/` stores frozen inputs, and `examples/` stores historical cases—not runtime artifacts.
- Record architectural decisions in `docs/architecture/`.

## Build, Test, and Development Commands

```bash
npm run typecheck:ts              # strict TypeScript check
npm run build:ts                  # compile src-ts/ to dist-ts/
npm run test:pr                   # typecheck, build, all TypeScript tests
npm test                          # legacy Python suite
npm run test:all                  # Python and TypeScript suites
npm run verify:component-boundary # enforce ownership boundaries
npm run test:gold                 # reviewed browser Gold regressions
npm run test:nightly              # PR, Gold, and performance tiers
```

Run `npm run test:pr` before a pull request. Run Gold/nightly tiers when changing browser evaluation, visual output, fixtures, or quality thresholds.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, explicit `.js` import suffixes, two-space indentation, semicolons, and descriptive kebab-case Skill IDs such as `state-responsibility`. Prefer `readonly` contracts and deterministic serialization. No repository formatter is enforced, so match adjacent code. Use semantic architecture names; do not add `v1`/`v2` to initial skeleton names, although contracts may carry `schemaVersion`.

Never add project, component, route, class, or visible-text allowlists. Preserve reviewed-evidence boundaries. Keep business data out of publishable component runtime: `sg-data-pack` owns normalization and Data Packs.

## Testing Guidelines

TypeScript tests use `node:test`; legacy checks use the Python runner. Add focused tests for every changed Skill, contract, adapter, or materializer, plus integration tests when artifacts cross boundaries. Do not lower Strict, Gold, runtime, network, or stability gates. Write screenshots and raw reports to the system temporary directory or `UI_DISMANTLER_ARTIFACT_ROOT`, never into source cases.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit-style subjects: `feat: ...`, `fix: ...`, and `docs: ...`. Keep commits narrow; separate architecture, behavior, and documentation when practical. Pull requests should describe the responsibility boundary changed, list commands and results, identify reviewed artifacts or schema changes, and attach visual evidence only for UI-output changes. Never commit secrets, tokens, local absolute-path fixtures, or browser-generated artifacts.
