---
skillId: spacing-and-alignment
targetLibrary: GraphCompose
targetVersion: 1.7.x
verifiedAgainst: 1.7.0
status: needs-validation
lastValidated: 2026-06-07
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

Rows arrange their children horizontally (side by side); sections
stack their children vertically. Neither primitive exposes a
cross-axis alignment option in 1.7 — there is no row-level "centre
the children vertically" knob and no section-level "centre the
children horizontally" knob. (1.7.0 does add per-LINE vertical seating
of text — `verticalAlign(TextVerticalAlign)`, see "Vertical text
seating" below — but that is a paragraph control, not a row/section
child-alignment knob.) Reach for the right structural tool instead of
faking balance with blank space.

- A row places children along the horizontal axis by weight or
  width. It does NOT vertically align children of different heights
  — `RowBuilder` has no top / center / baseline / bottom option. To
  put an icon and a text label on a shared vertical axis, give them
  the same height, or wrap the pair in a shape container / layer
  stack and centre each layer with `.center(...)` / `LayerAlign`
  (see [`layer-stacks-and-overlays`](layer-stacks-and-overlays.md)
  and [`shapes-and-containers`](shapes-and-containers.md)).
- A section stacks children vertically at the content width. It has
  no left / right / center / stretch child-alignment option; a
  child's horizontal position comes from its own width and, for
  text, the paragraph's `TextAlign`. For a centred badge or label
  inside a box, use a shape container / layer-stack layer with a
  `LayerAlign` anchor, not a section option.
- When two adjacent regions must share a visual edge (a header
  bottom flush with a hero top), align them by matching their
  measured heights / widths and the parent gap, not by per-region
  padding fudges.

Note: 1.7 adds a per-line vertical-seating control on text. A single
line dropped into a taller box still sits on its font baseline by
default (`TextVerticalAlign.DEFAULT`), but
`ParagraphBuilder.verticalAlign(TextVerticalAlign)` now seats it by its
cap band — `TOP`, `CENTER`, or `BOTTOM` — within its line box. For a
label centred in a taller pill / `ShapeContainer`, combine
`verticalAlign(TextVerticalAlign.CENTER)` with a vertically-centred
layer placement (`.center(...)` / `.centerLeft(...)`) instead of
nudging the text with blank lines or padding lifts. The correction is
derived from font metrics (ascent, descent, leading, cap height), not a
magic number, and it is render-only — existing layouts are
byte-for-byte unchanged. See "Vertical text seating" below.

If the reference clearly uses a column grid (12 columns, 8 columns,
etc.), the template should express that grid through the row or
section primitives' widths. Do not pretend to have a grid by
measuring pixels and writing absolute positions; that re-enters
coordinate soup and breaks selective rollback.

## Vertical text seating (1.7.0)

This is the anchor-first answer to "my label sits low in its box".
Before 1.7.0 the only fix was to centre the whole text layer with a
shape-container / layer-stack `.center(...)`; the text itself always
sat on its font baseline. 1.7.0 adds
`ParagraphBuilder.verticalAlign(TextVerticalAlign)` (enum
`com.demcha.compose.document.node.TextVerticalAlign`):

- `TOP` — cap top to the box top
- `CENTER` — cap band centred in the line box
- `BOTTOM` — baseline to the box bottom
- `DEFAULT` — the pre-1.7.0 baseline seating (unchanged)

Use it as the in-paragraph complement to layer placement: a single
label in a taller `ShapeContainer` / `LayerStack` "pill" sits where you
ask when you pair `verticalAlign(CENTER)` with a centred layer anchor,
instead of a compensating offset hack. It is opt-in and render-only —
omit it and nothing changes. This belongs to the "anchors over
hand-computed offsets" principle: prefer the engine's vertical seating
over blank-line or padding fudges. See [`typography`](typography.md)
for the typographic side.

## Dashed dividers (1.7.0)

When a gap is marked by a rule rather than whitespace — a dashed
section divider, a cut-here line, a timeline connector — reach for
`LineBuilder.dashed(...)` (a dotted rule is `dashed(1, 4)`) rather than
a row of glyph characters. The primitive and its `DocumentDashPattern`
value type live in [`layout-primitives`](layout-primitives.md).

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
(for choosing the right primitive),
[`tables`](tables.md) (for cell padding), and
[`themes-and-colors`](themes-and-colors.md) (for the shared naming
discipline).

## Known limitations

- 1 to 3 pixel drift between renderers is normal. Classify it as
  `MINOR` per
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
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
- [`layout-primitives`](layout-primitives.md) for choosing the
  right primitive
- [`tables`](tables.md) for cell padding and table-internal gaps
- [`themes-and-colors`](themes-and-colors.md) for the shared
  naming convention
- [`typography`](typography.md) for line-spacing decisions that
  interact with vertical rhythm
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  for spacing mismatch classification
