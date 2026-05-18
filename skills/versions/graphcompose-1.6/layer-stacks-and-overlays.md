---
skillId: layer-stacks-and-overlays
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.0
status: needs-validation
lastValidated: 2026-05-18
---

# Layer Stacks and Overlays Skill

Use this skill when the visual reference has elements that genuinely
overlap: a badge sitting half-on, half-off a card; a watermark
behind body text; a decorative shape that crosses a panel boundary; a
label that breaks out of the row it labels. These are layer-stack
problems. They are not panel problems and they are not spacing
problems.

## When to load

Load this skill whenever the
[`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md)
analysis lists overlap. Concretely:

- a badge whose edge crosses the edge of a card or row
- a watermark drawn behind body content
- a decorative shape that visually sits in front of or behind a
  panel
- a label or callout that intentionally breaks out of its parent
- a stamp ("PAID", "DRAFT") drawn over content

If the surface carries the content rather than floating over it,
switch to [`backgrounds-and-panels`](backgrounds-and-panels.md). If
the visual is in the same plane as the content and you just need more
space, use [`spacing-and-alignment`](spacing-and-alignment.md) instead
— overlays are not a spacing tool.

## Genuine overlap vs faked spacing

A layer stack is the right tool only when the elements truly need to
share a region of the page. Two heuristics:

1. **Could the reference be reproduced by giving the underlying
   element more padding or a different alignment?** If yes, do that.
   It is not an overlap; the layer stack would be a hack.
2. **Does removing the overlapping element change the meaning?** A
   real badge ("NEW", a stamp, an order number) changes the meaning
   of the card. A fake "overlay" used to nudge a row into place does
   not.

If both checks point at "no real overlap", do not use a layer stack.
The layer stack adds rendering complexity, makes diffs noisier, and
hides intent from the visual-regression workflow.

## Z-index discipline

Layer order matters and must be deliberate:

- the layer at the bottom of the stack is the document content
- decorative overlays go above content unless they are watermarks
- watermarks go below content so text remains legible
- badges go on top of the card or row they belong to
- nothing in the stack should depend on the renderer drawing layers
  in a non-deterministic order

Document the intended layer order in `architecture-plan.md` whenever
more than two layers are present. The Visual Review Agent uses that
plan as ground truth when classifying overlay mismatches.

## Typical overlay shapes

### Badge on a card

A small pill or square that hangs partly off the corner of a card.
Compose it as a layer stack rooted on the card. The card is the lower
layer; the badge is the upper layer. Both are real layout objects;
neither is a coordinate-drawn ornament.

### Watermark

A faded brand element drawn behind body content. The watermark layer
sits below the content layer in the stack. The watermark must not
participate in pagination calculations; it is purely decorative.

### Decoration crossing a panel boundary

A shape that visibly straddles two regions — for example a tab that
sticks out of a panel top edge. The panel is the lower layer; the
shape is the upper layer. Do not split the shape into two clipped
halves; that is a coordinate hack.

### Stamp over content

A semi-transparent stamp ("PAID", "DRAFT", "VOID") drawn over a
finished page. The stamp is the topmost layer; it sits over every
other layer on the page.

## Bad vs good

### Good: badge on a card

```text
LayerStack rooted on the "InvoiceCard" section.

  Layer 1 (bottom): the card content (title, lines, totals).
  Layer 2 (top):    the "NEW" badge clipped to the card's top-right
                    corner.

Reason: the badge is a real, semantic element that overlaps the
card. It changes the meaning of the card and is referenced in the
visual analysis.
```

### Bad: fake spacing between two rows

```text
LayerStack with two rows positioned so that one is drawn slightly
over the other to "create breathing room".

Reason this is wrong: there is no genuine overlap. The two rows
are independent content. Using a layer stack here:

  - hides intent from the layout engine,
  - breaks pagination across the rows,
  - makes the layout snapshot misleading,
  - prevents selective rollback of either row.

Correct fix: arrange the rows in their parent container and adjust
the spacing primitive between them. See
spacing-and-alignment.md.
```

### Bad: layered panels to fake a card border

```text
LayerStack with a coloured panel below and a slightly smaller
white panel above to simulate a border.

Reason this is wrong: a border is not an overlap, and the
GraphCompose section primitive supports borders directly. The
layer stack adds two real layout objects where one suffices.

Correct fix: use the section's border on a single panel. See
backgrounds-and-panels.md.
```

## Avoiding fake-spacing hacks

The layer stack is the easiest primitive to abuse. Two specific
patterns are forbidden in templates produced under this workflow:

1. **Negative-margin emulation.** Stacking two content blocks to
   make them visually overlap when the layout intent is "they should
   be closer". Use spacing, not stacking.
2. **Pseudo-borders.** Stacking two panels of different sizes to
   imitate a border. Use the section border primitive.

Both patterns hide intent and silently break the rollback model.

## Required visual checks

- the overlap matches the reference: same anchor, same direction,
  similar protrusion
- nothing on the upper layer obscures critical text the reference
  leaves visible
- the layer order matches what `architecture-plan.md` describes
- pagination across pages preserves the overlay only where the
  reference repeats it
- the visual snapshot still passes after introducing the layer stack

## Known limitations

- Transparency, blending, and shadow rendering may differ between
  renderers. Tag those differences `ACCEPTED_LIMITATION` per
  [`../../docs/visual-accuracy-contract.md`](../../docs/visual-accuracy-contract.md).
- Very dense stacks (more than three meaningful layers) tend to be
  hard to diff. If the reference seems to demand one, list it as a
  visual risk in `architecture-plan.md`.

## Cross-references

- [`shapes-and-containers`](shapes-and-containers.md) — when the
  overlay is shape-based
- [`backgrounds-and-panels`](backgrounds-and-panels.md) — when the
  surface should carry content, not float over it
- [`layout-primitives`](layout-primitives.md) — the row, section,
  and table primitives that form the content layer
- [`spacing-and-alignment`](spacing-and-alignment.md) — the correct
  tool for "more breathing room"
- [`../../docs/visual-accuracy-contract.md`](../../docs/visual-accuracy-contract.md)
  — overlay-specific mismatch classification
