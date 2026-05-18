# Architecture Plan

Output of the Architecture Mapper Agent for `revision-001`. The
sections below follow the verbatim plan structure required by
`§5.5` of the project plan and re-stated in
[`../../../../docs/agents.md`](../../../../docs/agents.md#architecture-mapper-agent).

## Target GraphCompose Version

`1.6.0`, taken from
[`./version-resolution.md`](./version-resolution.md). The Template
Coder Agent must only use builders and tokens that the
`graphcompose-1.6` skill pack documents.

## Selected Skills

All 14 skills from the loaded pack
(`skills/versions/graphcompose-1.6/`):

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

`layer-stacks-and-overlays` and `shapes-and-containers` are loaded
even though the reference does not use overlays or strong shapes;
they are still consulted to make sure the Template Coder Agent
does not silently promote regions to a layer stack or a shape
container when the documented row, section, and table primitives
are enough.

## Document Structure

One `pageFlow` describing a single page in top-to-bottom order:

- Header &mdash; `addRow("Header", ...)`
- Hero &mdash; `addSection("Hero", ...)` rendered as a soft panel
  with rounded corners and a left accent strip
- Parties &mdash; `addRow("Parties", ...)` with two equal columns
- LineItems &mdash; `addTable("LineItems", ...)`
- Footer &mdash; `addSection("Footer", ...)`

The page-flow level carries a single `spacing` value that
approximates the visible gap between regions; per-section
overrides are not used in this revision. Pagination is not active
for this single-page reference, but the table is configured to
repeat its header if a real data load overflows the page, per the
`pagination` skill.

## Component Mapping

| Visual region | GraphCompose target |
|---|---|
| Header | `RowBuilder` via `addRow("Header", ...)` |
| Hero panel | `SectionBuilder` via `addSection("Hero", ...)`, soft panel background with accent strip |
| Parties row | `RowBuilder` via `addRow("Parties", ...)`, two equal columns each rendered with the shared `renderContactBlock` helper |
| Line items table | `TableBuilder` via `addTable("LineItems", ...)` with four columns and repeated header configured |
| Summary rows under table | reusable private render method `renderSummaryRow`, invoked three times for `Subtotal`, `Tax`, and `TOTAL` |
| Footer | `SectionBuilder` via `addSection("Footer", ...)` |
| Logo placeholder | shape container at the left of the header row (small dark square, 40 x 40 mm) &mdash; falls back to the dark fill when no image is supplied |

No layer stack and no canvas layer are required. The hero panel's
accent strip is expressed as a section accent on the section
background, not as an overlay.

## Theme Tokens

A `BusinessTheme` is constructed once per render with the
following tokens (semantic names per
`skills/versions/graphcompose-1.6/themes-and-colors.md`):

| Token | Value | Role |
|---|---|---|
| `accentPrimary` | `#1F4E79` | hero panel accent strip, table header background |
| `panelBackground` | `#F4F4F6` | hero panel background |
| `zebraAlternate` | `#F8F8FA` | alternate row background in the line-items table |
| `bodyText` | `#1A1A1A` | body type and amounts |
| `mutedText` | `#6B6B6B` | address line, secondary labels |
| `tableHeaderBackground` | same as `accentPrimary` | table header background |
| `tableHeaderText` | `#FFFFFF` | table header text colour |

Exact builder method names on `BusinessTheme` are part of the
Phase 4 validation fixtures. Until those land, the architecture
plan only commits to the *token names*; the Template Coder Agent
must consume them through the documented `BusinessTheme` surface
and must not invent new setters.

## Data Model Assumptions

A value object `InvoiceSpec` carrying:

- `invoiceNumber` &mdash; e.g. `INV-2026-0042`
- `issueDate` &mdash; e.g. `2026-05-12`
- `dueDate` &mdash; e.g. `2026-06-11`
- `totalDue` &mdash; e.g. a money value rendering as `$ 4,820.00`
- `subtotal`, `tax`, `total` &mdash; the three summary amounts
- `taxLabel` &mdash; e.g. `Tax (8%)` (locale-formatted by caller)
- `company` &mdash; a `Party` with name, address lines, country,
  email, optional logo reference
- `recipient` &mdash; a `Party` with the same shape as `company`
- `lineItems` &mdash; an ordered list of `LineItem` values, each
  with `description`, `quantity`, `unitPrice`, `amount`
- `paymentInstructions` &mdash; free-text paragraph for the footer
- `iban`, `swift` &mdash; strings shown in the footer monospace
  line
- `contactLine` &mdash; final footer line, e.g.
  `invoices@northwind.example | +1 555 0143`

`Party` and `LineItem` are nested value types; `Money` formatting
is the caller's responsibility (locale rules are out of scope for
the template).

## Template Class Shape

```text
public final class InvoiceTemplate implements DocumentTemplate<InvoiceSpec>
```

Render methods (all private):

