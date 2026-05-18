# Reference description

A textual description of the target document. The Visual Analyzer Agent
would normally produce this from a `reference.png`; for the Phase 3
example it is written here so that downstream artifacts in
[`../revisions/`](../revisions/) can be reviewed without a binary input.

## Document at a glance

- Format: A4 portrait, 210 x 297 mm, white background.
- Margins: roughly 18 mm on every side.
- Single page, no header or footer chrome that repeats across pages
  (the document is one page long for this example).

## Visual hierarchy from top to bottom

1. **Header row** spanning the full width.
   - Left: a small dark square placeholder (40 x 40 mm) acting as a
     company logo with the company name "Northwind Trading Co." set in a
     medium-weight sans-serif beside it. A muted address line in smaller
     type sits under the company name.
   - Right: the word `INVOICE` in a large all-caps sans-serif heading,
     with the invoice number `INV-2026-0042` and issue date
     `2026-05-12` underneath in a smaller, lighter weight.

2. **Hero panel** below the header, soft panel with rounded corners.
   - Light grey background (`#F4F4F6`), 8 mm of internal padding.
   - Two-column layout: on the left, a label "TOTAL DUE" in small caps
     above a large amount `$ 4,820.00` in a bold weight. On the right, a
     "DUE BY" label above the date `2026-06-11`.
   - A thin accent strip on the left edge of the panel uses the primary
     accent colour (`#1F4E79`, a deep navy).

3. **Parties row**, two equal columns.
   - Left: "BILL TO" label, then a contact block — recipient name,
     company name, two address lines, country, an email.
   - Right: "FROM" label, then the sender's contact block in the same
     shape.

4. **Line items table** spanning the full content width.
   - Header row with dark navy background (`#1F4E79`) and white text.
   - Four columns: `Description` (about 50% width, left aligned),
     `Qty` (10%, right aligned), `Unit Price` (20%, right aligned),
     `Amount` (20%, right aligned).
   - Five product rows with light zebra striping (alternating white and
     `#F8F8FA`). Row height is comfortable for two-line descriptions.
   - Bottom block: three right-aligned summary rows for `Subtotal`,
     `Tax (8%)`, and `TOTAL`, with the `TOTAL` line in a heavier
     weight and a thin divider above it.

5. **Footer section** at the bottom of the page.
   - A short payment-instructions paragraph in regular body type.
   - An IBAN and SWIFT code in a monospace font on a single line.
   - A faint divider line above the contact line
     ("invoices@northwind.example | +1 555 0143").

## Colours referenced

- Primary accent: `#1F4E79` (deep navy)
- Soft panel background: `#F4F4F6`
- Zebra-stripe alternate: `#F8F8FA`
- Body text: `#1A1A1A`
- Muted text: `#6B6B6B`
- White: `#FFFFFF`

## Typography referenced

- Headings (`INVOICE`, "TOTAL DUE", "BILL TO", "FROM", table header):
  medium-weight sans-serif, slight letter spacing on the small-caps
  labels.
- Amounts and body: regular-weight sans-serif.
- IBAN / SWIFT line in footer: monospace.
- Exact font is not specified; the workflow expects to use a sane fallback
  and document the substitution in `visual-review.md`.

## Reusable patterns the analyzer should call out

- The hero panel and the line-items header share the same primary accent
  colour; they should be expressed as a theme token, not duplicated hex.
- The two contact blocks ("Bill To" and "From") share an identical shape;
  this is a reusable private render method.
- The three summary rows under the table share their shape with each
  other; another reusable render method.

## Unclear or ambiguous parts

- The exact corner radius of the hero panel is a guess; document the
  chosen value in `visual-review.md`.
- The reference does not show pagination, but the template should still
  configure the table to repeat its header if invoice data overflows in
  real use.
- The reference logo is a flat dark square; the template should treat it
  as a placeholder and document that the real logo image is supplied by
  the data layer.
