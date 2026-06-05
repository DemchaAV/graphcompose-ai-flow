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
2. `mvn test` — the JUnit smoke test; asserts `compose(...)` does not
   throw
3. inspect `expected-output/layout-snapshot.json` for the intended
   layer order, region shapes, and anchor

The committed render baseline is captured separately from the JUnit
test. A no-arg
[`LayerStackBadgeFixtureDocument`](src/main/java/com/demcha/compose/document/fixtures/layerstackbadge/LayerStackBadgeFixtureDocument.java)
exposes the same `compose(DocumentSession)` the test exercises, and
`tools/preview-renderer` drives it to `expected-output/output.pdf` and
`output.png`. Run the loop from the repo root:

- `node scripts/validate-skills.mjs` — re-render and visual-diff the PNG
  against the committed baseline (expects `IDENTICAL`).
- `node scripts/validate-skills.mjs --update-baseline` — (re)capture the
  `expected-output/output.{pdf,png}` baseline.

## Checks

The JUnit test still asserts only that `compose(...)` does not throw. The
render and visual-diff now run through the `LayerStackBadgeFixtureDocument`
adapter and `node scripts/validate-skills.mjs`, not the test:

- preview-image visual diff against the committed
  `expected-output/output.png` — wired. `node scripts/validate-skills.mjs`
  re-renders via `tools/preview-renderer` and compares the PNG with
  `tools/visual-diff`, expecting `IDENTICAL` (AE == 0).
- rendered-output sanity — wired. The runner asserts the render produced a
  non-empty `output.pdf` and `output.png` (CI runs `--render-only`, since
  PNG rasterisation is platform-specific). Full PDF byte equality is
  intentionally skipped: PDFs carry timestamps, so parity is judged on the
  PNG.
- layout-snapshot equality against `expected-output/layout-snapshot.json`
  — still not enforced. `layout-snapshot.json` stays illustrative; it
  documents intent, not a measured engine run.

The captured baseline sizes and the `IDENTICAL` result for all five
fixtures are recorded in
[`../../../validation/reports/skill-render-validation-2026-06-03.md`](../../../validation/reports/skill-render-validation-2026-06-03.md).
