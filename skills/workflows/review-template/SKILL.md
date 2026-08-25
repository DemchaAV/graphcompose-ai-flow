---
name: review-template
description: Compare a rendered GraphCompose template against its reference or its parent revision and report what is still different, without opening a new revision. Use when the user asks "what's still different?", "review the current version", "compare it with the screenshot", "show me the diff", "how close are we?" — or when a create/revise pass has just rendered and needs a verdict before deciding whether to iterate again.
---

# Review a GraphCompose render

Measure first, then interpret. This skill produces a verdict and a
ranked list of mismatches — it does **not** open a revision, edit the
template, or approve anything.

## When this applies

- The user asks what is still different, or how close the render is.
- A create or revise pass has just rendered and the loop needs a verdict
  to decide whether to iterate.

If the user wants the difference *fixed*, this skill produces the
verdict and `revise-template` acts on it.

## Inputs

From the revision folder: `output.png` (and `output-page-N.png`), the
project's `reference/reference.png`, the parent revision's output when
one exists, `layout-snapshot.json`, and the scope recorded in
`revision.json`.

The scope decides what "different" is even measured against — see
[scope routing](../references/scope-routing.md). Reviewing a
`refactor-only` revision against the reference image instead of its
parent answers the wrong question entirely.

Reviewing needs one skill file, not a pack: `visual-regression.md`, per
the pack's `00-loading-map.md`. Reach for a topic file only when a
mismatch turns out to be about that topic.

## Steps

**1. Measure.** Run the deterministic comparison before looking at
anything:

```bash
node scripts/render-and-diff.mjs --project <id> --revision <revision-id> --skip-render [--against parent]
```

`--skip-render` reuses the existing render, so this is the measure step
alone: the reference is scaled to the render's size automatically (and
persisted as `reference-scaled.png`), the diff and stats land in the
revision folder, and the loop verdict comes back as the exit code.

The pass also checks that each region is built the way its role says —
a footer through `DocumentSession.footer` rather than a bled fill, a
table through `addTable`, an icon through `addSvgIcon` — and, once the
reference has more than one page, that the page model and the
keepTogether / keepWithNext rules were decided rather than left to
happen. Those findings name a region and a render method, so they are
read against the template, not against the images.

Run it even when you can see what is wrong. A revision whose render was
never compared carries none of the harness's gates, and the loop treats
it as unfinished rather than as a judgement call: `iterate-status`
answers `REVISE` with the focus `unmeasured-render`, and
`approve-and-publish` refuses. A review written from the render alone can
be entirely correct about what it saw and still be silent about the page
it never compared.

For a document longer than one page, every page is measured. Page 1 keeps
the familiar names; page N is `diff-page-N.png` against
`reference-scaled-page-N.png`, and the report's `pages` array and
`worstPage` say where to look first. Review the worst page, not page 1 —
on a proposal, page 1 is the cover and is the page most likely to be
right. If `missingFromRender` is not empty, those pages were never
compared and no number in the report says anything about them.
`--against parent` diffs against the parent revision's render instead —
what the `exact-diff` and `region-diff` gates compare — and never
resamples: parent and child come from the same renderer, so a size
difference there is a real change, not a resolution mismatch.

The underlying `visual-diff` CLI remains available for a bare two-image
comparison. For a region-aware gate, mask first with
`node tools/visual-diff/bin/mask-regions.mjs --input … --regions-file …
--mode keep-only`, then diff the masked pair.

Under `exact-diff` and `region-diff` gates the numbers *are* the
verdict. Quote the metric verbatim — `AE == 0`, not "looks identical".

**1b. When a table looks wrong, compare the borders, not the rows.**
Counting rows answers the wrong question. A reference that groups two
adjacent rows draws **no line between them on purpose**, and a render
that draws one there has not matched more closely — it has broken the
grouping. The reverse costs just as little in pixels: a divider the
render lost is a hairline among hundreds of thousands of pixels, so the
diff scores it as noise.

```bash
node scripts/check-border-topology.mjs --project <id> --revision <revision-id> --region items-table
```

Scope it with `--region` to the region whose bounds cover the table.
Whole-page is available and noisy: a filled band or a curved masthead
edge is not a rule, and while thick fills are excluded, a curve's edge
still crosses the scan intermittently.

Three findings, three different meanings:

