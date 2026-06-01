# Visual Review

## Summary

Revision-005 is closer than revision-004 on the user-called layer. The CV badge
now reads as a large clipped circle with centered `CV` text, icons remain clean
transparent PNGs, and the main column no longer bunches all content near the
upper half.

## Approval Recommendation

REVISE.

This is a good draft, but not an approval-grade match yet. The next concrete
layer is top-surface composition.

## Fixed vs revision-004

| Component | Result |
|---|---|
| CV badge scale | PASS - circle is much closer to reference/sidebar proportion |
| CV text alignment | PASS - text remains centered after the badge resize |
| Contact/interest icons | PASS - no white square backgrounds |
| Rating dots | PASS - transparent filled/open PNG dots still render |
| Main vertical rhythm | PASS - Education and Work Experience sit lower and closer to the reference sequence |

## Remaining Mismatches

| Component | Classification | Notes |
|---|---|---|
| Top dark band | MAJOR | Reference uses a page-wide dark band behind the cream sidebar card; current render still has a right-column-only dark name panel. |
| Sidebar top surface | MAJOR | Reference reads as a cream card laid over the dark band. Current sidebar is a full-height cream plate from the page margin. |
| Exact work timeline connector | MINOR | Bullet-plus-connector text approximates the dot-line marker but is not a dedicated timeline primitive. |
| Typography micro-fit | MINOR | Heading tracking and body sizes are close enough for draft but should be tuned after the top-surface architecture is corrected. |

## Next Revision Patch Target

Target `revision-006`.

Edit:

- `examples/noir-corporate-cv/revisions/revision-006/generated-template.java`

Expected changes:

1. Introduce a semantic top-band/page-surface composition so the dark region
   runs behind the left identity card.
2. Keep the cream sidebar content as a real panel/card layer, not a raw canvas
   rectangle.
3. Preserve the already-fixed transparent icons, clipped badge, and data-spec
   renderer.

Evidence:

- `reference/reference.png`
- `revisions/revision-005/output.png`
- `revisions/revision-005/output-debug.png`
