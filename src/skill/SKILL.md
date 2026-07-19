---
name: html-to-component-lib
description: Dismantle a single HTML case page into a reusable component library (parametric CSS + rendering engine JS + data-driven examples + design spec docs). MUST USE when the user wants to turn an HTML case into a component library / reusable template / extract theme colors and interaction patterns, or mentions "dismantle HTML" / "extract components" / "make a component library" / "standardize for reuse" / "extract theme colors" / "extract interaction patterns" / 「拆解 HTML」「提取组件」「做成组件库」「规范化复用」「提取主题色」「提取交互模式」. Supports both per-case dismantling and vertical aggregation modes; output follows the sg-* strong-constraint spec.
---

# HTML -> Component Library Dismantling Skill

Dismantle a self-contained HTML case page (with inline `<style>`/`<script>`) into a structured, reusable, data-driven component library.

> **Quick-entry version**: When capability is limited or you only need to run through quickly, first read [`SKILL-quick.md`](SKILL-quick.md) (57 lines, only trigger conditions + 5-step summary + thresholds). This file is the complete spec; read here for complex cases or when the quick version doesn't work.

## Your Role (agent)

**You are the lead dismantler**, not a script dispatcher. Like an engineer reading source code, you must **understand** this HTML -- its theme color semantics, Tab/view structure, interaction patterns, data organization, responsive breakpoints -- and then **personally produce** the complete component library code. The Python scripts are just deterministic tools that help you fetch color values, validate constraints, and quantify equivalence; **understanding and creation are done by you**.

Benchmark quality: `明星组合/组件库` (the manually dismantled BLACKPINK output, 2613 lines, with complete A11y + design tokens + data-driven). The library you produce should match this quality bar, not just "it runs".

## When to Use

- The user provides an HTML file (or directory) and asks to "dismantle into a component library", "extract reusable template", or "standardize"
- The user asks to extract a page's theme colors / Tabs / interaction patterns / logic settings and freeze them for reuse
- The user asks to merge multiple cases of the same vertical into a shared component library (vertical aggregation, see the last section)

**Supported input types** (after P1 generalization):
- Self-contained single HTML (inline `<style>`/`<script>`) -- natively supported
- Multi-file directory (`index.html` + external `.css`/`.js`) -- renderer auto-inlines
- Tailwind CDN pages (`cdn.tailwindcss.com`) -- renderer injects tailwind stub; analyze_html extracts theme colors from `tailwind.config`
- Pages with external dependencies (marked/dompurify/mermaid) -- renderer injects stubs to prevent crashes
- Pages with canvas animations -- renderer injects canvas context stub
- Responsive fluid layouts (non-fixed canvas) -- supported, no longer requires 788×492 fixed size

## Dismantling Workflow (execute in order)

### Step 1: Read Through the HTML, Build Understanding

**Don't rush to call scripts**. First read the HTML in full (`<head>`'s `<style>`, `<body>`'s structure, `<script>`'s logic), and build the following mental model:

1. **Canvas & layout**: What's the PC size? Is it a fixed frame (like `.pc-card-frame` 788×492) or fluid? What responsive breakpoints exist (`@media max-width: 500/320`)? How do the canvas size and layout change at each breakpoint?
2. **Theme color semantics**: Which color variables are defined in `:root`? **Which is the brand primary** (used for selected/active states / primary buttons)? **Which is the accent** (used for "other" / story / highlight)? How many gray levels does the text have (ink/muted/subtle)? Background colors (paper = card base / stage = canvas base)? Divider color? You must judge these semantics yourself, not mechanically copy variable names.
3. **Tab/view structure**: How many Tabs? Is it `role=tablist` or `nav + data-p` association style? What view does each Tab correspond to (member grid / timeline / works carousel / detail panel)? Is there a "more" special Tab at the end?
4. **Interaction patterns**: Is there auto-play (`setInterval`)? What interval? What interaction stops it? Is there a Modal (`role=dialog`)? Trigger method? Close method (X / overlay / ESC)? Is there a 3D carousel (`perspective`)? A story panel?
5. **Data organization**: Where is the member/works/timeline data? Is it `<script type=application/json>`, a JS array (`const memberList = [...]`), or written directly into the DOM? What fields exist? Is there image fallback logic? Is there image-source annotation?
6. **A11y status**: What `role`/`aria-*` does the original page already have? What's missing and needs to be added?

