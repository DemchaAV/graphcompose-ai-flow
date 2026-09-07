# Create, phase 2 — analyse the reference

Three artifacts describe the reference before any code exists:
`visual-analysis.json`, `<doc-kind>-data.json`, `asset-request.json`.
Then `architecture-plan.json` maps the analysis to primitives. Write the
JSON only; the readable `.md` twins are generated (see the end).

## Measure first, in one call

```bash
node scripts/reference.mjs analyze --project <id> --json
```

Page size and margins, the palette by coverage, every rule, the columns
with their gutters and share of the page, and the text bands **per
column** — about 5 KB, no window, no judgement. These are the questions
you have before you have read the document, which is why one call answers
them all. Bands are cut per column because a whole-page scan merges two
columns at overlapping heights into one run; a column inked edge to edge
comes back `separable: false` rather than as one meaningless band.

**Independent measurements go in one call.** A run's bill is its turn
count multiplied by its context, and every turn re-reads the whole prompt.
When the next thing to learn does not depend on the last thing learned,
learn them together: `reference.mjs` takes `--window` repeatedly;
`probe.mjs`, `javap` and a grep over the API surface can be one command.
Anything whose *result changes what you would ask next* stays its own
call. (One reference-analysis stage measured 61 calls, most a single
measurement each; one run spent 35% of its wall clock composing 76 one-off
measurement scripts for under five minutes of computation.)

## Fan the analysis out

The three artifacts describe the same reference and do not read each
other. **On a host with subagents, produce them concurrently** — this is
the instruction, not a suggestion. Claude Code: one message carrying
three `Agent` calls. A host without subagents does the same three in the
order below, and nothing else changes.

The earlier wording said three subagents *can* produce them, and a real
0.22.0 run read that as permission and went serial. Permission is not an
instruction, and the serial reading is the expensive one: these three are
the whole of discovery, and everything after them waits.

| Subagent | Owns, exclusively | Contract |
|---|---|---|
| geometry | `visual-analysis.json` | `node scripts/check-analysis.mjs --contract geometry` |
| content | `<doc-kind>-data.json` (+ `data-schema.md`) | `node scripts/check-analysis.mjs --contract content` |
| assets | `asset-request.json` | `node scripts/check-analysis.mjs --contract assets` |

**Run the contract command and paste what it prints.** It is a dozen
lines — what the worker reads, what it may query, the artifact it owns,
the command that says it is done — declared once in
`config/pipeline.json` rather than written out three times here. Three
prompts composed by hand from one page end up carrying each other's
material: in a recorded run the content worker, whose whole job is
pulling strings out of a picture, was handed `authoring-rules.md` — 4.7k
tokens of guidance about writing Java — and then re-read it on every one
of its own turns.

