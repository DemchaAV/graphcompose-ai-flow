# Status - revision-003

- Status: DRAFT
- Parent revision: `revision-002`
- GraphCompose version: `1.6.0`
- Date: 2026-05-19
- Rendered artifacts: `output.pdf`, `output.png`, `output-debug.pdf`,
  `output-debug.png`

## Summary

Revision-003 fixes the concrete defects called out by the user:

- Iconify PNGs no longer render with white square backgrounds.
- The `CV` mark is a centered text layer inside a clipped circular
  `ShapeContainerBuilder`.
- The sidebar cream plate extends down the page.
- Skills/languages use transparent filled/open dot image assets.

The workflow prompts were also updated so future visual drafts do not stop at
"near enough"; a `REVISE` review must name the next visual layer and the
orchestrator should continue when the next action is concrete.

## Verification

`node scripts\render-noir-corporate-cv.mjs revision-003` completed
successfully.
