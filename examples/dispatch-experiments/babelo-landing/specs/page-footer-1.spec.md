# PageFooter Specification

## Overview
- **Target file:** `src/components/PageFooter.ts`
- **Source selector:** `footer.footer`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 page-footer 视图：BabeL·O Your terminal workspace for durable coding sessions, native TUI workflows, and tool-aware ag
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `footer.footer`.

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
- click: div.footer-grid > div:nth-child(1) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(1) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(2) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(3) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(4) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(1) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(2) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(3) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(4) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(1) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(2) > a:nth-child(1)
- click: div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(3) > a:nth-child(1)

## Per-State Content
- Covers: `click|div.footer-grid > div:nth-child(1) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(1) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(2) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(3) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(2) > ul:nth-child(2) > li:nth-child(4) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(1) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(2) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(3) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(3) > ul:nth-child(2) > li:nth-child(4) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(1) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(2) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(3) > a:nth-child(1)|semantic-control`
- Covers: `click|div.footer-grid > div:nth-child(4) > ul:nth-child(2) > li:nth-child(4) > a:nth-child(1)|semantic-control`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
- Data dependency: `a`

## Text Content (verbatim)
- BabeL·O Your terminal workspace for durable coding sessions, native TUI workflows, and tool-aware agents. Product Features How it works Live demo Architecture R

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
- Estimated lines: 108
- Budget: 150
- Status: READY
