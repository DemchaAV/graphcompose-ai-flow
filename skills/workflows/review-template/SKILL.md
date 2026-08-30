---
name: review-template
description: 'Compare a rendered GraphCompose template against its reference or its parent revision and report what is still different, without opening a new revision. Use when the user asks "what''s still different?", "review the current version", "compare it with the screenshot", "show me the diff", "how close are we?" — or when a create/revise pass has just rendered and needs a verdict before deciding whether to iterate again.'
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

**If the report carries `aspectMismatchPages`, read that before any
percentage.** It means the reference and the render are not the same
shape, and `--scale-reference` stretched one onto the other before the
pixels were compared — so the mismatch you are looking at was measured
on a distorted reference and is *smaller* than the real difference. That
is a wrong page size, not a wrong layout, and no amount of nudging
regions will close it. Classify it CRITICAL regardless of the
percentage, settle the page size with `scripts/import-reference.mjs`
(exit 5 means it is a question for the user), and re-render. The rule is
in the accuracy contract under "The page size is measured".

**1a. Read the region table before you explain the page number.**
`render-and-diff` runs `region-diff` on every pass and writes
`region-diff-stats.json`; the report carries the ranking under
`regions.ranked`. Each region gets its own mismatch count, and next to
it the number that matters:

```
concentration = this region's share of the page's difference
                ÷ its share of the page's area
```

Even wear sits near `1.00x`. Anti-aliasing against a softly-rendered
reference produces exactly that — every text region near 1.00, a large
percentage, nothing to fix. A region well above it carries damage out
of proportion to its size, and *that* is where a structural defect is,
whatever the page total says.

This exists because a whole-page percentage cannot be checked, only
explained. A real run explained 9.734% as type rendering — correct in
outline — while a timeline rail ran straight through the marker meant
to cap it. Regions disagree with each other; a page total cannot.

Run it directly to interrogate one page:

```bash
node tools/visual-diff/bin/region-diff.mjs --reference <rev>/reference-scaled.png --output <rev>/output.png --regions-file <rev>/visual-analysis.json
```

Under `region-diff` the same tool **is** the gate: pass
`--changed <region-ids>` and it exits 2 when any region outside that
list carries mismatched pixels. Name the regions the scope was allowed
to touch, not the ones that happen to have moved.

The underlying `visual-diff` CLI remains available for a bare two-image
comparison, and `mask-regions --mode keep-only` still masks a pair by
hand when a rect does not correspond to a named region.

Under `exact-diff` and `region-diff` gates the numbers *are* the
verdict. Quote the metric verbatim — `AE == 0`, not "looks identical" —
and copy the per-region figures into `gate.regions[]`. A quoted number
that disagrees with the file it came from downgrades the verdict; see
"`READY_FOR_APPROVAL` is audited" below.

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

**1c. Ask what *kind* of thing is wrong, before deciding how bad it
is.** A block in the wrong place and a block in the wrong colour look
equally different in a diff, and the fixes have nothing in common — one
is a layout property on a named owner, the other is a file or a font.
Guessing between them from an image is how a pass spends itself nudging
margins until a *wrong icon* lines up.

```bash
node scripts/evidence.mjs --project <id> --revision <revision-id> --region <region-id>
```

It joins the three files that already hold the answer — the region
bounds read off the reference, the measured per-region pixel difference,
and the engine's own record of where every node ended up — and returns
about 4 KB: the owning node, how far it sits from where the reference
puts the region, its hierarchy, its children, and **the properties that
actually produced its position**.

`--mismatch <id>` builds it for a mismatch you already wrote; `--all`
does every mismatch in `visual-review.json` at once.

Read three things from it, in order:

1. **`cause`.** `GEOMETRY` means the box is genuinely misplaced — fix a
   layout property. `ASSET` means the box is right and the file is
   wrong, and the package says so with a prohibition attached: **do not
   compensate an asset with margins.** `PAGINATION` means stop; nothing
   else in the package means anything until the page count matches.
2. **`UNKNOWN` is a real answer, not a failure.** It means the box is
   where the reference puts it, so this is *not* geometry — which is
   already most of the decision. The candidates it lists
   (`TYPOGRAPHY`, `PAINT`, `CONTENT`) are the ones nothing deterministic
   can yet separate, so that separation is yours to make and to justify.
