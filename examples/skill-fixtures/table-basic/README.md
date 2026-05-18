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
2. `mvn test`
3. inspect `expected-output/layout-snapshot.json` for the intended
   columns, header config, and data rows

Phase 6 will additionally write `expected-output/output.pdf` and
`expected-output/output.png` on every run.

## Deferred checks

The JUnit test currently asserts only that `compose(...)` does not
throw. Three checks are pending the Phase 6 renderer and the Phase 7
visual-diff tool:

- layout-snapshot equality against
  `expected-output/layout-snapshot.json`
- PDF byte sanity (non-empty, valid header) on
  `expected-output/output.pdf`
- preview-image visual diff against a committed
  `expected-output/output.png` baseline
