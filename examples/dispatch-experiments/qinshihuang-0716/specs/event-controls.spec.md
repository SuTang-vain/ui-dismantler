# EventControls Specification

## Overview
- **Target file:** `src/components/EventControls.ts`
- **Source selector:** `div.event-bar`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 event-controls 视图：‹ › ›
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `div.event-bar`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-hover`
- Token: `--primary-light`
- Token: `--primary-tint`
- Token: `--bg-white`
- Token: `--bg-dent`
- Token: `--text-main`
- Token: `--text-minor`
- Token: `--text-tiny`
- Token: `--border-light`
- Token: `--shadow-sm`
- Token: `--shadow-md`
- Token: `--shadow-lg`
- Token: `--radius-xs`
- Token: `--radius-sm`
- Token: `--radius-md`
- Token: `--radius-lg`
- Token: `--rel-family`
- Token: `--rel-ruler`
- Token: `--rel-ally`
- Token: `--rel-enemy`
- Token: `--rel-plot`
- Token: `rgba(30, 31, 36, 0.06)`
- Token: `rgba(30, 31, 36, 0.12)`

## States & Behaviors
- click: #barPrev
- click: #barNext
- click: .event-btn → #modalOverlay class.remove(active=active)
- click: .event-btn → #eventIntro content.set(innerHTML)
- click: .event-btn → #eventBtns content.set(innerHTML)
- click: .event-btn → .node structure.remove-node
- click: .event-btn → #graphEdges content.set(innerHTML=)
- click: .event-btn → .node class.set
- click: .event-btn → .node content.set(innerHTML)
- click: .event-btn → .float-inner style.set(animationDuration)
- click: .event-btn → .float-inner style.set(animationDelay)
- click: .event-btn → .node style.set(left)

## Per-State Content
- Covers: `click|#barPrev|semantic-control`
- Covers: `click|#barNext|semantic-control`
- Covers: `click|.event-btn|script-assignment`
- Covers: `scroll|#eventBtns|script-assignment`

## Mutation Targets
- Mutates: `#modalOverlay`
- Mutates: `#eventIntro`
- Mutates: `#eventBtns`
- Mutates: `.node`
- Mutates: `#graphEdges`
- Mutates: `.float-inner`
- Mutates: `#graphCanvas`
- Mutates: `#barPrev`
- Mutates: `#barNext`
- Mutates: `#swipeHint`

## State Transitions
- #modalOverlay: class.remove `active` → `active`
- #eventIntro: content.set `innerHTML`
- #eventBtns: content.set `innerHTML`
- .node: structure.remove-node
- #graphEdges: content.set `innerHTML` → ``
- .node: class.set
- .node: content.set `innerHTML`
- .float-inner: style.set `animationDuration`
- .float-inner: style.set `animationDelay`
- .node: style.set `left`
- .node: style.set `top`
- #graphCanvas: structure.append
- #graphEdges: structure.append
- #graphEdges: structure.append
- #graphEdges: structure.append
- .float-inner: style.set `animationPlayState` → `running`
- #barPrev: property.set `disabled`
- #barNext: property.set `disabled`
- #swipeHint: class.toggle `hide` → `hide`

## Assets & Data
- Data dependency: `events`
- Data dependency: `nodeState`
- Data dependency: `edgeEls`
- Data dependency: `SVGNS`
- Data contract: `events`
- Data contract: `edgeEls`

## Text Content (verbatim)
- ‹ › ›

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(min-width: 769px)`
- `(max-width: 768px)`
- `(max-width: 768px)`
- `(max-width: 480px)`

## Complexity Budget
- Estimated lines: 150
- Budget: 150
- Status: READY
