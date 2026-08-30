---
name: revise-template
description: 'Change an existing GraphCompose template — content, assets, theme, structure, or a pure refactor — as a new revision with the right gate. Use when the user asks for a modification to a document that already renders: "change the email", "make the header darker", "use Lato", "swap the icon set", "make the sidebar wider", "add a section", "rename that helper", "make it navy". Picks the narrowest scope the change really needs, runs only the stages that scope requires, and proves the result against the gate that scope implies.'
---

# Revise a GraphCompose template

The whole craft here is picking the **narrowest** scope the change
honestly fits, because the scope decides both which stages run and what
"correct" is measured against.

## When this applies

The document already renders and the user wants it different. If there
is no template yet, use `create-template`. If they want to know
what is different rather than change it, use `review-template`.

**New content is not a revision.** "A proposal for Acme using Northline"
changes data, not layout, and belongs in the data file of whatever
project already uses that template — or in a fresh copy made with
`use-template`. Opening a revision for it produces an approval record for
a change nobody made to the template. See
[Template Reuse First](../references/scope-routing.md#template-reuse-first--before-any-scope).

**A published bundle is never where the change goes.** If the user names
a template under `templates/`, the revision belongs in the project it was
published from — `template.json` records `sourceProject` and
`sourceRevision`. `publish-template` rewrites a bundle's sources from its
revision on every publish, so an edit made in the bundle is reverted the
next time anyone publishes it, and in the meantime the bundle no longer
matches the revision it claims to come from.

## Steps

**0. Check the page size is settled.** One command, before the scope
question, on every revision:

```bash
node scripts/page-size.mjs --project <project-id>
```

Exit `0` means the page has been measured and answered and you can carry
on. Exit `5` means it never was — **stop and ask the user**, with the
question the command prints, then record the answer:

```bash
node scripts/page-size.mjs --project <project-id> --use <A4|LETTER|LEGAL|WxH> --decision "<what you asked and what they said>"
```

This is step zero rather than part of the scope work because a wrong page
size is not in scope for anything. Relational geometry derives from the
page: get the page wrong and every ratio built on it is faithfully wrong,
on every page, at a size the pixel diff cannot see — `visual-diff
--scale-reference` resamples the reference to the render's exact width
*and* height, so the error is stretched away immediately before the
pixels are compared. Three projects shipped that way with green gates.

`import-reference` settles this when a project is created, but a revision
does not re-import, and a project created before the measurement existed
carries no page size at all. This is where those meet the gate.

**1. Pick the scope.** Read the gesture, then verify it against the
surface the change would actually touch — the table and the
verification rule are in
[scope routing](../references/scope-routing.md). Ambiguity gets exactly
one clarifying question, asked before any revision is opened.

**2. Open the revision.** Never edit the current draft in place; every
change is a new revision.

```bash
node scripts/pass.mjs --project <project-id> --open "<the user's words>" [--report "<their words, when they named a symptom>"]
```

That is `new-revision` plus the screen you would otherwise assemble by
hand: the sources carried forward, the focus the loop is on, the
evidence's owning node and properties for it, what earlier passes tried,
and the budget. (`node tools/revision-manager/bin/graphcompose-flow.mjs
new-revision "<the user's words>" --project <project-dir>` is the bare
form.)

The render refuses to run into a revision that already carries a
`visual-review.json` — that revision's pass has been judged, and rendering
over it would replace the render the review was written about. It is the
one place the rule is enforced rather than stated, so if you see that
refusal, the answer is the command above and not `RENDER_SAME_REVISION=1`.

The cost of skipping it is not tidiness. A real run put three corrections
into one revision: the template was rewritten and the review overwritten,
so there was nothing to roll back to, the user's two corrections survive
nowhere in the record, and `iterate-status` — which counts iterations by
walking the revision chain — saw one pass where there had been three, so
every loop bound was off.

Then write `orchestration-decision.json`
([schema](../../../schemas/orchestration.schema.json)) with `intent`,
`scope`, `parentRevision`, and the `stages` + `gate` copied from the
scope's entry in `config/pipeline.json`. Print the chain with
`node scripts/run-pipeline.mjs <project-id>` rather than retyping it
from memory.

**3. Run only what the scope requires.**

| Scope | What you actually do |
|---|---|
| `data-only` | edit `<doc-kind>-data.json`. **No Java.** If Java has to change, the scope was wrong |
| `asset-only` | edit `asset-request.json`, re-run the asset resolver, leave Java alone |
| `theme-only` | edit the theme bundle file only |
| `refactor-only` | change Java structure with zero intended visual effect |
| `visual-change` | analyse the changed region, update the architecture plan, then the code |

For `visual-change`, re-analyse **only the region that changed**. Doing
a whole-document analysis for a sidebar tweak invents differences in
regions nobody touched.

Load skills the same way: the pack's `00-loading-map.md` has a
per-scope row. A `data-only` revision needs no topic file at all; a
`theme-only` needs colours and possibly typography; a `refactor-only`
needs the allow-list for the primitives being moved. Reloading the
whole pack for a one-line change is the cost the map exists to avoid.

Follow [the authoring rules](../references/authoring-rules.md)
throughout: derived geometry, named anchors, no content literals in
Java, no invented API.

**4. Render and measure — one command, against the baseline the scope
names.**

```bash
# refactor-only · data-only · asset-only: the parent revision is the baseline
node scripts/render-and-diff.mjs --project <project-id> --revision <revision-id> --against parent

# theme-only · visual-change: the reference is
node scripts/render-and-diff.mjs --project <project-id> --revision <revision-id>
```

Or, the same run with its result on one screen instead of a page of JSON:
`node scripts/pass.mjs --project <project-id> [--against parent]`.

Not `render.mjs` on its own. A bare render leaves no comparison beside
it, and `iterate-status` then answers `REVISE` with the focus
`unmeasured-render` whatever the render looks like — every gate the
harness has lives inside `render-and-diff`. Against the parent it
compares at pixel threshold 0, so its `mismatchPx` **is** the `AE`
figure the gates below quote; there is nothing to run by hand.

**5. Prove it against the gate.** Not "it looks right" — the gate:

- `refactor-only` → `mismatchPx` must be **0 on every page** against
  the parent (`exact-diff`). Quote the number from
  `visual-diff-stats.json` into `gate.metric`. A refactor that changes
  one pixel is not a refactor; either it was a `visual-change` all
  along, or the refactor has a bug.
- `data-only` / `asset-only` → affected regions may differ; every other
  region must report `0` in `region-diff-stats.json` (`region-diff`).
  Run the gate form to make it decide rather than report:
  `node tools/visual-diff/bin/region-diff.mjs --changed <region-ids> …`
  exits 2 when a region outside the list carries a difference. A stray
  difference outside the affected regions means the edit reached further
  than the scope claimed.
- `theme-only` / `visual-change` → layer-by-layer review against the
  reference (use `review-template`).

**6. Iterate or stop — and ask, do not estimate.** After the review,
run:

```bash
node scripts/iterate-status.mjs <project-id> [--root <workspace>]
```

Exit 0 means ready (stop and report), 2 means fix the **one** mismatch
it names and go round again, 3 means blocked (stop and report the
`failureCategory`). Reuse a mismatch id when the problem survives a fix:
that repetition is what the tool counts. See
[the iteration loop](../references/iteration-loop.md).

When the mismatch it names is a fact about the line rather than a defect
— the reference's typeface is not among the bundled families, the version
has no letter-spacing — do not spend a pass on it and do not rename it.
Put the question to the user once, and record their answer:

```bash
node scripts/limitations.mjs accept <limitation-id> --project <project-id> --reason "<what was measured and why it is acceptable>" --mismatch <mismatch-id> --cause TYPOGRAPHY
```

From then on `iterate-status` looks past it to the next mismatch the
review rated, and it never blocks approval.

**7. Record what moved.** `changedComponents` on the revision lists the
render methods actually touched. This is what makes selective rollback
work later ("keep the new awards but restore the old header").

**8. If you learned something about the engine, record it as an
observation — not in a README.** A correction is where library behaviour
turns up, because a correction is where a reasonable expectation meets
what the layout actually does. When that happens:

```bash
node scripts/observations.mjs find <the call you were using>
node scripts/probe.mjs --list
```

If nothing on record explains it, the finding is worth a probe in
`tools/diagnostics/graphcompose-<line>/` and an observation beside it.
`observations verify` then re-confirms it on every later version and
retires it when the library is fixed — which is not hypothetical: two
observations were retired the day 2.2.1 landed, and the skill pack that
had been teaching their workarounds was corrected with them.

A measurement written into a bundle README instead does none of that. It
is true, it is unreachable, and the next run pays to discover it again.
That happened: a proposal run measured that the right margin on a rule
inside a row cell is counted twice — asked for 15.5pt, got 27.9 — and
recorded it under `knownLimitations`, where `observations find` will
never look.

## Judgement calls

- **When the scope stops fitting mid-flight, stop and say so.** A
  `data-only` edit that turns out to need a new row is a
  `visual-change`; opening the correct scope is cheap, and a gate
  applied to the wrong baseline silently passes unreviewed work.
- **Rollback is not revision.** "Previous was better" / "undo" is
  `graphcompose-flow undo`; "restore the old header but keep the rest"
  is `restore-component`. Both create a new DRAFT and neither rewrites
  history.
- **A user asking for two unrelated changes gets two revisions.** One
  revision per intent keeps the diff attributable and the rollback
  useful.

## A correction does not need the conversation that built the template

Everything a revision pass needs is on disk: the revisions, the reviews,
the template source, the reference, the renders. That is the point of the
file-based model — so **a correction works just as well in a fresh
session**, and much more cheaply. Measured on a real run: a one-sentence
correction made in the same session as the create carried ~550k tokens of
inherited context on every model call; the state it actually needed reads
in at a fraction of that.

Starting fresh: `node scripts/preflight.mjs --project-dir <dir> --project
<id>` re-establishes everything — workspace, version, scope, loop state —
in one call. Do not re-read the create conversation's artifacts wholesale;
load the revision being corrected and what its scope requires.

**Work from symbols, not files.** A template is a thousand lines and a
correction touches one method. Ask for that method:

```bash
node scripts/source.mjs outline --project <id> --revision <id>
node scripts/source.mjs symbol renderExperience --project <id> --revision <id>
node scripts/source.mjs constants --project <id> --revision <id>
```

The outline is every method with its line range and size — about a
fortieth of the file — and `symbol` returns one with its Javadoc, which is
where this harness records *why* a value is what it is. `constants` lists
what a correction actually edits. Measured over one run, `sed` and `cat`
returned 48k tokens across 35 calls, more than twice everything the nine
deterministic tools returned across ninety, and all of it was hunting for
one method in a file.

**Patch the method; never regenerate the file.** A write that fails
because the file changed under you is a signal to re-read that method
and edit it — not to delete the template and write it again. One pass
did the second thing and produced 1,103 fresh lines, which on disk looks
identical to a one-line correction: same revision, same parent, one file
written. Everything the Javadoc recorded about *why* a constant has its
value went with it.

Every pass now measures what it replaced:

```bash
node scripts/source.mjs diff --project <id> --revision <id>
```

`render-and-diff` runs it and puts the share on its `source change` line.
Under 20% of the methods touched is a correction. Most of them is a
different construction, and a different construction is **its own
revision** — opened deliberately, with the change named in the request,
so the chain shows where the architecture moved. One run replaced nested
rows and a timeline with tables and an accent border inside a revision
recorded as another visual change; nothing in the record disagreed.

**Work from crops, not pages.** For a localized correction, cut both
images down to the region in question:

```bash
node tools/visual-diff/bin/crop-region.mjs --revision <revision-dir> --region <id> [--bounds x,y,w,h]
```

One fractional rect is projected onto the reference and the render at
their own resolutions, so the two crops correspond. Bounds come from the
region's `bounds` in `visual-analysis.json` when the analysis recorded
them; otherwise pass `--bounds` once and consider adding them to the
analysis. The default 2% padding keeps the surrounding context in frame —
"too close to the divider" needs the divider visible.

## When the change is "that looks wrong"

Sometimes the user reports a symptom rather than requesting an edit —
"the timeline is visually incorrect". That is a **redirect, not a
specification**: it says where to look, not what to do.

Record it when you open the revision, in their words, so the loop honours
it without anyone having to restate it later:

```bash
node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "fix the timeline" --report "<their words, verbatim>" --project <project-dir>
```

That writes `human-report.json`; `iterate-status` keeps it in front of
every measured mismatch, carries it through later passes, and exempts the
pass it opened from the budget — until a review sets
`humanReportedMismatch.addressed: true` for its id. (A review may also open
one itself, with `addressed: false`, when the words arrive mid-pass.)

Then diagnose it yourself. Do not ask them why it looks wrong, and do not
treat their phrasing as a design instruction. In the acceptance run the
entire input was that one sentence, and two revisions later the cause
turned out to be a rail whose ends followed the band height and an
over-tall child being top-clamped — neither of which the user could have
named.

**Diagnose from the layout, not from the gap.** A symptom report points at
two things that disagree, and the tempting move is to measure how far apart
they are and split the difference. That is how the one regression in this
harness's history happened: an icon and its text sat 7.5 px apart, both were
moved by amounts taken from that gap, and the icon had been correct all
along — within 0.7 px of the reference. Shifting a right element by the full
error carried it past the target and broke all four rows the other way.

```bash
node scripts/layout.mjs explain <node> <x|y|width|height> --project <id> --revision <id>
```

`explain` returns the additive chain that produces a coordinate, which is
the question "which of these two is wrong" — the one thing a difference
between them cannot tell you. When no snapshot is available, `reference.mjs
compare` gives both sides in reference pixels; the ownership question is
still yours to settle before you move anything. The full routing, including
what to do when the snapshot is missing, is in
[create, phase 4 — the loop](../references/create-4-loop.md#when-the-snapshot-is-not-there).

## Reporting back

`iterate-status` already prints a one-line cost after every pass, so the
numbers are in front of you whether or not you ask. End the handoff with
the full block:

```bash
node scripts/telemetry/run-metrics.mjs report --project <project-id> --status <verdict>
```

The cycle clock is what makes a correction's cost visible — it measures from
the moment the user last spoke, so "the timeline is wrong" gets a number of
its own rather than disappearing into a run total.

Telemetry never fails the work: if it is unavailable, carry on without it.

## Related

- [`../references/scope-routing.md`](../references/scope-routing.md) — picking the scope and its gate
- [`../references/authoring-rules.md`](../references/authoring-rules.md) — geometry, anchors, data spec, API discipline
- [`../references/iteration-loop.md`](../references/iteration-loop.md) — bounds and failure categories
- [`../review-template/SKILL.md`](../review-template/SKILL.md) — producing the verdict
- [`../approve-template/SKILL.md`](../approve-template/SKILL.md) — when the user accepts it
