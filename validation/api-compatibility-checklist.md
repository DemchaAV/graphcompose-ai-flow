# API Compatibility Checklist

This checklist tracks each skill in the current skill pack against
its target GraphCompose version. It is the single place to read when
you want to know which skills have a fixture, which fixtures have
been executed, and which skills are still pending validation.

## Header

- Target GraphCompose version: `1.7.0` (manifest declares
  `defaultGraphComposeVersion: 1.7.x`; coordinate is
  `io.github.demchaav:graph-compose:1.7.0` from Maven Central).
- Skill manifest version: `0.3.0` (see
  [../skills/skill-manifest.json](../skills/skill-manifest.json)).
- Status: the render-only fixture smoke re-passed on 2026-06-07
  against `io.github.demchaav:graph-compose:1.7.0` from Maven Central
  (5 fixtures rendered to non-empty PDF/PNG via
  `node scripts/validate-skills.mjs --render-only`, all green). 1.7.0
  is additive over 1.6.x (zero breaking changes), so the earlier 1.6.x
  compile/smoke lineage carries forward: the 2026-06-01 re-smoke
  against `1.6.7` is archived at
  [reports/fixture-smoke-2026-06-01.md](reports/fixture-smoke-2026-06-01.md),
  and the original 2026-05-18 smoke against `v1.6.0` via JitPack at
  [reports/fixture-smoke-2026-05-18.md](reports/fixture-smoke-2026-05-18.md).
  Full render/preview/visual-diff validation (pixel parity vs committed
  baselines) is still pending, so manifest statuses remain
  `needs-validation`.
- Last reviewed: 2026-06-07.

## Per-skill table

| Skill ID | Target version | Status | Fixture exists | Fixture executed | Drift detected | Last validated |
|---|---|---|---|---|---|---|
| graphcompose-basics | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| visual-to-graphcompose-mapping | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| layout-primitives | 1.7.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-07 vs 1.7.0 Central) | no compile drift; visual pending | 2026-06-07 |
| tables | 1.7.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-07 vs 1.7.0 Central) | no compile drift; visual pending | 2026-06-07 |
| themes-and-colors | 1.7.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-07 vs 1.7.0 Central) | no compile drift; visual pending | 2026-06-07 |
| typography | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| spacing-and-alignment | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| backgrounds-and-panels | 1.7.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-07 vs 1.7.0 Central) | no compile drift; visual pending | 2026-06-07 |
| layer-stacks-and-overlays | 1.7.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-07 vs 1.7.0 Central) | no compile drift; visual pending | 2026-06-07 |
| shapes-and-containers | 1.7.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-07 vs 1.7.0 Central) | no compile drift; visual pending | 2026-06-07 |
| pagination | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| visual-regression | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| revision-discipline | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |
| troubleshooting | 1.7.0 | needs-validation | no | no | unknown | 2026-06-01 |

Fixture-to-skill coverage notes for the five fixtures under
[../examples/skill-fixtures/](../examples/skill-fixtures/):

- `row-basic` covers `layout-primitives`.
- `section-basic` covers `layout-primitives` and
  `backgrounds-and-panels`.
- `table-basic` covers `tables` and `themes-and-colors`.
- `layer-stack-badge` covers `layer-stacks-and-overlays`.
- `shape-container-card` covers `shapes-and-containers`.

Skills without `Fixture exists: yes` will gain fixture coverage in
later phases; for now they remain `needs-validation` without a
fixture row.

## Method-binding TODOs

These are open `TODO(visual-review)` markers carried over from the
example revisions under
[../examples/invoice-reference/revisions/](../examples/invoice-reference/revisions/).
They surface the uncertain method bindings the example template
could not resolve from the skill pack alone. Each one is a
candidate skill-drift discovery once the renderer and visual-diff
are run against the invoice example.

- Shape-container builder for the logo. The exact builder name for
  the rounded-corner logo container is uncertain in the
  `shapes-and-containers` skill. Tracked in
  `examples/invoice-reference/revisions/revision-001/generated-template.java`
  and `revision-002/generated-template.java` (lines marked
  `TODO(visual-review): confirm shape-container builder name for ...`).
- SectionBuilder corner-radius API. The exact API for setting a
  rounded corner radius on a `SectionBuilder`-backed panel is
  uncertain. Tracked in both revisions
  (`TODO(visual-review): confirm corner-radius API on SectionBuilder`).
- TableBuilder repeated-header method. The exact builder method for
  enabling repeated headers across pages is uncertain in the
  `tables` skill. Tracked in both revisions
  (`TODO(visual-review): confirm the exact builder for repeated ...`).
- Column-mirror binding. The exact column-mirror binding between
  the line-items table and the summary section is uncertain. Tracked
  in revision-002 only
  (`TODO(visual-review): confirm the column-mirror binding between ...`).

Once the full render + visual-diff loop is wired up, the five
smoke-verified fixtures will be visually compared and any of these
TODOs that turn into real drift will produce a
`skill-fix-<skill-id>-<date>.md` report under [reports/](reports/).
