# Architecture Plan

## Revision Goal

Apply the user's requested visual polish without reopening the failed
LayerStack top-surface architecture.

## Patch Targets

| Layer | Change |
|---|---|
| Sidebar geometry | Reduce bottom filler and tighten section spacing so the beige plate reads more balanced on the page. |
| CV badge | Keep the clipped circle and increase `CV` text from 23 pt to 36 pt with regular decoration. |
| Name bar | Add a centered thin divider line between the name and job title; slightly increase name/title text. |
| Main heading bars | Increase bar padding and heading font size; widen bars after main-body padding adjustment. |
| Sidebar typography | Add dedicated larger sidebar heading/label/body styles so main body text does not inflate. |
| Work timeline | Replace `• --` text with a bullet title plus real `LineBuilder.vertical(...)` connectors. |

## Geometry Notes

- Column widths still derive from page constants and row weights.
- The main body gets its own left padding so the top name panel can sit closer
  to the sidebar while body content keeps breathing room.
- Timeline connectors use GraphCompose `LineBuilder.vertical(...)`, not raw
  drawing.

## Preserved Layers

- Data spec and spec provider stay unchanged.
- Iconify PNG transparency stays unchanged.
- `revision-006` blocker remains documented separately.
