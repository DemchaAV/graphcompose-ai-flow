---
skillId: tables
targetLibrary: GraphCompose
targetVersion: 1.7.x
verifiedAgainst: 1.7.0
status: needs-validation
lastValidated: 2026-06-07
---

# Tables Skill

Use TableBuilder for all structured row/column content.

Do not recreate tables using manual text rows unless the reference is not semantically a table.

## Required visual checks

- number of columns matches reference
- column proportions match reference
- header styling matches reference
- row height is visually close
- borders match or are documented
- zebra rows match if present
- totals/footer row matches
- repeated headers are configured when content paginates

## When to load

Load this skill whenever the reference contains structured row and
column content. Typical triggers:

- invoice line items
- pricing tables, fee schedules
- comparison or feature tables
- transaction logs and schedules
- any region where columns have shared meaning across rows

It pairs with
[`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md)
(which decides that the region is a table at all),
[`layout-primitives`](layout-primitives.md) (which separates tables
from rows or sections), and
[`themes-and-colors`](themes-and-colors.md) (for header/zebra colors
that must flow through theme tokens).

## When NOT to use TableBuilder

Not every grid of content is a table. The table primitive must not
be forced on regions that are not semantically tabular. Use rows,
sections, or shape containers instead in these cases.

- Decorative grid of icons or logos with no shared column meaning.
  Each cell is independent and the grid is for visual rhythm; use
  rows or a section with repeated render methods.
- Image collage or photo gallery. Use a section that lays out a
  sequence of figures, or per-cell shape containers when the cells
  are rounded.
- Free-form key-value list outside a real table — for example, a
  small "From / To / Date" block in an invoice header. This is a
  row of labelled fields, not a table.
- Single-row arrangements (logo plus address plus QR). Use a row.
- Side-by-side panels with different internal structure. Use a row
  of sections; the panels do not share column meaning.

When in doubt, ask: "Do the rows share the meaning of each column?"
If yes, it is a table. If no, it is not.

## Pagination expectations

Tables are the primary source of multi-page content in templates.
When a table can paginate, the template must:

- preserve the header row on each new page
- avoid mid-row page breaks where possible
- keep totals or footer rows attached to the last data section
  visually
- document any pagination-only artefacts in `visual-review.md`

The detailed pagination contract — `pageFlow` integration, atomic
blocks, repeated headers, and per-page visual checks — lives in the
parallel-lane `pagination.md`. Cross-link to that file from the
architecture plan whenever the table is expected to overflow one
page.

## Theme alignment

Tables consume theme tokens for header background, row backgrounds,
borders, and totals. Do not hardcode hex values inside the table
render method. Use the named tokens described in
[`themes-and-colors`](themes-and-colors.md): for example,
`tableHeader`, `tableRowAlt`, and `borderMuted`. This keeps the
table consistent with the rest of the template and lets a theme
swap propagate everywhere.

## Known limitations

- Exact pixel proportions for column widths may require manual
  tuning. The library aims for visual fidelity, not pixel-exact
  reproduction, and 1 to 3 pixel drift between renderers is normal.
  Document any deliberate proportion adjustments in
  `visual-review.md` and classify them per the rules in
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
- Complex cell content (icons inline with text, nested badges) may
  need a per-cell render method rather than a plain string. Treat
  the cell content as its own miniature semantic block and reach
  for the same primitive decision flow described in
  [`layout-primitives`](layout-primitives.md).
- Cross-page totals, running balances, and merged cells require
  careful handling. If the verified examples for 1.7.0 do not show
  the exact pattern needed, mark the requirement as a Visual Risk
  in `architecture-plan.md` and document substitutions in
  `visual-review.md` rather than inventing API surface.

When library behavior diverges from anything written here, the
library is the source of truth. File a skill fix report per
[`../../../docs/skill-validation.md`](../../../docs/skill-validation.md)
and do not silently patch around the skill.

## Cross-references

- [`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md)
  for the upstream decision that a region is a table
- [`layout-primitives`](layout-primitives.md) for the broader
  primitive selection rules
- [`themes-and-colors`](themes-and-colors.md) for header and zebra
  styling tokens
- [`typography`](typography.md) for table cell font choices
- [`spacing-and-alignment`](spacing-and-alignment.md) for padding
  and gutters inside cells
- parallel-lane `pagination.md` for multi-page table behavior
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  for the parity contract that table reviews must satisfy
