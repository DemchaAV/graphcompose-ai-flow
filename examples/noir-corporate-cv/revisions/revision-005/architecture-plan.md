# Architecture Plan

## Revision Goal

Close the next visual layer after `revision-004`: badge proportion, identity
placement, and main-column rhythm.

## Patch Targets

| Layer | Change |
|---|---|
| CV badge | Increase `CV_DIAMETER` from 72 pt to 108 pt so the circle reads like the reference relative to the sidebar width. |
| Sidebar identity | Lower the badge by increasing `SIDEBAR_PAD_TOP`, then reduce the overlay-bottom spacer so the Contact block stays in the reference band. |
| Name bar | Move the name/title pair upward within the dark panel while preserving the panel height. |
| Main body | Increase top padding and section spacing so Profile, Education, and Work Experience land closer to the reference vertical sequence. |
| Work entries | Add a little more bottom rhythm between experience items. |

## Geometry

The badge remains relational:

```text
CV_LEFT_PAD = max(0, (INNER_SIDEBAR_WIDTH - CV_DIAMETER) / 2)
```

No raw coordinates were introduced. The revision changes named constants and
flow spacing only.

## Preserved Layers

- Iconify PNG transparency from `tools/asset-resolver/src/iconify.mjs`
- explicit `ClipPolicy.CLIP_PATH` circle semantics
- transparent rating dot assets
- data-driven `NoirCorporateCvSpec` rendering

## Remaining Architecture Gap

The next layer is the top surface: the reference has a dark page-wide band
behind a cream sidebar card. The current template still expresses this as a
right-column name bar plus cream left column. That should become a genuine
layer-stack or page-band composition in the next revision if the user wants an
approval-grade match.
