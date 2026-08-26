# The iteration loop

A successful render is not the stopping point. Keep going until the
review says `READY_FOR_APPROVAL` or `BLOCKED` — those two are the only
places the loop ends on its own.

```text
        fix one thing
              ↓
            build
              ↓
           render
              ↓
            diff
              ↓
         evaluate  →  write visual-review.json
              ↓
     ┌────────┴────────┐
   REVISE          READY_FOR_APPROVAL / BLOCKED
     │                  │
     └──── loop         └── stop, report, wait for the user
```

## What the user said comes first

A difference the user names outranks the measured one. Record it in the
review:

```json
"humanReportedMismatch": {
  "id": "timeline-marker-placement",
  "quote": "the timeline visually isn't aligned correctly",
  "addressed": false
}
```

`iterate-status` then names it as the next target instead of whatever
occupies the most pixels, and keeps naming it until a review sets
`addressed: true` — so a report cannot be lost to a louder measured
mismatch appearing.

Keep the quote verbatim. A paraphrase turns their observation into your
interpretation of it, and the difference matters when the diagnosis turns
out wrong.

**This is not the user telling you how to fix it.** They said what looks
wrong; why it is wrong and what to change stay yours. In the acceptance
run the whole instruction was "the timeline is visually incorrect", and
the loop diagnosed a rail overshoot and an anchor clamp from that. Do not
ask them to diagnose, and do not treat the words as a specification.

## One root cause per pass

Each iteration fixes **one cause** — not one line, and not the template
wholesale. Rewriting everything on every pass destroys the evidence about
what actually helped and makes a regression impossible to attribute.

One cause may show up as several symptoms. When it does, fix them
together and record the link:

```json
{ "id": "timeline-rail-overshoot", "rootCause": "entry-band-height", "region": "main-experience" }
{ "id": "marker-title-misalignment", "rootCause": "entry-band-height", "region": "main-experience" }
```

The condition is a shared `rootCause` **and** a shared region. An axis
change that moves a marker, a rail and a title is one fix; three
unrelated tweaks bundled to save a pass is not, and the shared id is what
tells them apart afterwards.

The bound counts causes, not ids. Three passes chasing three symptoms of
one cause is the situation `maxSameMismatchAttempts` exists to catch, so
it looks through the symptom to the `rootCause` when one is recorded.

The order to work in, when several causes are equally loud:

1. structural geometry, page and crop proportions
2. large surfaces and panels
3. anchors, alignment, spacing
4. typography hierarchy
5. icons, badges, dots, small marks
6. final colour and anti-aliasing differences

Fixing colour before geometry wastes a pass: the geometry fix moves the
thing you just recoloured.

## Ask, do not estimate

After every render-and-review, ask the tool whether the loop may
continue. It counts the current loop from the revisions on disk, so the
answer does not depend on remembering how many passes there have been:

```bash
node scripts/iterate-status.mjs <project-id> [--root <workspace>] [--json]
```

| Exit | Verdict | Do |
|---|---|---|
| 0 | `READY_FOR_APPROVAL` | stop; report to the user and wait |
| 2 | `REVISE` | fix the one named mismatch, render, review, ask again |
| 3 | `BLOCKED` | stop; report the `failureCategory` and what was tried |

An agent judging for itself whether it is going round in circles is
exercising precisely the judgement a circling agent has already lost.
Run the command.

`render-and-diff` runs it for you and adds one finding of its own: a
link declared in the data that never reached the rendered PDF turns a
`READY_FOR_APPROVAL` into `REVISE` with focus `dead-links`. It is the
one defect the images cannot show — an annotation has no pixels — so it
is read from the file instead of looked at, and the rule is in
[the authoring rules](authoring-rules.md). Only READY is
downgraded: an already-revising pass keeps the focus its reviewer chose,
and `BLOCKED` stays blocked.

## Targeted Evidence First

When a mismatch is geometric — something is in the wrong place, or the
wrong size — do not reason from the image about which of four nested
paddings moved. The render was measured. `layout-snapshot.json` in the
revision folder is GraphCompose's own post-layout record of where every
node ended up, and three commands query it:

```bash
node scripts/layout.mjs inspect <node>  --project <id> --revision <id>
node scripts/layout.mjs explain <node> <x|y|width|height|contentX|contentY> …
node scripts/layout.mjs diff <revA> <revB> --project <id> [--region <node>]
```

Six steps, in order:

1. **Name the node the user named.** "The Languages block" is
   `inspect Languages` — the tool resolves the name, so you never need
   the full node path. An ambiguous name lists its candidates.
2. **Read where it actually is** — `inspect` gives the placement box,
   the computed content box, margin, padding and page.
3. **Ask why that coordinate is what it is** — `explain <node> x` returns
   the additive chain, naming every node that contributes:

   ```text
   HeadingText_CONTACT.x = 26
     canvas.margin.left               0
   + Sidebar.padding.left            17
   + Heading_CONTACT.padding.left     9
   = 26   (flowStart, exact)
   ```

4. **Fix the owner, not the symptom.** The chain names who contributes
   what. Changing the node that *shows* the offset when a grandparent's
   padding produced it is how a template accumulates the compensating
   constants [the authoring rules](authoring-rules.md) forbid.
5. **Believe `not derivable`.** A paragraph is as wide as its text and a
   weighted row column's x comes from weights, and neither the metrics
   nor the weights are in the snapshot. When `explain` says it cannot
   derive a value, that is the answer — it is not an invitation to
   estimate one. An inexact chain reports the leftover as
   `unattributed`, and that number is the finding: it is the amount no
   node has claimed.
6. **Confirm the change landed where you meant, and only there.**

   ```bash
   node scripts/layout.mjs diff <parent-revision> <this-revision> --project <id>
   ```

   It separates what a person edited — margins, padding, tree position — from
   what the engine then computed, so the answer is not "47 nodes changed" but
   "one padding was edited, three children followed it, and one node moved that
   no edit explains". That last group is **collateral**, and it is the one to
   read: a parent growing because its widest child did is the engine working
   correctly, but nothing in your edit said it would happen.

   `--region <node>` scopes it to one subtree. `render-and-diff` runs it for you
   against the parent revision and reports it as a step; it is evidence and does
   not change the verdict.

   Declaring `expectedAffectedNodes` in `revision.json` **before** the render
   turns it into a claim the diff can check — anything that moved outside those
   subtrees is reported. Written afterwards to match the diff it proves nothing,
   which is why it is worth writing first.

### When the cause is typography

`evidence.mjs` will not tell a wrong font from a wrong colour — it says
`UNKNOWN` and names the candidates. Two of them are measurable rather
than guessable:

```bash
node scripts/typography.mjs match --reference <crop.png> --text "<the exact string>"
node scripts/typography.mjs search --reference <crop.png> --text "<the exact string>" --family <NAME> --from 9 --to 12 --step 0.25 --scale <px-per-pt>
```

`match` sets every candidate family in **one** render and ranks them by
two independent signals: how wide the string runs, and — with width
normalised away — the letterforms. When those disagree, that is
information: matching shapes at the wrong width is a condensed cut of the
same face. Read the gap to the runner-up before believing the winner; a
lead inside 0.02 is a coin toss reported as a result.

`search` needs `--scale`, and refuses without it. A size cannot be
recovered from a crop of unknown resolution, and the family metric
deliberately normalises scale away. Take the scale from
`region-diff-stats.json` as `width ÷ canvas.pageWidth`, or as the dpi the
crop was rendered at over 72.

**Read the curve, not just the winner.** A flat run of near-equal scores
means the measurement cannot separate 23 from 24, and the tool says so.
Re-rendering to find out spends passes on a difference nothing can see.

Get the crop from `crop-region.mjs`, which already pads for context.


**Never read `layout-snapshot.json` into context.** It is 227 KB for a
one-page CV — 248 nodes, of which one is the answer. Loading it spends
the budget the loop needs and buries the row that matters. That is the
whole reason these commands exist; use them even when the file looks
small enough to skim.

This is not `scripts/probe.mjs`. A probe answers "how does GraphCompose
behave?" by running the library. The inspector answers "how did *this*
template lay out?" by reading what the renderer measured. Reach for the
probe when you do not know what a primitive does, and for the inspector
when you do not know where a node went.

