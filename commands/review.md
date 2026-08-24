---
description: Compare the current GraphCompose render against its reference or parent revision and report what is still different, without opening a new revision.
argument-hint: "[optional: which project or revision]"
---

Review the current GraphCompose render.

Follow the `review-template` skill in
`skills/workflows/review-template/SKILL.md`. Measure first with
`visual-diff` — under the exact-diff and region-diff gates the numbers
are the verdict, quoted verbatim — then look at the reference and the
output region by region in the priority order geometry, surfaces,
anchors and spacing, typography, small marks, colour.

Write `visual-review.json` against its schema, then the readable `.md`
beside it, and report the verdict, the largest mismatch and the next
concrete fix in that order.

Do not open a revision and do not edit the template; this is a verdict,
not a change.

Target: $ARGUMENTS
