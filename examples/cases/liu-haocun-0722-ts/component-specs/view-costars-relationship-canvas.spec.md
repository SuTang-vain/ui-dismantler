# RelationshipCanvas Specification

## Overview
- **Target file:** `src/components/RelationshipCanvas.ts`
- **Source selector:** `#costarGraphWrap`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 relationship-canvas 视图：多次合作 电影合作 剧集合作
- **Parent:** `panel-view-costars`
- **Dependencies:** `panel-view-costars`

## DOM Structure
- Preserve the source subtree rooted at `#costarGraphWrap`.

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
- click: .radar-center → .view class.remove(active=active)
- click: .radar-center → @dynamic-id class.add(active=active)
- click: .radar-center → .nav-btn class.toggle(active=active)
- click: .radar-center → .nav-btn attribute.set(aria-current)
- click: .radar-center → #modal class.remove(active=active)
- click: .radar-center → #modal attribute.set(aria-hidden=true)
- click: .radar-center → #modal content.set(innerHTML=)
- click: .radar-center → #costarGraphWrap class.remove(panel-open=panel-open)
- click: .radar-center → .node focus.focus
- pointerdown: #costarGraphWrap
- pointerup: #costarGraphWrap → #costarGraphWrap class.add(panel-open=panel-open)

## Per-State Content
- Covers: `click|.radar-center|script-assignment`
- Covers: `pointerdown|#costarGraphWrap|script-assignment`
- Covers: `pointerup|#costarGraphWrap|script-assignment`

## Mutation Targets
- Mutates: `.view`
- Mutates: `@dynamic-id`
- Mutates: `.nav-btn`
- Mutates: `#modal`
- Mutates: `#costarGraphWrap`
- Mutates: `.node`

## State Transitions
- .view: class.remove `active` → `active`
- @dynamic-id: class.add `active` → `active`
- .nav-btn: class.toggle `active` → `active`
- .nav-btn: attribute.set `aria-current`
- #modal: class.remove `active` → `active`
- #modal: attribute.set `aria-hidden` → `true`
- #modal: content.set `innerHTML` → ``
- #costarGraphWrap: class.remove `panel-open` → `panel-open`
- .node: focus.focus
- #costarGraphWrap: class.add `panel-open` → `panel-open`

## Assets & Data
- Data dependency: `costars`
- Data contract: `costars`

## Text Content (verbatim)
- 多次合作 电影合作 剧集合作

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(prefers-reduced-motion: reduce)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 137
- Budget: 150
- Status: READY
