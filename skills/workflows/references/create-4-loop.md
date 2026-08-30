# Create, phase 4 — the loop

A successful render is **not** the finish line. Each pass renders,
measures, classifies, fixes one cause, and asks whether it may continue.
The bounds, the failure categories, the render record and accepted
limitations are in [the iteration loop](iteration-loop.md); this page is
the pass itself.

## One pass, three calls

```bash
node scripts/pass.mjs --project <id> --open "<what this pass fixes>"    # 1. open the next revision
#   … edit the one owning property …
node scripts/pass.mjs --project <id>                                    # 2. render, measure, every gate, one screen
#   … write visual-review.json (review-template) …
node scripts/iterate-status.mjs <id>                                    # 3. may the loop continue?
```

The first call carries the sources forward and prints what the pass is
aimed at: the focus, the evidence's owning node and the properties that
produced its position, what earlier passes tried and what it moved, the
budget. The second is `render-and-diff` with its result on one screen: the
figure and its movement against the previous render, the worst regions
with a cause and owner each, the gates, the loop line, the next step; its
exit code is the loop's verdict (0 ready, 2 revise, 4 budget spent, 3
blocked, 1 a step failed). Rendering with Maven yourself and judging the
PDF by eye skips every gate at once — `iterate-status` calls such a
revision `unmeasured-render` and `approve-and-publish` refuses it.

The debug render with guide lines is for a person's eyes and runs only
when asked (`pass --debug`); one render per project at a time — a second
terminal on the same project is refused with the holder named, so work
on another project or wait.

## Read the screen in this order

**1. The page model, if it is named.** `missing-pages` (the reference has
a page the render never produced — set `render.pages` and render again),
`page-size-unsettled` (the reference was stretched to fit; settle the size
with `page-size.mjs`), `page-N` (page 1 matches, a continuation page does
not). While one of these is open no other comparison means anything, and
the loop refuses to aim elsewhere.

**2. The perceptual figure, then the regions, before the page percentage.**
The page's pixel percentage against a rasterised reference is never zero
and is mostly glyph anti-aliasing — every one of fifty real revisions
classified CRITICAL on it, the approved ones included — so it can only be
explained, never checked. Beside it the pass prints `perceptual`: SSIM
over the downsampled luminance, which anti-aliasing does not inflate.
Over the same fifty revisions it ran from 0.44 (one page measured against
two) to 0.95 (the invoices approved as finished); quote it, and read its
classification as provisional. Then the regions: each reports its own
mismatch and a `concentration` — its share of the page's difference over
its share of the page's area. Even wear sits near `1.00x`; a region well
above it carries a structural defect whatever the page total says. The
evidence is built for the regions carrying the most difference by
**mass** (share of the page's difference × concentration, over regions
large enough to be a layout); hairline rules go to their own list, and
`check-border-topology` is the tool for those.

**3. The cause, and what it forbids.** The pass classifies the three
heaviest regions (`evidence.json`) and prints each with its owning node,
the properties that produced its position, and a **measured** line: the
region's ink on the reference and on the render, in one pixel space,
subtracted — or, when the ink boxes are clipped by neighbours, the shift
at which the reference crop correlates best over the render. That line
involves no bounds anyone guessed; when it says the region is where the
reference has it, the cause is not geometry however far the node's box
sits from the analysis rectangle. A cause is a **restriction on the fix**:

| cause | what may change |
|---|---|
| `PAGINATION` | nothing else, until the page count matches |
| `GEOMETRY` | the layout property on the **named owner** — the one on the screen, or `node scripts/layout.mjs explain <node> <x|y|width|height>` names it |
| `TYPOGRAPHY` · `PAINT` · `ASSET` | the face, the colour, the file. **Not** margins, not padding, not size-to-compensate — moving a wrong picture into place is how a template ends up carrying today's font metrics as constants |
| `UNKNOWN` | nothing yet — the box is where the reference puts it, so this is *not* geometry, and the candidates listed are the ones one measurement separates |

For a region the pass did not rank: `node scripts/evidence.mjs --project
<id> --revision <id> --region <region-id>`.

