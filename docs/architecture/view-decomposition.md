# View decomposition

`analyze` must produce component boundaries for pages that have no tabs, panels, or
semantic `<section>` markup — a landing page built from styled `div`s is the common case.
Three deterministic fallbacks exist, and all of them are inert when the page already yields
specialized detector views or two or more semantic sections.

## Heading-group sections

A **heading group** is an element that:

- is not `header`, `footer`, `nav`, `ul`, or `ol`;
- has at least three element children;
- has at least two children that contain an `h1` or `h2`;
- holds at least `max(800 chars, 10% of body text)`.

Every child of a heading group becomes a section when it contains an `h1`/`h2`, or carries
at least 250 characters of text, or exposes at least three controls. Nested groups are
expanded instead of being emitted as a single section, so a wrapper that contains research,
stats, and pricing yields four components rather than one. Picks are de-duplicated by
containment and sorted back into document order.

The pass runs only when no specialized view was detected **and** fewer than two semantic
sections exist. Pages that already decompose are untouched; this is verified against every
managed case (identical view selectors).

## Shell fallback

When heading groups are found, page shells are selected by link density instead of the
legacy first/last body block:

- a candidate needs at least three `a[href]` links;
- its text must stay below 25% of body text;
- it must not contain, or be contained by, any section.

The first qualifying element becomes `page-header`, the last becomes `page-footer`. This
avoids the failure where a single wrapper that holds the whole page is labelled both header
and footer.

## Overlay regions

Body-level elements that are not covered by a section or shell and expose at least two
controls become `page-overlay` views (text between 20 chars and 30% of body text). Cookie
banners, consent bars, and floating dialogs therefore own their interactions instead of
producing `unowned-interactions` planning errors.

## CSS budgets

`DEFAULT_MAX_CSS_BYTES` is 1.5 MB and `DEFAULT_MAX_STYLE_BYTES` is 1 MB. Single-file
snapshots commonly inline several hundred kilobytes of CSS; the previous 300 KB / 150 KB
budget truncated the tail of the stylesheet and silently dropped theme custom properties.
Truncation still applies above the new budgets and is reported as a warning, and explicit
`maxCssBytes` / `maxStyleBytes` options keep working for callers that need tighter bounds.
