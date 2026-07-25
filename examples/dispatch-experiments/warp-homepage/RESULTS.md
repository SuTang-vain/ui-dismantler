# Warp homepage dispatch experiment — 2026-07-25

## Conclusion

The current TypeScript pipeline successfully dismantles and retranslates the Warp SingleFile snapshot at strict Gold+ quality without weakening any thresholds.

| Gate | Result |
|---|---:|
| validation | **10/10 PASS** |
| planning | **9 components / 0 over budget / 138 owned / 0 unowned / ready=true** |
| DOM / text | **1.0 / 1.0** |
| initial viewport matrix | **4/4 PASS** |
| critical scenario matrix | **1/1 PASS** |
| formal scenarios | **1/1 PASS** |
| verified interaction coverage | **1.0** |
| selector coverage | **1.0** |
| worst computed style | **0.9983** |
| worst pixel diff | **0.000965** |
| navigation integrity | **1.0** |
| font alignment failures | **0** |
| runtime / stability / required resource failures | **0 / 0 / 0** |
| overall | **0.9992** |

Strict quality execution took **16.692s**. Browser work used one shared Chromium process, five isolated contexts, ten pages, four initial viewports, and one scenario viewport. Browser close took **0.347s** on the successful run.

## 1. Large-archive analysis complexity

The original analyzer ran at full CPU for **215.43s** without completing and was terminated. The root causes were repeated full-stylesheet scans for every custom property and repeated document-wide selector queries while generating stable selectors.

The optimized algorithm now:

- computes CSS custom-property usage and semantic roles in one stylesheet pass;
- caches stable selectors per element;
- caches candidate selector match counts per document;
- avoids repeated stable-selector generation for the same interaction.

The same Warp analysis now completes in approximately **4.3–4.8s** while preserving the full DOM/text model and the existing CSS/script analysis budgets.

## 2. Parser-backed selector and theme rewriting

The first generated library exposed a systemic bug: global string replacement rewrote tokens inside Tailwind arbitrary-value class selectors, for example selectors containing `var(--color-*)` or `#hex`. The DOM class remained unchanged while the CSS selector changed, causing large visual differences.

The transpiler now performs custom-property and color rewriting at CSS AST declaration/value level:

- class and ID selectors are rewritten only as selector nodes;
- custom-property declarations and `var()` references are rewritten only as CSS semantic nodes;
- hexadecimal colors are replaced only inside declaration values;
- arbitrary-value selector text is preserved;
- URL transport semantics remain untouched.

This moved the initial pixel difference from roughly **0.27** to below **0.001**.

## 3. Document-root context preservation

The source stores theme and font context on the document element. A mounted component previously lost:

- document root classes;
- `data-color-mode` and language attributes;
- inline custom-property references;
- dependent `:root` variables that require font variables defined by root classes.

The generated mount now:

- always adds `sg-library-host`;
- transfers prefixed document/body classes to the mount root;
- transfers relevant `lang`, `dir`, `data-*`, and `aria-*` attributes;
- rewrites inline custom properties and fragment references;
- adds `.sg-library-host` to `:root`/`:host` variable scopes.

After this correction, all 9 reference and generated FontFace records align and all 18 face states are loaded consistently per viewport.

## 4. Interaction responsibility for static snapshots

The snapshot contains 138 semantic controls but no executable application scripts. A naive model treated captured popover/dialog/menu controls as live user actions even though SingleFile had permanently hidden their targets with author `display:none !important` rules.

The responsibility model now uses source evidence rather than class-name whitelists:

- 69 reachable links are `navigation-action`;
- 68 disabled, inert, or persistently hidden controls are `no-op-control`;
- 1 reachable input remains `user-action`;
- no manual coverage waivers are needed.

The final strict coverage model is therefore:

```text
eligible interactions: 1
verified interactions: 1
verified coverage: 1.0
waivers: 0
```

The critical input scenario runs at its reviewed desktop viewport and uses an explicit screenshot anchor. Scenario viewport constraints prevent mobile-only or desktop-only controls from being incorrectly executed at incompatible viewports.

## 5. Renderer and browser-gate hardening

This case also produced three general fixes:

1. The JSDOM roundtrip renderer synchronously flushes JSON output before exit, preventing snapshots larger than 64 KiB from being truncated by pipe-backed stdout.
2. Selector mismatch hints no longer build unsafe regular expressions from arbitrary class tokens.
3. Static class alignment no longer fragments variant classes such as `sg-dark:hidden` into nonexistent base classes.

## 6. Performance assessment

Final transpilation telemetry:

| Phase | Time |
|---|---:|
| read/parse | 483.719ms |
| analyze maps | 79.753ms |
| rewrite | 113.569ms |
| write | 7.234ms |
| total | **684.315ms** |

Final strict quality telemetry:

| Phase | Time |
|---|---:|
| roundtrip | 2.330s |
| initial visual matrix | 9.133s |
| scenario state | 1.713s |
| scenario visual matrix | 2.369s |
| total | **16.692s** |

Chromium cleanup was not a bottleneck in the successful Warp run (`closeMs=347.218`). A previous `closeMs≈2.2s` occurred only after a 30-second failed actionability wait, so close profiling should distinguish normal cleanup from timeout-path cleanup rather than attributing all variance to browser shutdown.

## 7. Remaining limitations

- The source is a saved static snapshot, not the live Warp application; executable Next.js behavior is not present and must not be inferred.
- Resource localization is not evaluated separately because the SingleFile archive already embeds its primary visual resources.
- SPA router transitions still require a dedicated fixture with executable `history.pushState` / `replaceState` behavior; this snapshot is not a valid router sample.
