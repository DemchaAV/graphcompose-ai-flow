# Architecture Plan

Output of the Architecture Mapper Agent for `revision-002`. This
plan is a delta against
[`../revision-001/architecture-plan.md`](../revision-001/architecture-plan.md);
sections that are unchanged from the parent revision point back at
the parent rather than being repeated in full.

## Target GraphCompose Version

`1.6.0`. Unchanged from the parent revision. The version pin is
inherited from
[`./version-resolution.md`](./version-resolution.md).

## Selected Skills

All 14 skills from the loaded pack
(`skills/versions/graphcompose-1.6/`), unchanged from the parent
revision:

1. `graphcompose-basics`
2. `visual-to-graphcompose-mapping`
3. `layout-primitives`
4. `tables`
5. `themes-and-colors`
6. `typography`
7. `spacing-and-alignment`
8. `backgrounds-and-panels`
9. `layer-stacks-and-overlays`
10. `shapes-and-containers`
11. `pagination`
12. `visual-regression`
13. `revision-discipline`
14. `troubleshooting`

The `tables` and `spacing-and-alignment` skills are the two that
the Template Coder Agent leans on hardest for this revision; both
recommend lifting summary blocks out of `table.footer(...)` when
the summary needs to mirror a specific column rather than fill the
table's whole content width.

## Document Structure

The `pageFlow` gains a new top-level region `Summary` placed
between `LineItems` and `Footer`:

- Header &mdash; `addRow("Header", ...)` (unchanged)
- Hero &mdash; `addSection("Hero", ...)` (unchanged)
- Parties &mdash; `addRow("Parties", ...)` (unchanged)
- LineItems &mdash; `addTable("LineItems", ...)` &mdash; no longer
  carries a `table.footer(...)` block
- **Summary &mdash; `addSection("Summary", ...)`** &mdash; new in
  this revision; lifts the three summary rows out of the table
  footer and right-aligns them under the `Amount` column
- Footer &mdash; `addSection("Footer", ...)` (unchanged)

`Summary` is introduced as a new region in this revision. The
`changedComponents` field in
[`./revision.json`](./revision.json) lists both `LineItems` (which
loses its footer block) and `Summary` (which gains the three rows).

## Component Mapping

Only the rows that change are shown here. For every other region,
see
[`../revision-001/architecture-plan.md#component-mapping`](../revision-001/architecture-plan.md).

| Visual region | GraphCompose target |
|---|---|
| Line items table | `TableBuilder` via `addTable("LineItems", ...)` with four columns and repeated header configured &mdash; **no longer carries a `table.footer(...)` block** |
| Summary rows under table | dedicated `addSection("Summary", ...)` in the page flow, populated by the new `renderSummaryBlock` helper; still calls `renderSummaryRow` three times for `Subtotal`, tax, and `TOTAL` |

## Theme Tokens

Unchanged. The token set committed in
[`../revision-001/architecture-plan.md#theme-tokens`](../revision-001/architecture-plan.md)
is still authoritative. No new tokens are introduced and no
existing token is repurposed.

## Data Model Assumptions

Unchanged. `InvoiceSpec`, `Party`, and `LineItem` keep the same
shape as in the parent revision; see
[`../revision-001/architecture-plan.md#data-model-assumptions`](../revision-001/architecture-plan.md).

## Template Class Shape

`InvoiceTemplate` still implements `DocumentTemplate<InvoiceSpec>`
with the same constructor and the same render-method signatures.
The delta is:

- `renderLineItems(TableBuilder table, InvoiceSpec spec)`
  &mdash; loses its `table.footer(...)` block. The body now ends
  after the line-item loop.
- `renderSummaryBlock(SectionBuilder section, InvoiceSpec spec)`
  &mdash; new private helper. Calls `renderSummaryRow` three
  times against the supplied section.

The other private methods (`renderHeader`, `renderHero`,
`renderParties`, `renderFooter`, `renderContactBlock`,
`renderSummaryRow`) are unchanged.

The `compose` method now reads:

```text
.addRow("Parties", row -> renderParties(row, spec))
.addTable("LineItems", table -> renderLineItems(table, spec))
.addSection("Summary", section -> renderSummaryBlock(section, spec))
.addSection("Footer", section -> renderFooter(section, spec))
```

## Render Methods

- `renderLineItems` &mdash; behaves as before except the trailing
  `table.footer(...)` block is removed. The line-item loop now
  terminates the method.
- `renderSummaryBlock` &mdash; configures the `Summary` section
  to right-align to the `Amount` column's edge by sharing the
  table's column proportions, then calls `renderSummaryRow` three
  times. The exact builder for the column-mirror binding is
  flagged with a `TODO(visual-review)` comment in the generated
  Java; the Phase 4 fixtures will pin down the verified method
  name. Until then, the helper documents the intent ("share the
  LineItems column proportions so the Subtotal / Tax / TOTAL rows
  sit under the Amount column") rather than guessing a builder
  signature.

## Testing Plan

- The unit smoke test in
  [`./generated-test.java`](./generated-test.java) still calls
  `compose(...)` on a sample `InvoiceSpec` and asserts that the
  call does not throw. This continues to pass.
- The layout snapshot at
  [`./layout-snapshot.json`](./layout-snapshot.json) is expected
  to change in the `LineItems` and `Summary` regions; an
  illustrative snapshot is committed reflecting the new shape.
- The visual regression test will need a fresh baseline once a real
  `reference.png` artifact is supplied.

## Visual Risks

The biggest risk in this revision is alignment between the Amount
column's right edge and the Summary section's right edge. The
helper uses the same proportions as the table, but the exact pixel
offset depends on the renderer's column-weight resolution. Until
the column-mirror binding is verified by the Phase 4 fixtures, the
risk is classified as MINOR in
[`./visual-review.md`](./visual-review.md) (downgraded from MAJOR
because the same content width is now declared by both the table
and the section). The corner-radius MINOR and the font
ACCEPTED_LIMITATION from the parent revision carry over unchanged.

## Known Limitations

The `column-mirror` binding between `Summary` and `LineItems`
shares the table's column proportions, but the exact builder
method is uncertain. The generated Java tags this with
`TODO(visual-review)`. The Phase 4 validation fixtures (see
[`../../../../docs/skill-validation.md`](../../../../docs/skill-validation.md))
will confirm the verified method name; until then, the limitation
is documented here and in the generated source so the next reader
does not have to discover it twice.

Other known limitations (exact font matching, exact pixel parity)
are inherited from the parent revision; see
[`../revision-001/architecture-plan.md#known-limitations`](../revision-001/architecture-plan.md).