**For anything unclear, read the corresponding CSS rule and JS snippet to confirm**. The quality of this step determines all downstream output.

**Align with the output baseline**: Before starting, run `ls out/<existing-cases>/` to inspect the complete file tree of already-dismantled cases (huang-yueying/kzk-about/kzk-grow/blackpink-card) and build a baseline awareness. The SKILL.md output list is a process guide; existing cases are the actual baseline -- take the union of both, missing neither. The self-check (Step 4) only validates quality constraints, not output completeness, so completeness is your responsibility at this step (commonly missed: `showcase.html`, `examples/template.html`).

### Step 2: Call Tools to Fetch Deterministic Data (reference only, not the sole basis)

```bash
python3 src/skill/scripts/analyze_html.py <html-path> --out <manifest.json> --minimal
```

`--minimal` mode quickly extracts theme color tokens + structure list + pattern recognition, as a **reference**.

**P2 pattern recognition** (`manifest.structure.pattern`):
- `cause-chain`: causal chain (timeline-nav + causeChain + whatIf)
- `nav-panel`: nav + panel (nav > [data-p] + .panel)
- `quiz`: quiz, `graph`: graph, `member-card`: member card (v1 patterns)
- `unknown`: unrecognized pattern, agent must understand the structure manually

**Tailwind config theme-color extraction** (P1 generalization):
- When `:root` has no CSS variables (Tailwind CDN pages), the tool automatically runs the page JS to capture `tailwind.config`
- Extracts `theme.extend.colors` and normalizes to `--sg-*` (e.g., `primary` -> `--sg-primary`, `on-surface` -> `--sg-ink`, `surface` -> `--sg-paper`)
- The manifest annotates `⚠ theme: :root has no variables, extracted N theme colors from Tailwind config`

**Data contract extraction** (non-minimal mode):
- cause-chain: `data.events` / `data.causeChain` / `data.whatIf`
- nav-panel: `data.graphNodes` / `data.quiz`

Notes:
- The tool's extracted theme color **semantics may be inaccurate**; you should correct the normalization based on your Step 1 understanding
- The view types the tool recognizes may be incomplete; you must judge the true structure yourself
- Items flagged in `manifest.warnings[]` as unrecognized are your dismantling priorities

Tools are crutches; your understanding is your legs. The normalization mapping table is in `references/spec.md` Section 2.

### Step 2.5: UI-IR v2 Projection (experimental, optional)

UI-IR v2 is a lightweight relational intermediate layer above manifest v1, using typed nodes (page/region/component/element/data/state/token/breakpoint) + sparse relation edges (renders/binds/triggers/controls/styles/responds/references/variantOf/derivedFrom/labels) to express page hierarchy and cross-layer relations. Current status: **experimental (2026-07-19)**; the core transformation, direct CSS `@media` parsing, DOM/JS static source evidence, optional browser listener observation, bounded interaction candidates, privacy-safe observed state graphs, and isolated Playwright scenarios with declarative conditions/assertions are usable.

**When to use**: For complex cases (multi-view / multi-data-contract / cross-layer bindings) that need more structured understanding, use the compact observation to supplement your Step 1 manual understanding. Simple cases can skip this.

```bash
# manifest v1 -> canonical UI-IR v2 (reads meta.source-pointed HTML/CSS, parses @media)
python3 src/skill/scripts/manifest_v1_to_uiir.py <manifest.json> -o <name>.uiir.json --pretty

# Optional: validate actual listener/property registration in browser
python3 src/skill/scripts/manifest_v1_to_uiir.py <manifest.json> -o <name>.uiir.json --runtime-observe

# Optional: replay isolated declarative Playwright scenarios; no eval/arbitrary JavaScript
python3 src/skill/scripts/manifest_v1_to_uiir.py <manifest.json> -o <name>.uiir.json --runtime-actions <scenarios.json>

# Optional: run one scenario by id while debugging
python3 src/skill/scripts/manifest_v1_to_uiir.py <manifest.json> --runtime-actions <scenarios.json> --runtime-scenario <id> --check

# canonical -> compact observation (for agent first-pass understanding, lossy projection)
python3 src/skill/scripts/uiir_to_compact.py <name>.uiir.json -o <name>.compact.json
```

