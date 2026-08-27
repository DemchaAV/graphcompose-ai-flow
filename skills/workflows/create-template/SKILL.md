---
name: create-template
description: Turn a document reference — a screenshot, PDF, or design image of a CV, invoice, proposal, cover letter, report, certificate — into a maintainable GraphCompose Java template, then render, compare against the reference, and iterate until it is ready for approval. Use when the user supplies a reference and asks to recreate, rebuild, or generate it with GraphCompose: "create this document", "recreate this screenshot", "make this CV with GraphCompose", "build a template from this reference", "turn this PDF into a template".
---

# Create a GraphCompose template from a reference

Reconstruct the document with **semantic GraphCompose primitives** —
sections, rows, weights, anchors, layer stacks. Never draw it with raw
coordinates: a coordinate drawing matches one reference at one size and
is unmaintainable the moment anything changes.

## When this applies

The user supplies a reference image or PDF and wants it as a template.
If a template already exists and they want it changed, use
`revise-template`.

## First, check nothing already does this

```bash
node scripts/templates.mjs --json
```

One command, no model, and it can end the task before it starts. If the
user named a published template — "use Northline", "another one like the
mint CV" — or if a bundle's `docKind` and preview match what they are
asking for, offer that instead of rebuilding it:

```bash
node scripts/templates.mjs inspect <template-id>
node scripts/use-template.mjs <template-id> --target <their-project>
```

Reuse is a file copy. Reconstruction is the whole loop, and it lands
*near* the approved layout rather than on it. Rebuilding something that
already exists is the most expensive mistake available here, and the
only warning is this command.

