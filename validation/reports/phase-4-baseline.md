# Phase 4 Baseline Validation Report

> Historical baseline: this report records the state before fixture
> execution. The follow-up smoke run is documented in
> [fixture-smoke-2026-05-18.md](fixture-smoke-2026-05-18.md).

## Header

- Report id: validation-phase-4-baseline-2026-05-18
- Run date: 2026-05-18
- GraphCompose version validated against: 1.6.0 (target — the
  Phase 6 renderer is not shipped yet, so this version was not
  actually exercised end-to-end)
- Skill pack version (from
  [../../skills/skill-manifest.json](../../skills/skill-manifest.json)):
  0.2.0
- Runner: manual (Phase 4 baseline; no automated runner exists yet)

## Summary

This is the Phase 4 baseline report. It records the state of the
skill pack and the fixture scaffold at the moment the validation
discipline ships. No fixture has been executed against a live
GraphCompose runtime, because the Phase 6 renderer and the Phase 7
visual-diff tools are not in place yet. All 14 skills in the
manifest remain at `status: needs-validation`. The report exists so
that the follow-up run, after Phase 6 ships, has a real baseline to
diff against rather than an empty page.

## Per-skill results

| Skill ID | Target version | Status | Fixture exists | Fixture executed | Drift detected | Last validated |
|---|---|---|---|---|---|---|
| graphcompose-basics | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| visual-to-graphcompose-mapping | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| layout-primitives | 1.6.0 | needs-validation | yes | no | unknown | 2026-05-18 |
| tables | 1.6.0 | needs-validation | yes | no | unknown | 2026-05-18 |
| themes-and-colors | 1.6.0 | needs-validation | yes | no | unknown | 2026-05-18 |
| typography | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| spacing-and-alignment | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| backgrounds-and-panels | 1.6.0 | needs-validation | yes | no | unknown | 2026-05-18 |
| layer-stacks-and-overlays | 1.6.0 | needs-validation | yes | no | unknown | 2026-05-18 |
| shapes-and-containers | 1.6.0 | needs-validation | yes | no | unknown | 2026-05-18 |
| pagination | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| visual-regression | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| revision-discipline | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |
| troubleshooting | 1.6.0 | needs-validation | no | no | unknown | 2026-05-18 |

## Failures

None observed. Nothing was executed: there is no renderer in Phase 4
to compile and run a fixture, and there is no visual-diff to compare
a rendered output against a committed baseline.

## Drift findings

None observed yet. Four open `TODO(visual-review)` items are
inherited from the example revisions under
[../../examples/invoice-reference/revisions/](../../examples/invoice-reference/revisions/);
each one is a candidate drift discovery once Phase 6 + Phase 7 land:

- Shape-container builder for the logo
  (`revision-001/generated-template.java`,
  `revision-002/generated-template.java`,
  `TODO(visual-review): confirm shape-container builder name for ...`).
- SectionBuilder corner-radius API
  (both revisions,
  `TODO(visual-review): confirm corner-radius API on SectionBuilder`).
- TableBuilder repeated-header method
  (both revisions,
  `TODO(visual-review): confirm the exact builder for repeated ...`).
- Column-mirror binding
  (`revision-002/generated-template.java`,
  `TODO(visual-review): confirm the column-mirror binding between ...`).

These are tracked in
[../api-compatibility-checklist.md#method-binding-todos](../api-compatibility-checklist.md#method-binding-todos)
and will be re-checked in the follow-up run.

## Accepted limitations confirmed

The five accepted limitations listed in
[../known-limitations.md](../known-limitations.md) are confirmed for
this baseline:

- Rendering — fixtures are not yet executed end-to-end (Phase 6
  dependency).
- Fonts — exact font matching may be limited; substitutions are
  documented in the fixture's `visual-review.md` and in the
  `typography` skill.
- Color matching — visual diffs will use a tolerance band rather
  than exact-match comparison.
- Pagination — pagination behavior depends on font metrics and the
  exact GraphCompose release; fixtures fix their data and column
  widths.
- Exact pixel parity — not a goal; the visual-accuracy contract
  allows `MINOR` and `ACCEPTED_LIMITATION` differences when
  documented.

## New limitations discovered

None observed yet. Phase 4 ships the discipline; it does not
discover new limitations because no fixture has been executed.

## Action items

| Item | Owner | Due | Status |
|---|---|---|---|
| Ship Phase 6 preview-renderer so fixtures can execute end-to-end. | Phase 6 lane | Phase 6 | open |
| Ship Phase 7 visual-diff so rendered output can be compared against committed baselines. | Phase 7 lane | Phase 7 | open |
| After Phase 6 lands, run all five scaffolded fixtures (`row-basic`, `section-basic`, `table-basic`, `layer-stack-badge`, `shape-container-card`) and produce a follow-up validation report under `reports/`. | Validation lane | Post-Phase 6 | open |
| Resolve the four `TODO(visual-review)` method-binding markers in `examples/invoice-reference/revisions/` against the real library and file skill-fix reports for any drift. | Validation lane | Post-Phase 6 | open |
