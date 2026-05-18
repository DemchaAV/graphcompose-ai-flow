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
2. `mvn test`
3. inspect `expected-output/layout-snapshot.json` for the intended
   region shape

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

Each deferred check is listed in a comment block inside
[`RowBasicFixtureTest`](src/test/java/com/demcha/graphcompose/fixtures/rowBasic/RowBasicFixtureTest.java).
