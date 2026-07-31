# Technical Glossary Explorer - Component Library

> A domain-neutral, data-injected component library covering 6 view patterns (quiz / comparison / graph / nav-panel / cause-chain / splash). Built as the quality benchmark and regression fixture for the ui-dismantler project.

## Package boundary

`src/` is the publishable runtime. It contains rendering logic, styles, neutral empty states, and the `mount/create` API; it does not contain benchmark records or domain data.

Reviewed demo and regression inputs live outside the package in `benchmark/fixtures/`. `examples/` are consumers only and are excluded by `package.json.files` from a package artifact. For business-data normalization, use `sg-data-pack` through a reviewed Data Surface contract.

The component therefore follows this boundary:

```text
component package
  = structure + behavior + props/options contract + neutral states
benchmark fixture
  = deterministic demo/regression data
Data Surface Manifest
  = shape + fields + consumers + injection boundary
sg-data-pack
  = business entities + relations + domain data
```

## Quick Start

```html
<link rel="stylesheet" href="src/glossary.css">
<div id="mount"></div>
<script src="src/glossary.js"></script>
<script>
GlossaryExplorer.mount(document.getElementById('mount'), {
  tabs: [...],
  splash: {...},
  quiz: {...},
  comparison: {...},
  graph: {...},
  nav: {...},
  causeChain: {...}
});
</script>
```

## State contract

Data-backed views must support a neutral empty state. The runtime does not invent records when options are omitted:

```text
loading → empty / ready
loading → error
ready → empty
```

The benchmark fixture supplies the `ready` state. A host application owns loading, error, and domain-specific data policy; the component only renders the supplied state.

## API

| Method | Description |
|---|---|
| `GlossaryExplorer.mount(container, options)` | Mount to a DOM container, returns the root element |
| `GlossaryExplorer.create(options)` | Create and return the root element (not mounted) |

## Data Contract

### options

| Field | Type | Required | Description |
|---|---|---|---|
| `tabs` | `Array<{id,label}>` | Host supplied | Tab bar items (5 tabs: quiz/comparison/graph/nav/cause) |
| `splash` | `{eyebrow,title,sub,question,options[],cta,hint}` | Host supplied | Splash overlay content |
| `quiz` | `{questions: Array<{q,opts[],correct}>}` | Host supplied | Quiz data |
| `comparison` | `{cards: Array<{tag,title,desc,variant}>}` | Host supplied | Comparison cards (real/alt) |
| `graph` | `{nodes: Array<{id,label,desc}>, edges: Array<{from,to}>}` | Host supplied | Graph nodes and edges |
| `nav` | `{items: Array<{id,label,title,desc}>}` | Host supplied | Nav-panel items |
| `causeChain` | `{events: Array<{title,desc,whatif}>}` | Host supplied | Cause-chain events |
| `theme` | `Record<string,string>` | No | Override `--sg-*` variables |
| `state` | `{status: ready|empty|loading|error, message?: string}` | No | Host-owned lifecycle state; defaults to neutral `empty` |

Omitting data options is valid and renders the neutral empty component state. Data is always injected by the host through `options`; no demo records are read from `src/`.

## Theming

Override `--sg-*` variables to customize:

```css
:root {
  --sg-primary: #your-brand-color;
  --sg-accent: #your-accent-color;
}
```

## File Structure

```text
glossary-lib/
├── README.md           This file
├── package.json        Release boundary (`files` excludes demos/fixtures)
├── docs/设计规范.md     Design spec
└── src/
    ├── glossary.css    Parametric styles (sg-* prefix, --sg-* vars)
    └── glossary.js     Rendering engine (GlossaryExplorer.mount/create)
```

Consumers and reviewed inputs are kept outside the release package:

```text
benchmark/
├── fixtures/glossary-demo.js  Reviewed ready-state fixture
└── lib/examples/              Consumer pages only
```

`benchmark/lib/package.json` includes only `src/`, `README.md`, and `docs/` in a package artifact.

## Pattern Coverage

| Pattern | Panel | Detector |
|---|---|---|
| `splash` | Entry overlay | splash-cta + splash-opt + splash-question |
| `quiz` | Panel 1 | qz-top + qz-body + opt + qz-next + qz-result |
| `comparison` | Panel 2 | whatif-card.real + whatif-card.alt + cmp-btn |
| `graph` | Panel 3 | svg + node class + NODES JS data |
| `nav-panel` | Panel 4 | nav + data-p triggers + panel sub-panels |
| `cause-chain` | Panel 5 | timeline-nav + causeChain JS + whatif-btn |
