# Orchestration Decision - revision-006

## Gesture

Continue autonomous visual iteration after `revision-005` visual review named
top-surface composition as the next layer.

## Routing

- Parent revision: `revision-005`
- Changed components: page-wide top band and content layering
- Agents required:
  - Architecture Mapper
  - Template Coder
  - Test + Render
  - Visual Review

## Decision

Try the GraphCompose semantic primitive that matches the visual relationship:
a `LayerStack` with a bottom page-surface layer and a top content layer. This
should place the dark band behind the cream sidebar card without raw drawing.

## Outcome

FAILED at render time. GraphCompose 1.6.0 rejects the content layer because it
contains the top-level `MainGrid` row while nested inside a stack layer.

Current usable draft remains `revision-005`.
