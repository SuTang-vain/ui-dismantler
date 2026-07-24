# FrequentlyAsked Specification

## Overview
- **Target file:** `src/components/FrequentlyAsked.ts`
- **Source selector:** `#faq`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 content-section 视图：Frequently asked
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#faq`.

## Computed Styles
- Token: `--bg`
- Token: `--surface`
- Token: `--surface-2`
- Token: `--card`
- Token: `--text`
- Token: `--text-2`
- Token: `--text-3`
- Token: `--accent`
- Token: `--accent-soft`
- Token: `--accent-2`
- Token: `--c-red`
- Token: `--c-red-soft`
- Token: `--c-orange`
- Token: `--c-orange-soft`
- Token: `--c-purple`
- Token: `--c-purple-soft`
- Token: `--c-pink`
- Token: `--c-pink-soft`
- Token: `--grad-warm`
- Token: `--grad-warm-soft`
- Token: `--grad-text`
- Token: `--grad-band`
- Token: `--line`
- Token: `--line-2`

## States & Behaviors
- click: #faq > div:nth-child(1) > div:nth-child(1) → .faq-item class.toggle(open=open)
- click: #faq > div:nth-child(1) > div:nth-child(1) → #faq > div:nth-child(1) > div:nth-child(1) attribute.set(aria-expanded)
- click: #faq > div:nth-child(2) > div:nth-child(1) → .faq-item class.toggle(open=open)
- click: #faq > div:nth-child(2) > div:nth-child(1) → #faq > div:nth-child(2) > div:nth-child(1) attribute.set(aria-expanded)
- click: #faq > div:nth-child(3) > div:nth-child(1) → .faq-item class.toggle(open=open)
- click: #faq > div:nth-child(3) > div:nth-child(1) → #faq > div:nth-child(3) > div:nth-child(1) attribute.set(aria-expanded)

## Per-State Content
- Covers: `click|#faq > div:nth-child(1) > div:nth-child(1)|script-assignment`
- Covers: `click|#faq > div:nth-child(2) > div:nth-child(1)|script-assignment`
- Covers: `click|#faq > div:nth-child(3) > div:nth-child(1)|script-assignment`

## Mutation Targets
- Mutates: `.faq-item`
- Mutates: `#faq > div:nth-child(1) > div:nth-child(1)`
- Mutates: `#faq > div:nth-child(2) > div:nth-child(1)`
- Mutates: `#faq > div:nth-child(3) > div:nth-child(1)`

## State Transitions
- .faq-item: class.toggle `open` → `open`
- #faq > div:nth-child(1) > div:nth-child(1): attribute.set `aria-expanded`
- #faq > div:nth-child(2) > div:nth-child(1): attribute.set `aria-expanded`
- #faq > div:nth-child(3) > div:nth-child(1): attribute.set `aria-expanded`

## Assets & Data
None

## Text Content (verbatim)
- Frequently asked

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:980px)`
- `(max-width:640px)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 96
- Budget: 150
- Status: READY