Add the task and nothing else. Each worker gets the reference and its
contract, **not** this conversation. Its reply is one line ("wrote
visual-analysis.json, 9 regions"); the parent reads results from disk.

### Workers commit their artifact, they do not write it

```bash
node scripts/write-artifact.mjs --project <id> --artifact <name> --from <draft>
```

A worker writes its draft to a scratch file and commits it with that. The
tool stages beside the target, validates against the schema, and renames —
so the canonical path holds either the previous complete artifact or the
new one, and never half of either. Writing the canonical path directly
leaves it truncated for as long as the write takes, and the other two
workers and the barrier are reading that directory; the failure then
arrives as "invalid JSON", which looks like a bad artifact rather than a
race, and re-running the worker appears to fix it. The `Write` guard
refuses the direct write for this reason.

A rejected draft leaves the canonical file untouched and says which
schema it failed, so a worker fixes its draft rather than its artifact.

### The join is on validated artifacts, not on files existing

```bash
node scripts/check-analysis.mjs --project <id> [--revision <id>]
```

Exit 0 means all three are complete and the architecture plan may start;
exit 1 names which one is not and why.

A file exists the moment a subagent starts writing it, and a truncated
or half-shaped artifact is worse than a missing one: the next stage
reads it, believes it, and plans around a document it has only half
seen. So the barrier is *validates*, not *is there*.

An artifact that fails validation is re-run, not patched around, and no
later stage starts until all three pass. The render loop that follows is
serial by nature; do not parallelise it.

### Resolve the assets as soon as the request is valid

```bash
node scripts/check-analysis.mjs --project <id> --only asset-request.json
node tools/asset-resolver/src/cli.mjs --revision <revision-dir>
```

Start it the moment `asset-request.json` validates — the first command
is exactly that question, about that one file, exit 0 — because the
resolver reads the request and nothing else, so it feeds neither the
geometry nor the plan and has no reason to wait for them. It runs beside
the architecture plan below; `config/pipeline.json` declares the two as
concurrent and `run-pipeline` prints them that way.

This used to happen during authoring, and it cost more than it looks.
Across nineteen recorded runs the manifest landed a median **26 minutes**
after the request that produced it was already valid, and the first
render followed the manifest within the same minute in **every one of
them** — the manifest was the binding constraint on time-to-first-render,
and most of its wait was not work.

Treat `assets-manifest.json` as the source of truth for what was actually
fetched — the format (`svg` or `png`) included; the template branches on
it rather than assuming an extension (see [authoring
rules](authoring-rules.md#asset-flow)). An icon the resolver could not
find has no record in the manifest. A font it could not place *has*
one, marked `manual_drop_required`: with `registration: "file-resource"`
it is a Google face you drop as TTFs and register in Java, and the
authoring barrier reports it and lets you proceed; with
`registration: null` the request named a family its source does not
carry, and the barrier holds until the request is fixed. That is why
the barrier reads both files rather than trusting either alone.

## `visual-analysis.json` ([schema](../../../schemas/visual-analysis.schema.json))

Describe the page in **ratios and dependencies, not pixels** — with one
exception: the `page` block carries the measurement from phase 1.

- **The `page` block is copied, not derived.** `reference.mjs analyze`
  returns it ready under `pageBlock` — format, orientation, `referencePx`,
  `aspect`, `sizePt`, `sizeSource`, `pageCount` — assembled from what
  `import-reference` already measured and recorded. Paste it and add only
  `margins` and `background`, which are yours to describe. Do not retype
  the numbers from `page`: that block reports width/height, the schema
  wants height/width, and thirteen of nineteen recorded runs wrote a
  `page` that failed its schema, most often with the measurements sitting
  as prose inside `format`. A `pageBlock` of `null` means
  `import-reference` recorded no geometry — say so in `unclearParts`
  rather than inventing one.
- **Every region has a stable kebab-case id and `bounds: {x, y, w, h}` as
  page fractions.** Every later artifact addresses regions by id; the
  bounds are what make a region croppable and measurable. A region without
  bounds cannot be evidenced, and the tool refuses rather than guessing.
- **Record relationships, not offsets** — "badge sits at the top-right of
  the avatar".
- **Measure every container; do not name a style of it.** `shapeOwnership`
  takes one entry per DISTINCT container that holds content — ten
  competency boxes built alike are one entry with `repeats: 10`. Each
  entry carries `shape`, `cornerRadiusRatio`, `sizing`, `fill.present` and
  `stroke.present` because each of those has been got wrong by describing
  it instead:

  | Measure | Not | Because |
  |---|---|---|
  | `cornerRadiusRatio` = radius ÷ shorter side | "rounded", "capsule", "pill badge" | A run wrote "rounded capsule shape" for a box measuring **0.09**. The author read the word and implemented a capsule. `pill` means the radius really is half the height — nothing else. |
  | `sizing: fill-parent \| hug-content` | leaving width to be inferred | Boxes sharing a left **and** right edge are `fill-parent`. Inferred, they shrink to their labels and every row ends somewhere different. |
  | `fill.present` and `stroke.present`, separately | "white box with a border" | A container showing the ground through it is `fill.present: false`. That is not the same as a fill matching the background: one paints, one does not. |
  | `padding` per side, `gap`, `contentAlign` | "some spacing" | Averaged padding puts content optically off-centre; `gap` is the rhythm between children, padding is the frame. |

  Ratios, never pixels — radius and stroke against the container's shorter
  side, padding and gap likewise — so the numbers survive any resolution.
  Estimating by eye is expected; say in `notes` when an estimate is coarse.

  **When the corners differ, name them.** `cornerRadiusRatio` takes a
  number for all four, or an object — omitted corners are square:

  ```json
  "cornerRadiusRatio": { "bottomRight": 0.3 }
  ```

  A panel with one rounded corner has no honest single value. Given
  exactly that panel, two models wrote `0` and `0.18`: one rendered a
  rectangle, the other a lozenge, and one of them had already written
  *"only the bottom-right corner is strongly rounded"* in `notes`, where
  nothing reads it. `check-analysis` measures each corner off the
  reference and refuses both mistakes — a radius the pixels contradict,
  and one number spread over corners that are not alike.

  **Every container carries `bounds`**, as page fractions, the same frame
  regions use — the first instance, when it repeats. That is what makes the
  rest checkable rather than merely stated: `check-analysis` samples the
  reference inside those bounds and just outside them, and **refuses a
  `fill.present` the pixels contradict**. A run got shape, radius, sizing and
  repeats right on one container and `fill.present` wrong, and that single
  field was the first thing a reader noticed about the render. Do not reason
  about the fill — look at whether the ground shows through.

  **A region with `role: panel` needs its own entry.** A panel *is* a shape: it
  has a fill, usually a radius, and other content sits on it. The same run left
  its dark monogram block undescribed, so nothing measured the corner (one stuck
  out) and nothing recorded that the sidebar runs underneath it (the sidebar
  stopped where the block began).
- **Record icons that are not text.** `icons` takes any icon whose size or
  placement is independent of the text beside it: `sizeRelativeToText`
  (1.0 is text-sized, 1.45 is half again), `verticalAlign`, `gapToText`,
  and `inline` — true when it flows in the text run, false when it is its
  own child. Without these an icon is emitted as an inline glyph at text
  size, which is what happened to a sidebar whose icons were half again
  the cap height.
- **`role` is the contract for how a region may be built.** `page-header`
  / `page-footer` are chrome the engine repeats — they go through
  `DocumentSession.header` / `.footer`; drawn as body content they appear
  on page one and nowhere else. `table` must be `addTable` (rows of shapes
  have no columns to align and cannot break across a page); `table-header`
  needs `repeatHeader`; `image` must be `addImage` and `icon`
  `addSvgIcon`. `check-region-primitives` compares roles to the render
  methods the plan maps them to, and every pass runs it.
- **Decide fixed or flowing, in `flow`.** A one-page invoice *screenshot*
  is not a one-page *document*: the sample shows four line items, real
  data brings thirty. `fixed` means the page is the artifact (CV,
  certificate, poster); `flowing` means content volume is data-driven and
  the layout must paginate — name the growing region in `drivenBy`. This
  field decides three things downstream: `pagination.md` gets loaded,
  furniture maps to chrome, the example data must overflow.
- **Decide whether a missing page has to be detectable, in
  `flow.pageEnumeration`.** Required for a flowing document, and
  `required: false` with a reason is a good answer. An invoice, a
  statement, a proposal or a report is a record someone may print or file;
  a CV or a poster carries no such duty. When required, `"Page {page} of
  {pages}"` in chrome is what carries it:

  ```java
  session.footer(DocumentHeaderFooter.builder()
          .zone(DocumentHeaderFooterZone.FOOTER)
          .centerText("Page {page} of {pages}")
          .build());
  ```

- **Decide the page model for a multi-page reference, in
  `pagination`.** Read every page: a continuation page is not a copy of
  the first — usually no masthead, maybe a repeated header row, the page
  numbering. `pageModel` is `uniform`, `first-page-different` or
  `sectioned`; `firstPageDiffers` says what page one does that the rest do
  not. `DocumentSession.pageMargins(List.of(PageMarginRule.page(1,
  DocumentInsets.zero())))` states margins per page; `flow.addPageBreak(pb
  -> pb.name("afterCover"))` puts a break where the document means one;
  `flow.addSection("Chapter" + i, s -> s.anchor("ch" + i))` names a run of
  pages.
- **List where the flow may not break, in `keepRules`.** `keepTogether`
  keeps a block whole across a boundary; `keepWithNext` stops a heading
  being orphaned above its content or a table header sitting alone at the
  foot of a page. Both are on `SectionBuilder` and `ModuleBuilder`. Neither
  is discoverable from a one-page render, and `check-region-primitives`
  reports a rule the plan decided and the template never built.
- **Set `page.pageCount`** to what the reference-shaped data produces —
  the overflow fixture's count is not a property of the document.
- **Measure the face; do not recognise it.** `typography.roles` commits
  one `fontName` per role and says how it was chosen. `headings` and
  `body` are required, because between them they set the whole page:

  ```bash
  node scripts/typography.mjs match --role headings \
    --reference <crop.png> --text "<the exact string in that crop>" \
    --project <id>
  ```

  It ranks every bundled family against the crop and records the ranking
  in the revision. Then write `{"role": "headings", "fontName": "LATO",
  "source": "measured"}` and the barrier checks the two agree.

  A face with no bundled equivalent is a real answer: `"source":
  "assumed"` with a `why` clears, and stays reviewable. What does not
  clear is `"measured"` with nothing recorded.

  The prose fields beside `roles` — `headings`, `likelyFontFamily`,
  `scale` — still describe the type, and describing is not choosing.
  Three runs on one reference wrote sentences like *"Poppins for body and
  a classic serif such as Spectral"*, set the headings in a serif against
  a grotesque, and put **all twelve regions at CRITICAL**. Every one of
  them had this tool and none called it.
- **Anything you cannot read confidently goes in `unclearParts`** with
  the assumption you are making. A recorded assumption is a question the
  user can answer later; a silent one is a bug with no author.

## `<doc-kind>-data.json`

Every variable string — names, contacts, dates, items — lives here behind
a typed spec; the template carries no content literals.

**Every address gets an `href`.** An email, a profile URL, a site, a
repository: the text as the reference shows it, and the target.

```json
{ "value": "linkedin.com/in/alexmorgan", "href": "https://www.linkedin.com/in/alexmorgan" }
```

A screenshot of a link and a screenshot of dead text are the same pixels.
`render-and-diff` checks the PDF's annotations against this field every
pass; an href you write is a promise the loop holds you to, one you omit
is a link nobody will notice is missing.

**For a flowing document, ship two datasets.** `<doc-kind>-data.json`
mirrors the reference — five line items, not thirty — because that is what
the diff compares. `<doc-kind>-data.overflow.json` crosses a page break —
the only place the page break, the repeated header and the numbering are
ever rendered. `render-and-diff` renders it automatically when present;
without it `pagination-never-exercised` fires. Two defects only the
overflow render shows: a continuation page with no masthead whose first
row starts hard against the paper's edge (needs `session.pageMargins(...)`
with `PageMarginRule.from(2, …)`), and a last row running into the page
number (needs a bottom margin reserving the footer's height).

## `architecture-plan.json` ([schema](../../../schemas/architecture-plan.schema.json))

The spine is `componentMapping`: region → **named render method** →
primitives. Every visible region gets its own method (`renderHeader`, not
`part1`): that name is what review, `changedComponents` and selective
rollback address. Pick the anchor primitives here; derive the base
constants here and record them under `baseConstants` with their
derivation, so a later revision changes one number instead of fifteen.
Every primitive must exist in the pinned pack's allow-list — `node
scripts/api-query.mjs --exists <Type>.<method>`.

## Close the phase: write the handoff

```bash
node scripts/handoff.mjs write --project <id>
```

The last thing phase 2 does. It runs the authoring barrier and, only if
that is clear, records `handoff.json`: where each of the five artifacts
is, what it hashed to, and that the barrier passed. A red barrier writes
nothing and names what is not done — there is no handoff that says "not
validated", because a next phase reading one would have to decide what to
do about it, and that decision is the barrier's.

**Why it is worth a file.** Everything phase 3 needs now exists on disk.
The measurement, the crops, the reasoning and these pages do not — they
are how the artifacts were produced, not what they say. Measured on two
recorded create runs, the conversation at this point held 192–266k tokens,
never came down, and was re-read by every one of the 218–382 requests that
followed: 84% and 96% of each run's cache-read. The handoff is what lets
phase 3 start from four files instead of inheriting all of that.

Paths and hashes only — never contents. Copying an artifact in would put
the same document in context twice and give the run a second thing that
can disagree with the first. `node scripts/handoff.mjs verify --project
<id>` re-hashes and says whether the state it names still holds.

**Writing it is not crossing it.** Phase 3 opens by spawning one `Agent`
to author from these five paths; `handoff.mjs status` reports `written`,
`requested` and `TAKEN` as three different answers, because three real
runs wrote a correct handoff and then authored in the coordinator anyway.

## Reading copies

`visual-analysis`, `architecture-plan` and `visual-review` have Markdown
twins. **Do not write them.** Generate them once per revision, after the
JSON is final:

```bash
node scripts/render-artifact-md.mjs --revision <revision-dir>
```

Anything the schema cannot carry — a paragraph of reasoning, a comparison
with the previous two revisions — goes in the JSON's `notes` array; the
generator emits it verbatim. Two hand-written documents describing one
revision drift, and nothing notices which is wrong.
