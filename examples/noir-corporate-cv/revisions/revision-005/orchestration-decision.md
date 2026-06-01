# Orchestration Decision - revision-005

## Gesture

Continue autonomous visual iteration after the previous draft rendered cleanly.

## Routing

- Parent revision: `revision-004`
- Changed components: identity badge scale/placement, name bar typography
  placement, main body vertical rhythm
- Agents required:
  - Architecture Mapper
  - Template Coder
  - Test + Render
  - Visual Review

## Decision

The current flow must keep moving from concrete visual evidence to the next
patch. `revision-004` fixed badge visibility and macro bar height work, but
the badge still read too small and the main body did not match the reference's
vertical rhythm closely enough.

## Constraints

- Keep the template data-driven through `NoirCorporateCvSpec`.
- Preserve transparent icons and rating dots from `revision-003`.
- Do not introduce raw PDF drawing or coordinate-only layout.
- Keep all widths derived from page constants and row weights.
