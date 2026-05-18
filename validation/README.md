# Validation

Validation is the discipline that proves the GraphCompose skill pack
describes real library behavior, not fantasy documentation. A skill
is valid only if it targets a specific GraphCompose version, its
code examples compile and render where applicable, it does not
reference removed APIs or deprecated patterns, it carries at least
one verified fixture when possible, and it documents the limitations
it accepts. The rule is recorded verbatim in
[skill-validation.md](skill-validation.md) and anchors back to
section 7.1 of the full project plan.

## What lives in this folder

- [skill-validation.md](skill-validation.md) — the operational guide:
  rule, structure, fixture layout, drift handling, how runs are
  performed, and when to file a skill-fix report.
- [api-compatibility-checklist.md](api-compatibility-checklist.md) —
  one row per skill in the current `skills/skill-manifest.json`,
  tracking version, fixture coverage, execution state, drift, and
  last-validated date.
- [known-limitations.md](known-limitations.md) — concrete limitations
  accepted for the 1.6.x skill pack, cross-linked to
  [../docs/limitations.md](../docs/limitations.md).
- [verified-examples.md](verified-examples.md) — registry of fixtures
  whose `expected-output/` has been compared to a rendered output and
  approved. Today the five committed fixtures are smoke-verified
  against GraphCompose 1.6.0, but visual verification is still
  pending.
- [skill-fix-template.md](skill-fix-template.md) — the verbatim
  skill-fix report template from plan §7.5, plus the file-and-commit
  steps to follow when filing one.
- [validation-report-template.md](validation-report-template.md) —
  the template for a periodic skill-pack validation run, including
  the per-skill table, drift findings, accepted limitations, and
  action items.
- [reports/](reports/) — committed instances of the validation
  report template. The Phase 4 baseline lives at
  [reports/phase-4-baseline.md](reports/phase-4-baseline.md), and the
  first fixture smoke report lives at
  [reports/fixture-smoke-2026-05-18.md](reports/fixture-smoke-2026-05-18.md).

The skill fixtures themselves live under
[../examples/skill-fixtures/](../examples/skill-fixtures/). That
folder is owned by a parallel lane and has its own README describing
the scaffold for each fixture.

## Current state

Phase 4 shipped the validation discipline; the follow-up fixture smoke
now proves that the five fixture projects compile and run against
GraphCompose 1.6.0 from JitPack. The per-skill table in
[api-compatibility-checklist.md](api-compatibility-checklist.md)
records which skills are covered by that smoke pass.

This is not full validation yet. The renderer still needs to execute
generated templates, refresh `output.pdf` / `output.png`, and feed
visual-diff against committed baselines. Until that full loop exists,
every skill in
[../skills/skill-manifest.json](../skills/skill-manifest.json) stays
at `status: needs-validation`. See
[../docs/roadmap.md](../docs/roadmap.md) for the phase schedule and
[../docs/skill-validation.md](../docs/skill-validation.md) for the
upstream description of the discipline this folder operationalises.
