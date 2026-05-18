# Fixture: section-basic

The smallest possible exercise of `SectionBuilder` with a soft panel
background and padding sourced from a `BusinessTheme` token. The
fixture proves that a section can carry both a styled background and
internal padding, and can hold a child text element.

## What it proves

- `DocumentSession.pageFlow(...).addSection(name, lambda)` produces a
  named section region
- `SectionBuilder.background(...)` accepts a colour token taken from a
  `BusinessTheme`
- `SectionBuilder.padding(int)` is a valid way to add internal padding
- a section composes a child text element without throwing

## Skill files exercised

- [`skills/versions/graphcompose-1.6/layout-primitives.md`](../../../skills/versions/graphcompose-1.6/layout-primitives.md)
  — the Section primitive and "semantically grouped block" branch of
  the decision flow.
- [`skills/versions/graphcompose-1.6/backgrounds-and-panels.md`](../../../skills/versions/graphcompose-1.6/backgrounds-and-panels.md)
  — the "soft panel" surface and the rule that the background lives on
  the section that already groups the content, not on a wrapper.

## Shape

A one-page document with one section called `Callout`. The section:

- carries a panel background from `theme.panelBackground()`
- has 8 mm of internal padding
- holds one body text element

The fixture is the canonical "info box" shape called out by the soft
panel section in the backgrounds-and-panels skill.

## How to run

1. `cd examples/skill-fixtures/section-basic`
2. `mvn test`
3. inspect `expected-output/layout-snapshot.json` for the intended
   region shape, padding, and background token

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
