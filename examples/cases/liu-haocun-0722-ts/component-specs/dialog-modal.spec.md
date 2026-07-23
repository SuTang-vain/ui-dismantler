# ModalDialog Specification

## Overview
- **Target file:** `src/components/ModalDialog.ts`
- **Source selector:** `#modal`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 dialog 视图的结构、样式与状态
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#modal`.

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
- click: .modal-close → #modal class.remove(active=active)
- click: .modal-close → #modal attribute.set(aria-hidden=true)
- click: .modal-close → #modal content.set(innerHTML=)
- click: .modal-close → #costarGraphWrap class.remove(panel-open=panel-open)
- click: .modal-close → .edge class.remove(hl=hl)
- click: .modal-close → .node focus.focus
- click: #modal → #modal class.remove(active=active)
- click: #modal → #modal attribute.set(aria-hidden=true)
- click: #modal → #modal content.set(innerHTML=)
- click: #modal → #costarGraphWrap class.remove(panel-open=panel-open)
- click: #modal → .edge class.remove(hl=hl)
- click: #modal → .node focus.focus

## Per-State Content
- Covers: `click|.modal-close|script-assignment`
- Covers: `click|#modal|script-assignment`

## Mutation Targets
- Mutates: `#modal`
- Mutates: `#costarGraphWrap`
- Mutates: `.edge`
- Mutates: `.node`

## State Transitions
- #modal: class.remove `active` → `active`
- #modal: attribute.set `aria-hidden` → `true`
- #modal: content.set `innerHTML` → ``
- #costarGraphWrap: class.remove `panel-open` → `panel-open`
- .edge: class.remove `hl` → `hl`
- .node: focus.focus

## Assets & Data
- Data dependency: `graphNodeState`

## Text Content (verbatim)
None

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(prefers-reduced-motion: reduce)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 100
- Budget: 150
- Status: READY
