# GraphFilters Specification

## Overview
- **Target file:** `src/components/GraphFilters.ts`
- **Source selector:** `#filters`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 graph-filters 视图的结构、样式与状态
- **Parent:** `panel-graph-p`
- **Dependencies:** `panel-graph-p`

## DOM Structure
- Preserve the source subtree rooted at `#filters`.

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
- click: .f → .f class.remove(on=on)
- click: .f → .f class.add(on=on)
- click: .f → .gnd structure.remove-node
- click: .f → #lines content.set(innerHTML=)
- click: .f → .gnd:not(.center) class.set
- click: .f → .gnd:not(.center) style.set(left)
- click: .f → .gnd:not(.center) style.set(top)
- click: .f → .gnd:not(.center) content.set(innerHTML)
- click: .f → .gnd class.remove(on=on)
- click: .f → .gnd:not(.center) class.add(on=on)
- click: .f → #pt content.set(innerHTML)
- click: .f → #pd content.set(innerHTML)

## Per-State Content
- Covers: `click|.f|script-assignment`

## Mutation Targets
- Mutates: `.f`
- Mutates: `.gnd`
- Mutates: `#lines`
- Mutates: `.gnd:not(.center)`
- Mutates: `#pt`
- Mutates: `#pd`
- Mutates: `#pop`
- Mutates: `#graph`

## State Transitions
- .f: class.remove `on` → `on`
- .f: class.add `on` → `on`
- .gnd: structure.remove-node
- #lines: content.set `innerHTML` → ``
- .gnd:not(.center): class.set
- .gnd:not(.center): style.set `left`
- .gnd:not(.center): style.set `top`
- .gnd:not(.center): content.set `innerHTML`
- .gnd: class.remove `on` → `on`
- .gnd:not(.center): class.add `on` → `on`
- #pt: content.set `innerHTML`
- #pd: content.set `innerHTML`
- #pop: class.add `on` → `on`
- #graph: structure.append
- #lines: structure.append

## Assets & Data
- Data dependency: `CENTER`
- Data dependency: `COLORS`
- Data dependency: `NODES`
- Data contract: `NODES`

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
- Estimated lines: 103
- Budget: 150
- Status: READY