| Finding | What it means | What to do |
|---|---|---|
| `rule-missing-from-render` | the reference draws it, the render does not | a divider was **lost** — restore it |
| `rule-only-in-render` | the render draws it, the reference does not | if the reference groups content there, **this line is the defect** — suppress it |
| `rule-displaced` | the same rule, out of place | move it; do not add or remove anything |

Suppress a shared divider through the table, never around it: borders
are per cell, so an unstroked cell is how a table draws no line. Do not
replace the table with positioned shapes to hide one rule, and do not
paint a white rectangle over it — a rectangle stays on page one while
the rule moves. See
[`table-borders-are-per-cell`](../../../observations/graphcompose-2.2/table-borders-are-per-cell.json)
for what unstroking actually removes, which is more than the one edge.

**2. Look.** Read the reference and the output as images, region by
region, in the priority order from
[the iteration loop](../references/iteration-loop.md): geometry, then
surfaces, then anchors and spacing, then typography, then small marks,
then colour. Compare like with like — same page, same region.

**3. Classify.** Every difference gets one of the closed set:
`CRITICAL`, `MAJOR`, `MINOR`, `ACCEPTED_LIMITATION`,
`INTENTIONAL_DIFFERENCE`. Do not invent classifications.
`ACCEPTED_LIMITATION` is never assigned automatically — it requires a
human note saying it was accepted.

**4. Write `visual-review.json`** against
[the schema](../../../schemas/visual-review.schema.json). JSON only —
the readable `.md` is generated:

```bash
node scripts/render-artifact-md.mjs <revision-dir>/visual-review.json
```

Never hand-write the `.md`. Two documents describing one revision drift,
and a reviewer reading the prose can then disagree with the gate reading
the JSON. Anything the schema cannot carry — a table comparing this
revision to the last two, a paragraph of causal reasoning — goes in the
JSON's `notes` array, which the generator emits verbatim.

The three fields that carry weight:

- `verdict` — `READY_FOR_APPROVAL` | `REVISE` | `BLOCKED`. Drives the
  loop. Distinct from `recommendation` (`APPROVE` / `REVISE` /
  `REJECT`), which advises the human. Never write `APPROVED`.
- `mismatches[].id` — stable kebab-case, e.g. `header-height`. **Reuse
  the id verbatim** when a problem survives a fix; that repetition is
  how the loop notices it is not converging.
- `largestMismatch` — the one id the next pass should fix, with a
  concrete `action` ("reduce vertical padding"), not a diagnosis
  ("header is wrong").
- `humanReportedMismatch` — set it whenever the user named a difference,
  with their words verbatim in `quote`. It outranks `largestMismatch`
  until a review sets `addressed: true`, which is what stops a person's
  observation being displaced by whatever occupies the most pixels.
- `mismatches[].rootCause` — a shared id when several mismatches are
  symptoms of one cause in one region. A pass may then fix them
  together, and the loop bound counts causes rather than symptoms.
- `pixelSimilaritySignal` — the whole-page pixel figure, under the name
  that says what it is. It over-weights anti-aliasing and under-weights
  structural error, so it can fall while the document visibly improves;
  never let it decide a verdict. `score` is the old name for the same
  number and is still read.

A `BLOCKED` verdict needs a `failureCategory`. Under a diff gate, put
the measured numbers in `gate.pages[]` / `gate.regions[]` and the
command output in `gate.metric`.

**5. Report** the verdict, the largest mismatch, and the next concrete
fix — in that order. The user should not have to open a JSON file to
learn whether it is close.

## Judgement calls

- **A clean gate is not automatically READY.** `AE == 0` against a
  parent proves nothing changed; for a `visual-change` scope the
  question is whether it matches the *reference*.
- **Score is a signal, not a gate.** A 96 with a `CRITICAL` structural
  mismatch is a `REVISE`.
- **Do not soften.** If the header is visibly taller, it is `MAJOR`
  even when the parity number is flattering — pixel counts undersell
  structural error and oversell anti-aliasing noise.

## Related

- [`../references/iteration-loop.md`](../references/iteration-loop.md) — priority order, bounds, failure categories
- [`../references/scope-routing.md`](../references/scope-routing.md) — which gate applies
- [`../revise-template/SKILL.md`](../revise-template/SKILL.md) — to act on the verdict
