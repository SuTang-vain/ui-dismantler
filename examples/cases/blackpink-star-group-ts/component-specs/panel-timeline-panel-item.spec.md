# PanelTimelinePanelItem Specification

## Overview
- **Target file:** `src/components/PanelTimelinePanelItem.ts`
- **Source selector:** `#tl-track > article:nth-child(1)`
- **Source instances:** 6
- **Interaction model:** click-driven
- **Responsibility:** 复现 repeated-item 视图：2016.08 出道 ·《Square One》 以《WHISTLE》与《BOOMBAYAH》双主打正式出道,确立四人编制主唱/主舞双轴。 了解背景 › 2016.08出道 ·《Square One》
- **Parent:** `panel-panel-timeline`
- **Dependencies:** `panel-panel-timeline`

## DOM Structure
- Preserve the source subtree rooted at `#tl-track > article:nth-child(1)`.
- Reuse this component for all source instances:
- `#tl-track > article:nth-child(1)`
- `#tl-track > article:nth-child(2)`
- `#tl-track > article:nth-child(3)`
- `#tl-track > article:nth-child(4)`
- `#tl-track > article:nth-child(5)`
- `#tl-track > article:nth-child(6)`

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
- click: #tl-track > article:nth-child(1) > div:nth-child(3) > button:nth-child(4)
- click: #tl-track > article:nth-child(2) > div:nth-child(3) > button:nth-child(4)
- click: #tl-track > article:nth-child(3) > div:nth-child(3) > button:nth-child(4)
- click: #tl-track > article:nth-child(4) > div:nth-child(3) > button:nth-child(4)
- click: #tl-track > article:nth-child(5) > div:nth-child(3) > button:nth-child(4)
- click: #tl-track > article:nth-child(6) > div:nth-child(3) > button:nth-child(4)
- click: #tl-track > article:nth-child(1) → .t-item class.remove(is-expanded=is-expanded)
- click: #tl-track > article:nth-child(1) → .t-item class.add(is-expanded=is-expanded)
- click: #tl-track > article:nth-child(1) → #tl-track style.set(scrollSnapType=none)
- click: #tl-track > article:nth-child(1) → #tl-track style.set(scrollSnapType=x proximity)
- click: #tl-track > article:nth-child(2) → .t-item class.remove(is-expanded=is-expanded)
- click: #tl-track > article:nth-child(2) → .t-item class.add(is-expanded=is-expanded)

## Per-State Content
- Covers: `click|#tl-track > article:nth-child(1) > div:nth-child(3) > button:nth-child(4)|semantic-control`
- Covers: `click|#tl-track > article:nth-child(2) > div:nth-child(3) > button:nth-child(4)|semantic-control`
- Covers: `click|#tl-track > article:nth-child(3) > div:nth-child(3) > button:nth-child(4)|semantic-control`
- Covers: `click|#tl-track > article:nth-child(4) > div:nth-child(3) > button:nth-child(4)|semantic-control`
- Covers: `click|#tl-track > article:nth-child(5) > div:nth-child(3) > button:nth-child(4)|semantic-control`
- Covers: `click|#tl-track > article:nth-child(6) > div:nth-child(3) > button:nth-child(4)|semantic-control`
- Covers: `click|#tl-track > article:nth-child(1)|script-assignment`
- Covers: `click|#tl-track > article:nth-child(2)|script-assignment`
- Covers: `click|#tl-track > article:nth-child(3)|script-assignment`
- Covers: `click|#tl-track > article:nth-child(4)|script-assignment`
- Covers: `click|#tl-track > article:nth-child(5)|script-assignment`
- Covers: `click|#tl-track > article:nth-child(6)|script-assignment`

## Mutation Targets
- Mutates: `.t-item`
- Mutates: `#tl-track`

## State Transitions
- .t-item: class.remove `is-expanded` → `is-expanded`
- .t-item: class.add `is-expanded` → `is-expanded`
- #tl-track: style.set `scrollSnapType` → `none`
- #tl-track: style.set `scrollSnapType` → `x proximity`

## Assets & Data
None

## Text Content (verbatim)
- 2016.08 出道 ·《Square One》 以《WHISTLE》与《BOOMBAYAH》双主打正式出道,确立四人编制主唱/主舞双轴。 了解背景 › 2016.08出道 ·《Square One》 经历背景 YG 娱乐时隔七年推出的全新女团。出道前四人经历长达四至六年的练习生训练,从多名练习生中脱颖而出。双主打《W

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
- Estimated lines: 123
- Budget: 150
- Status: READY
