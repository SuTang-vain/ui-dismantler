---
name: html-to-component-lib
description: Dismantle an inspectable HTML page into a reusable, data-driven, source-faithful component library and accept it through fixed static, roundtrip, interaction, visual, runtime, and stability gates. MUST USE for HTML component extraction, reusable templates, theme/interaction extraction, or component-library production.
---

# HTML to Component Library

Produce a **general-purpose component library**, not a case-specific page clone. Source evidence determines structure and behavior; fixed project names, component names, routes, classes, and visible-text rules are forbidden.

## Responsibility Boundary

`ui-dismantler` owns component boundaries, neutral runtime APIs, styles, interactions, lifecycle cleanup, examples, documentation, and formal quality acceptance. It may emit a Data Surface Manifest, but business-data normalization and Data Pack generation belong to `sg-data-pack`.

Publishable runtime files must not contain source business copy, entity records, private URLs, or credentials. Source data may appear only in non-publishable reproduction examples or reviewed external fixtures.

## Mandatory Transaction

Set the installed Skill root to the directory containing this file:

```bash
export UI_DISMANTLER_SKILL_ROOT="<absolute directory containing SKILL.md>"
python3 "$UI_DISMANTLER_SKILL_ROOT/scripts/tool_preflight.py"
```

A failed preflight is a hard stop. Never replace unavailable tooling with informal browser inspection.

Execute one fail-closed transaction:

```text
preflight
→ source readiness
→ deterministic analysis and plan
→ evidence review
→ component materialization
→ component-accept
→ evidence-driven repair (maximum 3 rounds)
→ accepted receipt
```

Only `.ui-dismantler/acceptance-receipt.json` with `accepted=true` means the work is complete.

## 1. Source Readiness

Run before generating files:

```bash
python3 "$UI_DISMANTLER_SKILL_ROOT/scripts/run_ts.py" component-source-readiness \
  <original.html> --out /tmp/ui-dismantler/source-readiness.json
```

Use `--resource-profile canvas` only with reviewed Canvas/WebGL evidence. Stop on unresolved runtime shells, missing critical local resources, or unreviewed WebGL responsibility. Frozen local JS/CSS resources are valid inspectable input.

Do not infer DOM from screenshots or from an unavailable remote runtime. Screenshots are acceptance evidence only.

## 2. Analyze and Plan

Read the complete HTML, CSS, scripts, local assets, media queries, and interaction paths. Then generate deterministic evidence:

```bash
python3 "$UI_DISMANTLER_SKILL_ROOT/scripts/analyze_html.py" \
  <original.html> --out /tmp/ui-dismantler/manifest.json

python3 "$UI_DISMANTLER_SKILL_ROOT/scripts/run_ts.py" plan \
  <original.html> --out /tmp/ui-dismantler/component-plan.json \
  --spec-dir /tmp/ui-dismantler/component-specs
```

Inventory these responsibilities before coding:

- visual regions and repeated structures;
- parent/child ownership and slot-like content;
- source selectors, tokens, inline styles, media queries, pseudo-elements, and assets;
- events, state writes, conditional regions, form bindings, timers, global listeners, and cleanup;
- data fields, collection cardinality, props, and external adapter boundaries;
- accessibility semantics and keyboard behavior.

Unresolved evidence remains explicit. Do not fill gaps with name-based rules or guessed markup.

## 3. Choose Component Boundaries

Create a component when a region has at least one structural reason: repeated topology, independent state, independent lifecycle, reusable style responsibility, or a stable input/output interface. Do not split wrappers that have no independent responsibility, and do not merge unrelated visual/state owners merely to reduce file count.

Preserve a traceable mapping:

```text
source region → component → runtime input → rendered nodes → style rules → interactions
```

## 4. Materialize the Library

Required shape:

```text
<library>/
├── README.md
├── docs/设计规范.md
├── package.json
├── src/
│   ├── <library>.css
│   └── <library>.js
└── examples/
    ├── <source-case>.html
    └── template.html
```

### Runtime contract

- expose `create(options)` and `mount(container, options)`;
- use neutral defaults; accept variable content through `options.data`, props, or reviewed adapters;
- keep business data outside publishable runtime;
- return or expose `destroy`, `unmount`, or `dispose` whenever timers, animation frames, or global listeners exist;
- use deterministic DOM creation—no `eval`, `document.write`, copied application runtime, or hidden network dependency.

