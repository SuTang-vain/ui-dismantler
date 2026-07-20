# Technical Glossary Explorer - Component Library

> A domain-neutral benchmark component library covering 6 view patterns (quiz / comparison / graph / nav-panel / cause-chain / splash). Built as the quality benchmark and regression fixture for the ui-dismantler project.

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

## API

| Method | Description |
|---|---|
| `GlossaryExplorer.mount(container, options)` | Mount to a DOM container, returns the root element |
| `GlossaryExplorer.create(options)` | Create and return the root element (not mounted) |

## Data Contract

### options

| Field | Type | Required | Description |
|---|---|---|---|
| `tabs` | `Array<{id,label}>` | Yes | Tab bar items (5 tabs: quiz/comparison/graph/nav/cause) |
| `splash` | `{eyebrow,title,sub,question,options[],cta,hint}` | Yes | Splash overlay content |
| `quiz` | `{questions: Array<{q,opts[],correct}>}` | Yes | Quiz data |
| `comparison` | `{cards: Array<{tag,title,desc,variant}>}` | Yes | Comparison cards (real/alt) |
| `graph` | `{nodes: Array<{id,label,desc}>, edges: Array<{from,to}>}` | Yes | Graph nodes and edges |
| `nav` | `{items: Array<{id,label,title,desc}>}` | Yes | Nav-panel items |
| `causeChain` | `{events: Array<{title,desc,whatif}>}` | Yes | Cause-chain events |
| `theme` | `Record<string,string>` | No | Override `--sg-*` variables |

## Theming

Override `--sg-*` variables to customize:

```css
:root {
  --sg-primary: #your-brand-color;
  --sg-accent: #your-accent-color;
}
```

## File Structure

```
glossary-lib/
├── README.md           This file
├── docs/设计规范.md     Design spec
├── src/
│   ├── glossary.css    Parametric styles (sg-* prefix, --sg-* vars)
│   └── glossary.js     Rendering engine (GlossaryExplorer.mount/create)
└── examples/
    ├── case.html       Reproduce the original case with real data
    └── template.html   Blank reuse template with sample data
```

## Pattern Coverage

| Pattern | Panel | Detector |
|---|---|---|
| `splash` | Entry overlay | splash-cta + splash-opt + splash-question |
| `quiz` | Panel 1 | qz-top + qz-body + opt + qz-next + qz-result |
| `comparison` | Panel 2 | whatif-card.real + whatif-card.alt + cmp-btn |
| `graph` | Panel 3 | svg + node class + NODES JS data |
| `nav-panel` | Panel 4 | nav + data-p triggers + panel sub-panels |
| `cause-chain` | Panel 5 | timeline-nav + causeChain JS + whatif-btn |
