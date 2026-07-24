# PageHeader Specification

## Overview
- **Target file:** `src/components/PageHeader.ts`
- **Source selector:** `#nav`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 page-header 视图：BabeL·O Features How it works Live demo Architecture Paths FAQ Get started
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#nav`.

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
- click: #nav > div:nth-child(1) > a:nth-child(1)
- click: nav.nav-links > a:nth-child(1)
- click: nav.nav-links > a:nth-child(2)
- click: nav.nav-links > a:nth-child(3)
- click: nav.nav-links > a:nth-child(4)
- click: nav.nav-links > a:nth-child(5)
- click: nav.nav-links > a:nth-child(6)
- click: #themeToggle
- click: div.nav-right > a:nth-child(2)
- scroll: html → #nav class.toggle(is-scrolled=is-scrolled)

## Per-State Content
- Covers: `click|#nav > div:nth-child(1) > a:nth-child(1)|semantic-control`
- Covers: `click|nav.nav-links > a:nth-child(1)|semantic-control`
- Covers: `click|nav.nav-links > a:nth-child(2)|semantic-control`
- Covers: `click|nav.nav-links > a:nth-child(3)|semantic-control`
- Covers: `click|nav.nav-links > a:nth-child(4)|semantic-control`
- Covers: `click|nav.nav-links > a:nth-child(5)|semantic-control`
- Covers: `click|nav.nav-links > a:nth-child(6)|semantic-control`
- Covers: `click|#themeToggle|semantic-control`
- Covers: `click|div.nav-right > a:nth-child(2)|semantic-control`
- Covers: `scroll|html|script-assignment`

## Mutation Targets
- Mutates: `#nav`

## State Transitions
- #nav: class.toggle `is-scrolled` → `is-scrolled`

## Assets & Data
- Data dependency: `a`

## Text Content (verbatim)
- BabeL·O Features How it works Live demo Architecture Paths FAQ Get started

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
- Estimated lines: 122
- Budget: 150
- Status: READY
