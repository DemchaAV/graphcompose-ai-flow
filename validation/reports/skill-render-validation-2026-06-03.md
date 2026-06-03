# Skill render validation — 2026-06-03

The render + preview + visual-diff loop that `docs/skill-validation.md` lists as
the prerequisite for promoting skills out of `needs-validation` is now built and
passing locally.

## What runs

`scripts/validate-skills.mjs` renders each fixture through the shared
`tools/preview-renderer` and compares the rendered PNG against a committed
`expected-output/output.png` baseline via `tools/visual-diff`.

Each fixture gained a no-arg `*FixtureDocument` class with
`compose(DocumentSession)` (the same compose the fixture's JUnit test exercises),
so preview-renderer's generic `render` subcommand can drive it. The renderer
writes into a throwaway `target/render-tmp` folder (a stub `revision.json`),
and the runner copies/diffs from there.

Modes:

- `--update-baseline` — (re)capture `expected-output/output.{pdf,png}`.
- default — re-render and visual-diff vs the committed baseline (expects
  `IDENTICAL`, i.e. AE == 0).
- `--render-only` — render and assert non-empty output, no diff. CI uses this:
  PNG baselines are platform-specific (font rasterisation differs across OS/JDK),
  so CI gates on the render path, not pixel identity.

## Result (local: Windows, GraphCompose 1.6.7 from Maven Central)

All five fixtures render and re-render `IDENTICAL` vs their committed baseline:

| fixture | output.pdf | output.png | result |
|---|---|---|---|
| `row-basic` | 881 b | 16848 b | IDENTICAL |
| `section-basic` | 1022 b | 18706 b | IDENTICAL |
| `table-basic` | 1362 b | 29609 b | IDENTICAL |
| `layer-stack-badge` | 1174 b | 19791 b | IDENTICAL |
| `shape-container-card` | 1083 b | 24889 b | IDENTICAL |

## Skills covered by a passing render fixture

- `layout-primitives` — row-basic, section-basic
- `backgrounds-and-panels` — section-basic
- `tables` — table-basic
- `themes-and-colors` — table-basic
- `layer-stacks-and-overlays` — layer-stack-badge
- `shapes-and-containers` — shape-container-card

## Status

`skills/skill-manifest.json` still reads `status: needs-validation` for all
skills. Flipping the six fixture-covered skills to `active` is a deliberate
follow-up pending an author review of the remaining skill-validity criteria
(no deprecated patterns; documented limitations). The eight skills without a
fixture stay `needs-validation`.
