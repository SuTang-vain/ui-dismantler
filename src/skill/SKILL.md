---
name: html-to-component-lib
description: Dismantle a single HTML case page into a reusable component library (parametric CSS + rendering engine JS + data-driven examples + design spec docs). MUST USE when the user wants to turn an HTML case into a component library / reusable template / extract theme colors and interaction patterns, or mentions "dismantle HTML" / "extract components" / "make a component library" / "standardize for reuse" / "extract theme colors" / "extract interaction patterns" / 「拆解 HTML」「提取组件」「做成组件库」「规范化复用」「提取主题色」「提取交互模式」. Optional `profile` provides domain context only; output follows the sg-* strong-constraint spec.
---

# HTML -> Component Library Dismantling Skill

Dismantle a self-contained HTML case page (with inline `<style>`/`<script>`) into a structured, reusable, data-driven component library.

## Your Role (agent)

**You are the lead dismantler**, not a script dispatcher. Like an engineer reading source code, you must **understand** this HTML -- its theme color semantics, Tab/view structure, interaction patterns, data organization, responsive breakpoints -- and then **personally produce** the complete component library code. The Python scripts are just deterministic tools that help you fetch color values, validate constraints, and quantify equivalence; **understanding and creation are done by you**.

Benchmark quality: `benchmark/lib` (the domain-neutral benchmark library, 1346 lines, covering 6 patterns with complete A11y + design tokens + data-driven). The library you produce should match this quality bar, not just "it runs".

## When to Use

- The user provides an HTML file (or directory) and asks to "dismantle into a component library", "extract reusable template", or "standardize"
- The user asks to extract a page's theme colors / Tabs / interaction patterns / logic settings and freeze them for reuse
- The user provides an optional domain background; treat it as understanding context, don't write it as a core rule branch

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

### Step 2: Call Tools to Fetch Deterministic Data (reference only, not the sole basis)

```bash
python3 src/skill/scripts/analyze_html.py <html-path> --out <manifest.json> --minimal
```

`--minimal` mode quickly extracts theme color tokens + structure list + pattern recognition, as a **reference**.

**Pattern recognition** (`manifest.structure.views[].type`):

The tool recognizes **10 patterns** via a pluggable `ViewDetectorRegistry`. Each detector returns a `semantic_type` + `structural_type` + `confidence` + `evidence` tuple.

| Pattern | structural_type | Recognition signal | Typical case |
|---|---|---|---|
| `carousel-3d` | collection | carousel position class + `perspective` | carousel works |
| `cause-chain` | sequence | timeline-nav + causeChain/whatIf data | Huang Yueying, She Xiang-furen |
| `nav-panel` | content-region | nav + ≥2 triggers (data-p/data-tab) + ≥2 panels | Zhi-shang-tan-bing |
| `graph` | collection | svg lines / node class + graph JS data | Qingyu-nian, Xie-tianzi |
| `timeline` | sequence | timeline/tl-item class | glossary timeline |
| `member-grid` | collection | member-grid/member-list class | glossary member grid |
| `detail-panel` | content-region | detail-panel/aria-live:polite | profile panel |
| `quiz` | form | qz-body/quiz/opt class | quiz |
| `comparison` | content-region | whatif-card/cmp-btn class | comparison |
| `splash` | overlay | splash-cta/splash-opt class | splash unlock screen |

`cause-chain`/`nav-panel`/`graph` are **page-level patterns** (need a global view); `_analyze_views` runs the detector on the `body` as a whole and returns it as the single view when matched. The other 7 are panel-level patterns.

**View details extraction** (non-minimal mode, per view type):
- `cause-chain`: `hasTimelineNav` / `hasCauseChainData` / `hasWhatIf` / `navItems`
- `nav-panel`: `triggerCount` / `panelCount` / `triggers` (up to 10)
- `graph`: `hasSvg` / `nodeCount` / `dataSource` / `hasEdges`
  - `dataSource` identifies 6 data-source kinds (`uppercase-const` / `object-property` / `mount-options` / `mount-api` / `runtime-state` / `function-builder`)
- `quiz` / `comparison` / `splash` / `member-grid` / `timeline` / `carousel-3d` / `detail-panel`: pattern-specific fields (see `references/patterns.md`)

Notes:
- The tool's extracted theme color **semantics may be inaccurate** (it only matches variable-name patterns); you should correct the normalization based on your Step 1 understanding (e.g., map `--marker-primary` to `--sg-primary`, `--cause-color` to `--sg-accent`)
- The view types the tool recognizes may be incomplete; you must judge the true structure yourself
- Items flagged in `manifest.warnings[]` as unrecognized are your dismantling priorities

