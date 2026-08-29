---
skillId: backgrounds-and-panels
targetLibrary: GraphCompose
targetVersion: 1.9.x
verifiedAgainst: 1.9.0
status: needs-validation
lastValidated: 2026-06-07
---

# Backgrounds and Panels Skill

Use this skill when the visual reference contains coloured surfaces
that carry content: a tinted page, a section block on a light fill, a
soft card behind a paragraph, an accent strip in the header, or a
coloured band that separates two regions. The shared idea is that the
surface is part of the document structure — it groups, anchors, or
separates content — not a free-floating decoration.

## When to load

Load this skill whenever the
[`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md)
analysis lists any of the following on the reference:

- a coloured or textured page background
- a section that sits on its own coloured fill
- a panel or card around grouped text
- an accent strip aligned with a header, row, or section edge
- a horizontal coloured band separating two regions

If the reference only has overlapping decorations sitting on top of
otherwise plain content, switch to
[`layer-stacks-and-overlays`](layer-stacks-and-overlays.md) instead.
If the reference has rounded cards or clipped shapes that themselves
carry content, also load
[`shapes-and-containers`](shapes-and-containers.md).

## The surfaces

### Page background

A colour (or texture) that fills the whole page, edge to edge. Use the
**session-level** page-background API:

- `DocumentSession.pageBackground(color)` — a single full-page tint.
- `DocumentSession.pageBackgrounds(List<PageBackgroundFill>)` — one or
  more multi-column / partial-page fills (a pale sidebar column, an
  accent stripe, a top/bottom band) that repeat on every page.

It is purely declarative — it does not change layout, it composes
correctly with margins, headers, and footers, and the engine repeats it
on every page automatically.

It is **not** `pageFlow().fillColor(...)`, and **not** a `fillColor` on
a wrapper section, and never a giant rectangle drawn from a canvas
layer. The first two are *container fills* bounded by content height —
they stop short of the page bottom on short content (see
[Container fill vs page background](#container-fill-vs-page-background))
— and a canvas rectangle is opaque to pagination and snapshots.

Semantic intent: "the document itself is tinted".

### Section background

A coloured fill scoped to one semantic block. Apply `fillColor(...)` to
the section primitive that already groups the content
(`section.fillColor(...)`). The fill is bounded by the section's
laid-out content — exactly right for a block that wraps the content it
colours (a navy header plaque, a tinted summary box). Do not introduce
a wrapper panel just to colour a region you already have, and do not
try to stretch a section fill to cover the rest of the page: a page
tint is a page background, not a section fill (see
[Container fill vs page background](#container-fill-vs-page-background)).

Semantic intent: "this group of content has its own visual surface".

### Soft panel

A subtle fill — often near-white or pale grey — that groups a small
piece of content (a callout, an info note, a totals box) without
shouting. The implementation is the same as a section background; the
distinction is one of contrast: a panel is quiet, a section background
is part of the brand.

Semantic intent: "this content reads as a single quiet block".

### Card

A more pronounced surface that visually lifts content above the page.
A card may have a border, a stronger fill, or rounded corners — all
three stay on the flow builder: `softPanel(color, radius, padding)`, or
`fillColor(...)` with `cornerRadius(...)` and `padding(...)` when the
parts come from different tokens. The surface is bounded by what the
section laid out, so the card is as tall as its copy.

**Rounded corners are not a reason to leave the flow.** A shape
container sizes to the rectangle you declare, not to its content. Move
to [`shapes-and-containers`](shapes-and-containers.md) when the surface
is a shape a rectangle cannot express — a circle, a chevron, an SVG
path — or when you want a fixed band with layered children.

Semantic intent: "this is a distinct, raised object on the page".

### Accent strip

A thin coloured strip — usually a few millimetres tall — that runs
along the edge of a row, section, or header. The strip is part of the
section it accents; it should be expressed through the theme accent
of the section, not as a stand-alone bar layered on top.

Semantic intent: "this row is branded".

### Coloured band

A full-width horizontal band that separates two regions of the page.
A band is a section whose only content is its background; it can be
expressed as a thin section with the appropriate fill colour. It is
not a layer-stack element.

Semantic intent: "the document changes mode here".

### Soft panel with an outline (1.7.0)

A rounded, padded background that also needs a thin border used to
require a separate wrapping node. 1.7.0 adds stroke overloads on the
flow builder — `softPanel(color, radius, padding, stroke)` and
`softPanel(color, cornerRadius, padding, stroke)` — that apply a border
stroke alongside the fill on the **same** flow node (section, module,
page flow). It is equivalent to the always-available
`softPanel(...).stroke(...)` chain; the overload just makes the
one-node form discoverable. Prefer it over wrapping a filled section in
an extra bordered panel.

Semantic intent: "this quiet block has a fill and a hairline outline".

### Heading band — headingBar(...) (1.7.0)

A filled, rounded title band with a single label — the common "section
title on a coloured plaque" — is one call in 1.7.0:
`headingBar(String)` or `headingBar(String, Consumer<HeadingBarStyle>)`
on any flow / section / module. `HeadingBarStyle` tunes fill, corner
radius, padding, margin, label text style, alignment, and an optional
outline stroke; the default is a light-grey band with a centred bold
label, so `bar -> bar.fill(brand).textStyle(white)` is usually enough.
It is sugar over the `softPanel(...).addParagraph(...)` recipe — no new
node type — added as a child above the body. Reach for it instead of
hand-building a plaque, and source the fill from a theme token.

Semantic intent: "this region opens with a branded title bar".

## Container fill vs page background

Two different primitives produce a coloured surface, and choosing the
wrong one is the failure behind every "the fill doesn't reach the
bottom of the page" bug. Decide this **before** writing the fill.

- **Container fill** — `fillColor(...)` on a flow or section
  (`pageFlow().fillColor(...)`, `section.fillColor(...)`). The engine
  paints it over the **laid-out bounds of that container's content**.
  Correct for a section / panel / card / band that wraps the content it
  colours. WRONG for "tint the whole page": on content shorter than the
  page it stops where the content ends and leaves a blank strip down to
  the page bottom. A tail spacer that tries to "push" the fill to the
  bottom is the same mistake in disguise — it guesses content height and
  breaks the moment the data changes.
- **Page background** — `DocumentSession.pageBackground(color)`, or
  `DocumentSession.pageBackgrounds(List.of(PageBackgroundFill...))` for
  multi-column / partial-page fills. The engine splices these in at the
  bottom of the z-order (z=0) with geometry taken from the **canvas page
  size**, so they reach all four edges and repeat on every page
  automatically — independent of how much content the page carries.

**Decision rule:** if the surface must reach a **page edge** (full-page
tint, edge-to-edge sidebar column, a band that bleeds to top/bottom),
it is a **page background**. If the surface is bounded by the **content
it wraps**, it is a **container fill** on the section that owns that
content.

```java
// WRONG — container fill on the flow. Stops at content height and
// leaves a white strip at the page bottom on short pages.
document.pageFlow(page -> page.fillColor(CREAM)
        .addSection("Body", this::renderBody));

// RIGHT — page background. Cream reaches the bottom edge regardless of
// content height; sections (e.g. a navy header) paint on top of it.
document.pageBackground(CREAM);
document.pageFlow(page -> page
        .addSection("Header", this::renderNavyHeader)   // its own fillColor(NAVY)
        .addSection("Body",   this::renderBody));

// RIGHT — multi-column chrome (pale sidebar + white main) at full
// height, repeating on every page:
document.pageBackgrounds(List.of(
        PageBackgroundFill.leftColumn(0.36, SIDEBAR_FILL),
        PageBackgroundFill.rightColumn(0.64, MAIN_FILL)));
```

`PageBackgroundFill` ships factory methods for the common shapes:
`fullPage`, `leftColumn` / `rightColumn` / `column`, and
`topBand` / `bottomBand` / `band`. The library's own `SidebarPortrait`
preset paints its full-height sidebar exactly this way — mirror it
rather than giving the sidebar section a `fillColor`.

## Panel vs layer-stack overlay

The most common mistake in this area is reaching for a layer stack
when a panel would do. The distinction is one of role:

- a **panel** is a surface that carries content. The content lives
  inside it. Pagination, snapshots, and reflow respect the surface
  because the surface is part of the layout.
- a **layer-stack overlay** is decoration that sits on top of content
  the layout already arranged. The overlay does not carry the
  underlying content; it floats over it (badge, watermark, ornament).

If the surface is the parent of the content, it is a panel. If the
surface is a child painted on top, it is an overlay.

## Theme tokens

Backgrounds and panels are exactly the kind of surface that must come
from the theme. See [`themes-and-colors`](themes-and-colors.md) for
the token vocabulary. Required named tokens for this skill:

- page background colour
- panel background colour (the quiet fill)
- card background colour (the louder fill)
- accent colour for strips
- band background colour

Hardcoding hex values inside the template for these surfaces is a
defect — they must come from the theme so revisions can recolour the
document consistently.

## Common mistakes

1. **Using a container fill to tint the whole page.** This is the
   headline mistake. `pageFlow().fillColor(...)` (or a `fillColor` on a
   wrapper section, or a tail spacer that tries to "push" the fill down)
   is bounded by content height and leaves a blank strip at the page
   bottom whenever the content is shorter than the page. A full-page
   tint is `DocumentSession.pageBackground(...)`; a full-height column
   is `pageBackgrounds(...)`. See
   [Container fill vs page background](#container-fill-vs-page-background).
2. **Using a panel where a section background suffices.** If the
   content is already inside a section, give the section a background
   colour. Wrapping that section in an additional panel adds layout
   nesting without semantic meaning and makes diffs harder to read.
3. **Layering panels when one section background would do.** Two
   stacked panels with the same content cannot be diffed by a snapshot
   any better than one section background; they only add nesting.
4. **Drawing a coloured rectangle on a canvas layer instead of using
   the page background.** A canvas rectangle is opaque to the layout
   engine. Pagination, layout snapshots, and visual regression cannot
   reason about it. Use the page-background primitive.
5. **Putting an accent strip in a layer stack on top of a header
   row.** The strip belongs to the header section. Express it through
   the section's accent, not as a floating overlay.
6. **Hardcoding panel colours.** Use theme tokens so the colour
   substitutes cleanly when the brand palette changes.

## Required visual checks

- a full-bleed page tint or full-height column reaches all four page
  edges — including the **bottom edge on short content** (this requires
  a page background; a container fill or tail spacer will fail this)
- the surface starts and ends where the reference's surface starts
  and ends (no half-bleed, no cut corners)
- the surface respects page margins unless the reference clearly
  bleeds edge-to-edge
- the content sits inside the surface, not behind or over it
- pagination still draws the surface correctly on every page it
  appears on (cross-check [`pagination`](pagination.md))
- the surface colour comes from the theme

## Known limitations

- Exact colour reproduction depends on the renderer. Document
  substitutions in `visual-review.md` and tag them
  `ACCEPTED_LIMITATION` per
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
- Texture or gradient fills are not described by this skill. If the
  reference uses a gradient, treat it as a known limitation until a
  later skill version adds explicit gradient handling.

## Cross-references

- [`themes-and-colors`](themes-and-colors.md) — token vocabulary
- [`layer-stacks-and-overlays`](layer-stacks-and-overlays.md) — when
  the surface is decoration on top, not a panel
- [`shapes-and-containers`](shapes-and-containers.md) — rounded cards,
  clipped surfaces
- [`spacing-and-alignment`](spacing-and-alignment.md) — how padding
  inside panels relates to outer spacing
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  — mismatch classification for documented substitutions
