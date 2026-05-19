# Orchestration Decision

## Task

Resize the page-2 Awards and References two-column grid so it fills
the entire Main column width, with the divide between the two
columns sitting at Main's center.

## Decision

Revision of `revision-006`. Single constant change in the template
(`GRID_COLUMN_WIDTH: 130 → 150`); content, fonts, icons, and the
spec contract are untouched. The change is mechanical enough that
the orchestrator routes directly to Template Coder, then through
Test+Render and Visual Review without re-running Architecture
Mapper or Asset Resolver.

## Scope

- Bump `GRID_COLUMN_WIDTH` from 130 to 150 so 2 columns add up to
  300pt ≈ Main column inner width (301.5pt).
- Confirm the awards / references right column now ends at the
  page-right margin (same X as Experience body right edge).
- Confirm the left column still starts at the Main column's left
  edge (same X as Experience heading).

## Out Of Scope For This Revision

- Page 1 layout (unchanged from revision-006).
- Page-2 sidebar (Expertise / Skills / Social — unchanged).
- Experience body width (still wraps at Main inner width — that's
  the same Main this revision now fills with Awards/References).
- Spec schema and `cv-data.json` (data identical to revision-006).
