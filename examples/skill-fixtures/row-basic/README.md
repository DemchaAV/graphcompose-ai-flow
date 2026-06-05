# Fixture: row-basic

The smallest possible exercise of `RowBuilder`. The fixture proves that
a two-column row composed of two named child sections is valid
GraphCompose 1.6.0 API and that the row composes through a real
`DocumentSession`.

## What it proves

- `DocumentSession.pageFlow(...)` accepts a lambda that calls
  `addRow(name, lambda)` with a `RowBuilder` parameter
- `RowBuilder.addSection(name, lambda)` is the supported way to nest
  child sections inside a row
- a single `RowBuilder` can hold at least two named sections side by
  side without throwing during composition
- the labelled `addSection` calls produce regions whose names match
  the names asserted in the layout snapshot

## Skill files exercised

- [`skills/versions/graphcompose-1.6/layout-primitives.md`](../../../skills/versions/graphcompose-1.6/layout-primitives.md)
  — the Row section, including the "horizontal arrangement of
  unrelated items" branch of the decision flow.

## Shape

A one-page document with one row called `TwoColumn`. The row has two
named child sections:

- `LabelCol` on the left, intended for a short uppercase label
- `ValueCol` on the right, intended for the matching value

The fixture is deliberately minimal. The reusable `addSection` usage
inside `RowBuilder` mirrors how the
[`InvoiceTemplate` example](../../invoice-reference/revisions/revision-001/generated-template.java)
composes its `Header` row.

## How to run

1. `cd examples/skill-fixtures/row-basic`
2. `mvn test` — the JUnit smoke test; asserts `compose(...)` does not
   throw
3. inspect `expected-output/layout-snapshot.json` for the intended
   region shape

The committed render baseline is captured separately from the JUnit
test. A no-arg
[`RowBasicFixtureDocument`](src/main/java/com/demcha/compose/document/fixtures/rowbasic/RowBasicFixtureDocument.java)
exposes the same `compose(DocumentSession)` the test exercises, and
`tools/preview-renderer` drives it to `expected-output/output.pdf` and
`output.png`. Run the loop from the repo root:

- `node scripts/validate-skills.mjs` — re-render and visual-diff the PNG
  against the committed baseline (expects `IDENTICAL`).
- `node scripts/validate-skills.mjs --update-baseline` — (re)capture the
  `expected-output/output.{pdf,png}` baseline.

## Checks

The JUnit test still asserts only that `compose(...)` does not throw. The
render and visual-diff now run through the `RowBasicFixtureDocument`
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
The same three checks are noted in a comment block inside
[`RowBasicFixtureTest`](src/test/java/com/demcha/compose/document/fixtures/rowbasic/RowBasicFixtureTest.java).
