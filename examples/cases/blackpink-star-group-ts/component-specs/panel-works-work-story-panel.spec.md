# WorkStoryPanel Specification

## Overview
- **Target file:** `src/components/WorkStoryPanel.ts`
- **Source selector:** `#work-story-panel`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 work-story-panel 视图：×
- **Parent:** `panel-panel-works`
- **Dependencies:** `panel-panel-works`

## DOM Structure
- Preserve the source subtree rooted at `#work-story-panel`.

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
- click: #ws-story-cta → #ws-story-body content.set(innerHTML)
- click: #ws-story-cta → #work-story-panel class.add(open=open)
- click: #ws-story-cta → #work-story-panel property.set(hidden=false)
- click: #ws-story-close → #work-story-panel class.remove(open=open)
- click: #ws-story-close → #work-story-panel property.set(hidden=true)
- click: #work-story-panel → #work-story-panel class.remove(open=open)
- click: #work-story-panel → #work-story-panel property.set(hidden=true)

## Per-State Content
- Covers: `click|#ws-story-cta|semantic-control`
- Covers: `click|#ws-story-close|semantic-control`
- Covers: `click|#work-story-panel|script-assignment`

## Mutation Targets
- Mutates: `#ws-story-body`
- Mutates: `#work-story-panel`

## State Transitions
- #ws-story-body: content.set `innerHTML`
- #work-story-panel: class.add `open` → `open`
- #work-story-panel: property.set `hidden` → `false`
- #work-story-panel: class.remove `open` → `open`
- #work-story-panel: property.set `hidden` → `true`

## Assets & Data
- Data dependency: `worksData`
- Data dependency: `wsCards`
- Data dependency: `WORKS_AUTO_INTERVAL`
- Data contract: `worksData`
- Data contract: `wsCards`

## Text Content (verbatim)
- ×

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
- Estimated lines: 150
- Budget: 150
- Status: READY