**Important constraints**:
- UI-IR is a **generated artifact**; the original HTML/CSS/JS remains the highest-priority source of evidence
- manifestPath only denotes the manifest path; DOM/CSS/JS `sourceSpan` and optional runtime evidence are the source/runtime location
- compact is a lossy projection and does not replace canonical IR; expanded/diff are for debugging (CLI in `docs/architecture/ui-ir-v2.md` Section 8)
- runtime scenarios are bounded validation evidence: each scenario gets a fresh browser context, inputs are redacted from diagnostics, and no automatic business-correctness claim is made
- runtime diagnostics include bounded `candidates` and an observed `stateGraph`; neither stores element text or form values, and candidates are not auto-executed
- Full design and CLI in `docs/architecture/ui-ir-v2.md`; schema in `references/uiir_v2_schema.json`

### Step 3: Produce Component Library Files

**Output form** (P3 output generalization, default IIFE, can generate other forms as needed):

| Form | File | Usage | Suitable scenario |
|---|---|---|---|
| IIFE (default) | `<lib>.js` | `<script src>` + `Lib.mount()` | General-purpose; roundtrip validates this form by default |
| ESM/UMD | `<lib>.esm.js` | `<script src>` or `import {mount}` | Modern build tools (webpack/vite) |
| Web Component | `<lib>.wc.js` | `<sg-lib>` tag + JSON | Declarative usage, framework-agnostic |

IIFE is the default output. For other forms, use the adapter generator:
```bash
python3 src/skill/scripts/adapt_output.py src/<lib>.js --esm --out src/<lib>.esm.js
python3 src/skill/scripts/adapt_output.py src/<lib>.js --wc --name sg-<lib> --out src/<lib>.wc.js
python3 src/skill/scripts/adapt_output.py src/<lib>.js --all --name sg-<lib> --out-dir src/
```

In the user-specified directory (or `/tmp/<lib-name>/`), create the complete component library:

```
<lib-name>/
├── README.md                 Intro + quick start + API + data contract + theming
├── docs/设计规范.md           Theme color system / Tab structure / interaction patterns / logic settings / responsive
├── showcase.html             Design system showcase page (auto-generated by generate_showcase.py, see 3.7)
├── src/
│   ├── <lib-name>.css        Parametric styles (sg-* prefix, --sg-* vars, three-tier responsive)
│   └── <lib-name>.js         Rendering engine (<LibName>.mount/create API, data-driven, A11y)
└── examples/
    ├── <case>.html            Reproduce the original case with the lib + original data
    └── template.html          Blank reuse template (with sample data, must produce)
```

#### 3.1 `src/<lib-name>.css` - Parametric Styles

- All class names use `sg-` prefix, kebab-case (`.sg-frame` `.sg-tab` `.sg-member`)
- Define all `--sg-*` variables in `:root` (or `.sg-frame` scope), with semantic comments
- **Colors always go through variables**; no hardcoded `#hex` in rules (`:root` definitions and `rgba(0,0,0,0.x)` pure-black/white overlays are exceptions)
- Colors inside gradients also reference variables: `linear-gradient(var(--sg-paper), var(--sg-soft))`
- Three-tier responsive: PC default + `@media (max-width:500px)` + `@media (max-width:320px)`. Even if the original case only has PC, you must backfill all three
- Preserve the original case's layout essence (3D perspective tiers, scroll-snap, grid columns, etc.) -- do not simplify them away

#### 3.2 `src/<lib-name>.js` - Rendering Engine

Benchmark against the `star-group.js` pattern (see `references/` benchmark):

