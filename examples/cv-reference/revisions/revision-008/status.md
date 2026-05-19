# Status

- Template: **Mint Editorial CV** (`cv-reference`)
- Revision: `revision-008`
- Parent: `revision-007`
- Status: `APPROVED` (2026-05-19T01:15:00Z)
- Supersedes: `revision-007`
- Renderable: YES
- Pixel diff vs parent page-1: 0 (byte-identical)
- Pixel diff vs parent page-2: 12631 px (0.58%) — the intentional
  ~0.5pt-per-column adjustment that comes from deriving
  `GRID_COLUMN_WIDTH = MAIN_WIDTH / 2.0` instead of hardcoding 150pt.

## What changed vs revision-007

A constants-only refactor. No template logic, no spec, no data, no
assets. The template now thinks RELATIONALLY:

```text
FULL_PAGE_WIDTH  + PAGE_MARGIN_SIDE + COLUMN_GAP  → USABLE_WIDTH
USABLE_WIDTH × SIDEBAR_WEIGHT                      → SIDEBAR_WIDTH = SKILL_BAR_WIDTH
USABLE_WIDTH × MAIN_WEIGHT                          → MAIN_WIDTH
MAIN_WIDTH / 2                                      → GRID_COLUMN_WIDTH
SIDEBAR_WEIGHT, MAIN_WEIGHT                         → row.weights(...)
```

Changing FULL_PAGE_WIDTH (A4 → Letter), PAGE_MARGIN_SIDE, or
SIDEBAR_WEIGHT now recomputes every dependent width in one place —
no per-region retuning.

## How to re-render locally

```powershell
node .\scripts\render-cv-reference.mjs revision-008
```

## Promotion path

When the user approves this revision:
- Revision Manager flips revision-008 status → APPROVED
- Marks revision-007 → SUPERSEDED
- Updates `currentApprovedRevisionId` to `revision-008`
- Template Publisher republishes
  `templates/mint-editorial-cv/` from revision-008 (with
  `--force-template` because the constants block is part of the
  rendered class)
