# Kezhongke page-shape fixtures

These self-contained fixtures are adapted from page and interaction shapes in:

`/Users/sutang/01_sutang/02_project/Kezhongke_web`

They intentionally remove remote Tailwind CDN, font, API, authentication, Mermaid, and shared-root runtime dependencies so regression tests stay portable and deterministic.

| Fixture | Reference shape | Main coverage |
|---|---|---|
| `auth-tabs` | `auth/index.html` | login/register tabs, form fill, password redaction, local validation |
| `article-search` | `article/index.html` + shared nav | search Enter flow, profile menu, Escape close, responsive media |
| `toc-reader` | `fangtan.html` | mobile TOC toggle, hash navigation, active state, responsive media |
| `journal-dynamic` | `journal/code.html` | delayed DOM creation, dynamic listener registration, detail reveal |
| `growth-filter` | `grow/code.html` | collection listeners, filtering, hidden/visible cards, reset |

Each HTML file has an adjacent `.scenarios.json` file consumed by `runtime_refs.observe_runtime_references`. The suite validates scenarios, assertions, candidate inventory, privacy-safe state transitions, static event references, and direct CSS `@media` extraction.
