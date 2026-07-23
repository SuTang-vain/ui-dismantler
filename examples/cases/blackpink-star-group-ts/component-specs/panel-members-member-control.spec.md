# MemberControl Specification

## Overview
- **Target file:** `src/components/MemberControl.ts`
- **Source selector:** `.member`
- **Source instances:** 4
- **Interaction model:** click-driven
- **Responsibility:** 复现 member-control 视图的结构、样式与状态
- **Parent:** `panel-members-member-grid`
- **Dependencies:** `panel-members-member-grid`

## DOM Structure
- Preserve the source subtree rooted at `.member`.
- Reuse this component for all source instances:
- `div.member-grid > button:nth-child(1)`
- `div.member-grid > button:nth-child(2)`
- `div.member-grid > button:nth-child(3)`
- `div.member-grid > button:nth-child(4)`

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
- click: div.member-grid > button:nth-child(1)
- click: div.member-grid > button:nth-child(2)
- click: div.member-grid > button:nth-child(3)
- click: div.member-grid > button:nth-child(4)
- click: .member → .member attribute.set(aria-pressed)
- click: .member → #rel-name content.set(textContent)
- click: .member → #rel-sub content.set(textContent)
- click: .member → #rel-list content.set(innerHTML=)
- click: .member → .m-row class.set(relation-row=relation-row)
- click: .member → .m-row content.set(innerHTML)
- click: .member → #rel-list structure.append
- click: .member → #rel-kicker content.set(textContent)

## Per-State Content
- Covers: `click|div.member-grid > button:nth-child(1)|semantic-control`
- Covers: `click|div.member-grid > button:nth-child(2)|semantic-control`
- Covers: `click|div.member-grid > button:nth-child(3)|semantic-control`
- Covers: `click|div.member-grid > button:nth-child(4)|semantic-control`
- Covers: `click|.member|script-assignment`

## Mutation Targets
- Mutates: `.member`
- Mutates: `#rel-name`
- Mutates: `#rel-sub`
- Mutates: `#rel-list`
- Mutates: `.m-row`
- Mutates: `#rel-kicker`
- Mutates: `#member-modal-title`
- Mutates: `#member-modal-body`
- Mutates: `.mdm-header`
- Mutates: `.mdm-avatar`
- Mutates: `.mdm-head-text`
- Mutates: `#member-modal`

## State Transitions
- .member: attribute.set `aria-pressed`
- #rel-name: content.set `textContent`
- #rel-sub: content.set `textContent`
- #rel-list: content.set `innerHTML` → ``
- .m-row: class.set `relation-row` → `relation-row`
- .m-row: content.set `innerHTML`
- #rel-list: structure.append
- #rel-kicker: content.set `textContent`
- #member-modal-title: content.set `textContent`
- #member-modal-body: content.set `innerHTML` → ``
- .mdm-header: class.set `mdm-header` → `mdm-header`
- .mdm-avatar: class.set
- .mdm-avatar: content.set `innerHTML`
- .mdm-avatar: content.set `textContent`
- .mdm-head-text: class.set `mdm-head-text` → `mdm-head-text`
- .mdm-head-text: content.set `innerHTML`
- .mdm-header: structure.append
- .mdm-header: structure.append
- #member-modal-body: structure.append
- .m-row: class.set `m-row` → `m-row`

## Assets & Data
- Data dependency: `memberData`

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
- Estimated lines: 125
- Budget: 150
- Status: READY
