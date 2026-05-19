# Visual Review

## Summary

`revision-007` resizes the page-2 Awards and References two-column
grid so it fills the Main column exactly: each grid column is now
~150pt wide (was 130), the total grid is ~300pt (was 260, matched
the Main inner width of 301.5pt), and the divide between the two
columns sits at Main's center. The user's schematic showed the
intended layout — the bottom-half of page 2 reads as three equal
regions (sidebar / awards-left / awards-right) instead of the prior
"narrow grid hugging Main's left edge with empty space on the right"
shape.

Rendered artifacts:

- [`./output.pdf`](./output.pdf)
- [`./output.png`](./output.png)
- [`./output-page-2.png`](./output-page-2.png)
- [`./output-debug.pdf`](./output-debug.pdf) (with GraphCompose guide-lines)
- [`./output-debug.png`](./output-debug.png)
- [`./output-debug-page-2.png`](./output-debug-page-2.png)

## Pixel diff vs parent revision

```text
magick compare -metric AE
  examples/cv-reference/revisions/revision-006/output.png
  examples/cv-reference/revisions/revision-007/output.png
→ 0 differing pixels

magick compare -metric AE
  examples/cv-reference/revisions/revision-006/output-page-2.png
  examples/cv-reference/revisions/revision-007/output-page-2.png
→ 15334 differing pixels (0.71% of page 2)
```

Page 1 is byte-identical to revision-006 as expected — the change
only affects the page-2 Awards / References grid widths. The
page-2 diff is the localized re-positioning of the awards/references
right column from "ends at X≈388pt of Main" to "ends at X≈452pt of
Main (page-right margin)". No other regions move.

## Passes

- Awards: two columns visibly fill the Main column. The right
  column "AWARD NAME HERE" right-aligns with the EXPERIENCE body
  right edge (the page-right margin). Verified against the
  reference and against the user's schematic.
- References: same — the second reference per row's right edge is
  flush with the page-right margin.
- Page 1 unchanged. Sidebar (Expertise / Skills / Social) on page
  2 unchanged. Experience entries on page 2 unchanged.
- Debug PDF (`output-debug.pdf`) shows the new wider cell
  rectangles on page 2; useful when explaining the placement to
  reviewers.

## Known Differences

- None vs the user's schematic. The bottom-half of page 2 now has
  the three-region read the schematic showed.

## Recommendation

Promote `revision-007` to the new approved baseline. The previous
APPROVED revision-004 (and its zero-diff descendants 005 / 006) had
the narrower 260pt grid, so this is a real layout change, not a
no-op refactor — visual-review-agent's parity gate against
revision-006 page-2 correctly flags the diff as INTENTIONAL_DIFFERENCE
classified by the user request.
