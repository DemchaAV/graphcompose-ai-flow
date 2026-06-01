# Status - revision-006

- Status: FAILED
- Parent revision: `revision-005`
- GraphCompose version: `1.6.0`
- Date: 2026-05-19
- Current usable draft: `revision-005`

## Summary

Revision-006 attempted the next visual layer: a page-wide dark top band behind
the cream sidebar card using `LayerStack`.

The implementation compiles but fails during render because GraphCompose rejects
the existing `MainGrid` row inside the stacked content layer.

## Verification

`node scripts\render-noir-corporate-cv.mjs revision-006` failed at render time.
