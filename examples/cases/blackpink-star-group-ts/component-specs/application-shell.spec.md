# ApplicationShell Specification

## Overview
- **Target file:** `src/components/ApplicationShell.ts`
- **Source selector:** `main.pc-card-frame`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 app-shell 视图：成员详情 4 经历 6 团体作品 6 其它 01 成员详情 ↓ 02 经历 ↓ 03 团体作品 ↓ 04 其它 ↗ Jisoo 百度百科 Jisoo · 金智秀 主唱 · 视觉 在团 Je Jenni
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `main.pc-card-frame`.

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
- click: #tab-members → .tab-bar .tab attribute.set(aria-selected)
- click: #tab-members → #tl-page-label content.set(textContent)
- click: #tab-members → .ws-dot class.toggle(is-active=is-active)
- click: #tab-members → #modal class.remove(open=open)
- click: #tab-members → #modal property.set(hidden=true)
- click: #tab-members → #tab-more attribute.set(aria-selected=false)
- click: #tab-members → #tab-more attribute.set(aria-expanded=false)
- click: #tab-members → #entry-cover class.add(is-hidden=is-hidden)
- click: #tab-members → #entry-cover attribute.set(aria-hidden=true)
- click: #tab-members → #entry-cover style.set(display=none)
- click: #tab-timeline → .tab-bar .tab attribute.set(aria-selected)
- click: #tab-timeline → #tl-page-label content.set(textContent)

## Per-State Content
- Covers: `click|#tab-members|panel-members`
- Covers: `click|#tab-timeline|panel-timeline`
- Covers: `click|#tab-works|panel-works`
- Covers: `click|#tab-more|modal-overlay-region`
- Covers: `click|div.entry-grids > button:nth-child(1)|toggle`
- Covers: `click|div.entry-grids > button:nth-child(2)|toggle`
- Covers: `click|div.entry-grids > button:nth-child(3)|toggle`
- Covers: `click|div.entry-grids > button:nth-child(4)|toggle`

## Mutation Targets
- Mutates: `.tab-bar .tab`
- Mutates: `#tl-page-label`
- Mutates: `.ws-dot`
- Mutates: `#modal`
- Mutates: `#tab-more`
- Mutates: `#entry-cover`

## State Transitions
- .tab-bar .tab: attribute.set `aria-selected`
- #tl-page-label: content.set `textContent`
- .ws-dot: class.toggle `is-active` → `is-active`
- #modal: class.remove `open` → `open`
- #modal: property.set `hidden` → `true`
- #tab-more: attribute.set `aria-selected` → `false`
- #tab-more: attribute.set `aria-expanded` → `false`
- #entry-cover: class.add `is-hidden` → `is-hidden`
- #entry-cover: attribute.set `aria-hidden` → `true`
- #entry-cover: style.set `display` → `none`
- .tab-bar .tab: attribute.set `aria-selected` → `false`
- #entry-cover: style.set `display` → ``
- #entry-cover: attribute.set `aria-hidden` → `false`
- #entry-cover: class.remove `is-hidden` → `is-hidden`
- #modal: property.set `hidden` → `false`
- #modal: class.add `open` → `open`
- #tab-more: attribute.set `aria-selected` → `true`
- #tab-more: attribute.set `aria-expanded` → `true`

## Assets & Data
- Data dependency: `panels`
- Data dependency: `wsCards`
- Data dependency: `WORKS_AUTO_INTERVAL`
- Data contract: `wsCards`

## Text Content (verbatim)
- 成员详情 4 经历 6 团体作品 6 其它 01 成员详情 ↓ 02 经历 ↓ 03 团体作品 ↓ 04 其它 ↗ Jisoo 百度百科 Jisoo · 金智秀 主唱 · 视觉 在团 Je Jennie · 金珍妮 主唱 · 说唱 · 视觉 在团 Rö Rosé · 朴彩英 主唱 · 领舞 在团 Li Lisa · L

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
- Estimated lines: 129
- Budget: 150
- Status: READY