## Bounds

From `limits` in [`config/pipeline.json`](../../../config/pipeline.json),
enforced by the command above:

| Limit | Default | Meaning |
|---|---|---|
| `maxIterations` | 8 | the **agent's own** passes in one loop |
| `maxConsecutiveBuildFailures` | 3 | compile/render failures in a row |
| `maxSameMismatchAttempts` | 3 | attempts at the *same* cause |
| `maxIterationGrants` | 3 | extensions past the ceiling for a converging loop |

When a bound is hit, stop and report `BLOCKED` with a
`failureCategory`. Do not raise the limit to keep going — the limit
existing at all is the admission that a loop which is not converging
will not converge with more turns.

Two things `maxIterations` does **not** charge for:

- **A pass the user asked for.** A review carrying a
  `humanReportedMismatch` id that has not appeared before in this loop
  is a pass that exists because a person named something, not because
  the agent decided to go round again. One report buys one free pass;
  further passes at the same report are the agent's own, so an
  unaddressed report cannot become unlimited licence. Charging these is
  how a real run reported `9/8` for a correction requested one message
  earlier.
- **A pass that is closing mismatches.** At the ceiling, a loop whose
  latest pass strictly reduced the number of `CRITICAL`/`MAJOR`
  mismatches gets one more pass, up to `maxIterationGrants`, and has to
  earn each one again. Circling is caught by `maxSameMismatchAttempts`,
  which fires on the third attempt at one cause however many passes have
  run; a flat ceiling on top of that also stops work that is visibly
  converging. A real run reached 8/8 holding two `MINOR` fixes whose
  recipes it had already written down, and wrote them into the bundle's
  README instead of into the document.

Progress is counted on the severity ledger, never on the page pixel
count. Capping a timeline rail with its marker — a real structural fix —
moved a page total from 211583 px to 211674, *up*, because it repainted
a few glyph edges. A convergence test built on that number calls the fix
a regression.

**Mismatch ids must be stable.** If the same problem survives a fix,
reuse its id verbatim; that repetition is exactly what
`maxSameMismatchAttempts` counts. Renaming a surviving mismatch defeats
the safeguard and hides the fact that three passes achieved nothing.

## Failure categories

Every stop that is not `READY_FOR_APPROVAL` carries one of these
(`failureCategories` in the config, `$defs/failureCategory` in the
schemas):

| Category | Use when |
|---|---|
| `BUILD_FAILED` | the template does not compile |
| `RENDER_FAILED` | it compiles but the render step fails |
| `ASSET_FAILED` | an icon or font could not be resolved |
| `VISUAL_MISMATCH` | it renders, but parity is not reachable by the next obvious edit |
| `GRAPHCOMPOSE_API_LIMITATION` | verified library behaviour blocks the fix — name the API and what was tried |
| `MISSING_REFERENCE_INFORMATION` | the reference does not show what is needed — say which region |
| `ITERATION_LIMIT` | a bound above was reached |

A category without specifics is not a report. `GRAPHCOMPOSE_API_LIMITATION`
means naming the method, the version it was verified against, and the
alternative that was tried.

## Recording each pass

- `visual-review.json` per pass, against
  [`schemas/visual-review.schema.json`](../../../schemas/visual-review.schema.json).
  A render with no review beside it is not an iteration — it is an
  unfinished one, and `iterate-status` says so rather than assuming the
  pass went fine.
- `reviewVerdict` on the revision, mirroring that verdict. The status
  stays `DRAFT`: `READY_FOR_APPROVAL` records that the loop stopped and
  is waiting for a human, not that anything was approved.
- `iteration` on the revision, 1-based, when the pass belongs to an
  autonomous loop rather than a human-opened revision.
- `changedComponents` listing the render methods actually touched —
  this is what makes selective rollback possible later.

## Stopping early on purpose

Stop and hand back to the user, without exhausting the bounds, when:

- the review recommends `APPROVE` (or `AE == 0` under a diff gate)
- the remaining differences were explicitly accepted by the user
- the next fix needs information only the user has
- the next fix is blocked by verified GraphCompose behaviour

Silence is not one of the stopping conditions. If the loop stops, say
which of these it was.
