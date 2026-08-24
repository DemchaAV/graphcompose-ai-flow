---
name: approve-template
description: Approve the current GraphCompose template draft and publish it as a template bundle. Use when the user signals acceptance of a rendered document — "approve", "save", "ship it", "looks good", "сохрани", "это хорошо" — after a create or revise pass has produced a render they are happy with. Flips DRAFT to APPROVED, supersedes the previous APPROVED revision, and rebuilds the published bundle under the workspace's templates/ directory.
---

# Approve a GraphCompose template

Almost no judgement here: the tools own the state machine. The job is to
confirm *what* is being approved, run two commands, and report what was
published.

## When this applies

The user accepts the current render: "approve", "save", "ship it",
"looks good", "that's the one", "сохрани", "это хорошо".

If they instead say "previous was better", "undo", "revert" — that is
rollback, not approval. Use `graphcompose-flow undo` or
`revert-approved`; both create a new DRAFT and neither rewrites history.

## Steps

**1. Find the project and the draft.**

```bash
node tools/revision-manager/bin/graphcompose-flow.mjs status --project <project-dir>
```

The project directory comes from the resolved workspace — see
[workspace resolution](../references/workspace.md) if you do not have it
yet. Confirm the revision you are about to approve is the one the user
just looked at; when the last render was a different revision, say so
rather than approving silently.

**2. Check the verdict, and be honest if it disagrees.**

Read the draft's `visual-review.json`. If `verdict` is
`READY_FOR_APPROVAL`, proceed. If it is `REVISE` or `BLOCKED`, the user
is approving something the review flagged — that is their call to make,
but state the open mismatches in one sentence first and let them
confirm. Never quietly approve over a `BLOCKED` verdict.

**3. Approve.**

```bash
node tools/revision-manager/bin/graphcompose-flow.mjs approve <revision-id> --project <project-dir>
```

This flips DRAFT → APPROVED, marks the previous APPROVED as SUPERSEDED
with `supersededBy`, and updates `currentApprovedRevisionId` in
`template-project.json`. Do not edit `revision.json` by hand to achieve
the same thing; the bookkeeping is the point.

**4. Publish the bundle.**

```bash
node scripts/publish-template.mjs --project <project-id> [--root <workspace>]
```

Add `--force-template` when the template class itself changed
(constants, render logic) — without it the publisher preserves the
polished Javadoc already in the bundle. Pass `--dry-run` first if you
want to show the user the plan before writing.

**5. Report.**

Name the revision that was approved, the revision it superseded, the
bundle path, and the files written. A published bundle the user cannot
find is not delivered.

## What must not happen

- Approving a revision that is already APPROVED — that path is
  `undo` / `revert-approved`.
- Approving without publishing, unless the user asked for the flip only.
- Editing statuses by hand.
- Opening a new revision. Approval closes one; it never starts one.

## Related

- [`../references/scope-routing.md`](../references/scope-routing.md) — what the gates meant
- [`../revise-template/SKILL.md`](../revise-template/SKILL.md) — if the answer is "almost, but…"
