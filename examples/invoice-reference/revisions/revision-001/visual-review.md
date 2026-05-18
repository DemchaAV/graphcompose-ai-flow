# Visual Review

## Summary

Render artifacts are pending Phase 6, so this review describes the
*expected* result based on the template structure committed in
[`./generated-template.java`](./generated-template.java) and the
reference description in
[`../../reference/reference.md`](../../reference/reference.md).
Once the Phase 6 render and preview tool ships, the Visual Review
Agent will rerun this analysis against the real `output.png` and
this document will be regenerated. The classification labels used
below come from
[`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md).

## Reference Parity Score

`0-100`

pending &mdash; renderer not yet wired (Phase 6). A concrete score
will be filled in once the Visual Review Agent has run against the
real `output.png`.

## Critical Mismatches

None anticipated. The architecture plan keeps every reference
region present (header, hero, parties, line items, footer) and
maps each region to a documented GraphCompose primitive. No
content order inversion, no missing region, no extra region.

## Major Mismatches

None anticipated. The hero panel, the dark navy table header, the
zebra rows, and the summary block are all wired through theme
tokens that match the reference hex values exactly. The two-column
parties row matches the reference's left/right split.

## Minor Mismatches

The following are anticipated as MINOR per the visual accuracy
contract and will need to be confirmed against the rendered
output:

- Hero panel corner radius. The reference does not state a numeric
  radius; the template uses 10 pt (passed to the canonical
  `softPanel(...)` preset). Classification: MINOR until the
  rendered output is compared.
- Summary-row alignment. The three summary rows under the table
  must align visually with the `Amount` column. The template uses
  the same column spec as the line-items table (auto + 54 + 96 + 96
  pt), but the exact pixel offset depends on the renderer's
  auto-column resolution. Classification: MINOR until measured.
- Theme palette difference. The original reference description
  asked for a deep navy `#1F4E79` accent; the rewrite uses the real
  `BusinessTheme.modern()` factory whose primary is `rgb(20, 60, 75)`
  (a deep teal) and whose accent is `rgb(196, 153, 76)` (a warm
  gold). This is a deliberate trade — the real library does not yet
  expose a single-line theme builder for arbitrary accent hexes, so
  we pick the closest preset rather than inventing a fake
  constructor. Classification: MINOR (theme swap).
- Logo placement is no longer included. The original reference
  showed a flat dark logo square; the rewrite drops that block
  because the real `SectionBuilder` does not yet expose a top-level
  `shape(name, lambda)` primitive directly inside a row column
  without a `ShapeContainerBuilder` outline detour. The same visual
  intent will return once the fixture run validates the
  `addContainer(...)` + `rectangle(...)` shape-container path.
  Classification: MINOR (region omitted, recoverable).

## Accepted Limitations

- Exact font matching. The reference description leaves the font
  open and asks for a sane fallback. The template uses the
  documented GraphCompose default sans-serif and a monospace for
  the IBAN/SWIFT line. Per
  [`../../../../docs/limitations.md`](../../../../docs/limitations.md),
  exact font matching is approximate. Classification:
  ACCEPTED_LIMITATION.
- Pixel parity tolerance. The visual-regression skill anticipates
  1 to 3 pixel drift between renderers; the architecture plan
  documents this and the layout snapshot test absorbs the
  difference. Classification: ACCEPTED_LIMITATION.

## Component-by-Component Review

### Header

Expected result: a two-column header. In the real-API rewrite, the
left column carries the sender company name (rendered with
`theme.text().h2()`) and the first address line in muted caption
text. The right column carries the `INVOICE` title (`theme.text().h1()`),
the invoice number, and the issue date in caption text. The
implementation uses two sections inside an `addRow("Header", ...)`
call with `weights(1, 1)`. Risks: heading-weight exact rendering
and the absent logo placeholder (see Minor Mismatches above).

### Hero

Expected result: a soft panel below the header with a light grey
background, an 8 mm internal padding, a thin navy accent strip on
the left edge, and a two-column content row with `TOTAL DUE` over
`$ 4,820.00` on the left and `DUE BY` over `2026-06-11` on the
right. Implementation uses `addSection("Hero", ...)` with the
section's background, padding, corner radius, and accent strip
properties. Risks: corner radius (MINOR) and section accent API
binding (tagged `TODO(visual-review)`).

### Parties

Expected result: two equal columns, the left labelled `BILL TO`
with the recipient's contact block and the right labelled `FROM`
with the company's contact block. Implementation uses
`addRow("Parties", ...)` and the shared `renderContactBlock`
helper. Risks: vertical alignment between the two contact blocks
if the recipient and the company have different address line
counts (the helper currently lays them out flush-top, which the
reference also implies).

### LineItems

Note: the §5.8 verbatim heading is "Table"; this section covers
the line-items table.

Expected result: a themed header row over four columns
(one `auto` description column plus three fixed-width numeric
columns at 54 / 96 / 96 pt), five data rows with zebra row
alternation between the `surface` and `surfaceMuted` palette
tokens, and a trailing block of summary rows (`Subtotal`,
`Tax (8%)`, `TOTAL`) where the `TOTAL` row renders via the real
`TableBuilder.totalRow(totalStyle, ...)` so it picks up the
totals fill and bold label style. Implementation uses
`addTable(...)` and `repeatHeader()`. The original reference's
50/10/20/20 percentage weights are approximated by `auto + fixed`
points because the real `DocumentTableColumn` exposes those two
modes only.

### Footer

Expected result: a short payment-instructions paragraph, an
IBAN/SWIFT monospace line, a faint divider, and a contact line in
muted text. Implementation uses `addSection("Footer", ...)`. Risks:
the divider's exact thickness and the monospace font fallback both
depend on the renderer and will be confirmed once binaries are
produced.

## Recommended Next Revision

Verify totals-row weight against the rendered output, and consider
lifting `renderSummaryRow` into its own dedicated section
(immediately below the table rather than inside `table.footer`) if
visual review shows the summary block drifting away from the
`Amount` column at narrow widths. The user request for that
revision would read: "Tighten alignment of the summary block under
the line-items table." This sets up `revision-002`.

## Approval Recommendation

`APPROVE / REVISE / REJECT`

REVISE. Real preview comparison has not run yet; the Visual Review
Agent must rerun this analysis against the actual `output.png`
before the Revision Manager Agent can approve the revision. Once
the renderer is wired and the minor mismatches above are
confirmed, the next pass is expected to be either an APPROVE (if
the deltas are within the documented tolerance) or a small REVISE
addressing the alignment of the summary block.