```js
(function (global) {
  'use strict';
  // Utilities: el(tag, cls, attrs) creates nodes; on(node, evt, fn) binds events
  function el(tag, cls, attrs) { /* ... */ }

  var DEFAULTS = { /* all configurable options, including tabs/members/timeline/works/theme/autoPlay etc. */ };

  function LibName(options) {
    this.opts = deepMerge({}, DEFAULTS, options || {});
    this.root = null;
    // instance state: timers/indices/selected state
  }
  LibName.prototype.create = function () { /* build DOM, return root node */ };
  LibName.prototype.mount = function (container) { /* create + append + afterMount */ };
  // _buildTabBar / _buildViewStack / _buildMembers / _buildTimeline / _buildWorks ...
  // _afterMount: start auto-play, bind interactions, a11y init

  function applyTheme(root, theme) { /* write options.theme into root.style --sg-* */ }

  global.LibName = { mount: function(c,o){return new LibName(o).mount(c);}, create: function(o){return new LibName(o).create();} };
})(window);
```

Key points:
- **Data-driven**: All variable content goes through `options`; **no hardcoded business copy/URLs**
- **Complete A11y**: tablist/tab/tabpanel + aria-selected/aria-controls/aria-labelledby; dialog + aria-modal + hidden; aria-live announcement region; aria-label on icon buttons; ESC to close
- **Image fallback**: `load`/`error` event-driven `.is-loaded`/`.is-error`; fallback shows first letter + gradient
- **Auto-play**: `setInterval` + stop on any interaction (click/touchstart/mouseenter)
- **Responsive logic**: `isMobile()`/`isExtremeSmall()` to branch small-screen behavior (pop Modal vs inline panel)

#### 3.3 `examples/<case>.html` - Reproduce with Original Data

- Include `src/<lib-name>.css` and `src/<lib-name>.js`
- Fill the **real data** from the original HTML (members/works/timeline/facts) into `options`
- Call `LibName.mount(document.getElementById('mount'), {...})`
- Goal: this page should reproduce the original case's core content (the roundtrip test quantifies this)

#### 3.4 `examples/template.html` - Blank Reuse Template

- Same structure, but with sample/placeholder data
- Comments annotate the meaning of each data segment, for easy replacement during reuse

#### 3.5 `docs/设计规范.md` - Complete Spec

Benchmark against the structure of `明星组合/组件库/docs/设计规范.md`:
1. **Theme color system**: design token table (Token / Value / Semantic usage) + semantic grouping + gradient overlay
2. **Tab elements**: structure + attribute conventions + three-tier sizes
3. **Interaction patterns**: view stack + interaction details for each view (member/timeline/works/detail)
4. **Logic settings**: responsive breakpoints + auto-play strategy + data-driven + A11y + performance robustness
5. **Typography**: font stack + heading hierarchy + border-radius system
6. **Component inventory**: component -> class name -> reuse notes

#### 3.6 `README.md`

Covers:
- Library intro + quick start (one-line mount)
- API reference (`mount(container, options)`, `create(options)`, options schema)
- Data contract (field list + types + required/optional)
- Theming (how to override `--sg-*` variables, dark mode example)
- File structure explanation

#### 3.7 `showcase.html` - Design System Showcase Page (auto-generated)

```bash
python3 src/skill/scripts/generate_showcase.py <lib-name> --out <lib-name>/showcase.html
```

