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
- A `CONVERGENCE_LIMIT_REACHED` verdict does **not** stop it. The loop
  ran out of budget with work still open and a document exists, which is
  exactly the state a person is meant to decide about; it is recorded as
  `verdictAtApproval` like any other. Refusing it was how one approval
  left by the door that writes nothing down, and the record then read as
  though the review had been clean.
- A `REVISE` verdict does not block — the human approving *is* the
  decision — but it is recorded as `verdictAtApproval`, and you should
  mention it in one sentence when reporting.
- A link declared in the data that never reached the rendered PDF stops
  the approval, also before anything changes, and names the targets.
  This is the one thing the user cannot have judged: they were looking
  at the render, where a dead link and a live one are the same pixels.
  Wire it and re-render rather than routing around the refusal — the
  previously published `navy-sidebar-cv` bundle ships every contact
  dead because nothing between the render and the bundle asked.
- **The bundle is a project, not the revision's one file.** Publishing
  splits the approved template into the structure the document already
  has — `theme/` for the tokens, one file per region under `sections/`,
  the blocks two or more sections share under `composites/`, and asset
  resolution under `support/` — leaving the template class reading as a
  table of contents. The revision stays a single file on purpose: that
  is what `source.mjs`, `check-structural-smells` and
  `restore-component` address, and what keeps a loop pass cheap.

  The split is deterministic and does not ask you anything. It uses the
  revision's `architecture-plan.json` to name the sections after their
  regions when there is one, and the `render*` prefix otherwise.

  A template it cannot account for — instance state, a constructor, a
  construction it cannot parse — publishes **flat**, with the reason on
  `template.json`'s `layoutReason`. That is not a failure and does not
  need fixing; say which layout was published if the user asks, and
  otherwise leave it alone.
- **The published bundle must render what the user approved.** The
  `render` tier now compares its own render with the approved revision's
  `output.png` and fails on any difference. If a structured bundle does
  not match, the command republishes it flat and re-verifies, recording
  `layoutFallback` — the layout is what goes, never the approval, because
  the user was looking at a picture and the bundle is meant to be that
  picture's source. A parity failure is the only thing that triggers the
  fallback; anything else fails identically under both layouts and
  republishing would hide the cause.

  When the revision is not in this workspace there is nothing to compare
  against, and the check reports itself skipped rather than passing.
- Verification runs on the published bundle and **renders it** by
  default: the `render` tier compiles the bundle standalone and puts its
  own example data through the renderer. `--verify static` compiles
  only, and `--verify none` skips it. A verify failure exits 1 *after*
  reporting the completed approve and publish — the state is real, and
  hiding it would be worse.

  The default is `render` because compiling is not working. The first
  bundle published from a real run compiled cleanly and could not
  render: `assets-manifest.json` never reached it, so every icon
  resolved to nothing — `No icon resolved for token "phone"`. Static
  verification passed it, and it would have shipped that way if the
  agent had not chosen `--render` on its own. Do not step down to
  `static` to get past a failure; a bundle that cannot render is the
  finding, not the obstacle.

**3. Fill the README's hand-written half, when it is worth it.**

The command generates everything derivable — preview, bundle contents,
dependencies, usage — and leaves two sections below a marker: *Design
notes* and *Known limitations*. If the run discovered anything a
maintainer needs (a library behaviour worked around, an accepted
difference from the reference), write it there. Everything above the
marker is regenerated on every publish; everything below it survives.

**4. Report.** Name the approved revision, what it superseded, the
bundle path, and the verify result. A published bundle the user cannot
find is not delivered. Mention the layout only when it is worth a
sentence: a structured bundle is worth naming its section count once, and
a fallback to flat is worth naming its reason.

## What must not happen

- Approving a revision that is already APPROVED — that path is
  `undo` / `revert-approved`.
- Approving without publishing, unless the user asked for the flip only.
- Editing statuses by hand.
- Opening a new revision. Approval closes one; it never starts one.

## Related

- [`../references/scope-routing.md`](../references/scope-routing.md) — what the gates meant
- [`../revise-template/SKILL.md`](../revise-template/SKILL.md) — if the answer is "almost, but…"