- `renderHeader(RowBuilder row, InvoiceSpec spec)`
- `renderHero(SectionBuilder section, InvoiceSpec spec)`
- `renderParties(RowBuilder row, InvoiceSpec spec)`
- `renderLineItems(TableBuilder table, InvoiceSpec spec)`
- `renderFooter(SectionBuilder section, InvoiceSpec spec)`

Reusable helpers (also private):

- `renderContactBlock(SectionBuilder section, Party party, String label)`
  &mdash; used twice by `renderParties`, once per column
- `renderSummaryRow(SectionBuilder section, String label, String amount, boolean emphasised)`
  &mdash; used three times under the line-items table for
  `Subtotal`, `Tax`, and `TOTAL`

The `compose(DocumentSession document, InvoiceSpec spec)` method
contains only the `pageFlow` skeleton and delegates every region
to one of the methods above. This satisfies the componentization
requirement from
`skills/versions/graphcompose-1.6/graphcompose-basics.md` and the
selective rollback contract in
[`../../../../docs/rollback.md`](../../../../docs/rollback.md).

## Render Methods

- `renderHeader` &mdash; builds a two-column row. Left column hosts
  the logo shape container and a stacked title plus muted address
  line. Right column hosts the `INVOICE` heading and a stacked
  invoice number and issue date in muted weight.
- `renderHero` &mdash; configures the section as a soft panel with
  `panelBackground` background, a left accent strip in
  `accentPrimary`, and 8 mm of internal padding. Lays out two
  columns: `TOTAL DUE` over the formatted total on the left,
  `DUE BY` over the formatted due date on the right.
- `renderParties` &mdash; calls `renderContactBlock` twice, once
  for `recipient` with label `BILL TO`, once for `company` with
  label `FROM`. The two columns share the row's width equally.
- `renderLineItems` &mdash; declares the four columns with their
  proportions (50% / 10% / 20% / 20%), sets the header to use
  `tableHeaderBackground` and `tableHeaderText`, configures
  alternating row backgrounds (white / `zebraAlternate`), and
  appends every entry in `spec.lineItems`. Header repetition is
  enabled for pagination safety even though the example reference
  is one page.
- `renderFooter` &mdash; lays out the payment-instructions
  paragraph, the IBAN/SWIFT monospace line, a thin divider, and
  the contact line. Uses `mutedText` for the secondary content.
- `renderContactBlock` &mdash; builds a small section: small-caps
  label in heading weight, then party name, two address lines,
  country, email; `mutedText` is used for the address lines.
- `renderSummaryRow` &mdash; builds a right-aligned section with a
  label on the left of a narrow strip and the amount on the right;
  when `emphasised` is true (the `TOTAL` row), the row is rendered
  in heavier weight with a thin divider above it.

## Testing Plan

- Layout snapshot test &mdash; capture the layout produced by the
  template for a representative `InvoiceSpec` and compare against
  the committed [`./layout-snapshot.json`](./layout-snapshot.json).
- Visual regression test &mdash; deferred until a real
  `reference.png` exists. The test will compare `output.png` to
  `reference.png` and report differences
  per
  [`../../../../docs/visual-review-loop.md`](../../../../docs/visual-review-loop.md).
- Unit test for `InvoiceSpec` totals &mdash; assert that the
  subtotal plus the tax matches the stored total to within a
  tolerance, and that the line-item amounts sum to the subtotal.
  This guards against a data layer mistake silently propagating
  into a rendered invoice.

The first deliverable for `revision-001` is the smoke-level test
in [`./generated-test.java`](./generated-test.java): build a
sample `InvoiceSpec`, call `compose`, assert no exception. The
deferred checks above are listed as pending in the test header.

## Visual Risks

- exact font is not specified by the reference; a fallback
  sans-serif will be used and recorded in
  [`./visual-review.md`](./visual-review.md)
- exact corner radius of the hero panel is a guess; the chosen
  value is documented in the visual review
- line-item overflow on real data &mdash; the table is configured
  to repeat its header, but pagination has not been exercised
  against the verified fixtures yet
- locale formatting of amounts and dates &mdash; the template
  trusts the caller to pre-format `Money` and `Date` values; if
  the caller mis-formats, the visual review will catch it but the
  template will not
- summary-row alignment &mdash; the three summary rows under the
  table must visually align with the `Amount` column; the helper
  uses the same content width as the table but the exact builder
  method to lock the alignment is part of the Phase 4 validation
  scope

## Known Limitations

Per [`../../../../docs/limitations.md`](../../../../docs/limitations.md):

- exact font matching is approximate; the template uses the
  documented fallback rather than the reference's unknown font
- exact pixel parity depends on the renderer; the layout snapshot
  test is the primary regression check until the visual diff
  workflow lands in Phase 7
- the agent can only use APIs documented in the loaded skill pack;
  any uncertain method binding is marked with `TODO(visual-review)`
  in the generated Java rather than guessed