**4. A delta does not say which element owns it.** An icon and its text
7.5 px apart is one number and two suspects; a run once moved both by the
full gap and carried the correct one past the target, breaking four rows
the other way. `layout.mjs explain <node> y` returns the additive chain
that produces the coordinate — naming every node that contributes — which
is exactly the question a pixel diff cannot answer. `layout.mjs inspect`
gives the boxes; `layout.mjs diff <parent> <this>` says afterwards whether
the edit moved only what it meant to, and names anything that moved with
no edit to explain it. **Never read `layout-snapshot.json` into context**
— 227 KB for a one-page CV, one node is the answer; the guard refuses it.

**5. The checks.** Dead links (an annotation has no pixels, so a document
whose every link is dead diffs identically to one where they work); the
document's page count and enumeration; regions built against their role;
the **furniture** at the page's edges (the lowest band of ink in the
reference's bottom strip against the render's, the highest in the top
strip — a page number too low or a masthead too high is a named defect,
`bottom-band-lower`, `top-band-higher`); structural smells; layout
collateral. Each is a fact read from the file, and a dead link, a document
defect or a furniture defect turns a ready verdict into `REVISE` on its
own.

## When the snapshot is not there

`capabilities.layoutSnapshot.state` in the preflight payload says whether
the engine's post-layout measurement is available (GraphCompose 2.2.1+).
Without it, measure the rasters — with a command, not a script you write:

```bash
node scripts/reference.mjs compare --project <id> --revision <id> --window "TOP,20,1080,0,300" --window "COL1,53,530,700,1200"
```

Both sides come back in reference pixels; `--window` is
`name,x0,x1,y0,y1` and repeatable — pass every window you need in one
call. Choosing the window is still yours.

## When the cause is typography

Rank the candidates against the reference; do not substitute by eye:

```bash
node scripts/typography.mjs match --reference <crop.png> --text "<the exact string>"
node scripts/typography.mjs search --reference <crop.png> --text "<the exact string>" --family <NAME> --from 9 --to 12 --step 0.25 --scale <px-per-pt>
```

`match` sets every candidate in one render and reports the gap to the
runner-up — a lead inside 0.02 is a coin toss. `search` returns the value
**and the curve**; a flat curve says the measurement cannot separate the
candidates, so do not re-render to find out. Crops come from
`node tools/visual-diff/bin/crop-region.mjs --revision <dir> --region <id>`.

When no bundled family is within reach, that is a fact about the line,
not a mismatch to attempt three times: ask the user once and record it —
`node scripts/limitations.mjs accept <id> --project <id> --reason "…"
--mismatch <mismatch-id> --cause TYPOGRAPHY` — and the loop routes around
it.

## The structural gates, on demand

```bash
node scripts/check-border-topology.mjs   --project <id> --revision <id> --region <table-region>
node scripts/check-region-primitives.mjs --project <id> --revision <id>
node scripts/check-document-integrity.mjs --project <id> --revision <id>
```

`check-border-topology` compares the reference's rules against the
render's in both directions: a line missing from **both** is intentional,
a line missing from one is a defect, and which side says which kind. It
reads `reference-scaled.png`, which only a measured pass writes.

## Then loop

Write the review (`review-template`), then ask:

```bash
node scripts/iterate-status.mjs <project-id> [--root <workspace>]
```

| exit | verdict | then |
|---|---|---|
| 0 | `READY_FOR_APPROVAL` | stop and report |
| 2 | `REVISE` | open the next pass at the **one** mismatch it names |
| 4 | `CONVERGENCE_LIMIT_REACHED` | stop and put it to the user; what is open and what has been tried are in the status |
| 3 | `BLOCKED` | stop and report the `failureCategory` — no usable document can be produced |

Fix one cause per pass and reuse the mismatch id when a problem survives —
that repetition is how the tool sees a loop going nowhere. Do not raise a
limit to keep going, and do not decide for yourself that another pass is
warranted: a circling agent is the last thing qualified to judge whether
it is circling. The priority order when several causes are equally loud:
structural geometry and page proportions, then large surfaces, then
anchors and spacing, then typography, then small marks, then colour.
Fixing colour before geometry wastes a pass.

Every render is on the record (`attempts.json`), and `iterate-status`
reports renders beside revisions; a trail that stopped moving is the
signal to change approach rather than render a sixth value.

Stop early, and say which of these it was, when: the review recommends
`APPROVE`; the remaining differences were explicitly accepted; the next
fix needs information only the user has; the next fix is blocked by
verified GraphCompose behaviour. Silence is not a stopping condition.
