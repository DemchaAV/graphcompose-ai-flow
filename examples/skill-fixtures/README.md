# Skill Validation Fixtures

This folder is the home of the Phase 4 skill validation fixtures.

A *skill fixture* is a small, self-contained Maven project that exercises
one GraphCompose primitive documented by the
[`skills/versions/graphcompose-1.7/`](../../skills/versions/graphcompose-1.7/)
skill pack. Each fixture proves, at the smallest possible scope, that the
primitive the skill documents is real GraphCompose API surface and not
fantasy documentation. The fixtures are the on-disk receipts for the
[no-invented-API rule](../../docs/versioned-skills.md) and for the
[skill drift rule](../../validation/) the parallel-lane validation docs
describe.

## What a skill fixture is

- one folder per primitive
- one `pom.xml` declaring the GraphCompose 1.6.0 dependency and JUnit 5
- one JUnit 5 test that builds a tiny in-memory document and runs the
  primitive through `DocumentSession.compose(...)`
- one `expected-output/` folder for the artifacts a Phase 6 renderer
  will populate, plus an illustrative `layout-snapshot.json` that
  documents the intended layout shape

The fixtures are intentionally tiny. Each one focuses on a single
primitive so that, when a skill drifts from the library, the failing
fixture points directly at the skill file that needs to be updated.

## Fixtures shipped in Phase 4

| Fixture | Primitive | Skill files exercised |
|---|---|---|
| [`row-basic/`](row-basic/) | `RowBuilder` with two child sections | `layout-primitives.md` |
| [`section-basic/`](section-basic/) | `SectionBuilder` with a panel background and padding | `layout-primitives.md`, `backgrounds-and-panels.md` |
| [`table-basic/`](table-basic/) | `TableBuilder` with header styling, three columns, and zebra rows | `tables.md`, `themes-and-colors.md` |
| [`layer-stack-badge/`](layer-stack-badge/) | `LayerStack` placing a badge over a card | `layer-stacks-and-overlays.md` |
| [`shape-container-card/`](shape-container-card/) | rounded shape container holding a heading and body | `shapes-and-containers.md` |

These five fixtures correspond to the Phase 4 task list in §19 of the
project plan. Two additional fixtures listed in §7.3
(`table-repeated-header`, `pagination-basic`, `invoice-layout`) are
deferred to a later phase together with the renderer; they require the
full pagination engine to be meaningful.

## How fixtures run

Each fixture is its own Maven project. To exercise one:

1. `cd examples/skill-fixtures/<fixture-name>`
2. `mvn test`
3. inspect `expected-output/` for the layout snapshot and the
   documentation note that describes the deferred binary artifacts

The Phase 6 render-and-preview tool will, in addition to running the
JUnit test, populate `expected-output/output.pdf` and
`expected-output/output.png`, then refresh `layout-snapshot.json` from
the real engine. Until that lands, the tests prove only that the
fixture compiles and that `compose(...)` does not throw.

## Honest status

The Phase 4 fixtures ship the source skeleton only. Three concrete
honesty points apply:

- `expected-output/output.pdf` and `expected-output/output.png` are
  intentionally absent. The renderer is Phase 6. The fixture skeletons
  exist now so Phase 6 has somewhere to write its output and so
  Phase 7 visual-diff has somewhere to read its baselines.
- `expected-output/layout-snapshot.json` is illustrative. The values
  describe the layout shape the fixture *intends* to produce, not the
  values a real engine has measured. The `notes` field at the top of
  each snapshot file is explicit about this.
- Any builder method whose exact name is not yet confirmed by a
  fixture run is tagged with `TODO(skill-validation):` in the test
  source, per the no-invented-API rule. The Phase 4 follow-up sweep
  resolves each marker.

## Pointer to validation docs

Documentation-side work for skill validation lives in
[`../../validation/`](../../validation/). That folder is the home of
the validation reports, skill-fix templates, and API compatibility
checklists. The two lanes are split deliberately: this folder owns
the executable fixture skeletons, and `validation/` owns the prose
the fixtures support. The parallel-lane authors should not write
under `examples/skill-fixtures/`; this lane should not write under
`validation/`.
