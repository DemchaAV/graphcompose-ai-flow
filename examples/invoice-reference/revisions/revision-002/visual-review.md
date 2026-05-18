# Visual Review

## Summary

Revision-002 lifts the three summary rows (`Subtotal`, `Tax (8%)`,
`TOTAL`) out of the line-items table (where revision-001 emitted
them inline via `TableBuilder.totalRow(...)`) and into a dedicated
`addSection("Summary", ...)` placed directly after `LineItems` in
the page flow. The Summary section composes its own 4-column inner
table that mirrors the `LineItems` column spec exactly
(`auto + 54 + 96 + 96` pt), so the totals end up under the `Amount`
column above.
Render artifacts now exist: [`./output.pdf`](./output.pdf) and
[`./output.png`](./output.png). This review is still provisional
because the example has a textual reference
[`../../reference/reference.md`](../../reference/reference.md) but no
committed `reference.png` baseline for pixel comparison. The
classification labels used below come from
[`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md).

## Reference Parity Score

`0-100`

pending &mdash; `output.png` exists, but no `reference.png` baseline
exists yet. A concrete score will be filled in once visual-diff can
compare two rendered images.

## Critical Mismatches

None anticipated. The architecture plan still keeps every reference
region present (header, hero, parties, line items, summary,
footer). The new `Summary` region is a structural reorganisation of
the rows that were previously inside `table.footer(...)`; the three
labels and the order are unchanged.

## Major Mismatches

None anticipated. The summary-row alignment risk that was flagged
as a concern in the parent revision's "Recommended Next Revision"
section is the subject of this revision. By lifting the rows into a
dedicated section that mirrors the table's column proportions, the
worst-case drift away from the `Amount` column is reduced; what
remains is classified as MINOR (see below) rather than MAJOR.

## Minor Mismatches

The following are anticipated as MINOR per the visual accuracy
contract and will need to be confirmed against the rendered
output:

- Hero panel corner radius. Carried over from
  [`../revision-001/visual-review.md`](../revision-001/visual-review.md);
  the template still uses approximately 4 mm and the reference
  does not state a numeric radius. Classification: MINOR until the
  rendered output is compared.
- Summary section right-edge alignment. The section builds its own
  inner table with the same `DocumentTableColumn` spec as the
  line-items table above (`auto + 54 + 96 + 96` pt), so the
  rightmost cell shares the `Amount` column's pixel position. The
  exact alignment still depends on the auto column's resolved
  width, which the renderer pins from the description widths in
  each table; if the two tables compute slightly different auto
  widths, the totals row will drift. Classification: MINOR, pending
  render (downgraded from the parent revision's MAJOR-risk reading
  because the section now declares the same column spec as the
  table).
- Theme palette difference. Carried over from
  [`../revision-001/visual-review.md`](../revision-001/visual-review.md);
  the rewrite uses `BusinessTheme.modern()` (deep teal + warm gold)
  rather than the reference's `#1F4E79` deep navy. Classification:
  MINOR (theme swap).

## Accepted Limitations

- Exact font matching. Carried over unchanged from
  [`../revision-001/visual-review.md`](../revision-001/visual-review.md).
  The reference description leaves the font open and asks for a
  sane fallback. Classification: ACCEPTED_LIMITATION.
- Pixel parity tolerance. Carried over unchanged from the parent
  revision. The visual-regression skill anticipates 1 to 3 pixel
  drift between renderers. Classification: ACCEPTED_LIMITATION.

## Component-by-Component Review

### Header

Unchanged from
[`../revision-001/visual-review.md#header`](../revision-001/visual-review.md#header).

### Hero

Unchanged from
[`../revision-001/visual-review.md#hero`](../revision-001/visual-review.md#hero).

### Parties

Unchanged from
[`../revision-001/visual-review.md#parties`](../revision-001/visual-review.md#parties).

### LineItems

Note: the §5.8 verbatim heading is "Table"; this section covers
the line-items table.

Expected result: dark navy header background with white text, four
columns at 50/10/20/20 proportions, five data rows with alternating
white and `#F8F8FA` backgrounds. **No trailing summary block** is
attached to this table in revision-002; the three summary rows now
live in their own region. Implementation uses
`addTable("LineItems", ...)` and ends after the line-item loop.
Risks: exact builder for repeated headers (tagged
`TODO(visual-review)`) and column-weight resolution at narrow page
widths.

### Summary

New region in revision-002. Expected result: three right-aligned
rows (`Subtotal`, `Tax (8%)`, `TOTAL`) sitting under the `Amount`
column of the line-items table, with the `TOTAL` row in heavier
weight and a thin divider above it. Implementation uses
`addSection("Summary", ...)` populated by the new
`renderSummaryBlock` helper, which in turn calls
`renderSummaryRow` three times. The section mirrors the line-items
column proportions so it shares the table's content-width grid
rather than re-deriving its own. Risks: the `column-mirror`
builder is uncertain (tagged `TODO(visual-review)` in the
template) and the rendered right-edge alignment between the
section and the `Amount` column is the primary observable to
verify against the committed preview.

### Footer

Unchanged from
[`../revision-001/visual-review.md#footer`](../revision-001/visual-review.md#footer).

## Recommended Next Revision

Verify that the `TOTAL` label weight matches the reference once a
reference image is available for comparison. In the same pass,
consider raising the divider stroke width above the `TOTAL` line by
approximately 1 point if the current divider looks weak in the
rendered preview. Both adjustments would stay inside
`renderSummaryBlock` and would not affect the page flow.

## Approval Recommendation

`APPROVE / REVISE / REJECT`

REVISE. A real preview now exists, but comparison against a
reference image has not run yet because `reference.png` is absent.
The Visual Review Agent must rerun this analysis against the actual
`output.png` and a real visual baseline before the Revision Manager
Agent can approve the revision. The structural change in
revision-002 directly addresses the parent revision's "Recommended
Next Revision" suggestion.
