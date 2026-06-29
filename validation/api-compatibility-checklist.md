# API Compatibility Checklist

This checklist tracks each skill in the current skill pack against
its target GraphCompose version. It is the single place to read when
you want to know which skills have a fixture, which fixtures have
been executed, and which skills are still pending validation.

## Header

- Target GraphCompose version: `1.9.0` (manifest declares
  `defaultGraphComposeVersion: 1.9.x`; coordinate is
  `io.github.demchaav:graph-compose:1.9.0` from Maven Central).
- Skill manifest version: `0.4.0` (see
  [../skills/skill-manifest.json](../skills/skill-manifest.json)).
- Status: the render-only fixture smoke re-passed on 2026-06-29
  against `io.github.demchaav:graph-compose:1.9.0` from Maven Central
  (5 fixtures rendered to non-empty PDF/PNG via
  `node scripts/validate-skills.mjs --render-only`, all green; the
  fixture poms resolve 1.9.0 and `row-basic` was also confirmed via
  `mvn dependency:list` to bind `graph-compose:jar:1.9.0`). 1.9.0 is
  additive over 1.7.x / 1.6.x (zero breaking changes), so the earlier
  smoke lineage carries forward: the 2026-06-07 re-smoke against
  `1.7.0` and the 2026-06-01 re-smoke against `1.6.7` are archived at
  [reports/fixture-smoke-2026-06-01.md](reports/fixture-smoke-2026-06-01.md),
  and the original 2026-05-18 smoke against `v1.6.0` via JitPack at
  [reports/fixture-smoke-2026-05-18.md](reports/fixture-smoke-2026-05-18.md).
  The `graphcompose-api-surface` allow-list is `status: active` — it is
  the source-generated, version-exact API existence check and needs no
  render. Full render/preview/visual-diff validation (pixel parity vs
  committed baselines) is still pending for the 14 conceptual skills, so
  their manifest statuses remain `needs-validation`.
- Last reviewed: 2026-06-29.

## Per-skill table

| Skill ID | Target version | Status | Fixture exists | Fixture executed | Drift detected | Last validated |
|---|---|---|---|---|---|---|
| graphcompose-api-surface | 1.9.0 | active | n/a (source-generated) | n/a | none (exact extraction from v1.9.0 tag) | 2026-06-29 |
| graphcompose-engine-guides | 1.9.0 | needs-validation | n/a (vendored guides) | upstream compile-smoke + render-proof | not re-smoked in-flow yet | 2026-06-29 |
| graphcompose-basics | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| visual-to-graphcompose-mapping | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| layout-primitives | 1.9.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-29 vs 1.9.0 Central) | no compile drift; visual pending | 2026-06-29 |
| tables | 1.9.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-29 vs 1.9.0 Central) | no compile drift; visual pending | 2026-06-29 |
| themes-and-colors | 1.9.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-29 vs 1.9.0 Central) | no compile drift; visual pending | 2026-06-29 |
| typography | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| spacing-and-alignment | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| backgrounds-and-panels | 1.9.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-29 vs 1.9.0 Central) | no compile drift; visual pending | 2026-06-29 |
| layer-stacks-and-overlays | 1.9.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-29 vs 1.9.0 Central) | no compile drift; visual pending | 2026-06-29 |
| shapes-and-containers | 1.9.0 | needs-validation | yes | yes, render-only smoke (re-passed 2026-06-29 vs 1.9.0 Central) | no compile drift; visual pending | 2026-06-29 |
| pagination | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| visual-regression | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| revision-discipline | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |
| troubleshooting | 1.9.0 | needs-validation | no | no | unknown | 2026-06-01 |

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

As of the 1.9.0 retarget, the source-generated allow-list
(`graphcompose-api-surface`,
[../skills/versions/graphcompose-1.9/00-api-surface.md](../skills/versions/graphcompose-1.9/00-api-surface.md))
is the authoritative existence check for these builders: every
"confirm `<builder>`" TODO below is now answerable by grepping the
allow-list — if the exact member is listed it exists for 1.9.0, and if
it is absent the call is invented and must be replaced. The Skill
Validator's pre-compile API-existence gate (see
[../prompts/skill-validator-agent.md](../prompts/skill-validator-agent.md))
applies this diff before any compile, so these guesses no longer ride
through to the compiler unchecked.

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