### Visual contract

- preserve source DOM topology and source CSS responsibility before refactoring;
- namespace public classes with `sg-` and variables with `--sg-`;
- derive tokens from source colors and usages; do not replace source styling with a generic design;
- materialize all source-owned regions, responsive states, pseudo-elements, local images, SVG geometry, and fonts needed by reviewed views;
- do not invent framework internals or flatten complex layout/Canvas behavior into placeholder cards;
- keep every JS-referenced class defined in CSS and every CSS slice reachable in an example.

### Interaction and accessibility contract

- implement transitions from event → state mutation → affected DOM;
- generate formal scenarios for every eligible interaction;
- preserve keyboard, focus, ARIA, dialog, tab, and form behavior;
- verify cleanup after route/state changes or unmount.

### Examples and docs

`examples/<source-case>.html` may inject the reviewed source data to reproduce the reference. `examples/template.html` uses neutral sample data and proves reuse. Document API, data schema, theming, lifecycle, accessibility, responsive behavior, and asset requirements.

The 10 static constraints are defined in `references/spec.md`.

## 5. Generate Interaction Scenarios

When the manifest contains interactions:

```bash
python3 "$UI_DISMANTLER_SKILL_ROOT/scripts/run_ts.py" scenarios \
  /tmp/ui-dismantler/manifest.json \
  --out /tmp/ui-dismantler/scenarios.json
```

Review candidates before acceptance. Assertions must prove the target state, not merely that a click occurred. Do not waive interactions because they are difficult to reproduce.

## 6. Formal Acceptance

First run syntax checking, then the fixed-threshold acceptance pipeline:

```bash
node --check <library>/src/<library>.js

python3 "$UI_DISMANTLER_SKILL_ROOT/scripts/run_ts.py" component-accept \
  <original.html> \
  --lib <library> \
  --scenarios /tmp/ui-dismantler/scenarios.json \
  --viewports desktop,tablet,mobile \
  --browser-mode shared-browser \
  --browser-resource-cache run-local \
  --browser-stability adaptive \
  --visual-artifacts /tmp/ui-dismantler-artifacts/<run-id>
```

Omit `--scenarios` only when analysis proves there are no interactions. The command exposes no threshold-lowering option.

Acceptance requires:

- source readiness `ready`;
- all static constraints and runtime selector coverage;
- rendered reference and library;
- roundtrip overall ≥ 0.85, structure ≥ 0.7, text ≥ 0.8;
- verified interaction coverage ≥ 0.8 when interactions exist;
- computed-style match ≥ 0.98 and pixel diff ≤ 0.02;
- no runtime, resource, navigation, network, font, stability, or blocking-handle failure.

## 7. Repair by Responsibility

Use `.ui-dismantler/quality-report.json`; do not patch by visual intuition alone.

| Failure | Repair responsibility |
|---|---|
| structure/text | missing or extra DOM topology, source content binding, repeated cardinality |
| selector coverage | dead CSS, missing state/viewport, class mismatch |
| computed style | selector context, inheritance, variables, fonts, responsive rule, pseudo-element |
| pixel diff | geometry, spacing, assets, clipping, Canvas state after style gates pass |
| scenario/coverage | event execution, mutation target, conditional rendering, assertions |
| runtime/resource | script error, missing local asset, unsupported external dependency |
| stability/handles | timer, rAF, animation completion, listener cleanup |

Rerun the full acceptance command after each repair. Stop after three failed rounds and report unresolved blockers rather than publishing a low-quality library.

## Completion Report

Return:

- library path;
- source-readiness report path;
- manifest and component-plan paths;
- scenario path, if applicable;
- quality-report and acceptance-receipt paths;
- acceptance status and repair-round count;
- remaining blockers, if not accepted.

Manual QA may supplement these artifacts, but cannot override them.

## Runtime and References

The installed Skill contains portable wrappers, not duplicated algorithms. Runtime lookup order is `UI_DISMANTLER_RUNTIME_ROOT`, Skill-local locator, user locator, then development checkout. Install or refresh it from a built repository with:

```bash
npm run skill:install -- --target ~/.codex/skills/ui-dismantler --force
```

References:

- `references/spec.md` — static and Gold+ quality contract;
- `references/manifest_schema.md` — analyzer output;
- `references/patterns.md` — optional structural-detector evidence, never case rules.
