# Orchestration Decision

## Classification

Revision of existing `noir-corporate-cv` draft.

## Parent

- Parent revision: `revision-002`
- New revision: `revision-003`

## Route

Focused layer-by-layer continuation:

1. Fix asset resolver transparency so Iconify PNGs do not render white boxes.
2. Keep CV as a real `ShapeContainerBuilder.circle(...)` and make clipping
   explicit with `ClipPolicy.CLIP_PATH`.
3. Extend the cream sidebar plate with a derived bottom filler so the plate
   reads as a full-height page column.
4. Replace text-only rating dots with Iconify-backed transparent dot assets.
5. Re-render clean + debug outputs.
6. Update workflow prompts so future `REVISE` recommendations name the next
   visual layer and continue automatically when no user input is needed.

## Stop Condition

Do not call this fully approved. It is improved and rendered, but the next
visual layer is still page crop / exact top-bar/sidebar proportions.
