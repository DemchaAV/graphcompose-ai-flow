# How similarity is measured

Every loop pass ends with two numbers about the page and a table about
its regions. This page says what each of them is, what it can and cannot
tell you, and why none of them is a gate on its own.

## The pixel figure

`tools/visual-diff` decodes the reference (scaled to the render's
dimensions by `--scale-reference`) and the render with `pngjs` and
compares them with `pixelmatch` — threshold `0.1`, anti-aliased pixels
ignored — against the reference, and at threshold `0` against a parent
revision. ImageMagick is not involved: it is used to import a jpg/webp/pdf
reference, to measure the reference (`reference.mjs`) and to match
typefaces (`typography.mjs`), never to diff.

The result is `mismatchPx`, its share of the page as `percent`, a
`parityScore` (100 − percent, floored), and a classification:

| percent | classification |
|---|---|
| 0 | `IDENTICAL` |
| < 0.5 | `MINOR` |
| < 5 | `MAJOR` |
| ≥ 5 | `CRITICAL` |

Against a rasterised design reference this figure **never reaches zero
and never classifies better than MAJOR**: the reference was drawn in a
typeface and a renderer the PDF does not share, so every glyph edge
differs by a few pixels, and a page of text is mostly glyph edges. Across
the audited corpus — fifty revisions of sixteen real documents — it sat
between 5.2% and 12.5% on every one, the approved ones included. It is
quoted verbatim in every review because it is what was measured; it is
never what decides a verdict.

Against a **parent revision** the same figure is exact and is the gate:
a refactor must report `mismatchPx: 0` on every page, and a data- or
asset-only change may differ only inside the regions it declared
(`region-diff --changed …`).

## The perceptual figure

Beside the pixel count, `visual-diff` reports `perceptual.ssim`: both
images to luminance, downsampled by a 4-pixel block mean, blurred once,
and compared as the mean structural similarity over 8×8 windows. A glyph
edge becomes the same grey smear on both sides; a block in the wrong
place, missing, or a different weight does not.

Over the same fifty revisions it ran from **0.44** — a one-page render
measured against page 1 of a two-page reference — through 0.64 (a poster
built at a different aspect) and 0.88–0.92 (proposals with a substituted
face and a misplaced card) to **0.93–0.95** for the invoices that were
approved as finished. The pixel figure ordered none of that.

Its classification (`MINOR` ≥ 0.93, `MAJOR` ≥ 0.80, `CRITICAL` below) is
**provisional**: read off that distribution, not measured against a
person's judgement of what "close" means. Quote the number; treat the
label as a hint. `worstWindow` names the 32-pixel block that scored
lowest, which is usually where to look first.

## The regions

`region-diff` cuts every region of `visual-analysis.json` out of both
images and reports, per region, its own mismatch percentage and a
**concentration**: its share of the page's difference divided by its
share of the page's area. Even wear sits near `1.00×`; a region well
above it carries a structural defect whatever the page total says.

Two rankings come out of it. `ranked` is by concentration — the reading
order. `byMass` is share of the page's difference × concentration, over
regions covering at least 0.5% of the page — the order the evidence is
built in, because concentration alone put the same three hairline
dividers first in 13 of 14 projects while the regions carrying the
difference ranked below them. Hairlines go to `hairlines`, and
`check-border-topology` is the tool for those.

## The measured shift

For each region the evidence is built for, `region-measure` finds the
tightest box of non-background pixels on the reference and on the render
— in one pixel space, since the scaled reference has the render's
dimensions — and subtracts them: the region's ink sits `dx, dy` from
where the reference has it, involving no bounds anyone guessed. When a
neighbour's ink clips the box, the shift comes instead from correlating
the reference crop over the render (`correlation.score` ≥ 0.6). A shift
past half a percent of the page's short edge is `GEOMETRY`; a region in
place is, by measurement, not geometry, and the cause is one of the
appearance candidates.

## The edges

`edge-bands` compares the lowest band of ink in the reference's bottom
fifth against the render's, and the highest in the top fifth. A band
more than 0.75% of the page height out of place — a page number too
low, a masthead too high — is a named defect the pixel figure scores as
a dozen grey rows.

## What decides

None of the above ends the loop. `iterate-status` starts from the
review's own verdict and only ever downgrades it — a failed binary gate,
a CRITICAL or MAJOR mismatch still on the list, an open report from the
user, a quoted figure that is not the one on disk — and the bounds in
`config/pipeline.json` stop a loop that is not converging. The numbers
say where to look and how far the page is; a person says when it is
right.