- Auto-extracts design tokens from `src/<lib>.css` (`--sg-*` variables grouped by semantic role), responsive breakpoints, component classes, gradients
- Generates a self-contained HTML (references the lib's CSS via `<link>`; requires `src/<lib>.css` in the same directory at runtime)
- Always stays in sync with the lib, zero maintenance -- just rerun the script when CSS changes
- **When to call**: After Step 3 src output is complete, before Step 4 self-check. It does not participate in validate_lib/roundtrip machine checks; it's a human visual self-check
- **Dependency**: Only needs `src/<lib>.css` in place (doesn't read .js / examples)

### Step 4: Self-Check (must all pass)

```bash
# 4a. 8-item strong-constraint validation
python3 src/skill/scripts/validate_lib.py <component-lib-dir>

# 4b. JS syntax check
node --check src/<lib-name>.js

# 4c. Roundtrip equivalence (quantifies "how faithful to the original HTML")
python3 scripts/roundtrip.py <original-html-path> --lib <component-lib-dir> --out <report.json>
```

**Quality thresholds** (all must pass to count as complete):
- `validate_lib.py`: all 8 items PASS
- `node --check`: no syntax errors
- `roundtrip.py`: overall score >= 0.85 (GOLD) / >= 0.70 (PASS)

**roundtrip scoring dimensions** (after P0 honest measurement):
- `tag_topology_rate` (weight 40%): DOM tag topology match rate, unaffected by class-naming conventions
- `class_match_rate` (weight 30%): class semantic similarity (tolerates sg- renames)
- `node_match_rate` (weight 30%): recursive node match rate
- `text_match_rate`: text exact + contains match
- `coverage`: reference coverage (should be close to 100%)
- `overall = struct_score * 0.5 + text * 0.5`

> **About Tailwind pages**: Tailwind utility classes (`bg-background text-on-background`) and sg- semantic classes
> are two valid paradigms; class similarity is naturally low. In this case, tag topology rate (typically 0.95+) and text match rate (1.0)
> are more faithful measures. overall 0.70+ is acceptable (PASS); don't chase high class-match scores.

> Threshold basis: the hand-built benchmark (star group) has roundtrip overall 0.91;
> agent dismantling (huang/zhi) 0.97+ GOLD;
> Tailwind pages (Kezhongke about/grow) 0.71-0.73 PASS (text 1.0 + tag topology 0.96+).

### Self-Check Decision Table (failure -> revision action)

After each self-check round, use this table to locate the revision point. After fixing, rerun all three self-checks (don't only rerun the failed item, to avoid introducing new problems):

| Self-check failure | Root cause location | Revision action |
|---|---|---|
| validate: 1. naming prefix | CSS rule body contains non-sg-prefixed generic words (tab/member/modal...) | Add `sg-` prefix to offending class names; only change the rule's main selector (rightmost segment). Descendant classes that are data-driven can be left alone |
| validate: 2. variable normalization | Rules outside `:root` use un-normalized `--original-var` or hardcoded colors | Define `--sg-*` vars in `:root`, switch rules to `var(--sg-xxx)`; normalization mapping in spec.md Section 2 |
| validate: 3. data separation | examples HTML hardcodes business copy/URLs (non-placeholder) | Move hardcoded content into `<script type="application/json">` or options params |
| validate: 4. three-tier responsive | Missing `@media (max-width:500px)` or `(max-width:320px)` | Backfill both breakpoints, each with at least canvas size/font-size/layout adjustment |
| validate: 5. A11y | Has tab but no role=tablist, or has dialog but no ESC | Add A11y attributes as needed (see spec.md Section 5 on-demand table) |
| validate: 6. theme customizable | Rules hardcode `#hex` or `rgb()` (non-:root, non pure-black/white overlay) | Replace with `var(--sg-xxx)`; colors inside gradients also go through variables |
| validate: 7. zero deps | examples HTML references external JS/CSS (font CDN excluded) | Remove external references, use local src/ resources |
| validate: 8. docs complete | Missing README.md or docs/设计规范.md, or README has no API docs | Complete docs; README includes mount/create API, design spec includes theme-color section |
| node --check error | JS syntax error (missing semicolon / unbalanced parens / illegal char) | Locate and fix by line number; common: unclosed template literal, trailing comma in object |
| roundtrip text score <0.8 | Check report `text.missing`, missing real content (member roles/work titles etc.) | Add missing text into `examples/<case>.html` options data |
| roundtrip structure score <0.7 | Check `structure.node_match_rate` (tag match rate) and `class_match_rate` | Common: missing view layer (timeline/works not rendered), nesting level misaligned, modal not mounted. The comparator already tolerates sg- prefix and class renames, no need to chase class-name parity |
| Output completeness (not validate-checked) | Step 1 didn't align with existing-case baseline | `ls out/<existing-cases>/` to compare, fill in missing files (common: `showcase.html` via `generate_showcase.py`, `examples/template.html` handwritten) |

**Exit protocol**:
- All thresholds pass -> dismantling complete, report file paths + self-check results to the user
- Still not passing after 3 rounds -> stop revising, explain to the user: which items pass, which are short by how much, the gap reason (e.g., "Huang Yueying is a cause-chain pattern, not currently supported and needs pattern extension"), and suggest next steps
- Each revision round only touches files related to the failed items, don't rewrite large swaths (to avoid regressions)

### Step 5: Revise (loop if not passing)

Locate revision points using the "Self-Check Decision Table" above. After fixing, rerun all self-checks (4a + 4b + 4c, all three). Loop until passing or hitting the 3-round cap.

- After revising, rerun self-checks; loop until passing or hitting the 3-round cap (if still not passing after 3 rounds, follow the "Exit protocol" to explain the gap to the user)

## Key Constraints (see references/spec.md for details)

8 strong constraints, validated by `validate_lib.py`:

1. **Naming prefix**: CSS classes `sg-`, variables `--sg-`, JS globals PascalCase, DOM ids `sg-`
2. **Variable normalization**: Original variable names normalize to `--sg-*` per the table (primary/accent/ink/muted/subtle/line/paper/stage/soft...)
3. **Data separation**: Variable content goes through JSON; no hardcoded business copy/URLs in JS
4. **Three-tier responsive**: PC + WISE (<=500px) + extreme (<=320px)
5. **A11y**: tablist/tabpanel, dialog, aria-live, aria-label, ESC to close (as needed)
6. **Theme customizable**: All colors go through variables; no hardcoded `#hex` (`:root` and pure-black/white overlays are exceptions)
7. **Zero dependencies**: No external JS/CSS (font CDN is the exception)
8. **Docs complete**: README.md + docs/设计规范.md both present

## Benchmark Reference

When dismantling, target the quality of the hand-built BLACKPINK component library (provided by the user, as gold standard):
- `明星组合/组件库/README.md` - documentation structure template
- `明星组合/组件库/docs/设计规范.md` - spec doc template
- `明星组合/组件库/src/star-group.js` - rendering engine pattern (IIFE + el() + DEFAULTS + create/mount + _buildXxx)
- `明星组合/组件库/src/star-group.css` - parametric style pattern (:root vars + sg- prefix + three-tier responsive)

## Tool Layer (deterministic helpers, you call them)

### CLI Scripts (command-line invocation)

| Script | Purpose | When to call |
|---|---|---|
| `src/skill/scripts/analyze_html.py --minimal` | Extract theme color tokens + pattern recognition + structure list; auto-extracts from Tailwind config when `:root` is empty | Step 2, fetch reference data |
| `src/skill/scripts/validate_lib.py` | 8-item strong-constraint validation | Step 4 self-check |
| `scripts/roundtrip.py` | Roundtrip equivalence (rendered version vs reference + tag topology + class + text three-way comparison) | Step 4 self-check |
| `src/skill/scripts/adapt_output.py` | Output adapter: IIFE -> ESM/UMD / Web Component | Step 3, generate other forms as needed |
| `node --check` | JS syntax check | Step 4 self-check |
| `scripts/verify_all.py` | Batch verification (parallel + cache + incremental) | Regression tests |
| `src/skill/scripts/generate_showcase.py` | Extract design tokens from `src/*.css` and generate `showcase.html` design-system showcase page | After Step 3 output, before Step 4 |
| `src/skill/scripts/manifest_v1_to_uiir.py` | manifest v1 -> canonical UI-IR v2 (reads HTML/CSS, parses `@media`) | Step 2.5, experimental optional |
| `src/skill/scripts/uiir_to_compact.py` | canonical UI-IR -> compact agent observation (for first-pass understanding) | Step 2.5, experimental optional |
| `src/skill/scripts/generate_lib.py` | manifest.json -> component library scaffold (Jinja2 template lays out src/examples/docs) | **Optional scaffold, not main flow**. Agent hand-writes src by default to hit benchmark precision; use only when you need to quickly lay a baseline from manifest |

**verify_all.py P4 robustness capabilities**:
- **Parallel**: `--workers N` (default CPU cores); runs roundtrip across cases in parallel
- **Cache**: Reuses results when original HTML + lib hash unchanged (cold start 1.2s -> cached 0.04s, 29x speedup)
- **Incremental**: `--changed` only tests changed cases (hash comparison, skips unchanged)
- Usage: `python3 scripts/verify_all.py --lib-dir out` (full) / `--changed` (incremental) / `--clear-cache` (clear cache)

### Python Utility Functions (import from `ui_dismantler.core.common`, callable on demand during dismantling)

In Step 1 when understanding HTML or Step 2 when fetching reference data, you can write temporary Python snippets calling these deterministic functions to reduce guesswork:

| Function | Purpose | Example scenario |
|---|---|---|
| `infer_color_roles(css, var_name)` | Infer what role a `--var` is used as (text/background/border/shadow/icon-fill) | Confirm "is this color a text color or border color" during normalization |
| `query_rules(css, selector_contains, has_prop, prop_value_contains)` | Filter CSS rules by selector/property/value | Look up `.member`'s layout rules; find 3D tiers with `perspective` |
| `extract_data_contracts(scripts)` | Scan JS to extract a data-contract overview (var names/types/element counts/fields) | Know what data arrays the page has and their fields |
| `parse_color(value)` / `to_hex(rgba)` | Color value parsing and normalization | Convert `hsl(...)` to `#hex` to compare and dedupe |
| `extract_root_vars(css)` | Extract `:root` variables (supports `:root,.sg-frame` selector groups) | Get the theme color list |
| `split_media_blocks(css)` | Split `@media` blocks (distinguishes keyframes) | Understand responsive breakpoints |
| `extract_gradients(css)` | Extract gradients (supports nested `rgba()`) | Normalize colors inside gradients to `var()` |

Canonical tool source is in `src/ui_dismantler/`; `src/skill/scripts/` is the compatibility CLI layer; tests in `tests/` (run all via `python3 scripts/test.py`, 192 tests covering unit and browser-backed edge cases).

## Vertical Aggregation (optional, do after single-case dismantling is stable)

Multiple cases of the same vertical -> shared library + per-case variant configs:

1. Run Steps 1-5 independently for each case, producing each component library
2. Extract the common parts (theme color skeleton, Tab structure, rendering engine framework) into the vertical shared library
3. Each case's differences (theme color values, data fields, unique views) become variant configs layered on top
4. `src/skill/scripts/aggregate_vertical.py` can assist with merging (but the merge logic is led by you; the script only dedupes)

**Prerequisite**: Single-case dismantling capability must be stable (forward tests all pass) before doing vertical aggregation, otherwise you'd stack complexity on an unsteady base.

## Dependencies

- Python 3.9+ (`python3 -m pip install -r requirements.txt`); Playwright runtime observation is optional
- Node.js 18+ (for `node --check` and roundtrip.py's jsdom rendering)

**roundtrip renderer** (`scripts/_roundtrip_render.mjs`) capabilities and limits:
- Two modes: component-library mode (default, serializes `#mount` subtree) + reference mode (`--ref`, serializes `<body>` subtree)
- Multi-file support: auto-inlines all `<link>` CSS and `<script src>` JS (in document order)
- Stub injection: Tailwind/marked/dompurify/mermaid/localStorage/canvas getContext all stubbed, prevents crashes from missing external deps
- VirtualConsole: silences jsdom's "Not implemented" warnings
- Large JSON output: >40KB goes through a temp file (prevents pipe truncation)
- Limits: jsdom has no real layout engine (clientWidth=0), no canvas pixel rendering, limited support for Web Component connectedCallback timing

## Failure Handling

- `validate_lib.py` reports FAIL: revise the corresponding file per the prompt, rerun self-checks
- `roundtrip.py` low score: check the report's `missingTexts`/`missingNodes`, fill in missing content
- `node --check` syntax error: locate by line number and fix
- Tool script itself errors (not a validation failure): check Python deps, or read `tests/` to confirm tool behavior

## Reference Files

- `references/spec.md` - detailed spec for the 8 strong constraints + variable normalization mapping table
- `references/patterns.md` - structure-recognition features (decision rules for Tab/carousel/Modal etc., useful in Step 1 when understanding HTML)
- `references/manifest_schema.md` - manifest.json field definitions (Step 2 tool output)
- `references/uiir_v2_schema.json` - UI-IR v2 JSON Schema (Step 2.5, node/relation type enums)
- `docs/architecture/ui-ir-v2.md` - UI-IR v2 design doc and complete CLI examples (Step 2.5)
