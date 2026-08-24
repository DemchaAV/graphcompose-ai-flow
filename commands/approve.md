---
description: Approve the current GraphCompose draft — DRAFT to APPROVED, supersede the previous approved revision, and publish the template bundle.
argument-hint: "[optional: revision id]"
---

Approve the current GraphCompose template draft.

Follow the `approve-template` skill in
`skills/workflows/approve-template/SKILL.md`. Confirm which revision is
being approved, read its `visual-review.json` first, and if the verdict
is `REVISE` or `BLOCKED` say so in one sentence and let the user confirm
before proceeding — never approve quietly over a blocked verdict.

Then run `graphcompose-flow approve` and `publish-template.mjs`, and
report the approved revision, the one it superseded, and the bundle path.

Revision: $ARGUMENTS