Two things this does **not** mean. A reference the user supplied is
still a reference: do not talk them out of a new template because
something in the catalog is roughly similar. And a request to change a
published template's layout is `revise-template` on its source project,
not a reuse — see
[Template Reuse First](../references/scope-routing.md#template-reuse-first--before-any-scope).

## Before the first stage

**Start with preflight.** One call answers everything deterministic about
where you are and what you are about to run:

```bash
node scripts/preflight.mjs --project-dir <java-project> [--project <id>]
```

It returns the workspace and how it was resolved, the version read from
their build file and the pack it maps to, the scope and stages this
revision routes through, the loop bounds, the loading map as data, what
previous runs already learned about this line, and whether the tools are
built. Exit 3 means the pinned line has no pack — a **stop**, not a
fallback. Exit 4 means this is not a GraphCompose project.

It decides nothing. Which files to open is still yours; what it removes
is the ten to twenty shell calls that used to go into establishing facts.

Two things it hands you that are easy to skip and expensive to skip:

- `skills.startingPoint` — the pack's own worked set for this document
  kind, usually four to six files. Sixteen exist. What you do not load is
  context the iteration loop gets to spend on the real mismatch.
- `knowledge.observations` — behaviours previous runs paid to discover.
  Read these before the first render, not after the third.

Then create the project, import the reference, and open the first
revision. Each of these is a command because each is a place where two
hosts would otherwise choose differently — see
[the canonical workspace](../references/workspace-layout.md):

```bash
node scripts/init-workspace.mjs --project-dir <java-project> --project <project-name>
node scripts/import-reference.mjs --project <project-name> --file <the reference the user gave you>
node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<the user's words>" --project <project-dir>
node scripts/telemetry/run-metrics.mjs start --project <project-name> --workflow create-template
```

`import-reference` takes png, jpg, webp or pdf, keeps the original as
`reference/source.<ext>`, and writes `reference/reference.png` — the one
path every later step reads — rasterising a PDF through the same PDFBox
the render loop uses, so reference and render are compared on equal
terms. Do not copy or convert the file yourself: that is the single step
where two runs of the same request end up measuring against two
different images.

**Settle the page size here, before anything is designed against it.**
`import-reference` measures the page and prints the ranked standards. Its
exit code is the instruction:

| exit | meaning | what you do |
|---|---|---|
| `0` | a standard matched within 1% | build at `page.format`; do not ask |
| `5` | nothing matched, the pages disagree, or the page could not be measured | **stop and ask the user**, then continue |

On exit `5` the output carries the whole question — the measured
dimensions, the nearest standard, what building at it costs in percent,
and the exact `DocumentPageSize.of(w, h)` that keeps the reference's
proportions. Put that choice to the user in their own terms and wait for
an answer. Do not pick the nearest standard yourself and do not proceed
on A4: both answers are defensible, they produce visibly different
documents, and only the person holding the source knows which one it is.

Then write the answer down, so no later revision has to ask again:

```bash
node scripts/page-size.mjs --project <project-name> --use <A4|LETTER|LEGAL|WxH> --decision "<what you asked and what they said>"
```

`--decision` is required and is not a formality: a nearby standard and
the exact measured size are both defensible, the numbers afterwards do
not say which was taken or why, and a question asked once per revision is
a question that gets answered carelessly. Run `page-size.mjs` with no
`--use` at any time to ask whether the size is settled — exit `0` it is,
exit `5` it is not.

Then record it in `visual-analysis.json` — `page.format`,
`page.orientation`, `page.referencePx`, `page.aspect`, `page.sizePt` and
`page.sizeSource`, plus `page.sizeDecision` when the user was the one who
decided. The schema requires them, and this is the one thing in the whole
analysis that is copied from a measurement rather than read off the image.

This is a gate rather than a note because the failure it prevents is
invisible downstream. `visual-diff --scale-reference` resamples the
reference to the render's exact width **and** height, so a page built at
the wrong proportions is stretched to fit immediately before the pixels
are compared: the diff reports parity, the review reads a stretched
reference, and the accuracy contract's "page size matches the reference"
is checked against the distortion. Three projects shipped that way —
`mocha-profile-cv` 9.5% out, `cv-reference` 4.9%, `navy-executive-cv`
4.2% — each with a green gate and every element placed against page
height in the wrong place. Nothing later in the chain can recover from
it, because relational geometry derives from the page: get the page
wrong and every ratio built on it is faithfully wrong.

**Give every region a role, and let the role decide the primitive.**
`role` is required in `visual-analysis.json` and it is not a label: it is
the contract for how that region may be built. `page-header` and
`page-footer` are chrome the engine repeats on every page and must go
through `DocumentSession.header` / `.footer` — drawn as body content they
appear on page one and nowhere else, and `bleedToEdge` extends a fill
past the margin to the paper edge, which is the opposite of the band a
footer occupies. `table` must be `addTable`, not rows of shapes, or it
has no columns to align and no way to break across a page.
`table-header` needs `repeatHeader`. `image` must be `addImage` and
`icon` `addSvgIcon`: a rectangle or a coloured disc the size of the thing
matches its box and nothing inside it.

Each of those renders correctly on page one of a one-page sample, which
is exactly where the pixel diff looks. `check-region-primitives` compares
the roles against the render methods the plan maps them to, and
`render-and-diff` runs it every pass.

**A reference can be longer than one page.** A proposal, a report or a
book arrives as a multi-page PDF, and every page is rasterised:
`reference.png` is page 1 and `reference-page-N.png` is the rest. The
import also sets `render.pages`, because rasterising the render is driven
by that field and a document rebuilt at one page cannot be compared
against a reference that has three.

**Decide the page model before you build the layout.** A book's first
page is not its second: different margins, no running header, often no
page number. `DocumentSession.pageMargins(List.of(PageMarginRule.page(1,
DocumentInsets.zero())))` states that per page; `flow.addPageBreak(pb ->
pb.name("afterCover"))` puts a break where the document means one; and
`flow.addSection("Chapter" + i, s -> s.anchor("ch" + i))` gives a run of
pages a name to be referred to. Record the answer in the plan's
`pagination` block — `pageModel` is `uniform`, `first-page-different` or
`sectioned`, and `firstPageDiffers` says what page one does that the rest
do not. A multi-page document built without deciding this gets its page
model by accident.

**And decide where the flow may not break.** `keepTogether` keeps a block
whole across a page boundary; `keepWithNext` stops a heading being
orphaned above its content, or a table header sitting alone at the foot
of a page. Both are on `SectionBuilder` and `ModuleBuilder`. Neither is
discoverable from the render: a template that only ever renders its
one-page sample never exercises a break, so the diff is silent and stays
silent until real content arrives. List them as `keepRules` in the same
block, with the reason for each — `check-region-primitives` reports a
rule the plan decided and the template never built, which is worse than
an unwritten one because the plan says it is handled.

Read every page before you plan. A continuation page is not a copy of the
first with different text: it usually has no masthead, may repeat a
header row, and carries the page numbering. Those are structural
decisions, and finding them at page 1 is much cheaper than finding them
after the layout is built around a single page.

The metrics call marks where the run began, so the numbers can separate
"this whole template" from "this one correction". Skip it and the run
clock falls back to the first thing the user said, which is close but not
the same thing.

Print the chain you are about to run with
`node scripts/run-pipeline.mjs <project-id>`.

## The stages

**Fan the analysis out, where the host can.** The first three artifacts
describe the same reference and do not read each other, so they can be
produced by three parallel subagents (in Claude Code: the Agent tool;
in a host without subagents, do the same three sequentially, in this
order):

| Subagent | Owns, exclusively | Reads |
|---|---|---|
| geometry | `visual-analysis.json` | the reference + its schema |
| content | `<doc-kind>-data.json` (+ `data-schema.md`) | the reference only |
| assets | `asset-request.json` | the reference + the request format |

The rules that make this safe are the same ones that make it fast. Each
subagent writes **only its own files** — the files are the join point,
and two writers on one file is a merge conflict with no merger. Each
gets the reference image and its task, **not** this conversation, so its
context stays a fraction of the parent's. Its reply should be one line
("wrote visual-analysis.json, 9 regions"); the parent reads results from
disk, never from transcripts. Rejoin when all three files exist, then
continue below — architecture depends on the geometry, the template on
all three. The render loop that follows is serial by nature (each pass
depends on the previous render); do not try to parallelise it.

**Analyse the reference** → `visual-analysis.json`
([schema](../../../schemas/visual-analysis.schema.json)).

Write the JSON only. The readable `.md` is generated — see **Reading
copies** below.

Describe the page in **ratios and dependencies, not pixels** — with one
exception, and it is the one the `page` block holds. The page size is
measured, in real units, because it is what every ratio is a ratio *of*;
carry over what `import-reference` measured rather than deciding again.
Everything below the page is relational.

Name every region with a stable kebab-case id — every later artifact addresses
regions by those ids — and give each one `bounds: {x, y, w, h}` as page
fractions. Four numbers per region, and they are what make a region
croppable later: a correction pass can then read two small crops instead
of two full pages. A region without bounds cannot be cropped, and the
tool refuses rather than guessing. Record, for each element whose position depends on
another, the *relationship* ("badge sits at the top-right of the
avatar"), not an offset. Shape ownership is mandatory for the five cases
that otherwise get drawn as free-floating text: initials or icons inside
circles, text inside pills or badges, content inside rounded cards,
images clipped by rounded shapes, badges anchored on a shape boundary.

**Decide fixed or flowing, and record it in `flow`.** A one-page invoice
*screenshot* is not a one-page *document*: the sample shows four line
items, real data brings thirty. `flow.kind: "fixed"` means the page is
the artifact (CV, certificate, poster) and content is curated to fit;
`"flowing"` means content volume is data-driven (line items,
transactions, an article body) and the layout must paginate. For flowing
documents name the growing region in `drivenBy` and say why in
`overflowExpectation`. This one field decides three things downstream:
`pagination.md` gets loaded, page furniture maps to chrome, and the
example data must overflow.

**Mark page furniture with `role`.** A region that repeats on every page
— a page header, a page footer, a table header — is chrome, not content:
`role: "page-header" | "page-footer"` regions map to
`DocumentSession.header/.footer` in the architecture, never to body
sections drawn once; `"table-header"` means `repeatHeader` on the table.
Drawing chrome as content is invisible on a one-page render and wrong on
every page after it.

**Decide whether a missing page has to be detectable, and record it in
`flow.pageEnumeration`.** The schema requires this for a flowing
document, so it is a decision someone makes rather than one that happens
by omission — and `required: false` with a reason is a perfectly good
answer. It is not decoration and it is not for everything: an invoice, a
statement, an estimate, a formal proposal or a report is a record
someone may print, post or file, and a page that vanishes from it should
be noticeable. A CV or a poster carries no such duty. When it is
required, `"Page {page} of {pages}"` is the format that carries it —
`{pages}` is the half that makes a missing page detectable, and "Page 3"
alone does not. It belongs in chrome:

```java
session.footer(DocumentHeaderFooter.builder()
        .zone(DocumentHeaderFooterZone.FOOTER)
        .centerText("Page {page} of {pages}")
        .build());
```

**For a flowing document, ship two datasets.** One cannot do both jobs,
and trying is how the two gates end up fighting:

- `<doc-kind>-data.json` **mirrors the reference**. The visual diff
  compares this render against the reference, so it has to hold what the
  reference holds — five line items, not thirty. A dataset that overflows
  makes page 1 a wall of rows and the diff meaningless.
- `<doc-kind>-data.overflow.json` **crosses a page break**. Same
  template, enough rows that the engine has to paginate. This is the only
  place a flowing document's page break, repeated header and page
  numbering are ever rendered.

`render-and-diff` renders the second automatically when it is there, into
`output-overflow.pdf`, and the integrity gate reads both. Without it,
`pagination-never-exercised` fires — a pagination path the render never
walks is untested code shipped as a template.

Two defects only the overflow render can show, both found this way:
a continuation page has no masthead, so without a per-page margin
(`session.pageMargins(...)` with `PageMarginRule.from(2, …)`) its first
row starts hard against the paper's edge; and without a bottom margin
reserving the footer's height, the last row of a continuation page runs
into the page number. Page 1 shows neither, because its content ends well
above the fold.

Set `page.pageCount` in the analysis to what the reference-shaped data
produces — the overflow fixture's page count is not a property of the
document.

`render-and-diff` enforces both of these from the rendered file:
`pagination-never-exercised` when a flowing document fits on one page,
`page-number-wrong` / `page-total-wrong` when the enumeration is
inconsistent, `page-count-mismatch` when the render disagrees with the
analysis. They are read from the PDF's decoded text, so they are facts
about the document rather than a judgement about it. The reference
implementation is the `page-enumeration` probe, which renders one table
that fits and one that cannot and checks the whole list.

Anything you cannot read confidently goes in `unclearParts` with the
assumption you are making. Do not silently guess — a recorded assumption
is a question the user can answer later; a silent one becomes a bug with
no author.

**Give every address an `href` in the data.** An email, a profile URL, a
site, a repository — in `<doc-kind>-data.json` each one is a pair: the
text as the reference shows it, and the target it resolves to.

```json
{ "value": "linkedin.com/in/alexmorgan", "href": "https://www.linkedin.com/in/alexmorgan" }
```

The reference cannot tell you this: a screenshot of a clickable link and
a screenshot of dead text are the same pixels. Both acceptance runs got
it wrong in the two available ways — one recorded no hrefs at all and
shipped a published bundle of dead contact text; the other recorded four
and rendered ten revisions that ignored them. The render is checked
against this field on every loop pass, so an href you write here is a
promise the loop will hold you to, and one you omit is a link nobody
will ever notice is missing.

**Map it to GraphCompose** → `architecture-plan.json`
([schema](../../../schemas/architecture-plan.schema.json)). JSON only,
same as above.

The spine is `componentMapping`: region → **named render method** →
primitives. Every visible region gets its own method (`renderHeader`,
not `part1`), because that name is what review, `changedComponents` and
selective rollback all address later. Pick the anchor primitives here;
derive the base constants here. Primitives must exist in the pinned
pack's allow-list.

**Resolve assets** → `asset-request.json`, then run the resolver;
`assets-manifest.json` is the source of truth for what was actually
fetched.

**Write the template** — following
[the authoring rules](../references/authoring-rules.md): derived
geometry, named anchors, content in `<doc-kind>-data.json` behind a
typed spec, no invented API.

**Compile and render:**

```bash
node scripts/render-and-diff.mjs --project <project-id> --revision <revision-id> [--root <workspace>]
```

One call renders, scales the reference to the render's size (persisting
`reference-scaled.png` for later passes and crops), diffs with the
evidence written into the revision, measures every region from
`visual-analysis.json` separately, checks that every `href` in the data
is a live target in the PDF, and answers with the loop verdict as its
exit code: 0 ready, 2 revise, 3 blocked, 1 a step failed. Do not run
render, diff and iterate-status as separate turns — that is three trips
for one deterministic chain.

**Read `regions.ranked` before the page percentage.** The page number
against a rasterised reference is never zero and is mostly glyph
anti-aliasing, so it can only be explained, never checked. The region
table can be: each region reports its own mismatch and a
`concentration` — its share of the page's difference divided by its
share of the page's area. Even wear sits near `1.00x`; a region well
above it is carrying a structural defect, whatever the page total says.
That is the number to aim the next pass at.

**This command is not optional, and the loop now enforces that.** Every
gate the harness has lives inside it: the page diff, the footer band, the
border topology, the link check, the document-integrity check. Rendering
with Maven yourself and judging the PDF by eye skips all five at once —
`iterate-status` refuses to call such a revision ready and names the
focus `unmeasured-render`, and `approve-and-publish` refuses to publish
it. Judging the render is judgement. Having compared it first is not:
parity with the reference is the one property looking at the render alone
cannot establish.

Every page of the reference is compared, not only the first. Page 1 keeps
the names it always had; page N writes `diff-page-N.png` and
`reference-scaled-page-N.png`, and the report carries a `pages` array
plus `worstPage`. Two verdicts come from this and neither can be argued
with by looking at page 1:

- `missing-pages` — the reference has a page the render never produced,
  so it was never compared at all. Set `render.pages` in
  `template-project.json` to the reference's page count and render again.
- `page-N` — page 1 matches and a continuation page does not. Open
  `diff-page-N.png` against `reference-scaled-page-N.png`; the fix is on
  that page, not on the one you have been looking at.

A dead link turns a ready verdict into `REVISE` with focus
`dead-links`, and it is the one finding you cannot argue with by looking
at the images: an annotation has no pixels, so a document whose every
link is dead diffs identically to one where they all work.

**Review** with `review-template` → `visual-review.json`.

## When the library surprises you

**In this order, and stop at the first one that answers.** Writing a page
of Java to find out how something behaves is the last step, not the first.

**1. Has a previous run already paid for this?** Ask by the symbol you are
about to call, not by an id you would have to know already:

```bash
node scripts/observations.mjs find DocumentTableCell.node
```

Exit 0 with what is known and what to do instead; exit 3 means nothing is
on record. An entry marked **ENGINE DEFECT** is a fault in this version
with a workaround attached — use the workaround, and do not carry it into
a later line without re-running its probe there.

**2. Does the API exist, and with what signature?**

```bash
node scripts/api-query.mjs --exists TimelineBuilder.entry
node scripts/api-query.mjs --query footer
```

The allow-list is generated from the pinned artifact's class files, so
absent means it does not exist — a closed answer, not a search result.
Members Lombok generates (`builder()`, `toBuilder()`, getters, nested
`…Builder` types) are in it, so a value type with no visible constructor
is still constructible; look for its builder rather than assuming the type
is unreachable.

**3. Is there already a probe for it?**

```bash
node scripts/probe.mjs --list
node scripts/probe.mjs anchor-alignment
```

**4. Only now, write one.** A probe goes in
`tools/diagnostics/graphcompose-<line>/`, not as a one-off in your project:
it answers one question about the library, prints measurements and a
finding derived from them, and can be re-run by anyone. Record what it
found with `observations`, so the next run does not buy the same answer
twice, and so `observations verify` can retire it when the library is
fixed. A probe that composes *your* template is not this — that stays in
your project.

Skipping steps 1–3 is the single most expensive habit available here: the
answer is usually already on disk, and rediscovering it costs a build, a
render and several turns.

## Reporting back

**Open the live file once, after the first successful render.** Every
render also lands at `<workspace>/projects/<project-id>/current.pdf`,
beside `template-project.json`, under that name for the life of the
project. A viewer that reloads on change and does not lock the file —
SumatraPDF — opened there once shows every later revision in place.

Open it yourself, as soon as there is something to see:

```bash
node scripts/preview-live.mjs --project <project-id>
```

**Once per project, not once per render** — it raises a window, and doing
that on every pass would take the screen away from the user mid-sentence.
Then name the path on the first handoff and not again, as already open
rather than as something for them to go and find. Printing a path at the
end of the run and asking the user to open it wastes the whole point of a
mirror that refreshes in place: they watch the loop work, or they see one
finished PDF and none of the passes that got there.

If it reports nothing to open, carry on and name the path instead — a
missing viewer is not a reason to stop the work.

Every handoff to the user — ready for approval, blocked, or answering a
correction — ends with the metrics block when it is available:

```bash
node scripts/telemetry/run-metrics.mjs report --project <project-id> --status <verdict>
```

It prints three clocks (this cycle, this run, this session) and five token
figures rather than one total, because a single number is dominated by
cache reads and hides everything worth seeing.

**Telemetry never fails the work.** If the command prints that no session is
on record, or fails for any other reason, say nothing about it and carry on:
a workflow that stopped because a measurement was unavailable would be worse
than one with no measurements.

## Reading copies

Three artifacts have a Markdown twin: `visual-analysis`,
`architecture-plan`, `visual-review`. **Do not write them.** Generate
them, once per revision, after the JSON is final:

```bash
node scripts/render-artifact-md.mjs --revision <revision-dir>
```

Writing both by hand cost the first acceptance run roughly 29k tokens
across eight revisions — an eighth of the run — restating JSON that had
just been written. The worse cost is that two documents describing one
revision drift, and nothing notices which one is wrong.

Anything the schema cannot carry — a table comparing this revision to
the previous two, a paragraph explaining *why* something was wrong —
goes in the JSON's `notes` array. The generator emits it verbatim, so
the narrative survives without a second source of truth.

## After the first render — diagnose before you measure

The render is the first moment there is something to be wrong about, and
the first temptation is to open the two images and start counting pixels.
Do not. A run that did exactly that spent **27 minutes of thinking — 35% of
its wall clock — composing 76 one-off measurement scripts**, and the
rendering it was so careful about cost under a minute. Ask the engine
first; it already measured everything.

What this install can answer is in the preflight payload, under
`capabilities`:

```bash
node scripts/preflight.mjs --json --project-dir <java-project>
```

`capabilities.layoutSnapshot.state` is `available`, `unavailable` or
`unknown`, and `capabilities.diagnostics` says which of the tools below
exist here at all. Preflight exits **5** when the installed skills are
newer than these tools — if that happens, stop and say so, because every
route in this section will silently degrade.

### When the snapshot is there

`available` on GraphCompose 2.2.1 and up. The engine's own post-layout
measurement is in the revision, and it answers in points, not pixels:

```bash
node scripts/layout.mjs inspect <node> --project <id> --revision <id>
node scripts/layout.mjs explain <node> <x|y|width|height> --project <id> --revision <id>
node scripts/layout.mjs diff <parent-revision> <this-revision> --project <id>
node scripts/layout.mjs doctor --project <id> --revision <id>
```

**A delta does not say which element owns it, and `explain` does.** This is
the rule, not an optimisation. A run found an icon and its text 7.5 px
apart, took *both* correction magnitudes from the size of that gap, and
moved both elements — but the icon had been right all along, within 0.7 px
of the reference, and only the text was low. Shifting a correct element by
the full error carried it past the target: the offset crossed zero and all
four rows broke in the other direction. `explain <node> y` returns the
additive chain that produces the coordinate, which is exactly the question
"which of these two is wrong" and the only one a pixel diff cannot answer.

### When it is not there

A project pinned below 2.2.1, or `layoutSnapshot.state` reporting
`unavailable`. Then measure the rasters — but with a command, not a script
you write:

```bash
node scripts/reference.mjs compare --project <id> --revision <id> --window "TOP,20,1080,0,300" --window "COL1,53,530,700,1200"
```

Both sides come back in **reference pixels** whatever the render's raster
is, so the numbers are comparable without converting anything. `--window`
is `name,x0,x1,y0,y1` and is **repeatable — pass every window you need in
one call**. One window per call is the failure this command was built to
end. `measure`, `rules`, `bands` and `colors` are the other subcommands;
`reference.mjs --help` lists them.

Choosing the window is still yours. A whole-page scan merges two columns at
overlapping heights into one run, and which region owns a rule is a
judgement no command makes.

### When the cause is typography

Rank the candidates against the reference; do not substitute by eye:

```bash
node scripts/typography.mjs match --reference <crop.png> --text "<the exact string>"
node scripts/typography.mjs search --reference <crop.png> --text "<the exact string>" --family <NAME> --from 9 --to 12 --step 0.25
```

### The structural gates

These read the render rather than your intentions, and each answers
something a diff reports as a few hundred grey pixels:

```bash
node scripts/check-border-topology.mjs   --project <id> --revision <id>   # rules present, missing, displaced
node scripts/check-region-primitives.mjs --project <id> --revision <id>   # regions built from the planned primitives
node scripts/check-document-integrity.mjs --project <id> --revision <id>  # every string in the data reached the page
```

`check-border-topology` compares the reference's rules against the
render's, in both directions: a line missing from **both** is intentional,
a line missing from one is a defect, and which one it is missing from says
which kind. It reads `reference-scaled.png`, which only
`render-and-diff.mjs` writes — after a bare `render.mjs` it exits **3** and
tells you so. `reference.mjs rules --revision <id>` answers the same
question off the original reference and needs no diff pass.

## Then loop

This is the part that is easy to stop too early. A successful render is
**not** the finish line. After every render: write the review, then ask
whether the loop may continue.

```bash
node scripts/iterate-status.mjs <project-id> [--root <workspace>]
```

| Exit | Then |
|---|---|
| 0 — `READY_FOR_APPROVAL` | stop and report |
| 2 — `REVISE` | fix the **one** mismatch it names, render, review, ask again |
| 3 — `BLOCKED` | stop and report the `failureCategory` |

Fix one thing per pass and reuse the mismatch id when a problem
survives — that repetition is how the tool sees a loop going nowhere.
Do not raise a limit to keep going, and do not decide for yourself that
another pass is warranted; the whole point of asking is that a circling
agent is the last thing qualified to judge whether it is circling. The
priority order for choosing what to fix is in
[the iteration loop](../references/iteration-loop.md).

When it says stop, report:

- what the document is and where it lives
- the parity verdict and any remaining mismatches, honestly
- the paths to `output.pdf` and `output.png`
- that it is waiting for approval

Do not approve on the user's behalf. `approve-template` runs when
they say so.

## Judgement calls

- **Do not open a revision for an ambiguous request.** One clarifying
  question first: which document kind, how many pages, is the sample
  content real or placeholder.
- **First render will not match.** That is expected — the loop is the
  method, not a fallback for a bad first attempt.
- **A reference that cannot be reproduced is a report, not a bodge.**
  If parity needs an API that does not exist, stop with
  `GRAPHCOMPOSE_API_LIMITATION` naming the API and what was tried —
  rather than faking the appearance with hardcoded offsets that will
  break on the next content change.

## Related

- [`../references/workspace.md`](../references/workspace.md) — roots, version, skill pack
- [`../references/authoring-rules.md`](../references/authoring-rules.md) — the non-negotiables
- [`../references/iteration-loop.md`](../references/iteration-loop.md) — bounds, failure categories
- [`../review-template/SKILL.md`](../review-template/SKILL.md) · [`../revise-template/SKILL.md`](../revise-template/SKILL.md) · [`../approve-template/SKILL.md`](../approve-template/SKILL.md)
