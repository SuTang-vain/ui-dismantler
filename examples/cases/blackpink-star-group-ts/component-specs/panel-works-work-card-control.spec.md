# WorkCardControl Specification

## Overview
- **Target file:** `src/components/WorkCardControl.ts`
- **Source selector:** `.work-item`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 work-card-control 视图的结构、样式与状态
- **Parent:** `panel-works-works-explorer`
- **Dependencies:** `panel-works-works-explorer`

## DOM Structure
- Preserve the source subtree rooted at `.work-item`.

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
- click: .work-item → #ws-story-body content.set(innerHTML)
- click: .work-item → #work-story-panel class.add(open=open)
- click: .work-item → #work-story-panel property.set(hidden=false)
- click: .work-item → .work-item class.remove(is-center=is-center)
- click: .work-item → .work-item class.add(is-center=is-center)
- click: .work-item → .work-item class.add(is-prev-side=is-prev-side)
- click: .work-item → .work-item class.add(is-next-side=is-next-side)
- click: .work-item → .work-item class.add(is-prev-far=is-prev-far)
- click: .work-item → .work-item class.add(is-next-far=is-next-far)
- click: .work-item → .ws-dot class.toggle(is-active=is-active)

## Per-State Content
- Covers: `click|.work-item|script-assignment`

## Mutation Targets
- Mutates: `#ws-story-body`
- Mutates: `#work-story-panel`
- Mutates: `.work-item`
- Mutates: `.ws-dot`

## State Transitions
- #ws-story-body: content.set `innerHTML`
- #work-story-panel: class.add `open` → `open`
- #work-story-panel: property.set `hidden` → `false`
- .work-item: class.remove `is-center` → `is-center`
- .work-item: class.add `is-center` → `is-center`
- .work-item: class.add `is-prev-side` → `is-prev-side`
- .work-item: class.add `is-next-side` → `is-next-side`
- .work-item: class.add `is-prev-far` → `is-prev-far`
- .work-item: class.add `is-next-far` → `is-next-far`
- .ws-dot: class.toggle `is-active` → `is-active`

## Assets & Data
- Data dependency: `worksData`
- Data dependency: `wsCards`
- Data contract: `worksData`
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
- Estimated lines: 114
- Budget: 150
- Status: READY
