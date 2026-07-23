# PanelTimelinePanel Specification

## Overview
- **Target file:** `src/components/PanelTimelinePanel.ts`
- **Source selector:** `#panel-timeline`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 content-panel 视图：组合阶段 第 1 / 2 页 · 关键节点 ‹ › 2016.08 出道 ·《Square One》 以《WHISTLE》与《BOOMBAYAH》双主打正式出道,确立四人编制主唱/主舞双轴。 了解背景
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#panel-timeline`.

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
- click: button.tl-prev-pc
- click: button.tl-next-pc
- click: button.tl-prev-mobile
- click: button.tl-next-mobile

## Per-State Content
- Covers: `click|button.tl-prev-pc|semantic-control`
- Covers: `click|button.tl-next-pc|semantic-control`
- Covers: `click|button.tl-prev-mobile|semantic-control`
- Covers: `click|button.tl-next-mobile|semantic-control`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

## Text Content (verbatim)
- 组合阶段 第 1 / 2 页 · 关键节点 ‹ › 2016.08 出道 ·《Square One》 以《WHISTLE》与《BOOMBAYAH》双主打正式出道,确立四人编制主唱/主舞双轴。 了解背景 › 2016.08出道 ·《Square One》 经历背景 YG 娱乐时隔七年推出的全新女团。出道前四人经历长达四至

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
- Estimated lines: 105
- Budget: 150
- Status: READY
