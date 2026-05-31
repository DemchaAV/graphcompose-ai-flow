---
skillId: revision-discipline
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.6
status: needs-validation
lastValidated: 2026-06-01
---

# Revision Discipline Skill

Use this skill whenever a change to a template is proposed: a first
generation, a "make it darker" tweak, an approval, a rejection, an
undo, a revert, or a selective rollback. Revision discipline is the
safety layer that keeps the workflow auditable and every change
reversible.

## When to load

Load this skill on every change. There is no situation in which
revision discipline is optional. The Revision Manager Agent owns the
full machinery; this skill is the contract the rest of the pipeline
follows when it interacts with revisions.

## Core rule

Quoted verbatim from §5.9 of the project plan:

```text
Never overwrite the approved revision directly.
Every change creates a new revision.
```

This rule is non-negotiable. Even a one-line edit to a render method
produces a fresh `revision-N` folder; the previous revision keeps its
artifacts intact. The cost is folder count. The benefit is that
every step is reversible and the rollback flows in
[`../../../docs/rollback.md`](../../../docs/rollback.md) become mechanical
rather than guesswork.

## What "creates a revision" means

Every change produces:

- a new `revisions/revision-N/` folder
- a fresh `revision.json` with a unique `id`, the correct
  `parentRevisionId`, an initial `status` of `DRAFT`, the
  `userRequest`, the `targetGraphComposeVersion`, the `skillPack`,
  and the list of `changedComponents`
- a fresh copy of any artifact that is produced for this revision
  (template, test, patch diff, layout snapshot, PDF, preview image,
  visual review, test result, status note)
- a `parentRevisionId` that always points at the revision the new
  draft was derived from

The artifact inventory and revision-metadata shape live in
[`../../../docs/revision-model.md`](../../../docs/revision-model.md). The
skill defers to that page for the exact JSON.

## No destructive overwrite of approved revisions

The `currentApprovedRevisionId` in `template-project.json` is the
source of truth. Tooling and agents must treat the approved revision
folder as read-only. The only way to "change" an approved revision is
to:

1. create a new revision derived from it
2. modify the new revision
3. obtain user approval
4. flip the approved pointer to the new revision

The old approved revision keeps its files. It transitions to
`SUPERSEDED` in its own `revision.json`, not in the new one.

## Failed revisions are preserved

A revision that fails — compile failure, render failure, visual
review failure — does not vanish. Its folder stays on disk with
every artifact that was produced before the failure:

- compilation failure: `build.log` and the partial
  `generated-template.java` remain
- render failure: `render.log` and the upstream artifacts remain;
  `output.pdf` may be missing
- visual review failure: `output.pdf`, `output.png`, and
  `visual-review.md` all remain

The revision's `status` is flipped to `FAILED` in its own
`revision.json`. The next revision is created from the previous good
draft (or the approved revision), never by editing the failed folder
in place. See
[`../../../docs/revision-model.md`](../../../docs/revision-model.md) for
the failure handling rules.

## Approval rules

Approval flips a `DRAFT` revision to `APPROVED` and updates
`currentApprovedRevisionId` in `template-project.json`. Approval is
permitted only when the revision satisfies every condition in
[`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md):

- no critical mismatches remain
- no major mismatches remain unless explicitly accepted
- minor mismatches are documented
- all generated artifacts exist
- code compiles
- PDF renders
- preview image exists
- `visual-review.md` is written
- revision metadata is complete

The Visual Review Agent's approval recommendation is advisory. Only
the Revision Manager Agent, acting on user instruction, performs the
status flip.

## Rollback rules

Three rollback types are supported. All three create a new revision
— nothing is overwritten in place.

### Undo

Discards the current draft. The new revision's `parentRevisionId` is
the parent of the discarded draft; the discarded draft is relabeled
`REJECTED` or `SUPERSEDED`. The discarded draft keeps its artifacts.

### Revert to approved

Creates a fresh draft from `currentApprovedRevisionId`. The approved
pointer is left untouched. The new revision becomes the draft
pointer. This is the "panic button" path.

### Selective rollback

Creates a new revision derived from the current draft, replacing one
or more components with the implementation from an older revision.
The new revision's `parentRevisionId` is the current draft; its
`changedComponents` lists exactly which components came from which
older revisions.

Selective rollback works only when the template is componentized.
Each visible component must be a small private render method
(`renderHeader(...)`, `renderHero(...)`, `renderLineItems(...)`,
`renderFooter(...)`, and so on). If the layout lives in a single
monolithic `compose` method, selective rollback degrades to manual
patching. Componentization is therefore part of the rollback
architecture, not a style preference.

See [`../../../docs/rollback.md`](../../../docs/rollback.md) for the user
phrases that trigger each rollback type and the exact procedure.

## Required artifacts in every revision

A revision is incomplete if any of the following is missing for the
work it was supposed to do:

- `revision.json` with `id`, `parentRevisionId`, `status`,
  `userRequest`, `targetGraphComposeVersion`, `skillPack`,
  `changedComponents`, and the artifact map
- `user-request.md` capturing what the user asked for
- `architecture-plan.md` or `patch.diff` describing the intended
  change
- `generated-template.java` (or a documented failure record)
- `output.pdf` and `output.png` (or a documented render failure)
- `visual-review.md` (or a documented review failure)
- `status.md` written by the Revision Manager Agent

A revision without these artifacts cannot be approved. It can still
be saved as `FAILED` — see the failed-revision section above.

## Common mistakes

1. **Editing a previous revision's files in place.** Forbidden. Every
   change creates a new revision.
2. **Approving a revision with missing artifacts.** Approval requires
   the full artifact set. A missing preview image blocks approval.
3. **Treating selective rollback as a multi-component edit.** It is a
   structured copy of named components from named revisions, not a
   free-form patch.
4. **Discarding a failed revision.** Failed revisions are preserved
   with their artifacts. The audit trail depends on it.
5. **Authoring a monolithic template.** A single giant `compose`
   method breaks selective rollback. Use named private render
   methods.

## Cross-references

- [`../../../docs/revision-model.md`](../../../docs/revision-model.md) —
  project and revision metadata, statuses, artifact inventory
- [`../../../docs/rollback.md`](../../../docs/rollback.md) — the three
  rollback types and the user phrases that trigger them
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  — approval rule
- [`visual-regression`](visual-regression.md) — how visual review
  decisions feed into revision status
- [`troubleshooting`](troubleshooting.md) — failure-handling for
  revisions that cannot produce expected artifacts
