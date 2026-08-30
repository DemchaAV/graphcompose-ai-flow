# Scope routing

Which stages run, and which gate the work must pass, follows from one
choice: the scope. There are five, plus `new` for a first revision.

**The routing itself is not written here.** It lives in
[`config/pipeline.json`](../../../config/pipeline.json) and is printed
by:

```bash
node scripts/run-pipeline.mjs <project-id>
```

This page is about *picking* the scope. The config is about what
follows from the pick.

## Template Reuse First — before any scope

A scope is a question about a **revision**. Ask a cheaper one first:
does this need a revision at all?

```text
Before generating a new layout, check whether the user named or
selected an existing published template.

If they did, do not reconstruct it from its preview or its reference.
Instantiate the published bundle and change the data only, unless the
user asked for a structural or design change.
```

Reuse costs a file copy. Reconstruction costs a full loop — analysis,
authoring, render, compare, iterate — and lands somewhere near the
original rather than on it. An agent that rebuilds an approved layout
because the user described it has spent the expensive half of the
lifecycle to arrive at something already on disk.

```bash
node scripts/templates.mjs --json
```

Run it before analysing a reference. If a published bundle matches what
the user named, say so and offer it.

### `use` and `revise` are different gestures

| The user says | This is | What happens |
|---|---|---|
| "make a new proposal for Acme using Northline" | **USE** | `use-template`, then edit the data file. No revision. |
| "here is my CV content, use mint-editorial-cv" | **USE** | same — the content is data, and the layout already exists |
| "in Northline, make the header taller and move the logo right" | **REVISE** | a new revision in the project Northline was published from |
| "like Northline but two columns" | **REVISE** | a design change; the reuse is a starting point, not the answer |

The discriminator is what changes. New content is a **use**; new layout
is a **revise**. A gesture naming a template and describing a layout
change is a revise even though it names a template.

### Using a template opens no revision

`use-template` copies files into someone's project. It writes nothing
into the workspace, opens no revision, and produces no gate result —
there is nothing to approve, because the approval already happened.

And a published bundle is never where a design change is made. It is the
immutable output of an APPROVED revision, and `publish-template` rewrites
its sources from that revision on every publish, so an edit there is
silently reverted the next time anyone publishes. The path back is:

```text
published bundle → the project it came from → new revision
    → render / review → APPROVE → republish
```

If the source project is not in the workspace, say so rather than
editing the bundle. `template.json` records `sourceProject` and
`sourceRevision`, which is how you find out where it came from.

## Picking the scope

Read the gesture first, then verify it against the surface the change
would actually touch.

| Gesture sounds like | Scope | Only if the diff really lands in |
|---|---|---|
| "change the email", "fix the typo in the summary", "swap the phone number" | `data-only` | the project's `dataFile` (per `template-project.json`) |
| "use Material icons", "swap the icon set", "use Lato for body" | `asset-only` | `asset-request.json` |
| "make it navy", "darker accent", "tighter spacing" | `theme-only` | the theme bundle file (e.g. `<Preset>Theme.java`) |
| "rename that helper", "extract the spec", "upgrade GraphCompose" | `refactor-only` | Java outside the theme bundle, with no data or asset change |
| "add a section", "redesign the header", "make the sidebar wider" | `visual-change` | anything else |

The verification step is not optional. A gesture that sounds like
`data-only` but needs a new row is `visual-change`, and mislabelling it
means the gate compares against the wrong baseline and passes work that
should have been reviewed.

**Ambiguity gets exactly one question.** "Make the table darker" is
`theme-only` if it is a palette token and `visual-change` if it means
new row striping. Ask, then open the revision. Never guess and never
open a revision to explore.

## What each gate means

| Scope | Gate | Compared against | Passes when |
|---|---|---|---|
| `data-only` | `region-diff` | parent revision | affected regions may differ; every other region is byte-equal (`AE == 0`) |
| `asset-only` | `region-diff` | parent revision | same, for the regions using the swapped asset |
| `refactor-only` | `exact-diff` | parent revision | `render-and-diff --against parent` reports `mismatchPx` **0 on every page** (`AE == 0`) |
| `theme-only` | `visual-review` | reference image | layer-by-layer review; theme tokens are cross-cutting, so a parent diff would only prove "not byte-equal", not "correct" |
| `visual-change` | `visual-review` | reference image | every mismatch is at most `MINOR` or `ACCEPTED_LIMITATION` |
| `new` | `visual-review` | reference image | same as `visual-change` |

Quote the metric verbatim. "Looks identical" is not a gate result;
`AE == 0` is.

## Recording the decision

Write `orchestration-decision.json` before any stage runs, against
[`schemas/orchestration.schema.json`](../../../schemas/orchestration.schema.json):
`intent`, `scope`, `parentRevision`, the ordered `stages` and the
`gate`. Copy `stages` and `gate` from the scope's entry in the config
rather than retyping a chain from memory. The Markdown sibling carries
the gesture reading and the alternatives weighed.

The scope also goes into `revision.json` — but that field is owned by
`tools/revision-manager`, so pass it when opening the revision rather
than editing the file by hand.

## Skill validation applies to every scope

Only the `new` chain lists a Skill Validator stage, but validation is
enforced on *every* render: `scripts/lib/render-runtime.mjs` calls the
gate in `scripts/lib/skill-validation-gate.mjs`, and a `halt` verdict
exits the render with status 4. A short scope does not opt out of it.
