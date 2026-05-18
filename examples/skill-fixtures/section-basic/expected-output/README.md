# expected-output for section-basic

This folder is where the Phase 6 render-and-preview tool will write the
rendered artifacts for this fixture. Until that lands, only
`layout-snapshot.json` is present, and it is illustrative — the values
describe the layout shape the fixture intends to produce, not values
measured by a real engine run.

## Files

| File | Status | Populated by |
|---|---|---|
| `layout-snapshot.json` | present, illustrative | placeholder for Phase 6 |
| `output.pdf` | absent, Phase 6 deferred | preview-renderer tool |
| `output.png` | absent, Phase 6 deferred | preview-renderer tool |

## What lands when

- **Phase 6** (preview-renderer): every `mvn test` regenerates
  `layout-snapshot.json` from the real engine, writes
  `output.pdf`, and converts the first page to `output.png`. The
  illustrative `notes` field on the snapshot will be removed at that
  point.
- **Phase 7** (visual-diff): introduces a committed `output.png`
  baseline and a tool that compares a new render against both
  `layout-snapshot.json` and that baseline. Diffs are classified per
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).

Do not edit `layout-snapshot.json` by hand once Phase 6 is wired; it
will be regenerated. Do edit it by hand now — it documents intent.
