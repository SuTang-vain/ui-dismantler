# GraphNodeGesture Specification

## Overview
- **Target file:** `src/components/GraphNodeGesture.ts`
- **Source selector:** `.node:where(*)`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 复现 gesture-surface 视图的结构、样式与状态
- **Parent:** `graph-node-control`
- **Dependencies:** `graph-node-control`

## DOM Structure
- Preserve the source subtree rooted at `.node:where(*)`.

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
- 初始渲染与源页面一致

## Per-State Content
- Covers: `mousedown|.node|script-assignment`
- Covers: `touchstart|.node|script-assignment`

## Mutation Targets
- Mutates: `.node`

## State Transitions
- .node: class.add `grabbing` → `grabbing`

## Assets & Data
- Data dependency: `nodeState`

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
- Estimated lines: 105
- Budget: 150
- Status: READY
