# FragmentsOfMeInteractivePanel Specification

## Overview
- **Target file:** `src/components/FragmentsOfMeInteractivePanel.ts`
- **Source selector:** `#floating-player`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 interactive-panel 视图：Lost Verdania · Christopher Larkin 0:00
- **Parent:** `section-4-fragments-of-me`
- **Dependencies:** `section-4-fragments-of-me`

## DOM Structure
- Preserve the source subtree rooted at `#floating-player`.

## Computed Styles
- Token: `--direction-multiplier`
- Token: `--page-title-display`
- Token: `--swiper-theme-color`
- Token: `--swiper-navigation-size`
- Token: `#999`
- Token: `rgba(14,165,233,.2)`
- Token: `hsla(0,0%,100%,.1)`
- Token: `#d3e6f3`
- Token: `#d2e3f9`
- Token: `#fff`
- Token: `rgba(0,0,0,0.2)`
- Token: `rgba(0,0,0,0.3)`
- Token: `#FFF`
- Token: `#eee`
- Token: `#1e1e1e`
- Token: `#000000`
- Token: `#777`
- Token: `rgba(255,255,255,0.5)`
- Token: `rgba(255,255,255,0.1)`
- Token: `#24D5B4`
- Token: `#586c80`
- Token: `#eebf56`
- Token: `#f46ca3`
- Token: `#1b9edf`

## States & Behaviors
- click: button.floating-close-btn
- input: input.floating-progress
- click: button.floating-play-btn

## Per-State Content
- Covers: `click|button.floating-close-btn|semantic-control`
- Covers: `input|input.floating-progress|semantic-control`
- Covers: `click|button.floating-play-btn|semantic-control`

## Assets & Data
None

## Text Content (verbatim)
- Lost Verdania · Christopher Larkin 0:00

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:700px)`
- `(max-width:700px)`
- `screen and (max-width:576px)`
- `(min-width:1024px)`
- `(max-width:1023px)`
- `(max-width:1024px)`
- `(min-width:768px)`
- `(min-width:768px)`
- `(max-width:767px)`
- `(min-width:1025px)`
- `(min-width:-1)`
- `(max-width:-1)`
- `(max-width:1024px)`
- `(max-width:-1)`
- `(max-width:767px)`
- `(prefers-reduced-motion:no-preference)`
- `(max-width:767px)`
- `(prefers-reduced-motion:reduce)`
- `(max-width:767px)`
- `(min-width:768px) and (max-width:1024px)`
- `(min-width:1025px) and (max-width:99999px)`
- `(max-width:1024px)`
- `(max-width:767px)`

## Complexity Budget
- Estimated lines: 131
- Budget: 150
- Status: READY
