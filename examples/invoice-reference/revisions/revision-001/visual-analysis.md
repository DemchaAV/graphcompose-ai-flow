# Visual Analysis

## Page

- format: A4 portrait, 210 x 297 mm
- orientation: portrait
- margins: approximately 18 mm on every side
- background: solid white

## Layout Regions

- region 1: Header row spanning the full content width
- region 2: Hero panel below the header, soft rounded panel
- region 3: Parties row, two equal columns ("Bill To" and "From")
- region 4: Line items table spanning the full content width
- region 5: Footer section at the bottom of the page

## Visual Hierarchy

- primary: the monetary amounts &mdash; the large `$ 4,820.00`
  in the hero panel and the `TOTAL` row at the bottom of the line
  items table
- secondary: the section headings &mdash; the all-caps `INVOICE`
  on the header right, and the small-caps labels `TOTAL DUE`,
  `DUE BY`, `BILL TO`, `FROM`, and the table column headers
- supporting: body text in the contact blocks, the line item
  descriptions, the footer paragraph, and the date and identifier
  fields

## Components

- header: two-column row; left side carries a 40 x 40 mm dark
  square logo placeholder plus the company name "Northwind Trading
  Co." in a medium-weight sans-serif with a muted address line
  underneath; right side carries the word `INVOICE` in a large
  all-caps sans-serif heading with the invoice number
  `INV-2026-0042` and the issue date `2026-05-12` in lighter weight
  underneath
- hero: soft panel with rounded corners, light grey background
  (`#F4F4F6`), 8 mm of internal padding, a thin accent strip on the
  left edge in the deep navy primary accent (`#1F4E79`); two-column
  content with a `TOTAL DUE` label above a large amount on the left
  and a `DUE BY` label above the due date on the right
- table: line items table with a dark navy header (`#1F4E79`) and
  white header text; four columns &mdash; `Description` (~50% width,
  left aligned), `Qty` (~10%, right aligned), `Unit Price` (~20%,
  right aligned), `Amount` (~20%, right aligned); five product rows
  with light zebra striping (alternating white and `#F8F8FA`); a
  bottom block of three right-aligned summary rows for `Subtotal`,
  `Tax (8%)`, and `TOTAL`, with the `TOTAL` line set in heavier
  weight and a thin divider above it
- footer: a short payment-instructions paragraph in regular body
  type; an IBAN and SWIFT code rendered on a single line in a
  monospace font; a faint divider line above a final contact line
  ("invoices@northwind.example | +1 555 0143")

## Colors

- background: white `#FFFFFF`
- accent: deep navy `#1F4E79` (primary accent, used by the hero
  panel's left strip and the line-items table header)
- text: body text `#1A1A1A`, muted text `#6B6B6B`
- borders: no strong table border in the reference; the visible
  divisions come from the navy header and the zebra rows; a faint
  divider line appears above the footer contact row

## Typography

- title: the word `INVOICE` is set in a large all-caps medium-weight
  sans-serif with slight letter spacing
- headings: the small-caps labels `TOTAL DUE`, `DUE BY`, `BILL TO`,
  `FROM`, and the table column headers are also medium-weight
  sans-serif with slight letter spacing
- body: contact blocks and the footer paragraph use a regular-weight
  sans-serif
- table: the table body and summary rows use the same regular-weight
  sans-serif; the `TOTAL` summary row is set in heavier weight; the
  IBAN/SWIFT footer line is set in a monospace font

## Spacing

- outer margins: approximately 18 mm on every side
- section spacing: visible gap between header and hero, hero and
  parties row, parties row and line-items table, and line-items
  table and footer; in the architecture plan this is approximated
  by a single page-flow spacing token rather than per-section
  overrides
- table spacing: the line-items table uses comfortable row height
  sized for two-line descriptions; the summary block is
  right-aligned and visually tied to the table by a thin divider
  above the `TOTAL` line

## Reusable Patterns

- cards: the hero panel is the only card-like element; its rounded
  corners and accent strip make it a candidate for a section with a
  soft panel background and an accent token
- badges: none in the reference
- table rows: the line items table uses a zebra-striping pattern
  (alternating white and `#F8F8FA`) and a deep-navy header row; the
  zebra and the header share their colours with theme tokens, not
  with the hero panel's grey

The two contact blocks ("Bill To" and "From") share an identical
shape and should be expressed as a single reusable private render
method on the template. The three summary rows beneath the table
(`Subtotal`, `Tax (8%)`, `TOTAL`) share their row shape with each
other and are another reusable render method.

## Unclear Parts

- item: exact corner radius of the hero panel
  reason: the reference description does not state a numeric radius
  proposed assumption: pick a moderate value (around 4 mm) and
  document the chosen value in `visual-review.md`
- item: exact font for headings and body
  reason: the reference description explicitly leaves the font open
  and asks for a sane fallback
  proposed assumption: use the GraphCompose default sans-serif and
  record the substitution in `visual-review.md` per the typography
  skill
- item: behaviour of the logo placeholder
  reason: the reference shows a flat dark square, not a real logo
  proposed assumption: treat the logo as a placeholder supplied by
  the data layer; the template should accept an optional logo
  reference and fall back to the dark square when none is supplied