Tools are crutches; your understanding is your legs. The normalization mapping table is in `references/spec.md` Section 2.

### Step 3: Produce Component Library Files

In the user-specified directory (or `/tmp/<lib-name>/`), create the complete component library:

```
<lib-name>/
├── README.md                 Intro + quick start + API + data contract + theming
├── docs/设计规范.md           Theme color system / Tab structure / interaction patterns / logic settings / responsive
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

Benchmark against the `glossary.js` pattern (see `benchmark/lib/src/`):

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

Benchmark against the structure of `benchmark/lib/docs/设计规范.md`:
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
- `roundtrip.py`: defaults to rendered reference; when `reference.fallback=true`, fix the reference rendering or record the compatibility contract with `--reference-mode static`
- Runtime main threshold: overall ≥ 0.85 (structure ≥ 0.7, text ≥ 0.8)
- When the page has Tab/Dialog/form interactions, add `--scenarios <scenarios.json>`; each scenario must have assertions proving the state was actually reached

> Threshold basis: the benchmark library has roundtrip overall 0.99;
> agent dismantling (huang/zhi) 0.97+ GOLD;
> unsupported patterns (huang-yueying/zhi-shang-tan-bing generic fallback) naturally fall short and are lifted via agent dismantling.

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
| roundtrip text score <0.8 | Check report `text.missing`, missing real content (member roles/work titles etc.); `text.extra` is got-side noise (data-driven text like timeline years, not penalized) | Add missing text into `examples/<case>.html` options data; extra needs no action |
| roundtrip structure score <0.7 | Check `structure.node_match_rate` (with redundancy penalty); compare `node_recall`: high recall but low match_rate means `redundancy_penalty>0` (got nodes > 1.5× ref, redundant DOM); low `node_precision` also signals redundancy | Missing view layer (timeline/works not rendered) / nesting misaligned / modal not mounted -> add view; got redundant DOM (placeholder/debug containers) -> slim rendering, only output structures present in original HTML. The comparator already tolerates sg- prefix and class renames |

**Exit protocol**:
- All thresholds pass -> dismantling complete, report file paths + self-check results to the user
- Still not passing after 3 rounds -> stop revising, explain to the user: which items pass, which are short by how much, the gap reason (e.g., "Huang Yueying is a cause-chain pattern, currently unsupported and needs pattern extension"), and suggest next steps
- Each revision round only touches files related to the failed items, don't rewrite large swaths (to avoid regressions)

### Step 5: Revise (loop if not passing)

Locate revision points using the "Self-Check Decision Table" above. After fixing, rerun all self-checks (4a + 4b + 4c, all three). Loop until passing or hitting the 3-round cap.

## Key Constraints (see references/spec.md for details)

8 strong constraints, validated by `validate_lib.py`:

1. **Naming prefix**: CSS classes `sg-`, variables `--sg-`, JS globals PascalCase, DOM ids `sg-`
2. **Variable normalization**: Original variable names normalize to `--sg-*` per the table (primary/accent/ink/muted/subtle/line/paper/stage/soft...). Tailwind/Material Design 3 semantic colors are also covered (on-primary/on-secondary→on-accent/surface→paper/on-surface→ink/outline→line/primary-container→soft/...)
3. **Data separation**: Variable content goes through JSON; no hardcoded business copy/URLs in JS
4. **Three-tier responsive**: PC + WISE (<=500px) + extreme (<=320px)
5. **A11y**: tablist/tabpanel, dialog, aria-live, aria-label, ESC to close (as needed)
6. **Theme customizable**: All colors go through variables; no hardcoded `#hex` (`:root` and pure-black/white overlays are exceptions)
7. **Zero dependency**: No external JS/CSS (font CDN is the exception)
8. **Docs complete**: README.md + docs/设计规范.md both present

## Benchmark Reference

When dismantling, target the quality of the benchmark component library:
- `benchmark/lib/README.md` - documentation structure template
- `benchmark/lib/docs/设计规范.md` - spec doc template
- `benchmark/lib/src/glossary.js` - rendering engine pattern (IIFE + el() + DEFAULTS + create/mount + _buildXxx)
- `benchmark/lib/src/glossary.css` - parametric style pattern (:root vars + sg- prefix + three-tier responsive)

## Tool Layer (deterministic helpers, you call them)

### CLI Scripts (command-line invocation)

