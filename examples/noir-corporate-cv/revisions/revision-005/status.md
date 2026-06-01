# Status - revision-005

- Status: DRAFT
- Parent revision: `revision-004`
- GraphCompose version: `1.6.0`
- Date: 2026-05-19
- Rendered artifacts: `output.pdf`, `output.png`, `output-debug.pdf`,
  `output-debug.png`

## Summary

Revision-005 continues the layer-by-layer visual flow instead of stopping at a
near match.

- The `CV` badge is now a larger clipped circle, close to the reference
  proportion inside the sidebar.
- The `CV` text remains centered after the resize.
- Iconify contact/interest icons and rating dots still render transparently.
- The main-column rhythm was pushed closer to the reference sequence.

The remaining major layer is the top-surface architecture: a page-wide dark
band behind the cream sidebar card.

## Verification

`node scripts\render-noir-corporate-cv.mjs revision-005` completed
successfully.
