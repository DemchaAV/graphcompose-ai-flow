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
2. `mvn test`
3. inspect `expected-output/layout-snapshot.json` for the intended
   corner radius and child content

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
