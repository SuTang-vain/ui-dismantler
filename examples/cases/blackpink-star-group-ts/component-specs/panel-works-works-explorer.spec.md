# WorksExplorer Specification

## Overview
- **Target file:** `src/components/WorksExplorer.ts`
- **Source selector:** `#works-carousel`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 works-explorer 视图的结构、样式与状态
- **Parent:** `panel-panel-works`
- **Dependencies:** `panel-panel-works`

## DOM Structure
- Preserve the source subtree rooted at `#works-carousel`.

## Computed Styles
- Token: `--ink`
- Token: `--muted`
- Token: `--subtle`
- Token: `--line`
- Token: `--paper`
- Token: `--stage`
- Token: `--primary`
- Token: `--accent`
- Token: `--accent-2`
- Token: `--soft`
- Token: `--soft-pink`
- Token: `rgba(30, 31, 36, 0.06)`
- Token: `rgba(23, 24, 28, 0.10)`
- Token: `#fff`
- Token: `rgba(100, 135, 250, 0.25)`
- Token: `#FAFAFB`
- Token: `rgba(0,0,0,0.75)`
- Token: `rgba(0,0,0,0.5)`
- Token: `rgba(255,255,255,0.85)`
- Token: `rgba(255,255,255,0.2)`
- Token: `#2A2B33`
- Token: `rgba(30,31,36,0.55)`
- Token: `#FBFBFD`
- Token: `#F5F7FC`

## States & Behaviors
- mouseenter: #works-carousel
- mouseleave: #works-carousel

## Per-State Content
- Covers: `mouseenter|#works-carousel|script-assignment`
- Covers: `mouseleave|#works-carousel|script-assignment`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
- Data dependency: `wsCards`
- Data dependency: `WORKS_AUTO_INTERVAL`
- Data contract: `wsCards`

## Text Content (verbatim)
None

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width: 500px)`
- `(max-width: 320px), (max-height: 380px)`
- `(max-width: 500px)`
- `(max-width: 320px), (max-height: 380px)`

## Complexity Budget
- Estimated lines: 124
- Budget: 150
- Status: READY
