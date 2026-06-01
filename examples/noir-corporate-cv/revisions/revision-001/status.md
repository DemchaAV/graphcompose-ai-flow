# Status — revision-001

- **Status:** DRAFT
- **Parent revision:** none (first revision)
- **GraphCompose version:** 1.6.0
- **Date:** 2026-05-19
- **Rendered artifacts:** `output.pdf`, `output.png`,
  `output-debug.pdf`, `output-debug.png`
- **Assets manifest:** `assets-manifest.json` (7 Iconify icons +
  3 font roles — heading / body / fallback)
- **Render log:** `render.log`

## Summary

First structural draft of the **Noir Corporate CV** template,
generated from a single supplied screenshot
(`reference/reference.png`). The draft establishes:

- a single-page A4 portrait page with a two-column row
  (`SIDEBAR_WEIGHT = 0.33`, `MAIN_WEIGHT = 0.67`),
- a left identity sidebar carrying the `CV` badge, contact rows,
  skills meter, languages meter, and interest rows,
- a right main column carrying the name bar, professional profile,
  education entries, and work-experience entries,
- 7 Iconify glyphs rendered inline next to their values,
- bundled Poppins typography (no font drop required).

Five regions are tracked as `DOCUMENTED SUBSTITUTION` in
`visual-review.md` and scoped to follow-up revisions:

1. cream sidebar plate (panel pass — revision-002)
2. dark plum identity card behind the `CV` badge (panel pass)
3. dark plum filled name bar + section header bars (panel pass)
4. filled `CV` circle inside the identity card (shape pass —
   revision-003)
5. glyph-image rating meter (shape pass — revision-003)

A typed `NoirCorporateCvSpec` + JSON-backed provider split is
scheduled for revision-004 once the visual passes settle.

## Next step

Wait for the user to review the rendered preview. On
approval / save, the Revision Manager will flip this revision to
APPROVED and trigger the Template Publisher to build the first
`templates/noir-corporate-cv/` bundle (or — more typically —
the user will request an iteration first and revision-002 will
land before any publish runs).
