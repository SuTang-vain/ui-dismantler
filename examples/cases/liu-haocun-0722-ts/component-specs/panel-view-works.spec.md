# WorksPanel Specification

## Overview
- **Target file:** `src/components/WorksPanel.ts`
- **Source selector:** `#view-works`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 works-panel 视图的结构、样式与状态
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#view-works`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-dark`
- Token: `--primary-soft`
- Token: `--bg`
- Token: `--card`
- Token: `--text`
- Token: `--sub`
- Token: `--weak`
- Token: `--line`
- Token: `--shadow`
- Token: `rgba(255, 213, 226, 0.72)`
- Token: `#f8faff`
- Token: `rgba(100, 135, 250, 0.14)`
- Token: `rgba(255, 213, 226, 0.6)`
- Token: `rgba(255, 255, 255, 0.82)`
- Token: `rgba(100, 135, 250, 0.28)`
- Token: `rgba(255, 255, 255, 0.96)`
- Token: `rgba(30, 31, 36, 0.84)`
- Token: `rgba(30, 31, 36, 0.48)`
- Token: `rgba(255, 255, 255, 0.2)`
- Token: `rgba(30, 31, 36, 0.42)`
- Token: `rgba(30, 31, 36, 0.04)`
- Token: `rgba(100, 135, 250, 0.1)`
- Token: `rgba(100, 135, 250, 0.18)`

## States & Behaviors
- click: .category-btn → #view-works content.set(innerHTML)
- click: [data-select-poster]
- click: [data-select-work] → #view-works content.set(innerHTML)
- click: [data-select-work] → [data-next-work] focus.focus
- click: [data-next-work] → [data-next-work] focus.focus

## Per-State Content
- Covers: `click|.category-btn|script-assignment`
- Covers: `click|[data-select-poster]|script-assignment`
- Covers: `click|[data-select-work]|script-assignment`
- Covers: `click|[data-next-work]|script-assignment`

## Mutation Targets
- Mutates: `#view-works`
- Mutates: `[data-next-work]`

## State Transitions
- #view-works: content.set `innerHTML`
- [data-next-work]: focus.focus

## Assets & Data
- Data dependency: `works`
- Data dependency: `activeWorkIds`
- Data dependency: `visitedWorkIds`
- Data dependency: `activePosterIndexes`
- Data contract: `works`

## Text Content (verbatim)
None

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(prefers-reduced-motion: reduce)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 136
- Budget: 150
- Status: READY
