# Repository Governance

## Logical organization before physical moves

Historical cases remain under `examples/` until every test, frozen hash, and external reference can be migrated atomically. The repository now uses two logical registries:

- `cases/catalog.json` is the canonical inventory of source cases, blind studies, SPA regressions, dispatch experiments, and performance experiments.
- `benchmarks/registry.json` binds the catalog to the reviewed `pr`, `gold`, and `nightly` protocols in `benchmarks/protocols/`.

This separates case identity from physical paths. Future directory moves must update the catalog first and must not rely on path discovery in product code.

## Catalog contract

Each case records:

- a stable kebab-case ID and repository-relative path;
- status and research role;
- protocol membership;
- source entry or frozen external-source identity;
- the small set of retained evidence files that establish its reviewed state.

The catalog describes test evidence only. It must not introduce component-generation rules, business fixtures, selector allowlists, or runtime data.

## Benchmark protocols

- `pr` runs deterministic source, Skill, production, and representative browser regression checks without requiring external source projects.
- `gold` requires locked Starmap and Vue Element Admin source roots and executes the formal reviewed Gold+ cases.
- `nightly` extends PR and Gold with repeated performance evidence retained as CI artifacts.

Raw screenshots, traces, and repeated reports belong in `UI_DISMANTLER_ARTIFACT_ROOT` or CI artifacts. Git retains reviewed identities, final summaries, and explicitly frozen representative evidence.

## Enforcement

Run:

```bash
npm run catalog:validate
```

The validator fails when:

- a managed `examples/` case directory is missing from the catalog;
- IDs or paths are duplicated or escape the repository;
- source identity or frozen evidence files are unavailable;
- a protocol references an unknown or undeclared case;
- protocol inheritance points to an unknown protocol.

`npm run test:pr` executes this validation before TypeScript compilation and tests.
