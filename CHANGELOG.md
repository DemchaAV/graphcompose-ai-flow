# Changelog

All notable changes to **GraphCompose AI Template Flow** are recorded here.
The project follows [Semantic Versioning](https://semver.org/) and stays in
`0.x` while the workflow stabilizes — skills are still `needs-validation`, and
the full visual-baseline pass is the gate to `1.0.0`.

## v0.7.0 — 2026-08-25

A reference can be a proposal, a report or a book. Until now the harness
rasterised every page of one and then measured the first.

**Every page is compared.** The evidence had been on disk for months:
`examples/cv-reference` carries `reference-page-2.png`, its revisions
carry `output-page-2.png`, and no revision has ever held a diff between
the two. Page 1 keeps the names it always had — `reference.png`,
`output.png`, `reference-scaled.png`, `diff.png`, which everything
downstream reads. Page N writes `diff-page-N.png` and
`reference-scaled-page-N.png`, and the report gains a `pages` array,
`worstPage`, `missingFromRender` and `extraInRender`.

Two verdicts come out of it, and neither can be argued with by looking at
page 1. `missing-pages`: the reference has a page the render never
produced, so it was never compared at all — the report names
`render.pages` as the field to change. `page-N`: page 1 matches and a
continuation page does not, with the two images to open. On a proposal,
page 1 is the cover and is the page most likely to be right.

**Importing a one-page PDF used to fail outright.** The renderer's
`--page` is a zero-based index and the import passed the human number
through, so a one-page PDF asked for index 1 and was refused: *"page
index 1 out of range; pdf has 1 page(s)"*. That is the most ordinary
reference there is.

**Importing a two-page PDF put page two into `reference.png`.** The worse
half of the same off-by-one, because nothing failed: page one was never
imported and every later measurement was taken against the wrong page.
Proven by comparing the imported reference against the revision's own
page-1 raster — 0 px after the fix, 94,932 px against page 2.

**And the page count was guessed from the raw bytes**, scanning for
`/Type /Pages … /Count N`. That dictionary lives in a compressed object
stream in every PDF GraphCompose itself writes, so the scan found nothing
and the function returned its "safe floor" of one — measured across all
nine `cv-reference` revisions: the scan found 0, the renderer reports 2.
It now asks the renderer, which was already required on that path.

Both halves had to move together: the diff could compare N pages, and the
import would only ever produce one. `import-reference` now also sets
`render.pages`, because rasterising the render is driven by that field
and there would otherwise be nothing on the render side to compare to.

The create and review skills say that a reference can be longer than one
page, that continuation pages are structurally different from the first,
and which of the two verdicts means which fix.

## v0.6.6 — 2026-08-25

Keeping the document open while the harness works — documented where a
person installs, and made to work in the arrangement they install into.

**The install page now says to keep the render open.** Every render
rewrites `current.pdf` in the project folder, so one window follows the
whole run and a correction shows its effect without anyone asking for
anything. It needs a viewer that reloads on change **and does not hold
the file open** — the second half is the one that bites, because a viewer
keeping a lock makes the next render fail, which reads as a harness bug
and is not one. On Windows that is
[SumatraPDF](https://www.sumatrapdfreader.org/), which is free, open
source, reloads on change and lets go of the file; on macOS and Linux,
Preview and Evince both reload in place.

**`preview-live` gained `--project`, because without it the command could
not open anything in a plugin install.** There are two mirrors and they
are not the same file: the per-project `current.pdf`, written by every
render, and a shared `live/` copy written only when the install *is* the
workspace. The command looked exclusively in `live/` — so in the
arrangement most people run, it reported "nothing to open yet" and told
the reader to render something they had already rendered. It now resolves
through the workspace, and the two ways of having nothing say different
things, because the fix differs: name the project, or render for it.

Documenting this is what surfaced it. The section written first named a
command that would have failed for every reader it was written for.

## v0.6.5 — 2026-08-25

The report that detected a problem and recommended something else, and
two runs shown as they actually happened.

**`preflight` now recommends the fix it already found.** A freshly
installed plugin carries no `dist/` and no preview-renderer jar — they
ship as source. The report detected that correctly and had detected it
all along, then recommended creating a workspace and rendering: a
sequence that succeeds at the first step and exits 69 at the second,
which is precisely the twenty-minutes-in discovery the report exists to
prevent. Nothing pointed at `npm run setup`, because `nextCommands` never
read the tool report at all and `setupCommand` was a constant that
appeared whether or not it was needed.

The two halves of "not ready" are now separate, because they are not
interchangeable: `unbuilt` is what setup builds, `absent` is what setup
cannot install. Recommending `npm run setup` for a missing JDK would be
wrong advice delivered confidently. `ready` and `needsSetup` say which
case applies, and building comes first in `nextCommands` when it applies.

**The README shows the loop running.** Two recorded runs on 2.2.0 — a
Northpoint invoice at 12 revisions and 113 minutes, and a sidebar CV at
10 revisions and 120 minutes from a screenshot. The invoice's first two
revisions did not compile and are still on disk as FAILED, which is the
part worth showing: the record does not begin once things start working.
Neither frame is regenerated imagery; every step is the render that
revision actually produced.

**The image check covers every document, not just the README.** It
resolved paths against the repository root, which is right for the README
and wrong for anything in a subdirectory; it now resolves against the
document that prints the link. Proven by breaking a path.

## v0.6.4 — 2026-08-25

Two documents that named the wrong version, and the tag that carries the
fix. v0.6.3 was tagged before either was noticed, so the release a reader
installs told them to install a different one.

**The install example named a release three versions old.** `/plugin
marketplace add ...@graphcompose-flow--v0.5.0` was the worked example for
holding an exact version. A reader following it pins the wrong release
and has nothing to tell them so — the command succeeds.

**The benchmark protocol named 0.6.1 in four places**, including the
column headers of the results table the run is meant to fill in. A number
recorded under the wrong label is worse than no number: the comparison it
feeds is the entire reason for holding everything else still. The table
of what the run will meet now also lists what 0.6.2 and 0.6.3 added — the
overflow fixture with the integrity gate, and link checking inside the
loop pass — so a delta has something to be attributed to.

Both are the drift this project keeps finding by hand: the README claimed
Codex acceptance was outstanding after Codex had already fired the skill,
and the user caught that one too. The v0.6.3 contract test that checks
every documented `node scripts/*.mjs --flag` covers commands; a version
number in prose is still checked by reading it.

## v0.6.3 — 2026-08-25

The 0.6 line, cut after a review of everything it added. The review is the
reason this is a release rather than another increment: it found seven
defects in code that had passed 372 tests, two of them in tests that were
themselves passing without checking anything.

### v0.6.3 — the review, and the two tests that were testing nothing

**Two assertions had never run.** A backslash eaten before a file was
written turned a word-boundary escape into the byte it names: backslash
plus `b` became 0x08, so two regexes went looking for a literal
backspace character where they meant a word boundary. Both regexes match
no input that has ever existed, so both tests passed, and both pinned
nothing — the damage is invisible in a diff and invisible in a test run.
Repaired, and a contract test now walks the tree for control characters
where an escape was meant, proven by injecting one.
A second contract test extracts every
`node scripts/*.mjs --flag` printed anywhere in the documentation and
checks the script exists and reads the flag: 28 pairs across 120
documents, all currently honest.

**A fixture render no longer overwrites the render it belongs to.** The
overflow pass writes `output-overflow.pdf`, but the debug pass and the
page rasters that followed it wrote their names *without* the suffix, so
running the fixture clobbered the real render's debug artifacts — and
pushed a thirty-row test dataset into `current.pdf`, the file a person
keeps open while they work. A suffixed render is read by a checker and
looked at by nobody: it now returns after its own clean pass.

**The footer is the lowest page-number line, not the first.** Prose
containing "continued on page 2 of 3" read exactly like chrome, and
taking the first match made a body line the footer and the real footer a
body line below it — inventing an overlap in a document that had none.

**Importing an unsupported reference no longer destroys the one you
have.** The format check ran *after* the reference folder was pruned and
the source copied, so aiming a `.docx` at the command deleted the working
reference and then failed. Validation moved ahead of the first
destructive step.

**A skill pack is not automatically an allow-list.** The 1.6 and 1.7
packs are prose written before the surface was extracted from the jar.
They resolved as `supported`, and then `api-query` — which the workflow
requires before writing any call — dead-ended on a file nobody had
generated. `resolve-version` now reports `hasAllowList` and warns with
what to do instead (`javap` against the pinned jar); `api-query` names
the lines that *can* answer.

**Artifact labels collapse to the canonical name on save.** Nothing wrote
the artifact map, so two acceptance runs of this harness produced two
vocabularies for the same seven files — `generatedTemplate` in one,
`template` in the other. Both read fine; only one satisfies
`revision.schema.json`, whose error then reads "missing property
template" with `generatedTemplate` sitting two lines above it. Known
aliases are rewritten at the single write choke point. What is *not* done
is inventing a missing artifact: a label absent under every name stays
reported as the gap it is.

### v0.6.2 — the footer band, and a divider that is missing on purpose

Two checks the last acceptance run showed were needed and that nothing
measured. Both are about differences a pixel diff scores as noise and a
reader notices immediately.

**The footer has to be under the body, not through it.** A footer is
chrome: the engine reserves its band and the body is meant to stop above
it, but nothing enforced that — the reservation comes from the page's
bottom margin, and a template that sets none runs its last row straight
into the page number. Page one almost never shows it, because its content
ends well above the fold, so it is a defect a single-page render is
structurally unable to reveal. `preview-renderer text` gained `--lines`,
which reports where each line landed as well as what it says, and
`check-document-integrity` compares the lowest body line against the
footer's top edge. Proven by putting the defect back: removing one margin
produced `footer-overlaps-body: overflow page 1: "Nullam tempor elit
egestas neque." runs 6.1 pt into the footer line "Page 1 of 3"`. A body
line that clears the footer by less than 6 pt is a note rather than a
defect — nothing is wrong yet, and nothing is holding it off either.

**A missing internal border is often the design.** A reference that groups
two adjacent rows draws no line between them on purpose. Counting rows
calls that a match and calls a drawn divider an improvement; it is the
thing that breaks the grouping. `check-border-topology` extracts the rules
both images actually draw and compares them as a structure, reporting the
asymmetry rather than a score:

```text
rule-missing-from-render   the reference has it, the render lost it
rule-only-in-render        the render drew it, the reference groups there
rule-displaced             the same rule, out of place
```

The third exists because a rule slightly beyond tolerance was being
reported as one lost and one invented: two findings with two wrong fixes,
where there is one rule and one fix. Fills are separated from rules by
thickness — a rule is a line, and the invoice's sage masthead came back as
five missing dividers before that. Scope it with `--region`; whole-page is
available and noisy on a design with bands.

It is deliberately not wired into `render-and-diff`. It is comparative
evidence, not a gate, and the judgement belongs in the review — where the
skill now says which finding means which fix, and that suppressing a
shared divider goes through the table's own cell styles, never around it.

Also: the preview renderer's flag parser assumed every flag took a value,
so `--lines --pdf x` swallowed `--pdf` and blamed the path after it.
371 tests pass.

### v0.6.1 — a flowing document, end to end

A third acceptance run, this time an invoice: the reference is a sage
one-page sample with five line items, and the document behind it is not
one page. Everything the 0.6.0 gates described was expressible; almost
none of it had been walked by a real render. Twelve findings, recorded in
full in `docs/private/acceptance-invoice.md`.

**The conflict the run existed to find.** A flowing document cannot
satisfy both gates with one dataset: the visual diff needs data that
mirrors the reference — a sample that fits — and the integrity gate needs
data that crosses a page break. So a revision may now carry two:
`<doc-kind>-data.json` beside `<doc-kind>-data.overflow.json`.
`render.mjs` gained `--data-file` and `--suffix`, `render-and-diff`
renders the fixture automatically into `output-overflow.pdf`, and the
integrity gate reads both — checking enumeration across every page of the
overflow render and that the table header repeats there. The render
runtime exports `graphcompose.data.file` so a provider can honour the
override instead of hardcoding a name.

Measured on the real template: five items give one page reading
"Page 1 of 1"; thirty give three pages, "Page N of 3" correct on every
one, the header repeated on all three, no row lost, and the summary,
payment info, terms and signature following the table onto page three.

**A project could not render at all.** `init-workspace --project` left no
`render` block and no render runner, and the only bundled seed is written
against 1.7 and correctly refused on 2.x — so on the current line there
was no path to a first render that did not go through an agent inventing
a hundred lines of Maven. `scripts/scaffold-runner.mjs` writes it,
parameterised by the pinned version, including the fonts artifact that
moved out of core at 1.8.0.

**Contracts were unenforced where the artifacts live.**
`validate-schemas.mjs` was hardcoded to this repository and took no path,
so a revision in a user's workspace was never checked. It takes paths
now — and immediately found the run's own analysis off-schema in seven
places. `render-artifact-md` no longer dies with a raw TypeError on a
malformed artifact; it names the file and points at the validator, and it
renders the `pageEnumeration` decision so a reviewer can see it.

**Two defects only a continuation page can show**, both real: without a
per-page top margin a continuation page starts hard against the paper's
edge, and without a reserved bottom margin its last row runs into the
footer. `PageMarginRule` is the primitive; the skill now says so.

**A new observation.** `PathBuilder` coordinates are normalized 0..1 with
the origin bottom-left and y up. Nothing in the allow-list says so and
point values do not fail — they draw a different shape, silently, which
is how a curved header band came out flat. The probe refuted the first
hypothesis while confirming the behaviour, and the record says what was
measured rather than what was assumed.

Also: `check-links` and the content check matched target keys exactly, so
a field called `emailHref` was invisible — a wired link reported as
unwired, and the href reported twice more. Suffix matching now.
353 tests pass.

### v0.6.0 — the allow-list is the artifact, not the source

Hardening pass over everything two real acceptance runs turned up. The
theme is the same throughout: replace a place where an agent had to
improvise with a command or a contract that decides.

**The API surface is read from the pinned jar.** The old indexer parsed
GraphCompose's Java source with regexes, so it could not see anything
Lombok generates — and four value types whose whole construction path is
generated came out empty or near-empty. `DocumentMetadata (class)` had no
members at all. Under the allow-list's own first rule, "a symbol absent
here does not exist", page headers and footers were unreachable, which is
exactly what a 2.2.0 run concluded.

- `tools/api-surface/extract-api.mjs` reads the artifact's class files
  with `javap` and merges parameter names in from the sources jar:
  bytecode decides what exists, source only decides what things are
  called. A member in one and not the other is `origin: "generated"`,
  which is a definition rather than a guess.
- `skills/versions/<line>/api-surface.json` is now the canonical form and
  `00-api-surface.md` is generated from it; `api-query` reads the JSON and
  gained `--query` as the everyday entry point. 268 types became 357 with
  **nothing lost**, and 1312 previously invisible members are listed —
  Lombok's builders and getters, and the record accessors and canonical
  constructors the compiler writes, none of which appear in source text.
- A second defect fell out of the same change: the source parser folded
  nested types into their enclosing type, so the allow-list claimed
  `GraphCompose.margin(...)` was a static call. Nested types are now their
  own entries, kept only where the surface can reach them.
- `--check` compares the committed pack against a fresh extraction.

**Two more behaviours of 2.2 are on record, each with a probe.**
`DocumentTableCell.node(...)` accepts any node and draws three kinds:
Row, ShapeContainer and CanvasLayer draw none of their children, and
Section and LayerStack draw 0.4 of them — worse to diagnose than nothing,
because a half-drawn cell reads as a styling problem. Measured by rendered
ink, because cell content never appears in `layoutSnapshot()` by name.
Table borders are per cell, and zero-width stroking a group removes every
edge of those cells rather than the shared divider alone, so a group needs
a stroked cell on each side of it. `observations` gained `find <symbol>`,
so a lookup starts from the call about to be written, and an
`engineDefect` field, so a workaround is scaffolding with an expiry rather
than permanent guidance.

**Icons resolve as SVG.** GraphCompose draws them through
`SvgIcon.read` + `addSvgIcon`; rasterising everything discarded the vector
for every icon to survive the rare one outside the reader's subset. The
compatibility check encodes that subset and separates refusal from
degradation, the SVG cache is keyed without a raster size, and the
manifest records `format` and the `fallbackReason`. Verified against live
Iconify: 226 bytes of vector where the PNG was 2.7 KB. The first version
of the check would have rasterised the entire icon set, because Iconify
serves `width="1em"` alongside a viewBox — pinned by a test.

**One canonical workspace, and commands that produce it.**
`import-reference` converts png / jpg / webp / pdf into
`reference/reference.png`, keeps the original as `reference/source.<ext>`,
and records both — the one step where two hosts would otherwise measure
against two different images. `workspace-layout.md` states the layout
once, and a parity test asserts that every command and reference a skill
names exists and ships to Codex, and that no skill branches on the host.

**A multi-page document is checked as a document.**
`check-document-integrity` reads the rendered PDF's decoded text — subset
fonts make the raw stream unsearchable — and reports page count against
the analysis, a flowing template whose example data never crossed a page
break, and "Page N of M" that does not add up. `flow.pageEnumeration` is
required for a flowing document, so the decision is made rather than
defaulted by omission. The `page-enumeration` probe is the fixture: three
rows stay on one page reading "Page 1 of 1", forty produce six pages
numbered through with the header and footer on every one and no row lost.

**Publishing removes what it no longer writes.** A stale file survived a
republish — a renamed template class left its old `.java` in the bundle,
where it still compiles and nothing downstream notices. The publisher now
prunes anything this run did not write, preserving the README's
hand-written half.

Also: `observations verify` could never confirm an array-valued result;
telemetry counts `failedRevisions`, the one build-failure figure that can
be counted honestly. 351 tests pass.

### v0.5.6 — a link with no pixels

Two things the loop could not see, both reported from real use.

**The newest render now lands beside `template-project.json`.** The live
mirror existed but wrote only to `<install>/live/`, which in a plugin or
versioned-runtime install is a cache directory nobody opens — so in every
user workspace it was invisible. Each project now keeps its own
`current.pdf` / `current-debug.pdf` / `current.txt`, rewritten on every
render under a name that never changes, so a viewer that reloads on
change and does not lock the file (SumatraPDF) can be opened once at
revision 1 and follow the work to the end. The shared `live/` folder
stays for harness development and for an explicit `GRAPHCOMPOSE_LIVE_DIR`;
the rasters stay there alone, since every tool that wants pixels reads
the revision's own `output.png`. The mirror moved to
`scripts/lib/live-mirror.mjs`, and `init-workspace` now seeds a
`.gitignore` covering the derived copies and the runners' `target/` —
and nothing else, because the revisions are the audit trail.

**Links are now read back out of the rendered PDF.** A link annotation
has no pixels, so a document whose every link is dead diffs identically
to one where they all work — the visual loop is structurally unable to
see it. Reading the acceptance runs back proved it had been happening
throughout: `serif-headline-cv` rendered zero link annotations through
revisions 001-010 with four hrefs already sitting in `cv-data.json`, and
went live only in 011 after the user asked; `navy-sidebar-cv` was
approved and published with zero links and no hrefs recorded at all.

- **`scripts/lib/pdf-links.mjs`** reads `/Subtype /Link` targets out of a
  PDF — raw body and Flate object streams, literal and hex strings, no
  dependency. It is a reader, not a parser: it reports which targets the
  document contains, not which text carries them.
- **`scripts/check-links.mjs`** compares those targets to the data spec
  and separates the two failures. A declared `href` missing from the
  render is a **failure** — the contract was explicit. A link-shaped
  value with no href near it is a **warning** — whether a given string
  should be clickable is a judgement, and candidates stay narrow (URLs
  and emails; not phone numbers, addresses or company names) so the
  warnings stay worth reading.
- **It runs where it costs nothing.** `render-and-diff` checks every
  pass, and a dead link turns `READY_FOR_APPROVAL` into `REVISE` with
  focus `dead-links`; an already-revising pass keeps the focus its
  reviewer chose. `approve-and-publish` checks before any state changes
  and refuses with the targets named — the one defect the person
  approving cannot have seen, because they were judging the render.
- **The rules moved upstream too**: the create workflow asks for an
  `href` beside every address while the reference is still being read,
  and `authoring-rules.md` states that an href in the data is a link in
  the render, through the pack's link API.

New: [`docs/link-integrity.md`](docs/link-integrity.md). 278 tests pass.

### v0.5.5 — a one-page screenshot is not a one-page document

Both acceptance runs were single-page CVs, so the flowing-document path —
an invoice whose line items outgrow the page, an article — was never
exercised, and inspection found the chain broken in three places even
though GraphCompose 2.2 has the machinery (`DocumentSession.header` /
`.footer`, `DocumentHeaderFooterZone`, `TableBuilder.repeatHeader`) and
the pack teaches it in `pagination.md`.

- **The analysis can now record the decision.** `visual-analysis.json`
  gains `flow` — `kind: fixed | flowing`, the region that grows
  (`drivenBy`), and one sentence of overflow reasoning — plus
  `regions[].role` (`page-header`, `page-footer`, `table-header`,
  `background`, default `content`). Until now even a perfect analysis had
  no field to say "this footer repeats on every page".
- **The skill forces the question while the reference is in front of the
  analyst**: decide fixed-vs-flowing explicitly; map furniture roles to
  session chrome, never to body sections ("drawing chrome as content is
  invisible on a one-page render and wrong on every page after it"); and
  for a flowing document the example data must reach page 2 — a
  pagination path the render never exercises is untested code shipped as
  a template.
- **The `pagination.md` loading trigger was circular** — "content that
  will overflow" requires having already thought about overflow. It now
  fires on the content kind: any repeated-row content, even when the
  screenshot shows one page.
- The reading copy leads with the flow call and highlights furniture
  roles, because an invisible decision is one nobody reviews.

### v0.5.4 — the analysis fans out, and the benchmark has a protocol

The last item from the optimization plan, plus the coherence pass that
closes it.

- **`create-template` can fan the analysis out to parallel subagents**,
  where the host supports them (Claude Code's Agent tool; sequential
  fallback elsewhere). Three subagents, three disjoint owners: geometry →
  `visual-analysis.json`, content → `<doc-kind>-data.json`, assets →
  `asset-request.json`. Files are the join points — each subagent writes
  only its own, replies in one line, and the parent reads results from
  disk, never from transcripts, so subagent output does not live in the
  parent's context. The render loop stays serial on purpose: each pass
  depends on the previous render, and the skill says so.
- **`docs/benchmarks.md`** records the baseline's shape and the protocol
  for v2: same reference, same opening sentence verbatim, fresh project
  id, fresh session, no steering until the loop stops, `run-metrics
  finish` afterwards. Compare per cycle, not per total — totals mix in
  how much steering the human chose to do, which is not the harness's
  variable. Honest expectations included: composites remove turns, not
  thinking, so the realistic near-term win is fewer requests and a much
  faster correction path, not a 3x create.
- **`run-pipeline` and `config/pipeline.json` caught up with the
  composites**: the render stage's tool is `render-and-diff`, and the
  printed hints name the two one-call commands instead of the retired
  step-by-step chain (the approve hint still pointed at the revision
  manager directly). Removed a dangling `posix` deletion my own edit had
  introduced — caught by exercising the missing-revision path, not by
  the suite, which is why the hint text is now covered by the smoke run.

### v0.5.3 — one loop pass, one command

Third optimization from the baseline. Every pass of the loop runs the
same deterministic chain — render, scale the reference, diff, write the
evidence, ask the loop — and the serif run paid for it as three to four
model turns per pass, improvising the scaling step with ImageMagick
shell arithmetic that left junk files in the user's project root.

- **`scripts/render-and-diff.mjs`** is that chain as one call, and its
  exit code is the loop's own verdict: 0 ready, 2 revise, 3 blocked, 1 a
  step failed — so a skill branches on the code without parsing prose.
  `--skip-render` reuses the existing render (the measure step alone);
  `--against parent` serves the exact-diff and region-diff gates.
- **`visual-diff` gained `--scale-reference` / `--save-scaled`**: when
  dimensions differ, the reference is scaled to the render's size with a
  documented, deterministic bilinear sampler (pure pngjs), and persisted
  as `reference-scaled.png` for later passes and crop-region. Opt-in, so
  a deliberate same-size comparison can never be silently resampled —
  and the parent comparison never scales at all: parent and child come
  from the same renderer, so a size difference there is a real change.
- A render failure surfaces as the build log's tail inside the one
  result, not as a separate turn spent re-reading Maven output.

The sampler's point is not to match ImageMagick — it is to be the same
every run, so diff numbers are comparable across passes. The scaling
method lives with the comparison that needs it, in the tool, not in
whatever shell the agent improvises.

### v0.5.2 — corrections read crops, not pages

Second optimization from the baseline. The measured case: "too close to
the divider" — one sentence about one region — cost 39 model requests,
each carrying two full pages of pixels plus ~550k tokens of inherited
create-session context.

- **`crop-region`** (a second `tools/visual-diff` bin, pure pngjs) cuts
  the reference and the render down to one region. Bounds are page
  fractions, deliberately unlike mask-regions' pixel rects: a mask pairs
  two same-size renders, a crop pairs images of different resolutions,
  and one fractional rect projects onto each pixel grid without
  resampling either. Proven on the real serif run: the certifications
  band came out as corresponding 49 KB and 147 KB crops from a 1240- and
  a 1024-wide image.
- **Regions may now carry `bounds: {x,y,w,h}`** in `visual-analysis.json`
  (optional, page fractions). The analyse stage records them — four
  numbers per region — and that is what makes a region croppable. A
  region without bounds is refused with instructions, not guessed at.
- **The default 2% padding keeps context in frame**, because "too close
  to the divider" needs the divider visible; an exact-edge crop hides
  precisely the relationship being judged.
- **`revise-template` now states the fresh-session protocol.** Everything
  a correction needs is on disk — that is what the file-based model is
  for — so a correction works in a fresh session at a fraction of the
  inherited-context cost, re-entering through one `preflight` call.

### v0.5.1 — approve is one command

The first optimization from the measured baseline. Telemetry priced the
old approve flow at 11 model requests, two minutes and 6.5M cache-read
tokens — for a chain the approve skill itself calls "almost no
judgement". The transcript showed why: status, approve, publish, verify
and metrics each ran as its own turn carrying ~590k of context, with the
bundle README hand-written in between.

- **`scripts/approve-and-publish.mjs`** chains the same CLIs — the
  revision manager still owns the state machine, the publisher the copy,
  the verifier the proof — and answers with one JSON. The agent's job is
  confirm, run, relay: two turns instead of eleven.
- **The guards survived the shortcut.** Only a DRAFT approves; BLOCKED
  stops the fast path *before* anything changes (the revision manager's
  own approve stays available, deliberately less frictionless); REVISE
  does not block — the human approving is the decision — but is recorded
  as `verdictAtApproval`. A verify failure exits 1 while reporting the
  completed approve and publish, because by then the state is real.
- **The bundle README's stable half is generated** from `template.json`:
  preview, contents, dependencies, usage with the real class names.
  Hand-written sections live below a marker and survive republishing —
  the serif run's best README content was three discovered library
  behaviours, exactly what a regeneration must not eat. A README without
  the marker is left alone entirely.
- The approve skill now runs the composite and forbids the step-by-step
  path it used to prescribe.

## v0.5.0 — 2026-08-25

The first tagged release. The harness became installable at the start of
this line and **proven** by the end of it: two complete acceptance runs
in Claude Code — a two-column navy CV and a single-column serif CV, both
from one sentence and a screenshot, both approved and published — plus a
mechanically verified self-contained Codex install, exercised with the
source clone deleted. Codex live discovery is the one thing still
outstanding, and the README says so.

Install this exact version:

- **Claude Code** — the release is tagged `graphcompose-flow--v0.5.0`
  (the plugin system's own tag format, created with `claude plugin tag`).
- **Codex** — `git clone --branch v0.5.0 …` then
  `npm run setup && node adapters/codex/install.mjs`; the runtime lands
  in `~/.codex/graphcompose-flow/0.5.0/` and the clone can be deleted.

Everything below shipped as `0.5.0-beta.1` through `-beta.15` and is
part of this release.

### v0.5.0-beta.15 — the landing page shows the same two runs

The site still advertised the eleven-agent chain and the
`mint-editorial-cv` bundle it produced: reference, render and debug
overlay, over two pages. Same problem the README had — it demonstrates
the renderer, not the loop.

- **`LiveExample` is now two runs**, each as reference · one request ·
  after corrections, with the counts, the corrections in the user's own
  words, and the measured cycle costs for the run that has them. The
  middle column is outlined, because it is the claim being made.
- **`site/src/data/runs.json`** holds the facts, hand-written: the runs
  happened in a user's own Java project — which is where the harness is
  meant to work — so there is no artifact in this repository to derive
  them from. A contract test asserts the figures also appear in the
  README, since two places holding the same numbers is how they drift. It
  was checked against a deliberately altered count.
- **`sync-assets.mjs` serves the README's own images**, so the front page
  and the landing page cannot show different work.

Two dead things went with it. `Pillars` linked to
`prompts/visual-review-agent.md`, deleted three releases ago — a broken
link on the public page — and described "the Visual Review agent" and
"the Template Publisher" as if the chain still existed. The hero's alt
text still said "11-agent".

A second new test walks every `tree/main` and `blob/main` link the site
makes and fails on any that no longer resolves. That is how the dead
prompt link survived: nothing was checking.

### v0.5.0-beta.14 — the front page shows what the harness actually does

The README's example was `mint-editorial-cv`, produced by the
eleven-agent chain this harness replaced. It showed reference, render and
debug overlay side by side — which demonstrates the renderer, not the
loop, and answers none of the questions someone deciding whether to
install this actually has.

Replaced with the two runs the current harness produced, each shown as
**reference · one request · after corrections**. That split is the claim
worth judging: a first render is never right, so what matters is how
close one request gets and what closing the rest costs.

- **navy-sidebar-cv** — two-column CV, photo, navy sidebar, timeline
  rail. Five revisions unattended, then it stopped and asked; two
  corrections about the timeline closed it. 8 revisions, 77 minutes.
- **serif-headline-cv** — display serif over a sans body, proportional
  skill bars, icon-badged certification cards. Eight revisions
  unattended, then three corrections, each a plain sentence about what
  looked wrong and none explaining how to fix it.

With the measured cost, from the harness's own telemetry: 68 minutes for
the first request against 7 and 10 for the corrections — roughly a tenth
each. That ratio is the number to watch, and it exists because
`beta.13` made the metrics visible.

Also honest about what the images do not show: neither run was
pixel-perfect from one request, and the pixel-similarity figure stayed
unimpressive in both because the references are rasterised in typefaces
no bundled family reproduces.

`Claude Code acceptance` is now recorded as run — twice, on these two
templates. Codex acceptance stays outstanding, and the contract test that
guards against overselling was updated to track that rather than a fixed
sentence. A second test now checks every README image exists, because a
broken image on the front page reads as a broken project.

### v0.5.0-beta.13 — the metrics were recorded and never shown

A real run happened and reported nothing. The data was all there — four
sessions on disk, one with every cycle of the run in it — and three
separate things kept it from reaching the screen.

- **`report` crashed on any session with a transcript.** The probe-cache
  refactor moved `const eventCache` below the top-level code that uses
  it, so every report died in the temporal dead zone. It shipped because
  the telemetry tests covered `core.mjs` and the provider and never ran
  the CLI. Four CLI-level tests now do, and they were checked against the
  reintroduced bug.

  This also means the "736 ms to 129 ms" in `beta.11` measured a crashing
  process. The real figure for a report on a 37 MB transcript is about
  700 ms, and the caching it describes is still correct.

- **`run-metrics start` was never called.** The README documented it, the
  skills did not mention it, and no session on disk had `runStartedAt`.
  `create-template` now calls it, and a report with no explicit start
  falls back to the first cycle rather than dropping the run clock
  entirely.

- **Nothing forced a report to be printed.** The skills said to, at the
  end of a long document, and it did not happen. `iterate-status` — which
  the loop calls after every render by contract — now prints a one-line
  cost of its own. Silent when telemetry is unavailable, never fatal.

The run that prompted this, recovered afterwards from its own recording:

```text
create from reference     68 min · 280.4k output · 61.0M cache read · 211 requests
"divider is vertical"      7 min ·  25.2k output · 16.0M cache read ·  32 requests
"too close to the line"   10 min ·  36.4k output · 21.8M cache read ·  39 requests
approve                    2 min ·   8.1k output ·  6.5M cache read ·  11 requests
```

### v0.5.0-beta.12 — probes stop rebuilding what has not changed

Measured before assuming: of a 6.0 s probe run, `mvn compile` was 3.0 s
and `dependency:build-classpath` 3.6 s, against 0.7 s for the probe
itself. Eighty-nine per cent of a probe was Maven repeating work it had
already done, and `observations verify` paid it once per observation.

- **`scripts/lib/probe-cache.mjs`** decides when either step can be
  skipped. A compile happens when any source post-dates the newest class;
  a classpath resolve happens when the pom's contents changed or any
  cached entry has vanished. `--refresh` forces both.

- **The key is the pom's contents, not its timestamp.** The timestamp
  version looked right and did nothing: a commit or a branch switch
  rewrites `pom.xml`, so the cache was thrown away after every ordinary
  git operation while the dependencies had not moved. That is why the
  first attempt only got 6.0 s down to 3.8 s.

- **Every entry is checked to still exist.** A cleaned local repository
  does not touch the pom, and without that check the failure is a
  NoClassDefFoundError from the probe rather than an honest resolve.

```text
probe, cached            6.0 s -> 0.7 s
observations verify     21.2 s -> 2.7 s
```

The predicates live in a module so they can be tested without a Java
toolchain — fourteen tests covering an edited source, an added source, an
unbuilt project, a touched-but-unchanged pom, a changed pom, a pruned
dependency, a missing stamp and an empty classpath. Cache invalidation is
exactly the logic that earns tests: a stale cache silently reporting on
code that is no longer there would be worse than a slow probe, because a
probe's only value is that its answer describes the build in front of you.

### v0.5.0-beta.11 — review of the day's work

A review of everything shipped today, looking for broken loops, holes,
wiring and things that will not scale. Every tool proved reachable from a
skill or `AGENTS.md` — no orphans — and the loop is sound. Six defects
turned up, all in code written today.

- **`api-query --exists` answered about the wrong thing.** A
  fully-qualified name split on its first dot, so
  `com.demcha.compose.dsl.TimelineMarker.dot` was reported as "no type
  `com` — it does not exist for this version": a confident, authoritative,
  wrong negative, from the one tool whose whole value is that its "no" can
  be trusted. It now reads the last two segments.
- **`render-artifact-md --revision --out` lost data silently.** It
  rendered each artifact over the last and reported success for every one.
  Refused now.
- **`observations promote` was not idempotent** — a second run appended
  the section again — and it accepted a target outside the harness, which
  recorded `promotedTo` as `../../../Users/...`. Both refused.
- **Telemetry parsed the transcript once per window.** A report read a
  37 MB file three times and an archive once per cycle. Parsing and
  folding are now separate: read once, fold many. A report went from
  736 ms to 129 ms, and `finish` stopped being linear in cycles.
- **`verify-published-template --template-id all` rewrote any argument
  equal to `all`**, including a `--root all`. Only the value after
  `--template-id` is substituted now.
- **The loop's blocking message misattributed a user's report.** When the
  focus came from the user, intervening passes may have worked on other
  things, so "the next attempt would be the same attempt" was untrue — and
  it is the sentence a human reads when the loop stops. It now says what
  the user reported is still open and to ask them.

Not defects, recorded so they are not rediscovered: `writeState` in the
telemetry hook is a read-modify-write with no locking, which two hooks
firing together could race — cheap to hit, harmless when it does, and a
lock is disproportionate. `preflight` spends most of its ~900 ms probing
for java, mvn and magick; that is the cost of answering "are the tools
ready" before a run rather than twenty minutes into one.

### v0.5.0-beta.10 — what the Codex install actually did

The Codex adapter was driven against a sandboxed install with the source
clone deleted — the claim the design stakes itself on. It held, but two
defects turned up first, and both would have ended a live run in its
opening minutes.

- **The bundled template seed never shipped.** `init --template invoice`
  failed with "template seed not found" because the runtime copy has no
  `examples/`. The Claude plugin cache is a full git clone and has it by
  accident, so the same command worked in one packaging and not the
  other — the divergence the adapter exists to prevent. Now shipped, but
  only the sliver the seeder reads: 60 KB against 1.5 MB for the example
  wholesale.

- **The render destroyed its own renderer.** `render.mjs` runs
  `mvn package` on the preview renderer before using it. An install ships
  the built jar and the pom but not the sources, so that build did not
  fail — it succeeded, produced a jar with no classes, and overwrote the
  working one. The render then died on "Could not find or load main
  class", and every later run would have failed the same way with no way
  back short of reinstalling.

  `scripts/lib/render-runtime.mjs` now rebuilds the renderer only where
  its `src/` exists, uses the shipped jar otherwise, and aborts clearly
  when there is neither.

With both fixed, the full deterministic chain runs from an install with
no clone anywhere: workspace, seeded project, compile, render, PDF and
PNG — plus probes, observation verification and telemetry.

Held by two tests in `scripts/test/codex-adapter.test.mjs`. One existing
test had to change with them: `examples/` is no longer absent from an
install, so it now asserts that exactly one example ships and nothing
else.

**Still outstanding:** the live half. Whether the skill fires from a
plain sentence in a session nobody prepared is a question only a Codex
session can answer, and it is the last release blocker.

### v0.5.0-beta.9 — the loop listens

- **A difference the user names now outranks the measured one.**
  `humanReportedMismatch` on the review carries their words verbatim and a
  stable id; `iterate-status` names it as the next target instead of
  whatever occupies the most pixels, and keeps naming it until a review
  sets `addressed: true`.

  This is the behaviour the acceptance run showed and nothing enforced.
  The whole instruction was "the timeline is visually incorrect", and the
  loop diagnosed a rail overshoot and an anchor clamp from it. The
  contract now says plainly that this is a redirect, not a specification:
  the user says what looks wrong, the diagnosis and the implementation
  stay with the agent, and the quote is kept verbatim because a paraphrase
  turns their observation into the agent's reading of it.

- **"One mismatch per pass" is now "one root cause per pass."** Several
  mismatches may be fixed together when they share a `rootCause` **and** a
  region — an axis change that moves a marker, a rail and a title is one
  fix. The link is recorded, so attribution survives.

  The loop bound counts causes rather than ids. Counting ids alone let a
  loop chase three symptoms of one cause and reset the counter every pass,
  which is precisely the situation `maxSameMismatchAttempts` exists to
  catch.

- **`score` is now `pixelSimilaritySignal`.** Named for what it measures,
  because a bare "score" reads as a verdict while the number
  over-weights anti-aliasing and under-weights structural error — it can
  fall while the document visibly improves. `score` is still read so
  revisions written before the rename keep validating and rendering.

  Not done: splitting it into geometry / alignment / typography / raster
  signals. Nothing computes those, and four invented numbers would be
  worse than one honestly named.

- Run telemetry was already shipped in `v0.5.0-beta.7`.

### v0.5.0-beta.8 — preflight and api-query

Two commands for the two things the acceptance run spent the most shell
calls on: establishing where it was, and checking whether a method exists.

- **`scripts/preflight.mjs`** answers in one call what used to take ten
  to twenty: the workspace and how it resolved, the version read from the
  build file and the pack it maps to, the scope and stages this revision
  routes through, the loop bounds, the loading map as data, what previous
  runs learned about this line, and whether the tools are built. Exit 3
  unsupported line, 4 not a GraphCompose project — the same codes as
  `resolve-version`, so a caller branches identically on either.

  It decides nothing. Which files to open stays judgement; what it
  removes is the calls spent establishing facts.

- **`scripts/api-query.mjs`** answers the allow-list without reading it:
  `--exists Type.method` returns the overloads and exit 0, or the type
  with no overloads and exit 3. Also `--type`, `--method`, `--search`,
  `--constant`, `--package`, `--dump`.

  **No generated `00-api-surface.json`.** Emitting one would create a
  second copy of a closed set that has to stay in step with the first —
  the drift this repository keeps removing. Parsing 126 KB takes
  milliseconds, so the Markdown stays the only source; `--dump` writes
  the JSON to stdout for anyone who wants it.

  The parser is checked against the totals the generated document states
  about itself — 268 types, 1886 methods, 317 constants — which is the
  cheap proof that a regex dropped nothing.

Preflight's loading-map parser caught a real defect on its first run: the
pack's worked starting point for a CV is followed by "Not `tables` unless
the CV has genuinely tabular content", and reading backticks past the
list added the one file the pack had just said to leave out.

### v0.5.0-beta.7 — telemetry

The first acceptance run produced one number: about an hour, roughly 240k
tokens. Enough to say the harness works, not enough to say whether a change
made it better, which correction was expensive, or what a cache-read
reduction is worth.

- **`hooks/hooks.json`** — the harness ships plugin hooks for the first
  time. They record timestamps and the transcript location, decide nothing,
  call no model, and **always exit 0**: a hook that fails blocks the turn it
  was measuring, and no measurement is worth that.
- **`scripts/telemetry/`** — `core.mjs` (host-independent clocks, counters
  and formatting), `providers/claude-code.mjs` (token accounting),
  `providers/codex.mjs` (a named seam that says it is not implemented rather
  than reporting zeros), `claude-hook.mjs`, `run-metrics.mjs`.
- **Three clocks**: cycle (since the user last spoke), run (since the
  workflow started), session. The cycle clock is the one that makes "what did
  that correction cost" answerable at all.
- **Five token figures, never one total.** In a real session: 843k output
  against 443M cache read. Reported as a single number, a sixfold cache
  reduction would be invisible next to a 5% output increase.
- **Counters are derived from the workspace**, not accumulated — revisions,
  renders and reviews are counted from what is on disk, so nothing has to
  remember to increment and no counter can drift from its artifacts. There is
  deliberately no "build failures" figure: nothing records one in a form that
  could be counted honestly.
- **Deduplication by `requestId`**, which is not optional: a real transcript
  held 1699 assistant lines carrying usage and 846 distinct requests. Summing
  lines would double every figure, and a doubled figure looks plausible.
- The `create-template` and `revise-template` skills now end a handoff with
  the metrics block, and are told to carry on silently when it is
  unavailable.

Also: the Codex runtime now ships `observations/` and `tools/diagnostics/`,
which the previous release left behind — an installed agent would have
rediscovered the same library behaviours the hard way.

### v0.5.0-beta.6 — probes and observations

The first acceptance run wrote four probes by hand, 305 lines of Java, to
establish three real behaviours of GraphCompose 2.2 — and left them inside
one CV project, with the conclusions in that template's README. The next
run would have paid for all of it again.

- **`tools/diagnostics/graphcompose-2.2/`** holds those probes as a
  compilable project, one per library line. `node scripts/probe.mjs <name>`
  compiles once (Maven caches it) and prints a single JSON object:
  measurements plus a `finding` **derived** from them. A probe that
  hardcoded its own conclusion could not report that the library changed
  under it, which is most of the reason to keep one.

  Four probes: `anchor-alignment`, `row-nesting`, `shape-paint`,
  `timeline-nesting`. Two of them expect the layout compiler to throw, catch
  it, and report the message — GraphCompose usually names the supported
  alternative in it, which is more than the acceptance run concluded on its
  own.

- **`observations/`** records what a probe established, as evidence held
  deliberately apart from the skill packs. A pack is the allow-list an agent
  authors against; a behaviour seen once in one document is not that. The
  path is record → `verify` → `promote`, and `promote` re-runs the probe
  before appending anything to a pack.

  `node scripts/observations.mjs verify` re-runs every probe and compares
  against the numbers recorded, so a library fix retires an observation
  instead of leaving it to mislead. It is a slow step in `npm run verify`.

- **Three observations seeded** from the run, all confirmed against 2.2.0 by
  live probes rather than copied from prose: a shape container paints its
  fill 21.84 pt above its box when it carries a 22 pt bottom margin; it
  top-clamps a child taller than itself, 3.5 pt for a 13.8 pt child in a
  6.8 pt band; a row cannot nest in a row cell, and a LayerStack layer does
  not rescue it.

- **`schemas/observation.schema.json`**, and the schema validator learned to
  bind by directory — observations are named after what they describe, not
  after their kind.

### v0.5.0-beta.5

- **`scripts/render-artifact-md.mjs`** generates the Markdown half of
  `visual-analysis`, `architecture-plan` and `visual-review` from their
  JSON. The workflow skills now ask for the JSON only.

  Writing both by hand cost the first acceptance run 24 Markdown files,
  112 KB, roughly 29k tokens across eight revisions — about an eighth of
  the run, restating JSON that had just been written. The larger problem
  was never the tokens: two documents describing one revision drift, and
  a reviewer reading the prose could disagree with the gate reading the
  JSON with nothing to say which was right.

  `--revision <dir>` renders every artifact present; `--check` re-renders
  and compares instead of writing, so an edited reading copy fails
  instead of quietly diverging. Exit 0 in sync, 1 drift or malformed
  artifact, 2 usage.
- **`notes` added to the three artifact schemas** — an array of Markdown
  blocks emitted verbatim under a `Notes` heading. This is where the
  narrative the schema cannot derive goes (a table comparing three
  revisions, a paragraph of causal reasoning), so keeping it costs a
  field rather than a second source of truth.

  Existing hand-written twins under `examples/` are left as they are.
  They are the worked chain the README teaches from, and regenerating
  them would replace a narrative written for readers with a rendering of
  its own data.

### v0.5.0-beta.4 — what the first acceptance run exposed

The harness was run end to end for the first time, by hand, against a
clean Java project pinning GraphCompose 2.2.0: eight revisions, five of
them autonomous, then human visual feedback and two more, then approve
and publish. The workflow held. The publisher did not, and every change
below is a defect that run left on disk (`docs/private/acceptance-claude.md`).

- **A published bundle now always matches its APPROVED revision.**
  `--force-template` is gone. It existed so a re-publish would not
  discard editorial Javadoc, and the cost was that the bundle could
  silently stop matching the revision it named. Each copied source
  reports `new` / `unchanged` / `UPDATED`.
- **Every asset reaches the bundle**, not just `assets/icons/` and
  `assets/fonts/`. The run's bundle referenced `assets/avatar.png` in its
  example data, the file sat in the approved revision, and the publisher
  had no rule that copied it.
- **The rename covers every published source.** The spec and provider
  were copied verbatim, so their Javadoc kept naming the revision-local
  `GeneratedCvTemplate`, a class no consumer of the bundle has.
- **Publishing a non-APPROVED revision fails.** It used to warn and
  continue, so an explicit `--revision` could ship a DRAFT under the same
  template id. `--allow-unapproved` keeps the development path and says
  so in the output.
- **`dependencies` come from the render runner.** They were hardcoded to
  graphcompose + jackson while the run's README documented
  `graph-compose-fonts:1.1.0` — the prose knew more than the manifest,
  and a build file generated from the manifest would not have compiled.
- **The publisher scans what it wrote** and fails rather than leaving a
  bundle carrying a stale class name, an absolute path, or a reference
  back into `revisions/<id>/`.
- **`scripts/verify-published-template.mjs`** takes `templates/<id>/` and
  nothing else and asks whether it works. Static by default (manifest,
  sources, and every asset the example data names — no toolchain, runs in
  CI); `--build` compiles it against the dependencies its own manifest
  declares; `--render` renders its example data through the preview
  renderer. Exit 0 verified, 1 broken, 2 usage.

  Run against the acceptance bundle it reports the missing avatar in
  under a second. Run against the republished one it compiles and renders
  184 KB of PDF from the bundle alone.

### v0.5.0-beta.3

- **`init --template` works outside a checkout.** It looked for the seed
  by walking up from `process.cwd()` for the repository, so an installed
  user got "must run inside the graphcompose-ai-flow repository" and
  could not use it at all. The seed ships with the harness, so it is now
  found from the module's own location — true in a checkout, in
  `~/.codex/graphcompose-flow/<version>/` and in the plugin cache alike.
- **The seeded project lands where the caller stands**, exactly like the
  empty scaffold, instead of being forced to `<install>/examples/<name>`.
  That rule came from `runRender` resolving projects as
  `examples/<projectId>`; it takes an explicit `projectDir` now, and
  honouring the old rule would have written a user's project into the
  harness install. `cd examples && init --template` in a checkout is
  unaffected.
- **Seeds are pinned to a GraphCompose line and cross-line seeding is
  refused.** A seed is real Java against one API: the 1.7 invoice does
  not compile against 2.x — the whole
  `com.demcha.compose.document.templates.*` tree moved — so seeding it
  into a 2.2 project produced something that could not build. The error
  names both lines and points at the empty scaffold. Within a line the
  caller's patch version wins, and the seeded runner's
  `<graphcompose.version>` is repointed at it; nothing overrides that
  property at render time, so an unrewritten runner silently built
  against the seed's version.
- **`scripts/init-workspace.mjs --template <name>`** threads the flag
  through, so workspace, project and seed are one command.

  **Known gap:** the only seed is `invoice` on the 1.7 line, so
  `--template` is unavailable on 1.9 and 2.2 by design rather than by
  accident. Closing it needs an invoice example ported to the current
  line, which is example work, not a fix to this command.

### v0.5.0-beta.2

- **`scripts/init-workspace.mjs`** — see the entry under Public API
  below. The version is bumped rather than folded into `beta.1` because
  `claude plugin update` compares version strings, not commits: a fix
  shipped under an unchanged version never reaches an installed user,
  and the CLI reports them "already at the latest version".

### v0.5.0-beta.1 — the harness migration

The project stops being a workflow kit that a coding agent has to
interpret and becomes an installable harness for Claude Code and Codex.
The host supplies the model, the reasoning and the shell; this project
supplies workflow, GraphCompose knowledge and gates; anything a script
can decide is decided by a script.

#### Public API

- **Four workflow skills** replace the eleven-prompt chain —
  `skills/workflows/{create,revise,review,approve}-template/SKILL.md`,
  one per user gesture, over four shared references (workspace, scope
  routing, iteration loop, authoring rules). `prompts/` and the
  `docs/agents.md` that described it have been removed; the stages are
  now named by what they do in `config/pipeline.json`.
- **`config/pipeline.json`** is the single source of scope → stages, the
  gate each scope ends on, the loop bounds and the failure categories.
  `scripts/run-pipeline.mjs` holds no chain of its own; the orchestrator
  prompt and the revision schema point at the config instead of
  restating it.
- **Workspace decoupling.** Work lives in the user's Java project under
  `graphcompose-flow/`, resolved by `--root`, `GRAPHCOMPOSE_FLOW_ROOT`,
  discovery from the cwd, or this repository's own `examples/` in
  development. `scripts/lib/workspace.mjs` is the only resolver.
- **`scripts/init-workspace.mjs`** creates that workspace, and is the
  first command to run in a project that has none. It resolves the
  GraphCompose pin, seeds the manifest with it, and with `--project <id>`
  creates the project inside `projects/`. Idempotent; exit 0 created or
  present, 2 usage error, 3 project exists.

  This closes a hole rather than adding a convenience. `initWorkspace()`
  existed but no CLI called it — the workflow reference told the agent to
  import the module inline — so the step deciding *where every later
  command writes* had no deterministic backstop, and skipping it failed
  silently: with no manifest, resolution falls through to install mode,
  whose projects directory is the harness's own `examples/`. A user
  following the documented flow would have had their work written into
  the installed runtime, with every command agreeing it belonged there.
- **`graphcompose-flow init` accepts `--target-version` / `--skill-pack`.**
  Both were reachable from `runInit` but not from the CLI, so every
  project it created claimed GraphCompose 1.9.0 whatever the project
  actually pinned, and the mismatch first surfaced as a compile error
  against the wrong allow-list.
- **`scripts/resolve-version.mjs`** reads the GraphCompose pin from the
  user's `pom.xml` / `build.gradle(.kts)` and maps it to a skill pack.
  Exit 0 supported, 3 unsupported, 4 not a GraphCompose project. An
  unsupported line is a stop, never a fallback to the nearest pack.
- **`scripts/iterate-status.mjs`** enforces the loop bounds that were
  previously only declared: exit 0 ready for approval, 2 revise, 3
  blocked, counting iterations, consecutive build failures and repeats of
  the same mismatch id.
- **GraphCompose 2.2 skill pack** (`skills/versions/graphcompose-2.2/`),
  generated from the `v2.2.0` tag — 268 types, 1886 methods, 317
  constants — and now the manifest default. 1.9 joins 1.6 and 1.7 as a
  frozen snapshot. Each pack gains a `00-loading-map.md` so a task opens
  four to six files instead of seventeen.
- **Packaging.** `.claude-plugin/plugin.json` + `marketplace.json` and
  four slash commands for Claude Code; `adapters/codex/install.mjs` for
  Codex, installing stubs that point at the canonical skills rather than
  copying them.
- **`npm run verify`** runs every gate locally, fail-fast, with `--quick`
  for the steps that need no Java or network.
- `graphcompose-flow fail` takes `--category`, `--stage` and `--message`.

#### Fixed

- `graphcompose-flow fail` wrote `status: FAILED` with no `failure`
  record, which its own schema requires. Reproduced and confirmed with
  ajv; it now always writes one, using `stage: "unspecified"` rather
  than inventing a plausible stage.
- `graphcompose-flow` and `visual-diff` died with a raw
  `ERR_MODULE_NOT_FOUND` on a fresh clone, because `dist/` is not
  committed. They now exit 69 naming `npm run setup`.
- `tools/api-surface/api-index.py` silently wrote an **empty** allow-list
  when it parsed nothing, and only understood the 1.x source layout. It
  now refuses to write an empty index, scans the 2.x reactor modules
  (`core/`, `templates/`), and emits the frontmatter the repository
  contract requires.
- Two documented commands used a bash line continuation, which PowerShell
  reads as a literal.

#### Documentation

- `docs/architecture.md` — the layer split, the loop, the contracts, the
  workspace model, and what is deliberately excluded (no LLM API, no MCP,
  no standalone runtime).
- `docs/plugin-installation.md`, `adapters/codex/README.md`,
  `docs/demo.md` (real captured output), and a README that leads with
  installation rather than concept.
- `AGENTS.md` cut from 346 lines to a dispatcher: which skill owns the
  task, seven invariants, the commands, where each contract is declared.

#### Tests

- 78 root contract tests on the built-in `node:test` runner (no new
  dependency), plus 7 ajv schema tests, wired into CI as
  `harness-contracts` — the root suite had not been running in CI at all.
- Four new schemas (orchestration, visual analysis, architecture plan,
  visual review) and a workspace-manifest schema, all bound to the
  existing repo-wide validator.
- `tests/routing-fixtures.json` — 16 gestures with the scope each should
  route to, checked for shape; the routing itself is observed in the
  acceptance runs rather than asserted with an LLM in CI.

#### Known gaps

- The Claude Code and Codex **acceptance runs are outstanding** —
  whether a skill fires unprompted in a clean project is not yet
  recorded.
- The five skill fixtures still pin 1.9.0; four fail against 2.2.0
  because `BusinessTheme` left the published library in 2.x. Until they
  are ported, the 2.2 pack's compile-smoke evidence is inherited rather
  than proven and every conceptual skill stays `needs-validation`.

### GraphCompose 1.9.0 — source-generated API allow-list + default retarget
- **New `graphcompose-api-surface` allow-list skill.**
  `skills/versions/graphcompose-1.9/00-api-surface.md` is generated
  straight from the `v1.9.0` GraphCompose source (199 types, 1571
  methods, 197 constants) and is the FIRST skill in the manifest. It is
  the COMPLETE, exact list of every public authoring method/constant for
  1.9.0 — a closed set: a symbol absent from it does not exist for the
  version. This gives the agents a decidable API-existence check instead
  of "skill → Javadoc → guess". `status: active` (verified-by-construction
  against the tag; not a visual render).
- **Vendored generator.** `tools/api-surface/api-index.py` (copied verbatim
  from the GraphCompose repo's `.llm-wiki/tools/api-index/`) regenerates the
  allow-list per release; `tools/api-surface/README.md` documents the
  tag-checkout + generate flow. The generated body is never hand-edited.
- **New `skills/versions/graphcompose-1.9/` pack.** A port of the 1.7 pack
  (1.7.0 → 1.9.0 is additive, zero breaking changes); the frozen
  `graphcompose-1.7/` and `graphcompose-1.6/` snapshots are retained for
  pinned-back projects. All 14 conceptual skills re-stamped
  `verifiedAgainst: 1.9.0` (`status: needs-validation`); version-pinned
  Javadoc lookups now point at 1.9.0 while the historical "New in 1.7.0"
  notes are preserved as accurate version history.
- **New `graphcompose-engine-guides` (how-to-use-the-engine) skill.**
  `tools/api-surface/sync-engine-guides.mjs` vendors the 13 verified,
  render-proven developer guides from the GraphCompose LLM wiki
  (`.llm-wiki/12-docs-extraction/`) into
  `skills/versions/graphcompose-1.9/guides/`, each stamped with a provenance
  header. Where the allow-list says WHAT exists, the guides show HOW to wire
  the primitives. A flow-owned index (`guides/00-index.md`) is the manifest
  entry (`status: needs-validation` until the snippets are re-smoked against
  1.9.0 in this flow). Curated layer, so this is a re-sync, not a `--src`
  regeneration.
- **Lookup priority flipped to skill → allow-list → engine guides → Javadoc.**
  `graphcompose-basics.md` and `skills/README.md` now make the allow-list
  the authoritative existence check ("not listed = does not exist") and the
  engine guides the how-to layer, ahead of the Javadoc.
- **Prompts cite the allow-list as the closed set.**
  `template-coder-agent.md` requires confirming every GraphCompose call
  against the allow-list before writing it; `skill-validator-agent.md`
  gains a pre-compile API-existence gate that diffs generated GraphCompose
  calls against the allow-list BEFORE compile and halts on an invented
  symbol — closing the "compile/render gate but no pre-compile
  API-existence gate" gap.
- **1.9 is the new default target.** `skill-manifest.json` →
  `skillsVersion 0.4.0`, `defaultGraphComposeVersion 1.9.x`,
  `supportedGraphComposeVersions [1.6.x, 1.7.x, 1.9.x]`; the
  `graphcompose-flow init` scaffold default, the five skill-fixture poms,
  the render gate's fallback coordinate (`deriveTargetCoordinate`), the
  CI `skill-fixtures` job, and the `validate-skills` stub all move to
  1.9.0. Existing committed example projects stay pinned at
  `targetGraphComposeVersion: 1.7.0` (their renders carry 1.7.0 parity).
  Verified: `io.github.demchaav:graph-compose:1.9.0` resolves from Maven
  Central and the skill fixtures compile/render against it.

### GraphCompose 1.7.0
- **Dependency bumped 1.6.7 → 1.7.0.** All render-runner, skill-fixture,
  and preview-renderer poms now resolve
  `io.github.demchaav:graph-compose:1.7.0` from Maven Central; every live
  example `template-project.json` (`targetGraphComposeVersion`) and the
  `graphcompose-flow init` scaffold default move with them. 1.7.0 is
  additive over 1.6.x (zero breaking changes), so existing generated
  templates compile and render unchanged.
- **New `skills/versions/graphcompose-1.7/` pack.** A port of the 1.6
  pack (the frozen `graphcompose-1.6/` snapshot is retained for projects
  pinned back) with the v1.7.0 additive primitives folded into the topic
  skills: inline shape runs (rating dots / bullets / arrows / checkboxes
  drawn from geometry, no font glyph), polygon `ShapeOutline` geometry,
  composite inline figures + swappable tick/arrow styles, per-corner
  `roundedRect(...)`, vertical text alignment
  (`verticalAlign(TextVerticalAlign)`), semantic timelines
  (`addTimeline(...)`), dashed/dotted lines (`LineBuilder.dashed(...)`),
  `headingBar(...)`, `softPanel(..., stroke)`, `FontName.JETBRAINS_MONO`,
  `DocumentSession.availableHeight()`, and the nested-stack
  `position(...)` offset fix. The `spacing-and-alignment` "no per-line
  vertical centring" note was corrected for the new `verticalAlign`.
- **Manifest repointed to 1.7.x.** `skill-manifest.json` →
  `skillsVersion 0.3.0`, `defaultGraphComposeVersion 1.7.x`,
  `supportedGraphComposeVersions [1.6.x, 1.7.x]`, all 14 entries
  `verifiedAgainst 1.7.0` (`status: needs-validation` until the render +
  visual-diff loop runs on 1.7.0).
- **Prompts + docs refreshed.** The Architecture Mapper gains mapping
  rows for the 1.7.0 primitives; the Template Coder lists them as Stable,
  surface-agnostic idioms; `AGENTS.md`, the quickstart / overview /
  roadmap / limitations / implementation-status / skill-validation /
  integration docs, README, and CONTRIBUTING move their "current target"
  to 1.7.0 (the pre-1.6.7 JitPack boundary is left intact as history).

### Live preview
- **`live/` mirror.** Every render now also writes a single stable copy of the
  latest output to `live/current.pdf` (plus `current-debug.pdf`, `current.png`,
  `current.txt`) at the repo root, regardless of which project/revision produced
  it. Open `live/current.pdf` once in SumatraPDF (auto-reloads on change, no
  file lock) and watch every render refresh in place — no digging for the latest
  revision folder. Override the location with `GRAPHCOMPOSE_LIVE_DIR`; disable
  with `RENDER_NO_LIVE=1`. The folder is gitignored.
- **`scripts/preview-live.mjs`** (`npm run preview` / `npm run preview:debug`)
  opens the live file in SumatraPDF with `-reuse-instance`, resolving it via
  `SUMATRAPDF_PATH`, `PATH`, or the standard install locations, and falling back
  to the OS default viewer.

### Developer workflow
- `CONTRIBUTING.md` documents the branch-per-change + release-from-`main`
  workflow that keeps `main` always renderable; `AGENTS.md` carries the
  agent-facing summary ("Working on the flow itself").

## v0.1.0 — 2026-06-03

First tagged release. The kit already turned visual references into
maintainable GraphCompose Java templates; this release makes it easy to pick
up — one-command setup, a dev container, a seedable example, and agent
rule-packs — and refreshes the docs and dependencies.

### Onboarding & tooling
- **One-command setup.** `npm run setup` (or `./setup.ps1` / `./setup.sh`)
  checks the toolchain (Node 20+, npm, Java 21+, Maven), installs and builds
  the local Node tools, and packages the Java preview renderer.
  `npm run setup:check` verifies the toolchain only.
- **Seedable example.** `graphcompose-flow init <name> --template invoice`
  scaffolds a ready-to-render project under `examples/<name>/` (reference,
  render-runner, a DRAFT `revision-001`, and a `render` block); render it
  immediately with `node scripts/render.mjs <name> revision-001`.
- **Dev container.** `.devcontainer/` provisions Java 21 (Temurin) + Maven,
  Node 20, and ImageMagick for GitHub Codespaces / VS Code; `postCreate` runs
  `npm run setup`. Validated with a real container build.
- **Agent rule-packs.** Thin pointers to `AGENTS.md` for Claude Code
  (`CLAUDE.md`), Cursor (`.cursor/rules/`), Windsurf (`.windsurf/rules/`), and
  GitHub Copilot (`.github/copilot-instructions.md`).
- **Pipeline helper.** `scripts/run-pipeline.mjs` prints the ordered agent
  chain for a revision's scope and runs the mechanical render with `--render`.

### Documentation
- README embeds a clickable YouTube walkthrough (plays from GitHub) instead of
  an inline `.mp4`.
- `docs/quickstart.md` leads with the setup script + a Codespaces note; manual
  steps moved into a `<details>` block.
- `CONTRIBUTING.md` current-state refreshed: the preview renderer executes
  templates and writes `output.pdf` / `output.png`, and GraphCompose 1.6.7 is
  resolved via Maven Central.

### Dependencies & hygiene
- `vitest` bumped `1.6 → 4.1.8` in `revision-manager` and `visual-diff`,
  clearing all `npm audit` advisories (incl. one critical); tests stay green
  (31 + 39).
- Root-level junk cleanup; `.gitignore` guards for shell-accident filenames and
  the dev-container lockfile; the tooling install path is build-only.

### Skills
- `backgrounds-and-panels` expanded with the real page/section background API
  (`DocumentSession.pageBackground` / `pageBackgrounds`, `section.fillColor`)
  and a "Container fill vs page background" distinction.

### Versioning
- The on-disk artifact contract is now stamped: `template-project.json` and
  `revision.json` carry `schemaVersion: 1` on every write (older files without
  the field are treated as v1, so existing examples stay valid). The CLI tools
  stay repo-internal and versioned lock-step with the repo — not published to
  npm yet.

### Deferred (intentionally not in this release)
- `init --template cv` — a data-driven, multi-page CV seed; the invoice
  template ships now and cv follows in a later release.
- Publishing the CLI tools to npm — they stay repo-internal until there is a
  reason to publish.

### Compatibility matrix
| Component | Version |
|---|---|
| `graphcompose-ai-flow` (repo) | v0.1.0 |
| skill pack (`skillsVersion`) | 0.2.0 (`needs-validation`) |
| tools (revision-manager / visual-diff / asset-resolver / skill-validation-cache) | 0.1.0 (lock-step) |
| artifact contract | v1 — `schemaVersion: 1` stamped on new writes (absent = v1) |
| GraphCompose | supports 1.6.x, verified against 1.6.7 (Maven Central) |
| Toolchain | Java 21, Node 20, Maven |
