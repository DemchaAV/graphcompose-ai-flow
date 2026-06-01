# Architecture Plan

## Revision Goal

Solve the remaining top-surface mismatch with semantic layering.

## Proposed Structure

```text
PageSurfaceStack
  layer 0: PageSurfaceLayer
    TopDarkSurface      full-width dark band
    BodyPaperSurface    white page body
  layer 1: ContentLayer
    MainGrid            existing sidebar/main row
```

## Why LayerStack

The reference has a genuine overlap relationship: the cream sidebar card sits
over a dark top field. This is an overlay/surface relationship, not a spacing
problem, so `LayerStack` is the correct primitive to try before any fallback.

## Verified Blocker

The attempted structure compiles, but render fails:

```text
Row 'NoirCorporateCv[0]/PageSurfaceStack[0]/ContentLayer[1]/MainGrid[0]' cannot contain a nested horizontal row; use a section column instead.
```

The next architecture path needs either:

- a GraphCompose-supported way to put a row inside a stack layer, or
- a refactor that avoids `RowBuilder` inside the stacked content layer while
  preserving the two-column semantic layout.
