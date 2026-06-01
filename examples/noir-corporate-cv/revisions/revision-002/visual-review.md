# Visual Review

## Result

Status recommendation: keep as DRAFT.

Revision-002 is a real visual draft rather than a structural placeholder. It
adds the high-signal surfaces missing from revision-001: cream sidebar, dark
top bar, full-width dark section bars, and a circular CV badge.

## Rendered Artifacts

- `output.pdf`
- `output.png`
- `output-debug.pdf`
- `output-debug.png`

## Comparison

Because the reference screenshot is `353x506` and the rendered preview is
`1240x1753`, the numeric compare below uses a forced resize of the reference to
the rendered dimensions. Treat it as a rough smoke metric, not an approval
gate.

```text
magick reference.png -resize 1240x1753! miff:- | magick compare -metric AE - output.png null:
AE = 1.71198e+06 (0.787578)
```

## Improved vs revision-001

| Region | Revision-001 | Revision-002 |
|---|---|---|
| Sidebar plate | white page background | cream fill present |
| CV badge | text-only `CV` | dark circular badge with white initials |
| Name bar | plain dark text | dark plum filled bar with white text |
| Main headings | dark text + underline | dark plum full-width bars with white text |
| Data contract | embedded fixture strings | `NoirCorporateCvSpec` + `cv-data.json` |

## Remaining Differences

| Region | Classification | Notes |
|---|---|---|
| Screenshot crop / page scale | ACCEPTED LIMITATION | Reference is a small screenshot, not a PDF source. Render is a true A4 preview. |
| Rating dots | DOCUMENTED SUBSTITUTION | Uses font-safe `bullet` + `o`; exact filled/open circle glyphs remain a future raster-dot asset pass. |
| Work markers | DOCUMENTED SUBSTITUTION | Uses a text prefix and GraphCompose list bullets. The exact dot-plus-connector marker needs a future non-nested primitive approach. |
| Sidebar top shape | MINOR | Reference has a tighter top card crop; revision-002 uses one continuous cream plate with a centered circular badge. |
| Icon boxes | MINOR | Iconify raster glyphs carry small white square bounds in the preview; acceptable for draft, can be solved by transparent icon post-processing if needed. |

## Next Revision Candidates

1. Generate transparent filled/open dot PNG assets and render meters as inline
   images.
2. Replace text work markers with a table or layer-stack pattern that does not
   violate GraphCompose's nested-row restriction.
3. Fine-tune page crop, sidebar height, and top bar height after user review.
