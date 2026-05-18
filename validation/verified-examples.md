# Verified Examples

A verified example is a fixture whose `expected-output/` has been
compared to a freshly rendered output by the validation runner and
explicitly approved against the visual accuracy contract. Approval
means no `CRITICAL` or `MAJOR` mismatches remain, every `MINOR`
mismatch is documented, and any `ACCEPTED_LIMITATION` differences
are listed in
[known-limitations.md](known-limitations.md) or in
[../docs/limitations.md](../docs/limitations.md).

## Phase 4 baseline state

No examples are verified yet. The renderer that lets fixtures
execute against a real GraphCompose runtime ships in Phase 6; the
visual-diff that confirms the rendered output matches the committed
baseline ships in Phase 7. The five fixtures the parallel lane is
producing in Phase 4 are "scaffolded — pending verification": the
fixture folder, README, project file, test source, and committed
`expected-output/` exist, but no automated run has confirmed that
the baseline is reproducible.

This page will move fixtures to `verified` only after the Phase 6
renderer reproduces the committed baseline and the Phase 7
visual-diff reports no critical or major mismatch.

## Fixture registry

| Fixture | Skills covered | Status |
|---|---|---|
| `../examples/skill-fixtures/row-basic` | layout-primitives | scaffolded — pending verification |
| `../examples/skill-fixtures/section-basic` | layout-primitives, backgrounds-and-panels | scaffolded — pending verification |
| `../examples/skill-fixtures/table-basic` | tables, themes-and-colors | scaffolded — pending verification |
| `../examples/skill-fixtures/layer-stack-badge` | layer-stacks-and-overlays | scaffolded — pending verification |
| `../examples/skill-fixtures/shape-container-card` | shapes-and-containers | scaffolded — pending verification |

When a fixture is verified, update its row to `verified` and record
the run that approved it in the appropriate report under
[reports/](reports/). Update the matching row in
[api-compatibility-checklist.md](api-compatibility-checklist.md)
at the same time so the manifest stays consistent.
