# Verified Examples

A verified example is a fixture whose `expected-output/` has been
compared to a freshly rendered output by the validation runner and
explicitly approved against the visual accuracy contract. Approval
means no `CRITICAL` or `MAJOR` mismatches remain, every `MINOR`
mismatch is documented, and any `ACCEPTED_LIMITATION` differences
are listed in
[known-limitations.md](known-limitations.md) or in
[../docs/limitations.md](../docs/limitations.md).

## Current state

No examples are fully verified yet. The five committed fixtures are
now smoke-verified: each fixture compiles and runs with Maven against
GraphCompose 1.6.0 from JitPack. That proves the covered API calls
exist and execute. It does not yet prove visual parity against the
committed `expected-output/` baseline.

This page will move fixtures to `verified` only after the renderer
reproduces the committed baseline and visual-diff reports no critical
or major mismatch.

## Fixture registry

| Fixture | Skills covered | Status |
|---|---|---|
| `../examples/skill-fixtures/row-basic` | layout-primitives | smoke-verified — visual baseline pending |
| `../examples/skill-fixtures/section-basic` | layout-primitives, backgrounds-and-panels | smoke-verified — visual baseline pending |
| `../examples/skill-fixtures/table-basic` | tables, themes-and-colors | smoke-verified — visual baseline pending |
| `../examples/skill-fixtures/layer-stack-badge` | layer-stacks-and-overlays | smoke-verified — visual baseline pending |
| `../examples/skill-fixtures/shape-container-card` | shapes-and-containers | smoke-verified — visual baseline pending |

When a fixture is verified, update its row to `verified` and record
the run that approved it in the appropriate report under
[reports/](reports/). Update the matching row in
[api-compatibility-checklist.md](api-compatibility-checklist.md)
at the same time so the manifest stays consistent.
