# ApplicationShell Specification

## Overview
- **Target file:** `src/components/ApplicationShell.ts`
- **Source selector:** `#app-container`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 app-shell 视图：多次合作 电影合作 剧集合作 同框演员 参演作品 艺人身份
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#app-container`.

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
- click: nav.nav > button:nth-child(1) → #modal content.set(innerHTML)
- click: nav.nav > button:nth-child(1) → #modal class.add(active=active)
- click: nav.nav > button:nth-child(1) → #modal attribute.set(aria-hidden=false)
- click: nav.nav > button:nth-child(1) → .modal-close focus.focus
- click: nav.nav > button:nth-child(1) → #costarGraphWrap class.add(panel-open=panel-open)
- click: nav.nav > button:nth-child(1) → .edge class.toggle(hl=hl)
- click: nav.nav > button:nth-child(1) → .edge class.toggle(dim=dim)
- click: nav.nav > button:nth-child(1) → .view class.remove(active=active)
- click: nav.nav > button:nth-child(1) → @dynamic-id class.add(active=active)
- click: nav.nav > button:nth-child(1) → .nav-btn class.toggle(active=active)
- click: nav.nav > button:nth-child(1) → .nav-btn attribute.set(aria-current)
- click: nav.nav > button:nth-child(2) → #modal content.set(innerHTML)

## Per-State Content
- Covers: `click|nav.nav > button:nth-child(1)|semantic-control`
- Covers: `click|nav.nav > button:nth-child(2)|semantic-control`
- Covers: `click|nav.nav > button:nth-child(3)|semantic-control`

## Mutation Targets
- Mutates: `#modal`
- Mutates: `.modal-close`
- Mutates: `#costarGraphWrap`
- Mutates: `.edge`
- Mutates: `.view`
- Mutates: `@dynamic-id`
- Mutates: `.nav-btn`

## State Transitions
- #modal: content.set `innerHTML`
- #modal: class.add `active` → `active`
- #modal: attribute.set `aria-hidden` → `false`
- .modal-close: focus.focus
- #costarGraphWrap: class.add `panel-open` → `panel-open`
- .edge: class.toggle `hl` → `hl`
- .edge: class.toggle `dim` → `dim`
- .view: class.remove `active` → `active`
- @dynamic-id: class.add `active` → `active`
- .nav-btn: class.toggle `active` → `active`
- .nav-btn: attribute.set `aria-current`

## Assets & Data
- Data dependency: `costars`
- Data dependency: `graphNodeState`
- Data contract: `costars`

## Text Content (verbatim)
- 多次合作 电影合作 剧集合作 同框演员 参演作品 艺人身份

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(prefers-reduced-motion: reduce)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 99
- Budget: 150
- Status: READY
