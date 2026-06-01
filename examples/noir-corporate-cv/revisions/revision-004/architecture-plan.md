# Architecture Plan

## Revision Goal

Continue the visual match beyond the `revision-002` near-draft and close the
next concrete layer of defects.

## Patch Targets

| Layer | Change |
|---|---|
| Asset pipeline | Force Iconify raster output to `png32` with alpha and transparent white pixels. |
| Sidebar | Extend cream plate height using derived page-content height. |
| CV badge | Keep `ShapeContainerBuilder.circle(...)`; add explicit `ClipPolicy.CLIP_PATH`. |
| Rating meters | Add `rating-filled` and `rating-open` transparent Iconify PNGs. |
| Work markers | Replace plain dash prefix with bullet-plus-connector text approximation. |
| Workflow | Update orchestrator/review docs so `REVISE` continues layer-by-layer. |

## Geometry

New derived sidebar fill:

```text
FULL_PAGE_HEIGHT     = 842
PAGE_CONTENT_HEIGHT  = FULL_PAGE_HEIGHT - PAGE_MARGIN_TOP - PAGE_MARGIN_BOTTOM
SIDEBAR_BOTTOM_FILL  = PAGE_CONTENT_HEIGHT * 0.36
```

The spacer is a layout primitive used to make the sidebar fill behave like a
full-height plate. It is derived from page height, not tuned as a free pixel.

## Assets

Revision-003 now requests nine icons:

- contact/interest icons inherited from revision-002
- `rating-filled`: `mdi:circle`
- `rating-open`: `mdi:circle-outline`

The asset resolver now emits alpha PNGs:

```text
magick identify ... email.png => srgba ... opaque=False
```

## Remaining Architecture Gap

The exact top-left card shape in the reference mixes an edge-to-edge dark top
band with a cream sidebar card. That requires the next pass to rebalance page
margins and top surface layering.
