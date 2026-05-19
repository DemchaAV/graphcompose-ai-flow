# User request

Architectural shift in how the template thinks about layout:

> Two main columns with a gap, no borders. One column contains two
> sub-columns that fill the entire space of that column, exactly in
> half. If the page size changes, proportions stay the same — the
> engine computes the actual values. The agent must think in terms of
> what belongs to what and what depends on what, not in pixels.

Concrete fixes against revision-007's template constants:

- `GRID_COLUMN_WIDTH` was hardcoded to 150pt. It must be derived as
  `MAIN_WIDTH / 2.0`, where `MAIN_WIDTH = USABLE_WIDTH * MAIN_WEIGHT`
  and `USABLE_WIDTH = FULL_PAGE_WIDTH - 2 * PAGE_MARGIN_SIDE -
  COLUMN_GAP`.
- `SIDEBAR_WIDTH` was hardcoded to 136pt. It must derive as
  `USABLE_WIDTH * SIDEBAR_WEIGHT`.
- The literal `row.weights(0.31, 0.69)` must reference the same
  weight constants used by the derived widths so the layout stays
  consistent if any of them change.

After this refactor, changing any base constant (page width, side
margin, column gap, sidebar weight) recomputes every dependent
dimension in one place. No per-region retuning.
