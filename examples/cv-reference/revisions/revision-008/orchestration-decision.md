# Orchestration Decision

## Task

Refactor `GeneratedCvTemplate` so layout dimensions are computed
from a small set of base constants (page geometry + column weights)
instead of hand-tuned pixel values. Also encode the principle into
`prompts/template-coder-agent.md` so future agents reach for the
formula first.

## Decision

Revision of `revision-007` (current APPROVED baseline). The
orchestrator routes only through Template Coder — content, assets,
fonts, and spec are untouched; only the constants block + the two
`row.weights(...)` calls change. Visual Review classifies the small
pixel diff as `INTENTIONAL_DIFFERENCE` because the derived width
(150.765pt) is a slight, deliberate correction to revision-007's
hardcoded 150pt.

## Scope

- Add `SIDEBAR_WEIGHT` and `MAIN_WEIGHT = 1 - SIDEBAR_WEIGHT`
  constants.
- Derive `USABLE_WIDTH`, `SIDEBAR_WIDTH`, `MAIN_WIDTH`,
  `GRID_COLUMN_WIDTH`, `SKILL_BAR_WIDTH` from the base constants.
- Replace literal `row.weights(0.31, 0.69)` with
  `row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT)`.
- Group the constants block into three labelled sub-sections (page
  geometry, column proportions, derived widths) so the dependency
  direction is visible at a glance.

## Out Of Scope For This Revision

- Page-1 geometry (still uses the same constants and the same
  `weights(0.31, 0.69)` math, which now flows from the named
  constants).
- The skill bar height, the icon point sizes, the grid gap — those
  are genuinely independent dimensions and stay as plain constants.
- Asset-request, cv-data, fonts — unchanged from revision-007.
