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
| `refactor-only` | `exact-diff` | parent revision | `magick compare -metric AE` is **0 on every page** |
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
