# Visual Review

## Summary

Revision-003 is materially closer than revision-002. The obvious white icon
boxes are gone, the CV badge is an explicit clipped circle, the sidebar plate
extends down the page, and rating meters are rendered from transparent assets.

## Approval Recommendation

REVISE.

This is not an approval stop. The next layer is macro geometry and crop
proportion.

## Fixed vs revision-002

| Component | Result |
|---|---|
| Contact icons | PASS - no white square backgrounds |
| Interest icons | PASS - no white square backgrounds |
| CV badge | PASS - real circular shape container with explicit clip path |
| Sidebar plate | PASS - visually reads as full-height left plate |
| Rating dots | PASS - real filled/open transparent PNG assets |

## Remaining Mismatches

| Component | Classification | Notes |
|---|---|---|
| Page/top crop | MAJOR | Reference top dark region starts at the screenshot edge; current page still has an A4 margin and a separated main name bar. |
| Sidebar top card | MAJOR | Reference has a tighter cream top card over a dark top field; current sidebar is one continuous cream plate. |
| Vertical density | MAJOR | Main content ends too high compared with the reference; next pass should rebalance text size, gaps, and/or page crop. |
| Work marker connector | MINOR | Bullet-plus-connector text is closer but still not the exact dot-line primitive. |

## Next Revision Patch Target

Target `revision-004`.

Edit:

- `examples/noir-corporate-cv/revisions/revision-004/generated-template.java`

Expected changes:

1. Rework the top region so the dark name bar/crop aligns closer to the
   screenshot.
2. Split sidebar into a top identity card and lower plate if GraphCompose
   section fills allow the shape without introducing coordinate soup.
3. Increase vertical density in the main column so Work Experience reaches
   closer to the reference bottom.

Evidence:

- `reference/reference.png`
- `revisions/revision-003/output.png`
- `revisions/revision-003/output-debug.png`
