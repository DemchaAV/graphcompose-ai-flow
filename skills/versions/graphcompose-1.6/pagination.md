---
skillId: pagination
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.6
status: needs-validation
lastValidated: 2026-06-01
---

# Pagination Skill

Use this skill when the document is expected to span more than one
page, when a table can overflow into another page, when headers and
footers must reappear on every page, or when certain blocks must not
be split mid-content. Pagination is owned by GraphCompose's page-flow
primitive — templates declare intent, the engine performs the breaks.

## When to load

Load this skill whenever any of the following is true for the
reference:

- the reference is multi-page or the data set is expected to produce
  more than one page at render time
- the reference contains a table whose row count is data-driven and
  could grow beyond a single page
- the reference shows the same header or footer on every page
- the reference shows a block (a totals card, a signed agreement
  panel) that should never split across pages
- the analyser flagged "pagination" as a visual risk in
  `visual-analysis.md`

If the reference is strictly single-page and the data is bounded,
load only [`layout-primitives`](layout-primitives.md) and skip this
skill.

## Core rule: let pageFlow handle page breaks

```text
Do not insert manual page breaks when the page-flow primitive can
compute them.
```

GraphCompose's page-flow primitive is the page-break authority.
Templates compose content into a flow and let the engine decide where
pages end. Manually computing page positions is a coordinate-soup
pattern and a defect under this workflow.

Manual page breaks may be acceptable in two narrow situations only:

1. The reference itself shows a forced break (for example "Terms and
   Conditions start on a new page") that is part of the document
   semantics, not the rendering. Express the intent explicitly, not as
   a coordinate hack.
2. A specific atomic block must start on a new page for legal or
   structural reasons. Same rule: express the intent.

Otherwise the engine handles breaks.

## Tables across pages

A table that overflows must:

- repeat its header on every page it appears on
- preserve column proportions across pages
- not produce a single-row fragment on the last page when the row is
  visually part of the block above it
- preserve any zebra-row colouring rhythm if the reference uses it

See [`tables`](tables.md) for the table-builder rules; this skill
covers only the pagination contract.

### Repeated table headers

Repeated headers are not "the header is duplicated". They are the
table header reappearing at the top of every page the table reaches.
The template declares the intent on the table primitive; the engine
draws the header on every continuation page.

A reference that shows the table header only on page 1 is unusual; in
that case the template must explicitly suppress repetition rather
than relying on rendering accident.

### Avoiding orphan rows

A one-row fragment on the last page (one line of the table, marooned
on its own page) is a `MAJOR` mismatch under
[`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
Mark the totals row or footer row as atomic with the preceding rows
when the reference reads them as one block. See atomic blocks below.

## Atomic blocks that must never split

Some blocks lose meaning when split:

- a totals card that summarises the table above it
- a signed agreement panel (signature line + name + date)
- a hero card that must appear whole
- a coloured panel whose surface visually anchors its content

Declare these blocks atomic. The page-flow primitive treats atomic
blocks as a unit: if the block does not fit on the current page, the
engine moves the whole block to the next page rather than splitting
it.

Do not declare entire sections atomic just to avoid thinking about
page flow — that produces giant ragged page bottoms. Atomicity is for
blocks whose meaning depends on visual cohesion.

## Headers and footers across pages

The header and footer of a paginated document are not normal content
rows. They reappear on every page through the page-flow primitive's
header and footer slots, not by being duplicated in the body.

Required behaviour:

- the header reappears on every page at the same vertical position
- the footer reappears on every page at the same vertical position
- page numbers, if shown, advance correctly
- the surface (background or panel) of the header and footer
  reappears as well, not just the text content

If the reference shows a different header on page 1 (a hero header
that only appears once), express that as a page-1-only header
override, not as a manual page break.

## Manual page breaks

A manual page break is acceptable when the reference itself shows the
break as part of the document's structure, not the rendering — for
example "Terms and Conditions begin on a new page". Express it as an
explicit break in the page flow, not as a position computed from
coordinates. The break belongs to the document semantics.

## Required visual checks across pages

Every multi-page revision must verify, on every page:

- the header reappears in the same position and at the same size
- the footer reappears in the same position and at the same size
- the table header reappears whenever the table continues on this
  page
- there is no orphan one-row fragment from the previous page's
  content
- no section title is chopped at the bottom of a page (the title
  must stay attached to its content)
- no atomic block is split across pages
- page numbers, if present, are correct on every page
- backgrounds and panels declared as page-wide redraw on every page
  the reference draws them on (see
  [`backgrounds-and-panels`](backgrounds-and-panels.md))

The Visual Review Agent must walk through these checks page by page,
not only on page 1.

## Pagination snapshot expectations

When the Test + Render Agent produces `layout-snapshot.json`, the
snapshot includes per-page boundaries. Pagination changes must be
visible in the snapshot diff between revisions; a "darker totals row"
revision should not produce a different page break unless that change
was intended.

## Common mistakes

1. **Computing the page height manually and inserting a break at a
   fixed y-coordinate.** Always wrong under this workflow. Use the
   page-flow primitive.
2. **Forgetting to declare repeated table headers.** Default
   behaviour varies; declare the intent explicitly.
3. **Declaring an entire section atomic.** Atomicity is for blocks
   whose meaning depends on visual cohesion, not for spilling-prone
   sections.
4. **Duplicating header content in the body** so it "reappears" on
   page 2. The header slot exists; use it.
5. **Treating an orphan totals row as acceptable** because "it's only
   one row". One marooned row is a `MAJOR` mismatch.

## Known limitations

- Differences in font metrics between renderers can shift the page
  break by a row or two. Document those as `MINOR` mismatches.
- Atomicity is local: a block declared atomic is treated as a unit on
  its own page, but the engine cannot infer atomicity across more
  than one block. Declare each atomic block explicitly.

## Cross-references

- [`tables`](tables.md) — table-builder rules; this skill only covers
  the pagination contract
- [`visual-regression`](visual-regression.md) — diffing rendered
  pages across revisions
- [`layout-primitives`](layout-primitives.md) — the row, section, and
  table primitives that compose the page flow
- [`backgrounds-and-panels`](backgrounds-and-panels.md) — page-wide
  surfaces that must redraw on every page
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  — classification of pagination defects