3. **`recommendedProperties`.** These are the terms that produced the
   node's position, taken from the layout chain — not suggestions. If
   the x came from `MainColumn.padding.left`, the edit belongs on
   `MainColumn`. Adding a margin to the node that shows the symptom is
   the compensating constant
   [the authoring rules](../references/authoring-rules.md) forbid.

**Never read `layout-snapshot.json` yourself.** It is 227 KB for a
one-page CV, of which one node is the answer; the package is the same
answer at a fiftieth of the size. `scripts/layout.mjs inspect` and
`explain` are there when you need a node the package did not name.


**2. Look.** Read the reference and the output as images, region by
region, in the priority order from
[the iteration loop](../references/iteration-loop.md): geometry, then
surfaces, then anchors and spacing, then typography, then small marks,
then colour. Compare like with like — same page, same region.

**3. Classify, twice.** Every difference gets a **severity** from
the closed set — `CRITICAL`, `MAJOR`, `MINOR`,
`ACCEPTED_LIMITATION`, `INTENTIONAL_DIFFERENCE`. Do not invent
classifications. `ACCEPTED_LIMITATION` is never assigned
automatically — it requires a human note saying it was accepted.

Record a **`cause`** beside it, from the second closed set:
`GEOMETRY`, `TYPOGRAPHY`, `PAINT`, `ASSET`, `CONTENT`,
`PAGINATION`, `UNKNOWN`. Severity is how bad, cause is what kind, and
neither substitutes for the other — both are also separate from
`rootCause`, which only groups symptoms of one origin. Take the cause
from step 1c's package where it assigned one; where it returned
`UNKNOWN` with candidates, either pick one and say why in `reason`, or
record `UNKNOWN` honestly. A confident wrong cause is worse than an
unresolved one: it sends the next pass to edit the wrong kind of thing.
The vocabulary is declared once in
[`config/pipeline.json`](../../../config/pipeline.json) as
`mismatchCauses`, and `docs/visual-accuracy-contract.md` explains each
value under "Cause classification" — that document is repository
reading, not runtime, so it is named rather than linked.

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

- `verdict` — `READY_FOR_APPROVAL` | `REVISE` |
  `CONVERGENCE_LIMIT_REACHED` | `BLOCKED`. Drives the loop. Distinct
  from `recommendation` (`APPROVE` / `REVISE` / `REJECT`), which
  advises the human. Never write `APPROVED`.

  The last two are not the same stop. `BLOCKED` means no usable
  document can be produced — the build fails, the render fails, the
  asset is missing. `CONVERGENCE_LIMIT_REACHED` means the loop spent
  its own budget with work still open, and it is the loop's to write
  only when a bound says so; the difference matters because `BLOCKED`
  stops an approval the user may already have given, and the other
  hands them the decision with the evidence attached.
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

### `READY_FOR_APPROVAL` is audited, not accepted

`iterate-status` checks the verdict against the evidence in the same
folder before it lets the loop stop. Four contradictions downgrade
`READY_FOR_APPROVAL` to `REVISE`, and the reason names which one:

| | |
|---|---|
| `binary-gate-failed` | `gate.passed: false` under `exact-diff` or `region-diff`. Those gates measure equality, so the failure is a fact. |
| `unresolved-severity` | a `CRITICAL` or `MAJOR` mismatch is still on the list. |
| `human-report-open` | `humanReportedMismatch` is present without `addressed: true`. |
| `gate-metric-unmeasured` | `gate.pages[]` page 1 disagrees with `visual-diff-stats.json`. |

Only the first is liftable, by `gate.override.reason` — at least 60
characters naming what was measured instead and why it is acceptable.
There is no override for the other three: a `CRITICAL` is reclassified
honestly or fixed, a report is addressed, and a quoted number matches
the file it was quoted from.

`gate.passed: false` under the `visual-review` gate does **not** block.
That gate compares against a rasterised design image whose
anti-aliasing no PDF renderer reproduces, so its page percentage is
never zero and a pass/fail read off it would mean nothing.

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
