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
  approved. In Phase 4 every fixture is still "scaffolded — pending
  verification".
- [skill-fix-template.md](skill-fix-template.md) — the verbatim
  skill-fix report template from plan §7.5, plus the file-and-commit
  steps to follow when filing one.
- [validation-report-template.md](validation-report-template.md) —
  the template for a periodic skill-pack validation run, including
  the per-skill table, drift findings, accepted limitations, and
  action items.
- [reports/](reports/) — committed instances of the validation
  report template. The Phase 4 baseline lives at
  [reports/phase-4-baseline.md](reports/phase-4-baseline.md).

The skill fixtures themselves live under
[../examples/skill-fixtures/](../examples/skill-fixtures/). That
folder is owned by a parallel lane and has its own README describing
the scaffold for each fixture.

## Current state

Phase 4 ships only the validation discipline: the templates, the
checklist, and a baseline report. The renderer that lets fixtures
actually execute against GraphCompose ships in Phase 6, and the
visual-diff that compares rendered output to a committed baseline
ships in Phase 7. Until then every skill in
[../skills/skill-manifest.json](../skills/skill-manifest.json) stays
at `status: needs-validation`, the per-skill table in
[api-compatibility-checklist.md](api-compatibility-checklist.md)
reports `Fixture executed: no` for every entry, and the baseline
report in [reports/phase-4-baseline.md](reports/phase-4-baseline.md)
records that no fixture has been executed. See
[../docs/roadmap.md](../docs/roadmap.md) for the phase schedule and
[../docs/skill-validation.md](../docs/skill-validation.md) for the
upstream description of the discipline this folder operationalises.
