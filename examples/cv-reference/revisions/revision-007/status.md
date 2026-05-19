# Status

- Template: **Mint Editorial CV** (`cv-reference`)
- Revision: `revision-007`
- Parent: `revision-006`
- Status: `DRAFT`
- Renderable: YES
- Pixel diff vs parent page-1: 0 (byte-identical)
- Pixel diff vs parent page-2: 15334 px (0.71%) — the intentional
  re-widening of the Awards / References grid to fill the Main
  column.

## What changed vs revision-006

Single template constant: `GRID_COLUMN_WIDTH: 130.0 → 150.0`.

The awards / references two-column grid now spans the full Main
column (~301pt) instead of a 260pt-wide subset of it. The visible
gap between the two columns is still 28pt (left-cell right-padding),
just at the new positions: the left column ends ~28pt before Main's
horizontal center, the right column starts at Main's horizontal
center.

## How to re-render locally

```powershell
node .\scripts\render-cv-reference.mjs revision-007
```

Same flow as revision-006: asset-resolver runs first (icons
unchanged), preview-renderer renders the clean and the
debug-with-guidelines PDFs, page-2 previews land in
`output-page-2.png` and `output-debug-page-2.png`.

## Promotion path

When the user approves this revision the Revision Manager flips
`status` to `APPROVED` and `currentApprovedRevisionId` in
`template-project.json` to `revision-007`. The Template Publisher
then re-emits `templates/mint-editorial-cv/`. Because
`GRID_COLUMN_WIDTH` lives in the template (not in `cv-data.json` or
the asset bundle), the publisher's idempotent guard preserves the
agent's Javadoc polish on the published `MintEditorialCvTemplate`
unless `--force-template` is passed.
