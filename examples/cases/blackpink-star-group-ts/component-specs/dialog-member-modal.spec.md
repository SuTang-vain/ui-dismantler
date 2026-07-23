# MemberModalDialog Specification

## Overview
- **Target file:** `src/components/MemberModalDialog.ts`
- **Source selector:** `#member-modal`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 dialog 视图：× 成员详情 点击卡片查看详情
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#member-modal`.

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
- click: #member-modal-close → #member-modal class.remove(open=open)
- click: #member-modal-close → #member-modal property.set(hidden=true)
- click: #member-modal → #member-modal class.remove(open=open)
- click: #member-modal → #member-modal property.set(hidden=true)

## Per-State Content
- Covers: `click|#member-modal-close|semantic-control`
- Covers: `click|#member-modal|script-assignment`

## Mutation Targets
- Mutates: `#member-modal`

## State Transitions
- #member-modal: class.remove `open` → `open`
- #member-modal: property.set `hidden` → `true`

## Assets & Data
None

## Text Content (verbatim)
- × 成员详情 点击卡片查看详情

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
- Estimated lines: 117
- Budget: 150
- Status: READY
