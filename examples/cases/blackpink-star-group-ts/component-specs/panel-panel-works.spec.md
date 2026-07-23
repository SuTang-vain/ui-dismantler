# WorksPanel Specification

## Overview
- **Target file:** `src/components/WorksPanel.ts`
- **Source selector:** `#panel-works`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 复现 works-panel 视图：团体作品概览 仅收录团体作品 · 个人作品另列 ‹ › 展开创作故事 × [ {"img":"https://bkimg.cdn.bcebos.com/pic/faf2b2119313b07e60a8
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#panel-works`.

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
- 团体作品概览 仅收录团体作品 · 个人作品另列 ‹ › 展开创作故事 × [ {"img":"https://bkimg.cdn.bcebos.com/pic/faf2b2119313b07e60a8d1be04d7912397dd8c6b?x-bce-process=image/format,f_auto/water

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
- Estimated lines: 87
- Budget: 150
- Status: READY
