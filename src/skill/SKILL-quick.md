---
name: html-to-component-lib-quick
description: Quick-entry version. Dismantle an HTML case page into a reusable component library. MUST USE when the user mentions "dismantle HTML" / "extract components" / "make a component library" / "extract theme colors" / "extract interaction patterns" / "standardize for reuse" / 「拆解 HTML」「提取组件」「做成组件库」「提取主题色」「提取交互模式」「规范化复用」. Read this file first; for complex cases or failures, read the full SKILL.md.
---

# HTML -> Component Library Dismantling (Quick Version)

**Full spec in `SKILL.md`**. This file is the quick entry, covering only three things: when to use, how to do the 5 steps, and what counts as complete.

## When to Use

The user provides an HTML file (or directory) and asks to dismantle into a component library / extract theme colors / standardize for reuse.

## 5-Step Workflow

1. **Read through the HTML**: understand theme color semantics, Tab/view structure, interaction patterns, data organization, responsive breakpoints; **before starting, `ls out/<existing-cases>/` to align with the output baseline**
2. **Call tools to fetch data**: `python3 src/skill/scripts/analyze_html.py <html> --out <mf.json> --minimal` (gets theme color tokens + pattern recognition + structure list; auto-extracts from Tailwind config when `:root` is empty)
3. **Produce the component library** (in the user-specified directory, aligned with the out/ existing-case baseline):
   - `src/<lib>.css`: parametric styles (`sg-` prefix, `--sg-*` vars, three-tier responsive)
   - `src/<lib>.js`: rendering engine (`<Lib>.mount(container, opts)` API, data-driven, A11y)
   - `examples/<case>.html`: reproduce the original case with original data
   - `examples/template.html`: blank reuse template (must produce)
   - `showcase.html`: `python3 src/skill/scripts/generate_showcase.py <lib-dir> --out showcase.html`
   - `docs/设计规范.md` + `README.md`: documentation
4. **Self-check** (all three must pass to count as complete):
   - `python3 src/skill/scripts/validate_lib.py <lib-dir>` -> all 8 items PASS
   - `node --check src/<lib>.js` -> no syntax errors
   - `python3 scripts/roundtrip.py <original-html> --lib <lib-dir> --out <report.json>` -> overall >= 0.70 (GOLD >= 0.85)
5. **Revise**: if not passing, revise per the error, rerun self-checks; loop until passing or hitting the 3-round cap

## 8 Strong Constraints (validated by validate_lib.py)

1. Naming prefix: CSS `sg-`, vars `--sg-`, JS PascalCase, DOM id `sg-`
2. Variable normalization: original variable names mapped to `--sg-primary/accent/ink/muted/line/paper/stage/soft`
3. Data separation: variable content goes through JSON; no hardcoded business copy/URLs in JS
4. Three-tier responsive: PC + WISE (<=500px) + extreme (<=320px)
5. A11y: tablist/tabpanel/dialog/aria-live/aria-label/ESC (as needed)
6. Theme customizable: all colors go through variables; no hardcoded `#hex` (`:root` and pure-black/white overlays are exceptions)
7. Zero dependencies: no external JS/CSS (font CDN is the exception)
8. Docs complete: README.md + docs/设计规范.md both present

## Quality Thresholds

- **PASS**: roundtrip overall >= 0.70 (structure + text each weighted)
- **GOLD**: roundtrip overall >= 0.85
- Tailwind pages: tag topology rate (0.95+) and text match rate (1.0) are more faithful measures; class similarity is naturally low and that's normal

## When to Read the Full Version

- This file doesn't work -> read the "Dismantling Workflow" detailed steps in `SKILL.md`
- A validate item FAILs and you don't know how to fix -> read the "Self-Check Decision Table" in `SKILL.md`
- Variable normalization mapping is incomplete -> read `references/spec.md` Section 2
- Unsure about the structure pattern -> read `references/patterns.md`
- Want to output ESM/Web Component -> read "Output Form" in `SKILL.md` + call `adapt_output.py`
- Want to use UI-IR v2 for structured understanding, direct CSS `@media` relations, or isolated runtime scenarios -> read the full version "Step 2.5" + `docs/architecture/ui-ir-v2.md`

## Dependencies

- Python 3.9+ (`python3 -m pip install -r requirements.txt`)
- Node.js 18+ (jsdom rendering for roundtrip)