| Script | Purpose | When to call |
|---|---|---|
| `src/skill/scripts/analyze_html.py --minimal` | Extract theme color tokens + pattern recognition + structure list | Step 2, fetch reference data |
| `src/skill/scripts/validate_lib.py` | 8-item strong-constraint validation | Step 4 self-check |
| `scripts/roundtrip.py` | Roundtrip equivalence (rendered version vs reference + tag topology + class + text three-way comparison) | Step 4 self-check |
| `src/skill/scripts/adapt_output.py` | Output adapter: IIFE -> ESM/UMD / Web Component | Step 3, generate other forms as needed |
| `src/skill/scripts/generate_showcase.py` | Extract design tokens from `src/*.css` and generate `showcase.html` design-system showcase page | After Step 3 output, before Step 4 |
| `scripts/generate_scenarios.py` | Generate reviewable interaction-scenario candidates from manifest | Before Step 4, when page has interactions |
| `node --check` | JS syntax check | Step 4 self-check |
| `scripts/verify_all.py` | Batch verification (parallel + cache + incremental) | Regression tests |

**verify_all.py performance capabilities**:
- **Parallel**: `--workers N` (default CPU cores); runs roundtrip across cases in parallel
- **Cache**: Reuses results when original HTML + lib hash unchanged (cold start 1.8s -> cached 0.06s, ~28x speedup)
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

### Package Architecture

Canonical tool source lives in `src/ui_dismantler/` (layered Python package); `src/skill/scripts/` is the compatibility CLI layer (thin bridges ≤16 lines each); tests in `scripts/tests/` (run all via `python3 scripts/tests/run.py`, 296 tests covering unit + architecture-guard + interaction-matrix edge cases).

```
src/ui_dismantler/
├── core/common.py        # CSS parsing, color parsing, variable normalization
├── analysis/
│   ├── html.py           # HtmlAnalyzer (HTML -> manifest)
│   └── detectors.py      # ViewDetectorRegistry + 10 pattern detectors
├── generation/
│   ├── showcase.py       # design-token showcase page generator
│   └── adapt_output.py   # IIFE -> ESM/Web Component adapter
├── validation/library.py # 8-item strict-constraint validator
└── evaluation/
    ├── roundtrip.py      # roundtrip equivalence comparator
    ├── batch.py          # batch verification (parallel + cache)
    ├── scenario_coverage.py  # interaction coverage calculator
    └── scenario_generator.py # scenario candidate generator
```

Architecture guards (`scripts/tests/test_architecture.py`, 9 assertions) enforce layering: business modules must not contain CLI code (`argparse`/`sys.exit`/`def main()`); legacy entry points must be ≤16-line thin bridges; core package must never import the compatibility layer (cycle prevention).

## Domain Context and Experiment Boundaries

`--profile` can record the page's domain, helping the agent understand terminology, but cannot change the deterministic core algorithm. Domain-specific detectors must be inserted via the `ViewDetectorRegistry` and must simultaneously provide cross-page false-positive tests.

Multi-case aggregation, batch vertical generation, and domain assets are not part of this Skill's stable capabilities; they are explored on the `codex/vertical-case-experiments` branch. The stable quality line only accepts reproducible, cross-domain checks and regression samples.

## Dependencies

- Python 3.9+ (`beautifulsoup4`, user-level install: `pip install --user --break-system-packages beautifulsoup4`)
- Node.js 18+ (for `node --check` and `roundtrip.py`'s jsdom rendering)

**roundtrip renderer** (`scripts/_roundtrip_render.mjs`) capabilities and limits:
- Two modes: component-library mode (default, serializes `#mount` subtree) + reference mode (`--ref`, serializes `<body>` subtree)
- Multi-file support: auto-inlines all `<link>` CSS and `<script src>` JS (in document order)
- VirtualConsole: silences jsdom's "Not implemented" warnings
- Large JSON output: >40KB goes through a temp file (prevents pipe truncation)
- Limits: jsdom has no real layout engine (clientWidth=0), no canvas pixel rendering, limited support for Web Component connectedCallback timing

## Failure Handling

- `validate_lib.py` reports FAIL: revise the corresponding file per the prompt, rerun self-checks
- `roundtrip.py` low score: check the report's `missingTexts`/`missingNodes`, fill in missing content
- `node --check` syntax error: locate by line number and fix
- Tool script itself errors (not a validation failure): check Python deps, or read `scripts/tests/` to confirm tool behavior

## Reference Files

- `references/spec.md` - detailed spec for the 8 strong constraints + variable normalization mapping table
- `references/patterns.md` - structure-recognition features (decision rules for Tab/carousel/Modal/cause-chain/nav-panel/graph etc., useful in Step 1 when understanding HTML)
- `references/manifest_schema.md` - manifest.json field definitions (Step 2 tool output)
