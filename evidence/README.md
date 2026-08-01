# Evidence Registry

`registry.json` defines retention classes and no-growth budgets for tracked regression evidence. It does not delete historical artifacts; it prevents additional raw evidence from entering Git before a reviewed migration exists.

Current managed classes are:

- `case-artifacts`: historical reference/generated/diff captures under case `artifacts/` directories;
- `visual-artifacts`: reviewed SPA visual matrices;
- `raw-reports`: quality and result JSON reports;
- `identities`: source locks and frozen artifact identities.

Run:

```bash
npm run evidence:audit
```

New screenshots, traces, repeated reports, and browser runtime artifacts must use CI artifacts or `UI_DISMANTLER_ARTIFACT_ROOT`. Oversized historical reports remain locked by SHA-256 until compact reviewed summaries replace every dependency.

The audit also reports duplicate blobs as checkout-size telemetry. Git already deduplicates identical blob objects internally, so duplicate paths must not be removed unless source/runtime references and frozen tests are migrated together.
