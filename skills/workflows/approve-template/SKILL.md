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

**1. Confirm what is being approved.** The user's "approve" refers to the
render they just looked at. If the current draft is a different revision
than the one last shown, say so instead of approving silently. That
confirmation is the only judgement in this skill.

**2. Run the composite.**

```bash
node scripts/approve-and-publish.mjs --project <project-id> [--root <workspace>]
```

One command does the whole flow — approve (DRAFT → APPROVED, previous
APPROVED superseded), publish, generate the bundle README's stable half
from `template.json`, verify the bundle, and report the cycle's telemetry
— and answers with one result. Do not run the individual commands
one at a time; five separate turns for a deterministic chain is what
this command exists to remove, and it was measured costing 11 model
requests before it existed.

What it enforces, so you do not have to:

- Only a DRAFT can be approved; anything else is refused with the reason.
- A `BLOCKED` verdict stops the fast path **before** anything changes.
  Tell the user the failure category; if they still insist, the revision
  manager's own `approve` remains available — deliberately less
  frictionless.
- A `REVISE` verdict does not block — the human approving *is* the
  decision — but it is recorded as `verdictAtApproval`, and you should
  mention it in one sentence when reporting.
- Verification runs on the published bundle (static tier by default;
  `--verify render` also compiles and renders it standalone). A verify
  failure exits 1 *after* reporting the completed approve and publish —
  the state is real, and hiding it would be worse.

**3. Fill the README's hand-written half, when it is worth it.**

The command generates everything derivable — preview, bundle contents,
dependencies, usage — and leaves two sections below a marker: *Design
notes* and *Known limitations*. If the run discovered anything a
maintainer needs (a library behaviour worked around, an accepted
difference from the reference), write it there. Everything above the
marker is regenerated on every publish; everything below it survives.

**4. Report.** Name the approved revision, what it superseded, the
bundle path, and the verify result. A published bundle the user cannot
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
