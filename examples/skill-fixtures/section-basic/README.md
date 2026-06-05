# Fixture: section-basic

The smallest possible exercise of `SectionBuilder` with a soft panel
background and padding sourced from a `BusinessTheme` token. The
fixture proves that a section can carry both a styled background and
internal padding, and can hold a child text element.

## What it proves

- `DocumentSession.pageFlow(...).addSection(name, lambda)` produces a
  named section region
- `SectionBuilder.background(...)` accepts a colour token taken from a
  `BusinessTheme`
- `SectionBuilder.padding(int)` is a valid way to add internal padding
- a section composes a child text element without throwing

## Skill files exercised

- [`skills/versions/graphcompose-1.6/layout-primitives.md`](../../../skills/versions/graphcompose-1.6/layout-primitives.md)
  — the Section primitive and "semantically grouped block" branch of
  the decision flow.
- [`skills/versions/graphcompose-1.6/backgrounds-and-panels.md`](../../../skills/versions/graphcompose-1.6/backgrounds-and-panels.md)
  — the "soft panel" surface and the rule that the background lives on
  the section that already groups the content, not on a wrapper.

## Shape

A one-page document with one section called `Callout`. The section:

- carries a panel background from `theme.panelBackground()`
- has 8 mm of internal padding
- holds one body text element

The fixture is the canonical "info box" shape called out by the soft
panel section in the backgrounds-and-panels skill.

## How to run

1. `cd examples/skill-fixtures/section-basic`
2. `mvn test` — the JUnit smoke test; asserts `compose(...)` does not
   throw
3. inspect `expected-output/layout-snapshot.json` for the intended
   region shape, padding, and background token

The committed render baseline is captured separately from the JUnit
test. A no-arg
[`SectionBasicFixtureDocument`](src/main/java/com/demcha/compose/document/fixtures/sectionbasic/SectionBasicFixtureDocument.java)
exposes the same `compose(DocumentSession)` the test exercises, and
`tools/preview-renderer` drives it to `expected-output/output.pdf` and
`output.png`. Run the loop from the repo root:

- `node scripts/validate-skills.mjs` — re-render and visual-diff the PNG
  against the committed baseline (expects `IDENTICAL`).
- `node scripts/validate-skills.mjs --update-baseline` — (re)capture the
  `expected-output/output.{pdf,png}` baseline.

## Checks

The JUnit test still asserts only that `compose(...)` does not throw. The
render and visual-diff now run through the `SectionBasicFixtureDocument`
adapter and `node scripts/validate-skills.mjs`, not the test:

- preview-image visual diff against the committed
  `expected-output/output.png` — wired. `node scripts/validate-skills.mjs`
  re-renders via `tools/preview-renderer` and compares the PNG with
  `tools/visual-diff`, expecting `IDENTICAL` (AE == 0).
- rendered-output sanity — wired. The runner asserts the render produced a
  non-empty `output.pdf` and `output.png` (CI runs `--render-only`, since
  PNG rasterisation is platform-specific). Full PDF byte equality is
  intentionally skipped: PDFs carry timestamps, so parity is judged on the
  PNG.
- layout-snapshot equality against `expected-output/layout-snapshot.json`
  — still not enforced. `layout-snapshot.json` stays illustrative; it
  documents intent, not a measured engine run.

The captured baseline sizes and the `IDENTICAL` result for all five
fixtures are recorded in
[`../../../validation/reports/skill-render-validation-2026-06-03.md`](../../../validation/reports/skill-render-validation-2026-06-03.md).
