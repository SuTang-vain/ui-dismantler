# TimelineScrollSurface Specification

## Overview
- **Target file:** `src/components/TimelineScrollSurface.ts`
- **Source selector:** `#tl-track`
- **Source instances:** 1
- **Interaction model:** scroll-driven
- **Responsibility:** 复现 scroll-surface 视图：2016.08 出道 ·《Square One》 以《WHISTLE》与《BOOMBAYAH》双主打正式出道,确立四人编制主唱/主舞双轴。 了解背景 › 2016.08出道 ·《Square One》
- **Parent:** `panel-panel-timeline`
- **Dependencies:** `panel-panel-timeline`

## DOM Structure
- Preserve the source subtree rooted at `#tl-track`.

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
- scroll: #tl-track → .tl-prev-pc class.toggle(is-hidden=is-hidden)
- scroll: #tl-track → .tl-prev-mobile class.toggle(is-hidden=is-hidden)
- scroll: #tl-track → .tl-next-pc class.toggle(is-hidden=is-hidden)
- scroll: #tl-track → .tl-next-mobile class.toggle(is-hidden=is-hidden)
- scroll: #tl-track → #tl-page-label content.set(textContent)
- scroll: #tl-track → .ws-dot class.toggle(is-active=is-active)

## Per-State Content
- Covers: `scroll|#tl-track|script-assignment`

## Mutation Targets
- Mutates: `.tl-prev-pc`
- Mutates: `.tl-prev-mobile`
- Mutates: `.tl-next-pc`
- Mutates: `.tl-next-mobile`
- Mutates: `#tl-page-label`
- Mutates: `.ws-dot`

## State Transitions
- .tl-prev-pc: class.toggle `is-hidden` → `is-hidden`
- .tl-prev-mobile: class.toggle `is-hidden` → `is-hidden`
- .tl-next-pc: class.toggle `is-hidden` → `is-hidden`
- .tl-next-mobile: class.toggle `is-hidden` → `is-hidden`
- #tl-page-label: content.set `textContent`
- .ws-dot: class.toggle `is-active` → `is-active`

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
- Estimated lines: 105
- Budget: 150
- Status: READY
