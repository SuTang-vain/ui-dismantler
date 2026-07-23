# GraphNodeControl Specification

## Overview
- **Target file:** `src/components/GraphNodeControl.ts`
- **Source selector:** `.node`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 graph-node-control 视图的结构、样式与状态
- **Parent:** `relationship-canvas`
- **Dependencies:** `relationship-canvas`

## DOM Structure
- Preserve the source subtree rooted at `.node`.

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
- mouseenter: .node
- mouseleave: .node
- click: .node → #modalAvatar property.set(src)
- click: .node → #modalName content.set(textContent)
- click: .node → #modalRole content.set(textContent)
- click: .node → #modalRelTag content.set(textContent=核心人物 · 本人)
- click: .node → #modalRelTag style.set(background=linear-gradient(135deg, var(--primary), #7b96f7))
- click: .node → #modalRelTag content.set(textContent)
- click: .node → #modalRelTag style.set(background)
- click: .node → #modalDeed content.set(textContent)
- click: .node → #modalImpact content.set(textContent)
- click: .node → #modalOverlay class.add(active=active)

## Per-State Content
- Covers: `mouseenter|.node|script-assignment`
- Covers: `mouseleave|.node|script-assignment`
- Covers: `click|.node|script-assignment`

## Mutation Targets
- Mutates: `#modalAvatar`
- Mutates: `#modalName`
- Mutates: `#modalRole`
- Mutates: `#modalRelTag`
- Mutates: `#modalDeed`
- Mutates: `#modalImpact`
- Mutates: `#modalOverlay`

## State Transitions
- #modalAvatar: property.set `src`
- #modalName: content.set `textContent`
- #modalRole: content.set `textContent`
- #modalRelTag: content.set `textContent` → `核心人物 · 本人`
- #modalRelTag: style.set `background` → `linear-gradient(135deg, var(--primary), #7b96f7)`
- #modalRelTag: content.set `textContent`
- #modalRelTag: style.set `background`
- #modalDeed: content.set `textContent`
- #modalImpact: content.set `textContent`
- #modalOverlay: class.add `active` → `active`

## Assets & Data
- Data dependency: `edgeEls`
- Data dependency: `nodeState`
- Data dependency: `events`
- Data dependency: `REL`
- Data contract: `events`
- Data contract: `edgeEls`

## Text Content (verbatim)
None

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
