---
skillId: shapes-and-containers
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.6
status: needs-validation
lastValidated: 2026-06-01
---

# Shapes and Containers Skill

Use this skill when the visual reference contains shaped regions that
carry content: rounded cards, circles around avatars or icons,
ellipses framing a highlight, pills behind status labels, clipped
image areas. Shape containers are the GraphCompose primitive for
"content lives inside a non-rectangular region".

## When to load

Load this skill whenever the
[`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md)
analysis lists any of the following on the reference:

- a rectangular block with visibly rounded corners
- a circle or ellipse used as a container for an avatar, icon, or
  number
- a pill-shaped badge that holds text inside its shape
- a clipped image area (rounded, circular, or otherwise non-rectangular)
- any region whose outline is not a plain rectangle but which still
  holds content

If the shape is only decoration sitting on top of unrelated content,
switch to [`layer-stacks-and-overlays`](layer-stacks-and-overlays.md)
instead. If the shape is a flat coloured rectangle with no rounding,
use [`backgrounds-and-panels`](backgrounds-and-panels.md).

## The container shapes

### Rounded card

A rectangular content surface with rounded corners. The shape
container clips the inner content and provides the rounded outline.
Use it whenever the reference's corner radius is visibly non-zero.

### Circle

A circular container, typically holding an avatar, an icon, or a
single character or number. The container clips the inner content to
a circle.

### Ellipse

An elongated circular container, used for highlights or single-line
labels that read as oval rather than pill-shaped.

### Pill

A capsule-shaped container, common for status badges. A pill is a
rounded rectangle whose corner radius equals half its height.

### Clipped image area

A non-rectangular outline that clips a contained image. The image is
inside the container; the container provides the silhouette.

## Shape container vs canvas layer — decision rule

This is the most important rule in this skill.

```text
Use a shape container when the shape CARRIES content.

Use a canvas layer (last resort) when the shape is PURE decoration
and cannot be expressed with any other primitive.
```

A rounded card with a title and lines inside it is a shape container,
not a canvas drawing. A circle around a "1" in a numbered list is a
shape container, not a circle drawn with raw geometry. A subtle dot
pattern in a corner with no content inside it is decoration; if no
other primitive fits, that — and only that — may go on a canvas
layer.

The rule exists because canvas layers are opaque to:

- layout snapshots (the snapshot cannot reason about what is inside
  the shape)
- pagination (the canvas layer does not flow)
- selective rollback (a canvas-painted "card" cannot be swapped
  component-for-component)
- visual review (the review tooling treats the canvas region as a
  single decorative blob)

Every shape that carries content must be expressed as a container so
that the surrounding workflow can reason about it.

## Shape-as-container thinking

When mapping a reference, write the shape as the parent and the
content as the child:

```text
Container: rounded card
  Content: title row, body section, totals row

Container: circle (avatar)
  Content: image, or single initial character

Container: pill (status badge)
  Content: status text
```

If the analysis ends up with the shape on one side of the page and
the content on another (or in a different layer), the mapping is
wrong. Either the shape is decoration (and is therefore an overlay,
not a container) or the content belongs inside the shape.

## Child placement inside shapes

For content that belongs inside a shape, use the shape container's
placement API rather than placing a sibling node nearby.

Verified patterns include:

```java
section.addCircle(118, DEEP_TEAL, circle -> circle
        .center(label("GC", style)));
```

```java
section.addContainer(card -> card
        .roundedRect(178, 112, 16)
        .clipPolicy(ClipPolicy.CLIP_PATH)
        .center(cardCopy())
        .position(label("NEW", style), -6, 5, LayerAlign.TOP_RIGHT));
```

Use `.center(...)` when the child is centered in the shape, and
`.position(..., LayerAlign.X)` or a shape-specific anchor helper when
the child is anchored to a shape edge or corner.

Do not render a shape and then place its text/icon/image as a sibling
paragraph with a negative margin. That breaks component ownership,
rollback semantics, and layout snapshots even when the preview looks
close.

## Clipping

Shape containers clip their content to the shape outline. The
implications matter:

- text that would extend past the shape outline is clipped, not
  reflowed. Provide enough room inside the container.
- images placed inside a circle or ellipse container will be clipped
  to that outline. Use the container shape to express that intent
  rather than pre-clipping the image externally.
- nested shape containers compose: a rounded card containing a
  circular avatar is two containers, not one canvas drawing.

## Required visual checks

- the corner radius visually matches the reference
- the content sits inside the shape, never bleeding through the
  outline
- circular containers stay circular when the inner content changes
  size (do not let inner content stretch the container into an
  ellipse unless the reference is itself an ellipse)
- clipping is symmetric where the reference is symmetric
- pagination does not split a shape container mid-shape — see
  [`pagination`](pagination.md) on atomic blocks
- snapshots and visual regression diffs still pass

## Known limitations

- Rendering of exotic clip paths (complex polygons, custom curves)
  may differ across renderers. Document those differences in
  `visual-review.md` and tag them `ACCEPTED_LIMITATION` per
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
- Anti-aliasing on rounded corners is renderer-dependent. Tiny
  differences (sub-millimetre fringes) usually fall under `MINOR`
  unless the brand explicitly demands a specific corner treatment.
- Shadows, glows, and stroke effects on shapes are not described by
  this skill. If the reference uses them and no other primitive
  applies, list them as visual risks in `architecture-plan.md` and
  document them as accepted limitations until a later skill version
  covers them.

## Common mistakes

1. **Drawing the card outline on a canvas layer and placing the
   content next to it.** The content is not inside the shape; the
   shape is decoration. Use a shape container instead.
2. **Using a layer stack to fake a rounded card.** Layering a smaller
   panel over a larger rounded rectangle does not produce a
   container. Use a shape container.
3. **Clipping the image externally before placing it in a rectangular
   panel.** This loses the semantic "image inside a circle". Use a
   circular container.
4. **Allowing inner content to deform a circle into an ellipse.**
   Constrain the container; resize the content.
5. **Rendering shape-owned content as a sibling overlay.** If a
   circle contains initials, the initials are a child of the circle
   via `.center(...)`; they are not a later paragraph pulled upward
   with a negative margin.

## Cross-references

- [`backgrounds-and-panels`](backgrounds-and-panels.md) — when the
  surface is rectangular
- [`layer-stacks-and-overlays`](layer-stacks-and-overlays.md) — when
  the shape is decoration on top of unrelated content
- [`layout-primitives`](layout-primitives.md) — the row, section, and
  table primitives that go inside containers
- [`pagination`](pagination.md) — atomic-block behaviour for shaped
  containers across page breaks
- [`visual-regression`](visual-regression.md) — renderer-specific
  shape differences are documented here
