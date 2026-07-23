# GraphLayout Specification

## Overview
- **Target file:** `src/components/GraphLayout.ts`
- **Source selector:** `#graphWrap:where(*)`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 计算缩放坐标空间、环形排列、排列搜索与节点碰撞消解
- **Parent:** `relationship-canvas`
- **Dependencies:** `relationship-canvas`

## DOM Structure
- Preserve the source subtree rooted at `#graphWrap:where(*)`.

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
- Estimated lines: 123
- Budget: 150
- Status: READY
