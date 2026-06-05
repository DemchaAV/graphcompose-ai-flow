# Fixture: table-basic

Smallest possible exercise of `TableBuilder` with three columns,
header styling sourced from a `BusinessTheme`, zebra row alternation,
and two data rows. The fixture proves the canonical "invoice line
items" table shape works through `DocumentSession.compose(...)`.

## What it proves

- `DocumentSession.pageFlow(...).addTable(name, lambda)` produces a
  named table region
- `TableBuilder.column(name, weight, alignment)` accepts column
  weights that sum to 1.0 and a per-column alignment
- header background and header text colour are sourced from theme
  tokens (`tableHeaderBackground`, `tableHeaderText`)
- the zebra alternate fill is sourced from a theme token
  (`zebraAlternate`)
- a `TableBuilder.row(...)` lambda accepts the documented cell calls

## Skill files exercised

- [`skills/versions/graphcompose-1.6/tables.md`](../../../skills/versions/graphcompose-1.6/tables.md)
  — three columns, header styling, zebra rows, the "shared column
  meaning across rows" rule.
- [`skills/versions/graphcompose-1.6/themes-and-colors.md`](../../../skills/versions/graphcompose-1.6/themes-and-colors.md)
  — tokens (`tableHeader`, `tableRowAlt`, `borderMuted`) consumed by
  the table rather than scattered hex literals.

## Shape

A one-page document with one table called `LineItems`. The table has:

- three columns: `Description` (60%, left-aligned), `Qty` (15%,
  right-aligned), `Amount` (25%, right-aligned)
- a header row styled from theme tokens
- zebra rows alternating from `theme.zebraAlternate()`
- two illustrative data rows

The proportions and column meanings mirror the trimmed-down version
of the invoice line items table from
[`InvoiceTemplate`](../../invoice-reference/revisions/revision-001/generated-template.java),
without the per-page repeated-header behaviour (that lands in the
deferred `table-repeated-header` fixture together with the pagination
engine).

## How to run

1. `cd examples/skill-fixtures/table-basic`
2. `mvn test` — the JUnit smoke test; asserts `compose(...)` does not
   throw
3. inspect `expected-output/layout-snapshot.json` for the intended
   columns, header config, and data rows

The committed render baseline is captured separately from the JUnit
test. A no-arg
[`TableBasicFixtureDocument`](src/main/java/com/demcha/compose/document/fixtures/tablebasic/TableBasicFixtureDocument.java)
exposes the same `compose(DocumentSession)` the test exercises, and
`tools/preview-renderer` drives it to `expected-output/output.pdf` and
`output.png`. Run the loop from the repo root:

- `node scripts/validate-skills.mjs` — re-render and visual-diff the PNG
  against the committed baseline (expects `IDENTICAL`).
- `node scripts/validate-skills.mjs --update-baseline` — (re)capture the
  `expected-output/output.{pdf,png}` baseline.

## Checks

The JUnit test still asserts only that `compose(...)` does not throw. The
render and visual-diff now run through the `TableBasicFixtureDocument`
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
