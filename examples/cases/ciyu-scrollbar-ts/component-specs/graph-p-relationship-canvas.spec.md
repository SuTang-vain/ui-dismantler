# RelationshipCanvas Specification

## Overview
- **Target file:** `src/components/RelationshipCanvas.ts`
- **Source selector:** `#graph`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 relationship-canvas 视图的结构、样式与状态
- **Parent:** `panel-graph-p`
- **Dependencies:** `panel-graph-p`

## DOM Structure
- Preserve the source subtree rooted at `#graph`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-d`
- Token: `--primary-l`
- Token: `--bg-white`
- Token: `--bg-gray`
- Token: `--t1`
- Token: `--t2`
- Token: `--t3`
- Token: `--line`
- Token: `--sd-md`
- Token: `--green`
- Token: `--orange`
- Token: `--red`
- Token: `--r-s`
- Token: `--r-m`
- Token: `--r-l`
- Token: `rgba(0,0,0,0.1)`
- Token: `#e9edf7`
- Token: `#f1f3f9`
- Token: `rgba(0,0,0,0.05)`
- Token: `rgba(0,0,0,0.04)`
- Token: `rgba(100,135,250,0.35)`
- Token: `#fff`
- Token: `rgba(100,135,250,0.38)`

## States & Behaviors
- click: .gnd:not(.center) → #detail content.set(innerHTML)
- click: .gnd:not(.center) → .gnd class.remove(on=on)
- click: .gnd:not(.center) → .gnd:not(.center) class.add(on=on)
- click: .gnd:not(.center) → #pt content.set(innerHTML)
- click: .gnd:not(.center) → #pd content.set(innerHTML)
- click: .gnd:not(.center) → #pop class.add(on=on)

## Per-State Content
- Covers: `click|.gnd:not(.center)|script-assignment`

## Mutation Targets
- Mutates: `#detail`
- Mutates: `.gnd`
- Mutates: `.gnd:not(.center)`
- Mutates: `#pt`
- Mutates: `#pd`
- Mutates: `#pop`

## State Transitions
- #detail: content.set `innerHTML`
- .gnd: class.remove `on` → `on`
- .gnd:not(.center): class.add `on` → `on`
- #pt: content.set `innerHTML`
- #pd: content.set `innerHTML`
- #pop: class.add `on` → `on`

## Assets & Data
- Data dependency: `COLORS`
- Data dependency: `NODE_IMG`

## Text Content (verbatim)
None

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:520px)`
- `(min-width:396px) and (max-width:520px)`
- `(max-width:330px)`

## Complexity Budget
- Estimated lines: 110
- Budget: 150
- Status: READY
