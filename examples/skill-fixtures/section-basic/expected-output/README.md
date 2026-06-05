# expected-output for section-basic

This folder holds the committed render baseline for this fixture.
`output.pdf` and `output.png` are produced by `tools/preview-renderer`
driving the fixture's no-arg `SectionBasicFixtureDocument` adapter.
`layout-snapshot.json` is still illustrative — its values describe the
layout shape the fixture intends to produce, not values measured by a
real engine run.

## Files

| File | Status | Populated by |
|---|---|---|
| `layout-snapshot.json` | present, illustrative | hand-authored (documents intent) |
| `output.pdf` | present (committed baseline) | `tools/preview-renderer` via `SectionBasicFixtureDocument` |
| `output.png` | present (committed baseline) | `tools/preview-renderer` via `SectionBasicFixtureDocument` |

## How the baseline was captured

The render plus visual-diff loop is built (see
[`../../../../scripts/validate-skills.mjs`](../../../../scripts/validate-skills.mjs)
and the run recorded in
[`../../../../validation/reports/skill-render-validation-2026-06-03.md`](../../../../validation/reports/skill-render-validation-2026-06-03.md)):

- **Render** (`tools/preview-renderer`): `node scripts/validate-skills.mjs
  --update-baseline` instantiates the no-arg `SectionBasicFixtureDocument`,
  calls its `compose(DocumentSession)`, writes `output.pdf`, and converts
  the first page to `output.png` here.
- **Visual-diff** (`tools/visual-diff`): `node scripts/validate-skills.mjs`
  re-renders and compares the new PNG against this committed `output.png`,
  expecting `IDENTICAL` (AE == 0). PDFs carry timestamps, so parity is
  judged on the PNG, not the PDF bytes. Diffs are classified per
  [`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md).

`layout-snapshot.json` is not part of that loop. It stays hand-authored
and illustrative, so it is safe to edit by hand; the render loop never
regenerates it.
