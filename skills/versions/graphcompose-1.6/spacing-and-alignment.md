---
skillId: spacing-and-alignment
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.0
status: needs-validation
lastValidated: 2026-05-18
---

# Spacing and Alignment Skill

Use this skill when deciding page margins, the gaps between
sections, the padding inside primitives, and the alignment grid
that holds a template together.

## Measuring reference page margins

Margins are the first thing to lock down because they constrain
every region inside the page. The Visual Analyzer Agent should
extract:

- top, bottom, left, and right margins from the reference image
- whether margins are visually symmetric or intentionally asymmetric
- whether there is a bleed area, an outer frame, or a printer-safe
  zone
- whether the reference is calibrated against a known page size
  (Letter, A4, custom)

Record the measurements in `visual-analysis.md` in millimeters or
points, not pixels. Pixel measurements depend on the reference's
DPI and do not survive into the template. Convert at analysis time
and use the converted values throughout.

## Internal gaps

Inside the page the template has several distinct kinds of gap.
Treat each one as a separate, named decision.

- Section spacing — the vertical gap between top-level regions
  (Header, Hero, Parties, LineItems, Footer). This is the rhythm of
  the document and should be constant unless the reference is
  visually asymmetric on purpose.
- Row gutters — the horizontal gap between cells of a row primitive
  (logo plus address plus QR). Gutters should be consistent inside
  a row; varied gutters usually indicate a missed sub-row or a
  shape container that absorbs spacing internally.
- Table padding — the inner padding inside table cells. Header
  padding is often larger than body padding. Document both.
- Component padding — padding inside a section, panel, or shape
  container. This is separate from the gap between components.

Each kind of gap must be named (see "Consistency rules" below) so
revisions like "make the rows tighter" can be applied to the right
token without touching unrelated spacing.

## Alignment grids and how primitives enforce them

Rows align their children horizontally; sections align their
children vertically. Both primitives expose alignment options that
should be the first tool reached for, not bespoke offsets.

- A row primitive aligns children along a shared baseline (top,
  center, baseline-of-text, or bottom). Use the alignment option
  rather than inserting blank space to fake vertical balance.
- A section primitive aligns children along a shared edge (left,
  right, center, or stretch). Use the section's alignment, not
  per-child padding hacks.
- When two adjacent regions must share a visual edge (a header
  bottom flush with a hero top), align them through the parent
  primitive rather than per-region padding fudges.

If the reference clearly uses a column grid (12 columns, 8 columns,
etc.), the template should express that grid through the row or
section primitives' widths. Do not pretend to have a grid by
measuring pixels and writing absolute positions; that re-enters
coordinate soup and breaks selective rollback.

## Consistency rules and spacing tokens

Use named tokens for repeated spacing the same way colors are
tokenized in [`themes-and-colors`](themes-and-colors.md). The token
name describes role, not value. A revision that says "more breathing
room between sections" should change one token, not dozens of
literals.

Suggested tokens:

- `gapSection` — vertical gap between top-level regions
- `gapRow` — vertical gap between sub-rows inside a section
- `gutterRow` — horizontal gap inside a row primitive
- `padTable` — inner padding for table cells
- `padPanel` — inner padding for sections and panels
- `padBadge` — inner padding for small overlay elements

Templates should declare these tokens once near the theme and
import them into every render method. Bare numeric literals in
compose code are a code smell.

## When to load

Load this skill any time:

- a new template's spacing is being defined
- a revision uses words like "tighter", "looser", "more breathing
  room", "more compact", "more spacious"
- alignment between two regions is being questioned in visual review
- the reference uses an obvious column grid

This skill chains with [`layout-primitives`](layout-primitives.md)
(for alignment options on the row and section primitives),
[`tables`](tables.md) (for cell padding), and
[`themes-and-colors`](themes-and-colors.md) (for the shared naming
discipline).

## Known limitations

- 1 to 3 pixel drift between renderers is normal. Classify it as
  `MINOR` per
  [`../../docs/visual-accuracy-contract.md`](../../docs/visual-accuracy-contract.md)
  unless it visibly breaks alignment (a column lands a pixel left
  of its neighbor, a footer overlaps the page bottom rule, etc.).
  Document the drift in `visual-review.md` so reviewers know it was
  observed and accepted.
- Sub-pixel placement of overlapping primitives (a badge over a
  card edge) may differ between renderers. Adjust the layer stack
  position by token, not by an arbitrary literal, and re-measure
  after rendering.
- When the reference's spacing is itself inconsistent (a hand-built
  mockup with stray gaps), the template should normalize the gaps
  through tokens rather than copy the inconsistency. Note the
  normalization in `visual-review.md`.

## Cross-references

- [`graphcompose-basics`](graphcompose-basics.md) for the place of
  layout in the semantic model
- [`layout-primitives`](layout-primitives.md) for the primitive
  alignment options
- [`tables`](tables.md) for cell padding and table-internal gaps
- [`themes-and-colors`](themes-and-colors.md) for the shared
  naming convention
- [`typography`](typography.md) for line-spacing decisions that
  interact with vertical rhythm
- [`../../docs/visual-accuracy-contract.md`](../../docs/visual-accuracy-contract.md)
  for spacing mismatch classification
