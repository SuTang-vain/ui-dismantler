---
name: html-to-component-lib-quick
description: Quick-entry version. Dismantle HTML case pages into reusable component libraries. MUST USE when user mentions "dismantle HTML" / "extract components" / "make a component library" / "extract theme colors" / "extract interaction patterns" / 「拆解 HTML」「提取组件」「做成组件库」「提取主题色」「提取交互模式」. Read this file first; for complex cases or when this doesn't work, read the full SKILL.md.
---

# HTML -> Component Library (Quick Entry)

**Full spec in `SKILL.md`**. This file covers three things: when to use, 5-step workflow, completion criteria.

## When to Use

User provides an HTML file (or directory) and asks to dismantle into a component library / extract theme colors / standardize for reuse.

## 5-Step Workflow

1. **Read through the HTML**: Understand theme color semantics, Tab/view structure, interaction patterns, data organization, responsive breakpoints
2. **Call tools for data**: `python3 src/skill/scripts/analyze_html.py <html> --out <mf.json> --minimal` (fetches theme tokens + pattern recognition + structure list; auto-extracts from Tailwind config when `:root` is empty)
3. **Produce component library** (in user-specified directory):
   - `src/<lib>.css`: Parametric styles (`sg-` prefix, `--sg-*` vars, three-tier responsive)
   - `src/<lib>.js`: Rendering engine (`<Lib>.mount(container, opts)` API, data-driven, A11y)
   - `examples/<case>.html`: Reproduce original case with real data
   - `docs/设计规范.md` + `README.md`: Documentation
4. **Self-check** (all three must pass):
   - `python3 src/skill/scripts/validate_lib.py <lib-dir>` -> 8 items all PASS
   - `node --check src/<lib>.js` -> no syntax errors
   - `python3 scripts/roundtrip.py <original.html> --lib <lib-dir> --out <report.json>` -> overall >= 0.70 (GOLD >= 0.85)
5. **Revise**: Fix per error report, rerun all self-checks, loop until passing or 3-round cap

## 8 Strong Constraints (validate_lib.py)

1. Naming prefix: CSS `sg-`, vars `--sg-`, JS PascalCase, DOM ids `sg-`
2. Variable normalization: Map original vars to `--sg-primary/accent/ink/muted/line/paper/stage/soft`
3. Data separation: Variable content via JSON, no hardcoded business text/URLs in JS
4. Three-tier responsive: PC + WISE (<=500px) + extreme (<=320px)
5. A11y: tablist/tabpanel/dialog/aria-live/aria-label/ESC (as needed)
6. Theme customizable: All colors via variables, no hardcoded `#hex` (`:root` and pure B/W overlays excepted)
7. Zero deps: No external JS/CSS (font CDN excepted)
8. Docs complete: README.md + docs/设计规范.md present

## Quality Thresholds

- **PASS**: roundtrip overall >= 0.70 (structure + text equally weighted)
- **GOLD**: roundtrip overall >= 0.85
- Tailwind pages: tag topology rate (0.95+) and text match rate (1.0) are more faithful measures; class similarity is naturally low — this is normal

## When to Read the Full Version

- This file doesn't work -> read `SKILL.md` "Dismantling Workflow" for detailed steps
- validate item FAILs and you don't know how to fix -> read `SKILL.md` "Self-Check Decision Table"
- Variable normalization mapping incomplete -> read `references/spec.md` Section 2
- Unsure about structure pattern -> read `references/patterns.md`
- Want ESM/Web Component output -> read `SKILL.md` "Output Forms" + call `adapt_output.py`

## Dependencies

- Python 3.9+ + beautifulsoup4
- Node.js 18+ (for roundtrip jsdom rendering)
