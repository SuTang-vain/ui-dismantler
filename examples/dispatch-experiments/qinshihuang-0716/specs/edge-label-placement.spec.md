# EdgeLabelPlacement Specification

## Overview
- **Target file:** `src/components/EdgeLabelPlacement.ts`
- **Source selector:** `svg.family:is(*)`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 测量关系标签并执行节点、文本与已放置标签之间的避障搜索
- **Parent:** `edge-renderer`
- **Dependencies:** `edge-renderer`

## DOM Structure
- Preserve the source subtree rooted at `svg.family:is(*)`.

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
N/A (static component)

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

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
- Estimated lines: 99
- Budget: 150
- Status: READY
