# Visual Review

## Summary

`revision-008` is a relational-thinking refactor of the template
constants block: every dimension that's a function of page width,
margins, or column weights is now derived rather than hardcoded.
Visually this is a small but real change vs revision-007 — the
derived grid column width is 150.765pt (not 150pt), so the
awards/references right edge sits ~1.5pt further right.

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
  examples/cv-reference/revisions/revision-007/output.png
  examples/cv-reference/revisions/revision-008/output.png
→ 0 differing pixels

magick compare -metric AE
  examples/cv-reference/revisions/revision-007/output-page-2.png
  examples/cv-reference/revisions/revision-008/output-page-2.png
→ 12631 differing pixels (0.58% of page 2)
```

Page 1 unchanged (the page-1 grid weights also moved to constants
but the formula yields the same widths). Page-2 diff is the
intentional ~0.5pt growth in each grid column.

## Mismatches

Classified per `docs/visual-accuracy-contract.md`:

- **INTENTIONAL_DIFFERENCE** — page-2 awards/references right edge
  moved ~1.5pt further right vs revision-007. This is a corrective
  adjustment: r-007 set the grid to 300pt (hardcoded 150pt × 2) while
  the actual Main column inner width is 301.53pt. The derived
  formula now yields the exact half-of-Main width and the table
  spans the full Main column.

No CRITICAL, MAJOR, or MINOR mismatches.

## Constants audit

| Constant            | Was (r-007)         | Now (r-008)                                          |
|---|---|---|
| `FULL_PAGE_WIDTH`   | 595.0 (literal)     | 595.0 (literal — base constant)                     |
| `PAGE_MARGIN_SIDE`  | 52.0 (literal)      | 52.0 (literal — base constant)                      |
| `COLUMN_GAP`        | 54.0 (literal)      | 54.0 (literal — base constant)                      |
| `SIDEBAR_WEIGHT`    | (not extracted)     | 0.31 (base constant)                                 |
| `MAIN_WEIGHT`       | (not extracted)     | `1.0 - SIDEBAR_WEIGHT` (derived)                     |
| `USABLE_WIDTH`      | (computed inline)   | derived from page width + margins + column gap       |
| `SIDEBAR_WIDTH`     | 136.0 (hardcoded)   | derived: `USABLE_WIDTH * SIDEBAR_WEIGHT` ≈ 135.47pt  |
| `MAIN_WIDTH`        | (not extracted)     | derived: `USABLE_WIDTH * MAIN_WEIGHT` ≈ 301.53pt     |
| `GRID_COLUMN_WIDTH` | 150.0 (hardcoded)   | derived: `MAIN_WIDTH / 2.0` ≈ 150.765pt              |
| `SKILL_BAR_WIDTH`   | `= SIDEBAR_WIDTH`   | `= SIDEBAR_WIDTH` (unchanged formula, new value)     |
| `row.weights(...)`  | literal 0.31, 0.69  | `SIDEBAR_WEIGHT, MAIN_WEIGHT`                        |

## Recommendation

Promote `revision-008` to the new APPROVED baseline. The change
captures the user's stated principle ("the agent should think
relationally, not pixel-first") and corrects the ~1.5pt drift the
hardcoded value introduced in revision-007.
