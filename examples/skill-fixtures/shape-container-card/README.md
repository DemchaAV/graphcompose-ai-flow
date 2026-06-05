# Fixture: shape-container-card

The smallest possible exercise of the rounded-card shape container
from the shapes-and-containers skill. The fixture proves that a
rounded shape container holding a heading and body text composes
through `DocumentSession.compose(...)`.

## What it proves

- the shape container primitive carries content (a heading + body),
  not just decoration
- a corner radius value is recorded on the container, not faked with a
  layer stack or canvas drawing
- the contained text sits inside the shape, never bleeding through
  the outline

## Skill files exercised

- [`skills/versions/graphcompose-1.6/shapes-and-containers.md`](../../../skills/versions/graphcompose-1.6/shapes-and-containers.md)
  — the "rounded card" container shape and the shape-container-vs
  canvas-layer decision rule that content-carrying shapes must be
  containers, not canvas paint.

## Shape

A one-page document with one section called `RoundedCard`. The
section composes a rounded shape container with:

- `cornerRadius = 6` (the documented "moderate rounded card" radius
  the invoice example uses)
- one child section called `CardContent` holding a heading text and a
  body text element

The card carries content. It is not decoration. The fixture sits
firmly on the shape-container side of the decision rule and
deliberately does not attempt to fake the card with a layer stack or
canvas paint.

## How to run

1. `cd examples/skill-fixtures/shape-container-card`
2. `mvn test` — the JUnit smoke test; asserts `compose(...)` does not
   throw
3. inspect `expected-output/layout-snapshot.json` for the intended
   corner radius and child content

The committed render baseline is captured separately from the JUnit
test. A no-arg
[`ShapeContainerCardFixtureDocument`](src/main/java/com/demcha/compose/document/fixtures/shapecontainercard/ShapeContainerCardFixtureDocument.java)
exposes the same `compose(DocumentSession)` the test exercises, and
`tools/preview-renderer` drives it to `expected-output/output.pdf` and
`output.png`. Run the loop from the repo root:

- `node scripts/validate-skills.mjs` — re-render and visual-diff the PNG
  against the committed baseline (expects `IDENTICAL`).
- `node scripts/validate-skills.mjs --update-baseline` — (re)capture the
  `expected-output/output.{pdf,png}` baseline.

## Checks

The JUnit test still asserts only that `compose(...)` does not throw. The
render and visual-diff now run through the `ShapeContainerCardFixtureDocument`
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
