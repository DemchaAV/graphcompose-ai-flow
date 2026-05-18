---
skillId: backgrounds-and-panels
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.0
status: needs-validation
lastValidated: 2026-05-18
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

A colour or texture that fills the whole page. Use the page background
primitive on `pageFlow`, never a giant rectangle drawn from a canvas
layer. The page background is purely declarative — it does not change
layout — and it composes correctly with margins, headers, and footers.

Semantic intent: "the document itself is tinted".

### Section background

A coloured fill scoped to one semantic block. Apply it to the section
primitive that already groups the content. Do not introduce a wrapper
panel just to colour a region you already have.

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
A card may have a border, a stronger fill, or rounded corners. If the
corners are rounded, the implementation moves to a shape container —
see [`shapes-and-containers`](shapes-and-containers.md). If the card
is rectangular, the same section-background primitive is enough.

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

1. **Using a panel where a section background suffices.** If the
   content is already inside a section, give the section a background
   colour. Wrapping that section in an additional panel adds layout
   nesting without semantic meaning and makes diffs harder to read.
2. **Layering panels when one section background would do.** Two
   stacked panels with the same content cannot be diffed by a snapshot
   any better than one section background; they only add nesting.
3. **Drawing a coloured rectangle on a canvas layer instead of using
   the page background.** A canvas rectangle is opaque to the layout
   engine. Pagination, layout snapshots, and visual regression cannot
   reason about it. Use the page-background primitive.
4. **Putting an accent strip in a layer stack on top of a header
   row.** The strip belongs to the header section. Express it through
   the section's accent, not as a floating overlay.
5. **Hardcoding panel colours.** Use theme tokens so the colour
   substitutes cleanly when the brand palette changes.

## Required visual checks

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
