---
description: Turn a document reference (screenshot, PDF, design image) into a GraphCompose Java template, then render, compare and iterate until it is ready for approval.
argument-hint: "[path to the reference, or a note about it]"
---

Create a GraphCompose template from the reference the user has supplied.

Follow the `create-template` skill in
`skills/workflows/create-template/SKILL.md` — read it before starting,
including the shared references it links to. In short: resolve the
workspace and the GraphCompose version from the user's build file, load
only the skill files the loading map lists, analyse the reference into
named regions, map those regions to named render methods, write the
template, render, compare, and keep fixing the single largest mismatch
until the review says ready for approval or blocked.

Do not approve anything: that is the user's call, and `/approve` runs it.

Reference or context supplied: $ARGUMENTS
