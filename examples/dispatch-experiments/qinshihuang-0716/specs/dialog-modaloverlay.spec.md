# ModaloverlayDialog Specification

## Overview
- **Target file:** `src/components/ModaloverlayDialog.ts`
- **Source selector:** `#modalOverlay`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 dialog 视图：✕ 在本事件中的作为 影响
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#modalOverlay`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-hover`
- Token: `--primary-light`
- Token: `--primary-tint`
- Token: `--bg-white`
- Token: `--bg-dent`
- Token: `--text-main`
- Token: `--text-minor`
- Token: `--text-tiny`
- Token: `--border-light`
- Token: `--shadow-sm`
- Token: `--shadow-md`
- Token: `--shadow-lg`
- Token: `--radius-xs`
- Token: `--radius-sm`
- Token: `--radius-md`
- Token: `--radius-lg`
- Token: `--rel-family`
- Token: `--rel-ruler`
- Token: `--rel-ally`
- Token: `--rel-enemy`
- Token: `--rel-plot`
- Token: `rgba(30, 31, 36, 0.06)`
- Token: `rgba(30, 31, 36, 0.12)`

## States & Behaviors
- click: #modalClose → #modalOverlay class.remove(active=active)
- click: #modalOverlay → #modalOverlay class.remove(active=active)

## Per-State Content
- Covers: `click|#modalClose|semantic-control`
- Covers: `click|#modalOverlay|script-assignment`

## Mutation Targets
- Mutates: `#modalOverlay`

## State Transitions
- #modalOverlay: class.remove `active` → `active`

## Assets & Data
- Data dependency: `nodeState`
- Data dependency: `edgeEls`
- Data contract: `edgeEls`

## Text Content (verbatim)
- ✕ 在本事件中的作为 影响

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(min-width: 769px)`
- `(max-width: 768px)`
- `(max-width: 768px)`
- `(max-width: 480px)`

## Complexity Budget
- Estimated lines: 125
- Budget: 150
- Status: READY
