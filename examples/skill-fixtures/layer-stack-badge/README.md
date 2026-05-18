# Fixture: layer-stack-badge

The smallest possible exercise of `LayerStack` for the canonical
"badge on a card" pattern from the layer-stacks-and-overlays skill.
The fixture proves that a layer stack composes a lower content layer
and an upper badge layer with deliberate z-order.

## What it proves

- `LayerStack` is the supported primitive for composing genuinely
  overlapping elements
- the layer at the bottom of the stack is the content
- the layer at the top of the stack is the badge
- the layer order is explicit, not renderer-dependent
- the fixture does not abuse the layer stack for fake spacing or
  pseudo-borders (see the forbidden patterns in the skill)

## Skill files exercised

- [`skills/versions/graphcompose-1.6/layer-stacks-and-overlays.md`](../../../skills/versions/graphcompose-1.6/layer-stacks-and-overlays.md)
  — the "badge on a card" worked example, the z-index discipline
  paragraph, and the negative-margin / pseudo-border anti-patterns
  this fixture explicitly does not use.

## Shape

A one-page document with one section called `CardWithBadge`. The
section composes a `LayerStack` of two layers:

- **Layer 0 (bottom):** the card content. A nested section called
  `CardBody` holds the heading and the body text.
- **Layer 1 (top):** the badge. A small pill-shaped section called
  `NewBadge` carries the uppercase text "NEW", anchored to the
  top-right corner of the card.

The badge is a real semantic element. Removing it would change the
meaning of the card (the heuristic the skill calls out for valid
overlap), so the layer stack is the correct primitive.

## How to run

1. `cd examples/skill-fixtures/layer-stack-badge`
2. `mvn test`
3. inspect `expected-output/layout-snapshot.json` for the intended
   layer order, region shapes, and anchor

Phase 6 will additionally write `expected-output/output.pdf` and
`expected-output/output.png` on every run.

## Deferred checks

The JUnit test currently asserts only that `compose(...)` does not
throw. Three checks are pending the Phase 6 renderer and the Phase 7
visual-diff tool:

- layout-snapshot equality against
  `expected-output/layout-snapshot.json`
- PDF byte sanity (non-empty, valid header) on
  `expected-output/output.pdf`
- preview-image visual diff against a committed
  `expected-output/output.png` baseline
