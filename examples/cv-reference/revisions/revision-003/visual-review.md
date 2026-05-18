# Visual Review

## Summary

`revision-003` replaces the letter placeholders shipped in
`revision-002` with real Iconify icons and switches the template
typography from `Helvetica` to the bundled `Poppins` family. The
two-page composition, full-width mint header rule, and measured skill
bars from `revision-002` are preserved unchanged.

Rendered artifacts:

- [`./output.pdf`](./output.pdf)
- [`./output.png`](./output.png)
- [`./output-page-2.png`](./output-page-2.png)

## Passes

- Two-page PDF is generated.
- Contact section now shows phone, email, map-marker, and web icons
  sourced from `mdi:phone-outline`, `mdi:email-outline`,
  `mdi:map-marker-outline`, and `mdi:web` respectively. Letter
  markers are gone.
- Social section shows the four `mdi:twitter` / `mdi:facebook` /
  `mdi:pinterest` / `mdi:linkedin` glyphs in place of the previous
  `[t] / [f] / [p] / [in]` brackets.
- Expertise section opens with a real `mdi:check-decagram-outline`
  badge above the category list.
- Typography renders in `Poppins` — the rounded, geometric silhouette
  is visibly closer to the reference than `Helvetica`.
- The mint header rule still bleeds full-width, and the skill bars
  still use vector lines with vertical percentage markers.
- Every icon path on the page resolves through
  `assets-manifest.json`; no icon is hard-coded.

## Known Differences

- `mdi:check-decagram-outline` is heavier than the hand-drawn check
  badge in the reference. Classified MINOR; can be swapped for
  `mdi:check-circle-outline` in a follow-up by editing
  `asset-request.json`.
- Inline-image icons sit on the smallStyle baseline; the visual gap
  between icon and label is fixed by three non-breaking spaces. A
  later revision can replace this with a proper baseline offset once
  the spacing is tuned against the reference.
- `Poppins` letter spacing is wider than the reference's geometric
  sans-serif at small sizes; spaced-uppercase strings approximate
  tracking but are not pixel-identical.
- No visual-diff score is available yet for the two-page reference
  (covered in `docs/visual-review-loop.md`).

## Asset Flow Verification

This revision exercises the full agent chain for the first time:

```text
Architecture Mapper → asset-request.json
                  ↓
Asset Resolver     → assets/icons/*.png + assets-manifest.json
                  ↓
Template Coder     → generated-template.java (reads manifest)
                  ↓
Test + Render      → output.pdf + output.png + output-page-2.png
```

The renderer's JVM is started with
`-Dgraphcompose.revision.dir=<revisionDir>` so the template's
static `ICONS_DIR` resolves to the per-revision assets folder. The
flow is reproducible: re-running
`node scripts/render-cv-reference.mjs revision-003` re-downloads the
icons, re-validates the fonts, and re-renders without touching any
other revision.

## Recommendation

Promote `revision-003` to the current draft. The next revision should
focus on micro-typography — Poppins letter tracking, exact icon-to-label
gap, and a lighter expertise badge.
