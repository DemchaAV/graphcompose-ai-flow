# Changelog

All notable changes to **GraphCompose AI Template Flow** are recorded here.
The project follows [Semantic Versioning](https://semver.org/) and stays in
`0.x` while the workflow stabilizes — skills are still `needs-validation`, and
the full visual-baseline pass is the gate to `1.0.0`.

## v0.15.0 — 2026-08-27

**A version string is not a build.** A `create` run pinned `2.2.1-SNAPSHOT`,
compiled and measured the engine against whatever jar carried that name, found
the LayerStack row escape laying its children out vertically, and recorded that
as a regression in the released line — then rewrote the whole page architecture
around the workaround. The jar was a local `mvn install`, sitting in the same
repository as released `2.2.1` and `2.2.2`, and 14% larger than the later of the
two; the only tree on that machine pinning the name had 23 uncommitted files and
a HEAD two commits after `v2.2.0`, and six other worktrees could have produced
it. The observation is unattributable — not wrong, unattributable, which is
worse, because it reads as a fact about a release. Nothing in the chain
misbehaved except the assumption that a version string identifies code.

Preflight also carried the disagreement in plain sight: the workspace manifest
said `2.2.0` while the project said `2.2.1-SNAPSHOT`, for the whole 95-minute
run. Both were readable throughout. Nothing put them in a row.

### Fixed in review

Four findings from a review of this release's own branch.

- **`preflight` no longer stops where the stop cannot be answered.** Exit 6 asks
  for `--accept-build`, which records the decision in the workspace — and
  preflight is the command a run makes *before* `init-workspace`, so on a
  SNAPSHOT-pinned project the first documented step exited 6 and printed a
  remedy that refused to run. The finding is still reported; the stop now waits
  until there is a workspace to record the answer in.
- **`source.mjs diff --file` without `--project`** came back as an unhandled
  `WorkspaceError` stack trace: `diff` has to find the parent revision, which is
  looked up in the project, so `--file` cannot stand in for it. It is now a
  usage error that says so.
- **`resolved-version.schema.json` was never bound** in
  `.github/scripts/validate-schemas.mjs` — eleven schemas, ten bindings — so the
  contract `schemas/README.md` describes as enforced in CI validated nothing.
  Bound, and `contracts.test.mjs` now fails when any schema has no binding.
- **`scaffold-runner`'s version refusal honours `--force`** and names the exact
  edit. An older project in an upgraded workspace is not wrong, it is older, and
  the refusal existed to stop compiling against one version while reporting
  another — not to make that project unbuildable.

### Public API

- **`scripts/lib/version-resolver.mjs`** — new `describeArtifact()`: which jar
  in the local repository a pin resolves to, its size and mtime, whether it came
  from a download or a local `mvn install`, and — for a `-SNAPSHOT` — the
  releases already installed past it. `identifiesOneBuild` is the fact a caller
  branches on. New `compareVersions()` (a SNAPSHOT precedes the release it leads
  up to) and `localRepositoryRoot()` (`MAVEN_REPO_LOCAL` / `M2_REPO`, else
  `~/.m2/repository`). `resolveVersion()` now carries `artifact`, so one call
  answers both which pack applies and whether the build behind it is one thing.
- **`scripts/preflight.mjs`** — `graphCompose.artifact` publishes the above, and
  new `graphCompose.pins` lists every place a version is recorded — host build
  file, workspace manifest, project — with `agree` and, when they do not, which
  said what. `--text` prints both as `Build:` and `Version disagreement:` lines,
  before the routing, because a pin that names no single build makes every
  number measured after it unattributable. **New exit code 6**: the pin is a
  SNAPSHOT and nobody has said which build that is. It also now *writes*
  `resolved-version.json` — the record the rest of the run is meant to read
  instead of resolving the version again for itself.
- **`resolved-version.json`** — new artifact at the workspace root, with
  [`schemas/resolved-version.schema.json`](schemas/resolved-version.schema.json).
  Version, line, pack, which build file it came from, the resolved build, the
  pins as of the last preflight, and `accepted`.
- **`scripts/resolve-version.mjs`** — new `--accept-build --decision "<text>"`,
  the `page-size --use --decision` idiom applied to a build: a question put to
  the user once and recorded where later steps read it. The acceptance **binds
  to that jar** by sha1; rebuilding the snapshot reopens the question, which is
  the only honest behaviour for a mutable build.
- **`scripts/scaffold-runner.mjs`** — refuses when the project's
  `targetGraphComposeVersion` disagrees with the workspace's resolved version.
  This is where a version stops being a string and becomes the code that gets
  compiled, so it is the last place the disagreement is cheap.

### Knowledge

- **`graphcompose-2.2/pagination.md`** — the pack said "do not declare entire
  sections atomic" and never showed what to do instead. It does now: atomicity
  has a granularity, and the section is the wrong one. A CV's experience section
  is a list and may flow; the entry is the unit whose meaning depends on
  cohesion; inside an entry, `keepWithNext()` on the role line and the employer
  keeps the opening from being orphaned while the remaining bullets stay free to
  continue. With the table of what carries which rule, and why `keepTogether` on
  a block taller than the printable area is not a stronger request but an
  unanswerable one.
- **Heading grouping** — `keepWithNext` needs a node to attach to, which is why
  a flat `Heading` + `Rule` + `Body` cannot express "this header belongs to this
  body": the intent ends up spread across two calls a later edit can separate.
  Nesting a `ProfileHeader` gives one node to carry the rule and one box in the
  snapshot for the thing the designer drew.
- **The call goes inside the consumer.** `addSection` returns the builder you
  called it *on* — `T addSection(String, Consumer<SectionBuilder>)` — so
  `entry.addSection("RoleLine", …).keepWithNext()` reads as keeping the role
  line with what follows and in fact sets the flag on `entry`. The first draft
  of this guidance had exactly that bug; the allow-list caught it before it
  shipped, which is what the allow-list is for.
- **Said plainly: nothing checks this.** `LayoutNodeSnapshot` records where a
  node ended up and not whether it asked to be kept together, so no gate here
  can tell section-level atomicity from entry-level. The difference shows only
  when real content overflows, which a one-page reference never does. Until the
  snapshot carries those flags it is a rule you follow, not one you are caught
  breaking.

### Converging

- **New verdict `CONVERGENCE_LIMIT_REACHED`, and `BLOCKED` means one thing
  again.** The same-cause bound and the iteration ceiling used to report
  BLOCKED — "the loop cannot make progress" — for a loop that had a rendering,
  gate-passing document and had simply spent its budget. A run reached a
  finished-looking CV that way, and BLOCKED then refused the approval the user
  had already given, sending it around the revision manager's own door: the one
  path that writes no `verdictAtApproval`. The record afterwards read as though
  the review had been clean. BLOCKED now means only "no usable document can be
  produced" — a build failure, a render failure, a missing asset. New exit code
  **4** from `iterate-status` and `render-and-diff`.
- **`approve-and-publish` lets `CONVERGENCE_LIMIT_REACHED` through**, recording
  it as `verdictAtApproval`. That state is precisely the one a person is meant
  to decide about, and the point of the fast path is that the decision is
  written down. BLOCKED still stops it before anything changes.
- **Not added: `READY_WITH_RESIDUAL_DIFF`.** The severities already encode it —
  a READY review whose remaining mismatches are `ACCEPTED_LIMITATION` or
  `INTENTIONAL_DIFFERENCE` *is* "ready with a residual difference", and
  `review-claims` already blocks READY on anything CRITICAL or MAJOR. A verdict
  would put the same fact in two places, and the two would eventually disagree.

- **`iterate-status` now reports what has already been tried.** `attempts[]`
  lists every pass spent on the cause currently in front, with the lever its
  review recorded and the page difference it produced. Counting attempts stops a
  loop circling forever, which the same-cause bound already did; it does not
  stop a loop *repeating*. A run spent three revisions on one wrapped label —
  moving a shared constant to 8.5, then 8.65, then reasoning its way back toward
  8.5, a value it had already rendered and measured. Nothing on disk said so,
  because the attempts were one per revision and nobody had put them in a row.
  The same-cause bound's own reason now names them, so the report a user gets
  when the loop stops cannot propose a value the loop already spent a pass on.
- **`diminishingReturns`** — whether those passes are still buying anything: two
  consecutive attempts that each move the page difference by less than
  `limits.materialMovePercent` (new, 0.25) are reported as stalled. A pass with
  no measurement is not counted as a move of zero — that would report a loop as
  stalled on the strength of a comparison that never ran. **Evidence, not a
  verdict**: it does not end the loop, because a threshold nobody measured
  should not be the thing that ends one.

### Reading the template

- **`scripts/source.mjs diff`** — what a revision replaced, method by method,
  against its parent: changed, added, removed, and the share of the union
  touched. `render-and-diff` runs it every pass and puts the share on its
  `source change` line.
- **Why.** Two failures share one missing fact. A pass hit a write conflict,
  deleted the template and regenerated 1,103 lines — and on disk that looks
  exactly like a one-line correction: same revision, same parent, one file
  written; everything the Javadoc recorded about *why* a constant had its value
  went with it. Separately, a revision replaced the page's whole construction —
  nested rows and a timeline for tables and an accent border — and was recorded
  as another visual change. An edit and a rewrite are different kinds of change
  and nothing said which had happened. The share needs no judgement about
  intent, and it is the same number whoever asks.
- Measured against this repository's own history: `charcoal-gold-cv`
  revision-009 touched **6%** of its methods, and `cv-reference` revision-006
  touched **82%** — a revision whose own request begins "make the template
  data-driven: every visible string moves out of Java". Evidence, never a gate:
  a rewrite is often the right thing to do, and the point is that the chain
  shows where it happened.

### Reading the template

- **`scripts/source.mjs`** — new. `outline` lists every method with its line
  range and size; `symbol <name>` cuts one out with its Javadoc; `constants`
  lists the named values a correction actually edits. On the largest template in
  `examples/`: outline 1.2 KB and one method 3.8 KB, against a 51.9 KB file.
- **Why, measured rather than assumed.** Attributing every byte of one create
  run's tool output to the command that produced it: `sed` **30.3k tokens across
  17 calls**, `cat` **17.7k across 18**, `grep` 6.5k across 16 — together more
  than half of everything the model read back, and more than twice what all nine
  of the harness's deterministic tools returned across ninety calls
  (`reference` 4.6k, `render-and-diff` 4.1k, `layout` 3.5k, `magick` 3.3k,
  `typography` 3.1k). The expensive reading was never the diffing or the
  measuring. It was slicing a 1,233-line Java file to find one method, because
  the only way to ask for one was to guess its line range.
- **`scripts/lib/java-outline.mjs`** — new. Not a Java parser: it finds
  declarations by brace balance from a signature line, which is what cutting one
  method out of a file this harness generated needs. Braces inside strings and
  line comments are not structure; a record's component list is not a method; an
  unclosed declaration comes back `balanced: false` rather than as a cut that
  reads complete and is not.

### Measuring the reference

- **`scripts/reference.mjs analyze`** — new. Page size and margins, palette by
  coverage, every rule, the columns with their gutters and their share of the
  page, and the text bands **per column**, in one call and about 5 KB. The five
  commands beside it each answer a question the model has already framed; this
  answers the ones it always has before it can frame anything, which is why they
  collapse into one call — no window, no judgement. A run reached authoring
  after about ninety measuring calls and the first dozen were invariably these.
- Bands are cut **per column**, using the columns measured in the same pass.
  Scanning a whole page merges both columns into one run per line, and on a CV
  with a full-bleed sidebar into exactly one band covering the page: true, and
  no answer. A column inked edge to edge comes back `separable: false` with the
  reason — it is a filled panel whose type is lighter than its ground, so
  darkness cannot separate its lines — rather than as one band pretending to be
  a paragraph.
- **`scripts/lib/reference-metrics.mjs`** — new `inkColumns()`, the mirror of
  `inkBands` along the other axis. `gap` is the narrowest blank run that counts
  as a gutter, so word spacing is not a column boundary.

### The loop

- **`scripts/render-and-diff.mjs`** — new `evidence` step. Every pass now
  classifies the three regions carrying the most *concentrated* difference and
  writes `evidence.json` into the revision; the causes are on the step's line in
  the pass output. `evidence.mjs` shipped in v0.14.0 to answer exactly this
  question and the create run afterwards invoked it **zero times** — 43 raw
  ImageMagick calls, 26 hand-written patch scripts and 21 typography
  measurements did the work instead, arriving at "the box is in the right place,
  so this is the typeface" by hand, over an hour. The tool was not missing and
  the skill named it. Nothing produced its output, so nothing read it. It is
  evidence and never a gate: a classification that cannot be built is a missing
  view of a comparison that already succeeded.
- **`scripts/evidence.mjs`** — new `--worst <n>`, which ranks by the measured
  region difference and needs no review to exist yet; that ordering was the
  reason a loop pass could not ask. Ranking comes from `region-diff`'s own
  concentration order, because raw pixels put the page-background region first
  every time. New `--out <file>`.
- **`create-template/SKILL.md`** — the cause is now a restriction on the fix,
  in a table: `PAGINATION` blocks everything else, `GEOMETRY` allows a property
  on the named owner, `TYPOGRAPHY`/`PAINT`/`ASSET` allow the face, the colour or
  the file and **not** compensating margins, `UNKNOWN` allows nothing until one
  measurement separates the candidates.

### Probes

- **`scripts/probe.mjs`** — new `--build <x.y.z>`, `--pinned` and `--root`. A
  probe is written against a *line* and run against a *build*, and until now
  those were the same thing: the diagnostics pom pinned a release and every
  probe measured that release, whatever the project under test was compiled
  from. So a run pinned to `2.2.1-SNAPSHOT` asked "does the engine still do
  this?" and was answered about `2.2.1`. The default build is now the one the
  workspace resolved; the override reaches `mvn compile`, `dependency:build-classpath`
  and the probe's own reported version, the classpath is cached per build, and a
  changed build forces a rebuild rather than reusing classes resolved against
  different jars.
- **`scripts/lib/probe-build.mjs`** — new. `selectBuild()`, kept out of the CLI
  so the decision is testable without Maven, a JDK and a resolved artifact. A
  build from another line is dropped with a warning rather than answered about.
- **`scripts/observations.mjs verify --build <x.y.z>`** — forwards to the probe,
  so "re-measure this record against 2.2.2" is one command.
- **`timeline-anatomy`** — new probe, and with it
  `timeline-cannot-place-marker-or-date` is finally in the repository. That
  record was written from a `javap` read of the core jar: correct, and not a
  measurement — nothing could re-run it, so it could never be re-confirmed or
  retired, and importing it would have made `verify` report "no probe, so
  nothing can re-confirm it" forever. It sat orphaned in the 0.12.0 plugin cache
  for that reason. The probe replaces the disassembly with four two-entry
  timelines differing in one setting each: a setting that moves the one
  paragraph a caller can name is honoured, one that does not is discarded. All
  six recorded claims reproduce on 2.2.2 — a negative gutter is discarded while
  a positive one applies, there is no slot beside the rail for a date, title and
  meta take Strings only, `add(...)` content does not follow the marker column,
  and consecutive entry boxes touch so the rails meet as one line.
- **Measured with it, and it settles a disputed claim.** `column-nesting` on
  released **2.2.2**: the LayerStack row escape holds, children side by side.
  The same probe on the local **2.2.1-SNAPSHOT**: `layeredRowHorizontal` false,
  `layeredRowTwiceHorizontal` false. Both verdicts are now in
  `layered-row-survives-a-row-cell`, each carrying the sha1, size, mtime and
  origin of the jar it ran on. The behaviour is not a regression in the released
  line — 2.2.2 is newer than 2.2.1 and holds. It is one local build, and until
  this change nothing could have asked the question.
- **`schemas/observation.schema.json`** — `verifiedAgainst[].build`: sha1, size,
  mtime and origin of the jar a verdict was measured on. No path: that would be
  one developer's disk. For a release it is decoration; for a SNAPSHOT it is the
  difference between a measurement and a rumour.
- **`observations show`** — a record measured as `changed` on a **release** now
  gates every build not explicitly measured as holding: a behaviour that differs
  between two builds of one line is a property of the build, not of the line. A
  change measured on a **SNAPSHOT** deliberately gates only that exact build,
  because the same name is different code on another machine. The two tests that
  hunted for "a record with a changed verdict" were vacuous until this release —
  nothing had ever written one — and one of them encoded an assumption that the
  record would also be retired; it now says which of the two cases it means.

### Observations

- **`scripts/lib/observation-store.mjs`** — new. Two tiers:
  `<workspace>/observations/` for what runs here learned, `<install>/observations/`
  for what the pack shipped. Reads merge both, workspace first, and a shadowed
  shipped record is named rather than silently replaced. Writes only ever go to
  the workspace, and the install tree is refused **by path**, because convention
  is what failed: a run wrote a well-formed observation into
  `~/.claude/plugins/cache/.../0.14.0/observations/`, which is where the reader
  looks, so nothing appeared wrong. `timeline-cannot-place-marker-or-date`,
  recorded during an 0.12.0 run, still exists only in the 0.12.0 cache.
- **`scripts/observations.mjs`** — new `record <file.json>` command: the first
  supported way to write one. Validates the record's required fields and its
  kebab-case id, refuses a duplicate id without `--force` (the second file is
  how two records start disagreeing), and says so when confidence is not
  `confirmed`. `list` now reports each record's origin as `learned here` or
  `shipped`. New `--root` and `--force`.
- **`observations.mjs verify --record`** — files the verdict in the record's own
  `verifiedAgainst[]`. That field shipped in v0.14.0 and **nothing ever wrote
  it**: `show` gated on a list that was empty on every record, so the gate could
  only ever say "nobody has measured this here". Verifying a shipped record
  copies it into the workspace with the verdict attached rather than editing the
  pack, which upgrade replaces. The entry names the build the probe actually ran
  on — the exact pin, SNAPSHOT suffix included.

## v0.14.0 — 2026-08-27

**The diagnostics existed and `create` never mentioned them.** A forensic audit
of one `graphcompose-flow:create` run established where its 77.6 minutes went,
and the answer was not what anyone had guessed. Tool execution across the whole
seven-hour session was **14 minutes 46 seconds**; the model was 85.8% of the
wall clock. The single largest line item was **76 ad-hoc pixel-measurement
scripts costing 27.2 minutes of model time — 35% of the run** — to produce 4.7
minutes of computation, while the rendering that felt expensive cost 0.6
minutes. Retrieval was not the problem: knowledge reads totalled ~64 KB across
seven hours, and the `/context` warning about 1.4M "Read tokens" was an
estimate of image payloads that actually cost 20–25k.

The cause was routing, not tooling. `create-template/SKILL.md` named zero
diagnostics and zero of the six `check-*.mjs` that ship with it.

### Public API

- **`scripts/reference.mjs`** — new. `measure`, `rules`, `bands`, `colors`,
  `compare`, each with `--json`. `--window` is `name,x0,x1,y0,y1` and is
  **repeatable**: one window per call would reproduce the 76-script failure with
  better syntax. `compare` returns both sides in **reference pixels** whatever
  the render's raster is, plus the scale, the aspect drift, and an explicit
  `bandCountMatches`. `rules` reports both sides in one coordinate space.
- **`scripts/lib/reference-metrics.mjs`** — new. `pageMetrics`, `inkBounds`,
  `inkBands`, `samplePalette`, `comparableBands`. Takes decoded PNGs and returns
  plain data, matching `border-topology.mjs`'s contract.
- **`scripts/lib/border-topology.mjs`** — `isDark` is now exported. It defines
  what ink is, and two definitions drift.
- **`scripts/preflight.mjs`** — new `capabilities` block: per-file presence for
  the five diagnostics and all six `check-*.mjs`, skill-pack parity, and a
  three-state `layoutSnapshot`. **New exit code 5** when the installed skills are
  newer than the tools — the audited run hit that split and inferred it seven
  hours later from behaviour.
- **`scripts/observations.mjs`** — `show` now exits **5** on a record that cannot
  be trusted here (retired, or from another GraphCompose line), naming the probe
  that would settle it. A same-line version difference does not gate. `equal()`
  can now compare objects; it fell through to `===` and reported two identical
  grouped measurements as a change.
- **`scripts/render-and-diff.mjs`** — a failed step now prints its whole
  explanation rather than the first three lines of it, and the excerpt prefers
  error-shaped lines over the plain tail. A run was shown two `[asset-resolver]`
  progress lines where the compiler's complaint should have been, three times,
  and re-invoked `render.mjs` by hand each time to find out why. (It exits 1 on
  failure and always did — the audit's `EXIT=0` was `$?` read after a pipe.)
- **`probe.mjs line-spacing`** — new. `anchor-alignment` now answers both axes.
  Probe output is written through an explicit UTF-8 stream; it went through
  `System.out` and any non-ASCII character in a finding reached the caller
  corrupted.

- **`schemas/observation.schema.json`** — new `verifiedAgainst[]`: every build a
  record has actually been measured against, with a `held`/`changed` verdict.
  `graphComposeVersion` says where a behaviour was *first* seen and `sourceRun`
  says who paid for it; neither answers "is it true on the build in front of me".
  `observations show` treats an exact-build match as a measurement rather than a
  claim, and matches **exactly** — a snapshot never inherits its release's
  result, which is the distinction that cost the audited run an authoring pass.

### Documentation

- **`create-template/SKILL.md`** gains `## After the first render — diagnose
  before you measure`, routing four ways: capabilities, `layout.mjs` when the
  snapshot is there, `reference.mjs compare` when it is not, `typography.mjs`
  for a font. The run's only user-visible regression is stated as a rule — *a
  delta does not say which element owns it, and `explain` does*.
- **`## Reporting back`** now opens the live preview after the first successful
  render instead of printing its path at the end. Once per project, not per
  render.
- **`revise-template/SKILL.md`** is pointed at the same routing rather than
  given a copy.
- **`## The stages`** states the turn-cost arithmetic — 226 turns against a
  320k prompt is 72M tokens of re-reading, next to 550k of content — and the
  boundary: batch what is independent, never batch a decision point.
- **`authoring-rules.md`** gains guidance on applying small changes in small
  ways. One run wrote five throwaway Python patchers, nearly 30 KB, to change a
  handful of lines in its own generated Java; the composing is the cost.

### Knowledge

- **A retirement is withdrawn.** `row-cannot-nest-in-row-cell` was retired on
  the strength of `horizontalInLayerStack` flipping between 2.2.0 and 2.2.1.
  That is a real change describing a different placement; `builtInRowCell`, the
  field this record is about, was false then and is false now. Confirmed at
  2.2.1 with fresh probe output.
- **Two new observations**, both probe-backed:
  `shape-container-clamps-over-wide-child` (an over-wide child is left-clamped,
  landing half its overflow to the right) and
  `line-spacing-is-additive-between-lines` (1.0 pt per gap per unit at both type
  sizes; a single-line paragraph has no gap and ignores it).

### Tests

- **761 → 804**, measured against a baseline captured before the first change.
  New: `reference.test.mjs` (13), `reference-metrics.test.mjs` (12), plus 8 in
  `preflight.test.mjs` and 8 in `observations.test.mjs`.
- `reference-metrics` synthesises its rasters rather than committing fixtures,
  so every expected value is known by construction.

### Not yet proven

**No full `create` run has been made with any of this in place.** What is
verified is that each tool answers the question it was built for, end to end on
a rendered example: capability in one call, coordinate ownership from the
engine's own additive chain, a four-window reference/render comparison in one
call, and rule topology on both sides in one coordinate space. Whether that
makes a real create run cheaper is the claim `docs/benchmarks.md` exists to
test, and it cannot be tested until a project is authored this way. The 27.2
minutes is a measurement of the old loop, not a promise about the new one.

## v0.13.0 — 2026-08-27

**The diagnostics are not proven to have helped, and `docs/benchmarks.md` now
says so with the numbers.** The pre-diagnostics baseline was written so this
could be honest; here is the honest version.

- **The corpus has not moved.** `run-metrics baseline` re-run after the tools
  landed returns the same figures project by project — 53 revisions, 52 renders,
  5 structural smells, 2 negative insets. No project has been authored with the
  diagnostics in place, so there is nothing to compare against.
- **All three headline metrics are still null**, and one of them changed
  character without changing value: `collateralNodesPerRevision` is no longer
  un-computable, it is uncomputed, because no project has two consecutive
  revisions that both carry a snapshot. `collateralComparablePairs: 0` sits
  beside it so nobody mistakes an average over nothing for an average over
  something.
- **Capability is measurable and is recorded separately**, because "the tools
  answer the question they were built for" and "the loop got better" are
  different claims: 749 of 988 coordinate queries on a real CV resolve to an
  exact additive chain; an evidence package is 78× smaller than the snapshot;
  `doctor` finds 7 things on 248 nodes and nothing on a clean document; the font
  matcher ranks the right family first 6 times out of 6.
- **The uncomfortable number is stated rather than buried.** On the reference
  CV's seven reviewed mismatches the cause classifier returns `UNKNOWN` seven
  times. Six of those correctly rule out geometry, which is most of a decision —
  but it rules almost nothing in, and the cause that would convert several of
  them, `TYPOGRAPHY`, has never fired outside a fixture because **zero renders in
  the corpus carry typography**.

**Writing that section found a real defect and fixed it.** The classifier's one
positive verdict on live data was wrong: `masthead` came back `GEOMETRY` off an
11.5pt displacement that was an artifact of comparing two boxes that were never
the same box — the analyst's region is 45% wider than the node it named. A
displacement is now only readable when the owner and the region agree on size
(`SHAPE_AGREEMENT_TOLERANCE`), and the case is pinned by a test.

The gate is deliberately on **size**, not on overlap: a node genuinely displaced
by 40pt overlaps its region no better than one that is simply the wrong shape, so
an overlap floor would have suppressed the true positives along with the false
one. A second test pins that too.

**`layout doctor` reads the resolved tree for the maintainability defects a
render cannot show.** Five paragraphs that each carry a trailing gap look
identical on the page to one parent with `spacing(...)` — the pixel diff between
them is zero — but the first is five numbers a later revision has to find and
move together, and the sixth paragraph somebody adds will not have the gap.

- `node scripts/layout.mjs doctor` reports geometry stated on children that one
  value on the parent would state once, and clusters of negative insets. Each
  finding names the parent, the children, the value and what to put it on
  instead. Evidence, exit 0 either way — the same contract
  `check-structural-smells.mjs` has.
- **It is not a second front-end on the source check, and cannot be.** That
  check's central discriminator is literal-versus-named-constant, and in a
  snapshot both are just a number. So the two overlap and neither contains the
  other: the source sees what one method wrote, the snapshot sees siblings
  spread across several methods and geometry that arrived from a theme or a
  preset. The wording never claims you typed a value twice — only that it is
  stated N times.
- **Calibrated against a real 248-node CV before the thresholds were written,**
  then read finding by finding as the plan requires. That manual pass produced
  the two corrections that made the output worth reading:
  - `spacing(...)` is suggested only when the sharers are effectively all the
    children. It applies to *every* gap in the parent, so recommending it for
    four of six alternating item/rule children would have told an author to make
    a change that moves the page. Those get "one named constant" instead.
  - One component instantiated six times is one finding. Six of the thirteen raw
    groups were the same shape repeated across `AchievementText_0/1/2` and
    `CertificationText_0/1/2`; a reader scrolling past five restatements of a
    finding they have already read has been handed noise.

  Thirteen raw groups became seven, and a manual read of all seven finds no
  false positive. A third candidate rule — three or more distinct inset values
  among a parent's children — was measured, found to fire on a two-column row
  whose columns simply have different paddings, and **dropped**.
- `node scripts/layout.mjs impact <node>` reports what a property change there
  reaches: its children, deeper descendants, and the siblings stacked after it,
  each separately because the reason and the fix differ. Structural reach only —
  it refuses to predict the resulting page, which would be inventing the
  geometry this whole track exists to measure.

**A wrong font is now a fact, not a suspicion.** GraphCompose 2.2.2 reports what
each run of text actually became — the font the style *declared* beside the font
the document was *set in* — and the harness reads it.

- `schemas/layout-snapshot.schema.json` accepts the engine's new `typography`
  list (additive and optional: every render before 2.2.2 has none, which is an
  ordinary state, not a defect).
- `layout inspect <node>` prints the font, size and line count, and flags
  `declaredFont → resolvedFont ⚠ substituted` when they differ.
- **`evidence.mjs` assigns the `TYPOGRAPHY` cause** for a substitution, and
  checks it **before** geometry. A substituted font changes every glyph width in
  the run, so the box is the wrong size *because* the type is — calling it
  `GEOMETRY` would send the next pass to move a block whose position is only a
  symptom. The verdict arrives with a prohibition: do not adjust geometry; name
  the family and set the weight through the style's decoration.
- The trap this catches is real and quiet. A standard-14 **face** such as
  `Helvetica-Bold` is an alias of its family, and the face is chosen from the
  decoration — so a style that names the bold face and sets none renders
  *regular*. It lays out, it draws, it fails nothing, and no pixel comparison
  will ever report it.
- **"No font problem" and "nothing looked" are kept apart.** A render older than
  2.2.2 reports `typography.reported: false` with the reason, rather than an
  empty result that reads as a clean bill of health. The `charcoal-gold-cv` and
  `layout-diff-pair` fixtures stay on format 2.0 so a test proves the difference.
- A wrong *size* or a wrong colour is still `UNKNOWN`. Separating those needs a
  comparison against the reference's own type — that is `typography.mjs`, and it
  needs a crop a human chose.

**"Which font is that?" is now measured instead of guessed at.** It used to
cost revisions: try PT Serif, be wrong, try again; then "the size looks a little
small, try 10.5", and again. Each one is a render and a comparison out of a
budget of eight.

- **`node scripts/typography.mjs match`** sets every candidate family in **one**
  document — one paragraph each — renders it once, and slices the sheet back
  apart using the layout snapshot that same render produced. Twenty candidates
  cost one JVM start, not twenty. Ranking uses two independent signals: how wide
  the string runs, and the letterforms with width normalised away. They are
  reported separately, because when they disagree that is information — matching
  shapes at the wrong width is a condensed cut of the same face.
- **The gap to the runner-up is reported.** A lead inside 0.02 is a coin toss,
  and a caller reading only the first result would never know.
- **`node scripts/typography.mjs search` refuses without `--scale`.** A size
  cannot be recovered from a crop of unknown resolution, and the family metric
  normalises scale away on purpose. The first implementation scored sizes through
  that metric anyway and reported "best 28 — a clear minimum" for a crop that was
  24pt; every number in it was rendering noise.
- **It returns the curve, not just a winner.** When several sizes score within a
  tenth of a point, the tool says they are indistinguishable rather than picking
  one — re-rendering to chase a difference nothing can measure is exactly the
  waste this replaces. It also reports the size implied by proportion, since type
  scales linearly and one measurement answers the question outright.
- Comparison images are blurred before being compared. Sharp, every wrong family
  scores about the same — misaligned black-on-white text is uncorrelated, so the
  spread across wrong answers was 0.44–0.47, and the ranking below first place
  carried no information. Blurred, the same comparison spreads 0.084–0.121.
- `scripts/test/fixtures/typography-crops/` holds six real renders of the same
  string. The test feeds each back in as its own reference and asserts that
  family ranks first, and separately asserts the six are separable by width
  alone — if that ever collapses, the ranking is leaning on one signal without
  anybody noticing.

Uses ImageMagick and Maven, both already required. No new npm dependency.

**A review pass no longer has to guess what kind of defect it is looking at.** A
block in the wrong place and a block in the wrong colour look equally different
in a diff, and the fixes have nothing in common — one is a layout property on a
named owner, the other is a file or a font. Guessing between them from an image
is how a pass spends itself nudging margins until a *wrong icon* lines up.

- **`cause` is a new field on a mismatch** in `schemas/visual-review.schema.json`:
  `GEOMETRY | TYPOGRAPHY | PAINT | ASSET | CONTENT | PAGINATION | UNKNOWN`. It is
  orthogonal to `severity` (how bad) and to `rootCause` (which mismatches share
  an origin); all three can be set at once and none substitutes for another. The
  enum is mirrored into `config/pipeline.json` as `mismatchCauses` and
  `scripts/test/pipeline-config.test.mjs` asserts the copies agree, the same
  contract `failureCategories` already has.
- **`node scripts/evidence.mjs`** joins the three files that already held the
  answer and were never read together: the region bounds taken off the
  reference, the measured per-region pixel difference, and the engine's record
  of where every node ended up. It returns about **4 KB** — the owning node, how
  far it sits from where the reference puts the region, its hierarchy, its
  children, and the properties that actually produced its position. Against a
  227 KB snapshot; the boundedness is the feature and a test pins it.
- **The recommended properties are not suggestions.** They come from the
  inspector's additive chain, so they name the node that *owns* the offset. On
  the reference CV, `Masthead`'s position resolves to `MainColumn.padding.left`
  and `MainColumn.padding.top` — editing `Masthead` would have been the
  compensating constant the authoring rules forbid.
- **It assigns four of the seven causes and declines the rest.** `PAGINATION`
  (page counts differ, checked first because it invalidates everything after
  it), `GEOMETRY` (the owner is past tolerance from the reference region),
  `ASSET` (box right, role carries a file, interior heavily different — with the
  "do not compensate an asset with margins" prohibition attached to the verdict),
  and `UNKNOWN`. `TYPOGRAPHY`, `PAINT` and `CONTENT` are **never** assigned:
  separating them needs a typography snapshot that does not exist, so they come
  back as candidates. A test asserts they cannot be produced.
- **Owner selection is by overlap, not containment.** A containment test named
  the entire 797pt `Sidebar` column as the owner of the skills block, because
  the reference's bounds — read off an image by eye — started 0.63pt to its
  left. The displacement then read 338pt and meant nothing. Intersection over
  union picks the section; below a floor it names no owner at all, since every
  number downstream is computed against it.
- `docs/visual-accuracy-contract.md` gains a "Cause classification" section
  beside the severity table, including the `JSON → geometry, PNG → appearance`
  split. `skills/workflows/review-template/SKILL.md` gains step 1c and now
  records a cause alongside a severity — and is told not to read the snapshot.

**The layout inspector can now prove a patch moved only what it meant to.**
Every other check in the loop looks at the region under review, so a section
three pages away could shift and nothing would notice until a human opened the
PDF.
`node scripts/layout.mjs diff <revA> <revB>` compares two renders the engine
measured and answers the question a pixel comparison cannot.

- **Authored versus derived.** Nobody types an x coordinate into a template —
  they type `padding(0, 0, 0, 12)` and the engine works out that three
  paragraphs now start at 12. So inset and structure changes are treated as
  causes, placement changes as consequences, and "5 nodes changed" becomes
  "one padding was edited, three children followed it, and one node moved that
  no edit explains".
- **Collateral is the third group**, and the one worth reading: a derived change
  with no edited ancestor. In the committed fixture pair, adding 12 of left
  padding to one section makes the document root grow by 12, because its widest
  child got wider. Nothing is wrong — and nothing in the edit said it would
  happen. It is reported rather than failed on.
- **Ownership evidence.** Two or more siblings each gaining the same inset in
  one revision is reported as `shared-sibling-displacement` with a recommended
  owner and a property candidate — `padding.left` on the parent, or `spacing`
  when it is a trailing gap. Two, not three: the census behind
  `check-structural-smells.mjs` found nothing in the corpus repeating an inset
  three times, so a rule firing at three would never fire. Evidence only; the
  model decides and edits.
- **`expectedAffectedNodes`** is new and optional in `schemas/revision.schema.json`:
  the nodes a revision *intends* to move, named the way a person says them.
  Anything that moved outside those subtrees is reported. Declaring nothing
  disables the check rather than asserting stillness — a revision that forgot to
  fill it in must not read as one that promised nothing would move. A name that
  matches no node is reported rather than ignored, since the usual cause is a
  typo and silently treating it as "nothing expected" would switch the check off
  exactly when somebody tried to use it.
- `render-and-diff` runs the diff against the parent revision and reports it as
  a step. **It does not touch the verdict.** Promoting it to a gate belongs in
  `config/pipeline.json` and only after it has been quiet on real runs; a check
  that blocked the loop on its first day would be switched off on its second.
- `collateralNodesPerRevision` in the telemetry baseline is computed rather than
  null — averaged over consecutive revisions where both sides carry a real
  snapshot, with `collateralComparablePairs` beside it. It still reports null
  across today's corpus, because no project yet has two consecutive revisions
  that both carry one; `docs/benchmarks.md` says so rather than implying the
  number is a measurement.
- `scripts/test/fixtures/layout-diff-pair/` is two real renders of the same
  eight-node document differing by exactly one property, with the source kept
  beside them as the recipe. It includes a sibling subtree that must not move —
  "only the intended thing changed" is not provable without something that was
  supposed to stay put.

**Geometry is measured now, not guessed at.** The renderer writes GraphCompose's
own post-layout snapshot into the revision folder, and until now the only way to
use it was to read it — 227 KB and 248 nodes for a one-page CV, of which one is
ever the answer. So "the Languages block is too far right" still ended in an
agent staring at a PNG and reasoning backwards about which of four nested
paddings had moved. `scripts/layout.mjs` replaces that with arithmetic.

- `layout inspect <node>` returns one node's placement box, computed content
  box, insets, page range, parent and children. The node is named the way a
  user names it — `Languages`, not
  `CharcoalGoldCv[0]/Body[0]/Sidebar[0]/Languages[5]` — and an ambiguous name
  lists its candidates rather than answering about the wrong one.
- `layout explain <node> <x|y|width|height|contentX|contentY>` returns the
  additive chain, naming every node that contributes to the number:
  `HeadingText_CONTACT.x = 26` is `canvas.margin.left 0 + Sidebar.padding.left
  17 + Heading_CONTACT.padding.left 9`. Two owners, neither of them the node
  that shows the offset — which is the difference between fixing a layout and
  adding a compensating constant to it.
- **It can decline.** 109 of 247 nodes in the reference document have a width no
  arithmetic over the snapshot recovers — a paragraph is as wide as its text and
  the metrics are not in the file — and 16 have an x set by weights the snapshot
  does not record. Those report `not derivable` and say what it would take. A
  chain that is close but not exact reports the leftover as `unattributed`
  rather than absorbing it: that number is parent spacing or an unrecorded
  offset, which is to say it is the finding.
- The content box is **computed** from placement and padding. The snapshot's
  `contentWidth` field is equal to `placementWidth` on all 248 nodes despite the
  schema describing it otherwise, so reading it would have been wrong by exactly
  the padding, silently, on every node that has any. A test corrupts the field
  and asserts nothing changes.
- `y` is bottom-up. Every vertical rule works in top edges and converts at the
  end, and both the CLI and `inspect` say so, because a reader who assumes
  otherwise inverts every vertical fix they make.
- Four rules for `x`, three for `y`, two each for `width` and `height` — each
  one measured against all 247 non-root nodes before it was written, and the
  per-rule counts pinned by a test. A change that quietly stops explaining forty
  nodes turns that test red instead of degrading back into guessing.
- "Targeted Evidence First" in
  `skills/workflows/references/iteration-loop.md` makes it the required route
  for a geometric mismatch, and prohibits reading the snapshot into context.
  `AGENTS.md` separates it from `scripts/probe.mjs`: the probe answers how
  GraphCompose behaves, the inspector answers how this template laid out.
- `scripts/test/fixtures/charcoal-gold-cv/layout-snapshot.json` is a byte copy
  of a real render's snapshot, and every number in the tests comes from it.
  `validate-schemas.mjs` picks it up by filename, so it is proved schema-valid
  on every `npm run verify`.

**A published bundle now states its own consumer contract.** Everything after
APPROVE was supposed to be deterministic tooling — read the manifest, substitute
a few names, copy the files, build. But `template.json` only said `className`,
`specClass` and `specProviderClass`, and a generator still had to infer the
package from a source file, the data file from a naming convention, the runtime
rename from nowhere at all, and the assets from a directory listing. Inference
is where a zero-token step quietly needs a model again.

- `schemas/template-manifest.schema.json` pins the manifest, at
  `schemaVersion` `1.1.0`. New: `entrypoint` (the three fully-qualified names a
  runner substitutes), `data` (`example` **and** the `runtimeName` a consumer
  renames it to — the half `dataFile` never stated), `resources`,
  `graphComposeVersion`, `pageCount`, and a bundle `version`.
- The bundle `version` is preserved across a republish and moved only by
  `--version`. Whether consumers must re-integrate is a judgement about what
  changed in the layout; a publish step cannot make it, and resetting it every
  time would tell every consumer they were already up to date.
- `scripts/lib/template-bundle.mjs` is the one place a manifest is expanded.
  `readManifest` back-fills the contract from disk for the three `1.0.0`
  bundles already published, so no caller branches on `schemaVersion`, and
  `normaliseDependencies` expands the pre-1.1.0 shorthand keys once.
- That consolidation fixed a live defect. `generatePom` in
  `verify-published-template.mjs` expanded `"jackson"` to
  `com.fasterxml.jackson.core:jackson-databind`; the README generator in
  `approve-and-publish.mjs` expanded the same key to `io.github.demchaav:jackson`
  and printed it as the coordinate a consumer should declare — a dependency that
  does not exist, in the one document a consumer reads before writing their
  build file. Both read the same manifest; only one was right.
- An unknown shorthand key is now flagged (`assumedGroupId`) rather than
  silently resolving to `graph-compose`, which is what the old expansion did to
  any key it did not recognise.
- `validate-schemas.mjs` binds `template.json`, so the contract is enforced in
  CI like every other on-disk artifact.

**The consumer generator became reachable.** `verify-published-template.mjs` has
been synthesising a Maven project from `template.json` alone and compiling the
bundle against it since the `--build` tier landed — the one piece of code that
could turn a published bundle into a working project was locked inside the one
command whose output a consumer never sees.

- `scripts/lib/bundle-project.mjs` is that code, extracted: `generatePom`,
  `stageSources`, `stageResources`, `generateMainClass`,
  `generateConsumerReadme`, `resolveDependencies`, `copyTree`, `maven`. The
  verifier now imports it, so a bundle that verifies is a bundle that
  instantiates — there is one implementation, and it cannot drift from itself.
- `scripts/lib/consumer-main.java.tpl` is the runner: a static Java file with
  five names substituted by plain `${…}` replacement. No model decides anything
  in the consumer lane.
- It sets **both** `graphcompose.template.dir` and `graphcompose.revision.dir`.
  Every bundle published so far reads the second, and its provider throws when
  the property is unset rather than defaulting, so setting only the new name
  would break every existing bundle at startup. The old line goes away when the
  published providers read the new one.
- `resolveDependencies` backfills `graph-compose-fonts` for a bundle on 1.8.0 or
  later whose manifest omits it — the mapping `scaffold-runner.mjs` already had,
  now shared with it rather than copied. Without the artifact a template asking
  for `FontName.LATO` fails at render with "Bundled font resource not found",
  which reads like a template bug and is not one.
- Behaviour-neutral, and measured: `verify-published-template --template-id all`
  produces byte-identical JSON to the pre-refactor run at both the `--build` and
  `--render` tiers, down to the rendered PDF sizes.

**There is a catalog.** Nothing listed what had been published, and answering
"how do I use this bundle" meant opening `template.json`, then a source to find
the package, then `data/` to find the example, then the README for the
dependencies. Four files and a convention, to learn facts the manifest already
states — and an agent that has read that much of a bundle is already tempted to
rebuild it instead of reusing it.

- `node scripts/templates.mjs` lists every published bundle: id, name, kind,
  page count, GraphCompose version, bundle version, source project and revision.
- `node scripts/templates.mjs inspect <id>` prints the classes, the data file
  and the name to copy it to, the assets by extension, the font roles and which
  need manual registration, the dependencies, the provenance, and the call
  itself — generated from the bundle's own classes, so it cannot describe an API
  the bundle does not have.
- The dependency list is what a build file **needs**, not what the manifest
  happens to list: a 2.x bundle whose manifest omits `graph-compose-fonts` shows
  it marked `not in the manifest; this line needs it`.
- The snippet names the JVM property the bundle's own sources read, found by
  reading them. Bundles published so far read `graphcompose.revision.dir` and
  their providers throw when it is unset, so a snippet naming the newer property
  would look authoritative and not run. Those bundles are flagged as carrying
  harness vocabulary into published code.
- `--json` on both, for agents. Neither path calls a model, and a corrupt
  manifest in one bundle is reported rather than suppressing the rest.

**`use-template` closes the lifecycle.** After APPROVE there was no consumer
workflow at all: a published bundle could be verified and could not be used.

- `node scripts/use-template.mjs <id> --new-project <dir>` writes a complete
  runnable project — pom with the runner wired to `exec:java`, `Main.java`, the
  bundle's classes at their own package, the data file under its runtime name,
  the assets, a README — then compiles it before reporting success. All three
  published bundles produce a project that runs and renders a PDF byte-identical
  to the verifier's: 3173, 22172 and 50015 bytes.
- `node scripts/use-template.mjs <id> --target <project>` copies into a project
  that already exists and **reports** what its build file is missing, with the
  snippet in that build file's own syntax. It does not patch the build file:
  editing someone's pom by pattern is how a working build becomes a broken one.
- The report states the Java release too. The first real `--target` run reported
  one missing dependency, it was added exactly as printed, and the build failed
  anyway — the target pom set no compiler release, so Maven defaulted to
  `-source 8` and the template's records would not parse. A report that is
  followed and still does not compile is worse than no report.
- A dependency the project already declares is not reported missing; a version
  that differs from the one the bundle was published against is a note rather
  than a demand.
- Nothing is overwritten without `--force`, and a clash is refused **before**
  anything is written — a half-finished copy leaves a project that neither has
  the template nor is as it was. A directory that is not a Java project is
  refused rather than turned into one.
- Resources land under `template/<template-id>/` in an existing project, so
  installing a second template cannot silently overwrite the first one's data.

**A bundle that only works here no longer publishes.** The failure mode was
quiet: `templates/<id>/` looks complete, compiles, its manifest parses, and the
first consumer to run it gets a missing file whose path names a computer they
have never used.

- `scripts/lib/bundle-portability.mjs` scans every text file for absolute paths,
  paths into a `graphcompose-flow` workspace, paths into a `revisions/`
  directory, and revision vocabulary. Publishing fails on any of them; the
  verifier runs the same scan, so a bundle cannot pass publishing and then fail
  the consumer gate for a reason publishing could have caught.
- The line is between a path and a word. `revision-009` inside `template.json`
  or the README is traceability the consumer contract deliberately keeps — it is
  how a rendering service logs which template produced a document. The same word
  in a `.java` file is code that knows about a revision, and a *path* through
  `revisions/` is blocked everywhere, including the README.
- `graphcompose.revision.dir` is reported as a **known** leak rather than a
  blocking one: it is real and scheduled, and every bundle published so far
  reads it, so failing over it would stop the harness rather than improve a
  bundle. It prints on every publish so it cannot be forgotten.
- It found live defects in the two bundles this repository ships. Both READMEs
  linked to `../../examples/.../revisions/…`, which resolves only inside a clone
  of the harness — a broken link for every consumer. `InvoiceClassicTemplate`
  went further and returned `"(revision-003 - Page margin added…)"` from
  `getDescription()`: harness vocabulary in a value callers can render. Both
  bundles now state their provenance the way the contract intends, by pointing
  at `template.json`. Neither was republished — their Javadoc has been curated
  by hand since publication, and regenerating from the revision would have
  destroyed that and reintroduced more revision vocabulary than it removed.
- `npm run verify` now extends its untracked-files caveat to the published-bundle
  step too, since both walk the working tree rather than the index.

**Published code stops knowing this harness exists.** A template outlives the
run that produced it. Once published it is ordinary Java in someone else's
project — and a class resolving its data through a property called
`graphcompose.revision.dir` has told that project about revisions, workspaces
and an approval loop it will never have.

- `skills/workflows/references/authoring-rules.md` now states the contract, and
  that file is loaded on every authoring pass — which matters because the
  property was documented **nowhere**. New templates learned it by copying older
  ones, so the leak reproduced itself with no rule to point at.
- Every provider gets two ways in, and the property-free one is the real API:
  `load(Path dataFile)` for production, `create()` for the render runtime. A
  template that loads assets takes a resource root through a constructor, so a
  service rendering a thousand documents shares one set of assets instead of a
  directory per document.
- `create()` resolves `graphcompose.template.dir`, then
  `graphcompose.revision.dir`, then `"."` — never the reverse. The fallback is
  for reading, never for writing; new code does not emit the old name, and the
  portability scan reports it if it does.
- The harness sets both names (`render-runtime.mjs`, `verify-published-template.mjs`)
  while templates on either contract exist.
- `use-template`'s wire-up instructions now name the property the bundle's own
  sources read, found by reading them, rather than the one the harness prefers.
  Telling a consumer to set a name their template never looks up produces a
  provider that throws with the property already set. `resourceProperty` moved
  into `template-bundle.mjs` so the catalog and the installer answer this the
  same way.

**Template Reuse First.** With a catalog and an installer in place, the
remaining way to waste the expensive half of the lifecycle is to run it on
purpose: rebuild an approved layout because the user described it. Reuse is a
file copy; reconstruction is analysis, authoring, render, compare, iterate — and
it lands *near* the approved layout rather than on it.

- `scope-routing.md` gains the rule above the scope table, because a scope is a
  question about a revision and this one asks whether a revision is needed at
  all. `create-template` now runs `node scripts/templates.mjs --json` before
  analysing anything, and `/create` says so too — a rule only in a reference
  nobody opens is a rule that does not exist.
- The discriminator is **what changes**, not whether a template is named. New
  content is a use; new layout is a revise. "In Northline, make the header
  taller" names a published template and is still a revision.
- A revision on a published template belongs in the project `template.json`
  names as `sourceProject`. `publish-template` rewrites a bundle's sources from
  its revision on every publish, so an edit in the bundle is reverted the next
  time anyone publishes — and until then the bundle no longer matches the
  revision it claims to come from.
- Four routing fixtures pin it, including the two that make the rule
  non-obvious: naming a template while asking for a layout change, and asking
  for "something like X but different". `reuse` is a fixture answer that is not
  a scope, alongside `ambiguous`.
- Fixed while proving the rule was reachable: the skill link checker resolved
  `#anchor` as part of the filename, so a valid anchor link failed as a missing
  file. It now splits the fragment and checks that the target file really has a
  heading for it — a stale anchor is the same broken link one edit later.

**Stale knowledge is an instruction, not an inaccuracy.** An agent that reads
"work-experience timelines currently require bullets plus
`LineBuilder.vertical(...)` and margin tuning" believes it, and hand-assembles a
timeline with repeated sibling margins — against a library that has shipped
`addTimeline` for two minor versions. The generated code then reads as the
agent's judgement rather than as stale documentation, which is where the cost
hides.

- The audit found the active 2.2 pack **clean**: every "workaround" in it is
  retrospective, and `layout-primitives.md` already documents the timeline
  primitive positively. The one stale document was
  `docs/engine-feedback-noir-corporate-cv.md`, and it was an orphan — nothing
  linked to it, and it was not in the documentation map. It has been retired to
  `docs/private/`, annotated with what the allow-list actually says. An
  unreferenced document that greps well is a trap.
- Two of its seven items were provably resolved, checked against the generated
  allow-list rather than from memory: **item 5**, `addTimeline` with a full
  `TimelineBuilder`; **item 2**, `pageBackgrounds(List<PageBackgroundFill>)` —
  which is exactly the declarative background-band API it asked for. Item 6
  (`headingBar`) is genuinely still absent, so it stands.
- `scripts/check-knowledge-drift.mjs` stops it recurring, and runs inside
  `npm run verify`. It is deliberately narrow: a curated list of semantic
  primitives paired with the hand-built construction each replaced, and a pair
  is inert unless the pinned pack actually declares the primitive.
- The first version scanned prose generally — any absence phrase near any
  allow-listed symbol — and was unusable. Its loudest false positives were the
  sentences *teaching the closed-set rule itself*: "if it is not listed there,
  it does not exist" names builders while denying nothing. A check that cries
  wolf is a check somebody turns off, so the passages that must stay silent are
  now pinned by tests as hard as the one that must fire.

**Semantic primitive first, and geometry belongs to whoever owns it.** Two
rules in `authoring-rules.md`, which every authoring pass loads.

- **Semantic primitive before manual composition.** A primitive that represents
  the *relationship* is preferred even when equivalent output can be assembled
  from lower-level nodes, with a mapping table from pattern to primitive —
  timeline, table, page header/footer, shape-owned content, overlap, page
  background band, named vertical and horizontal groups. `LineBuilder`,
  `ShapeBuilder` and canvas drawing are fallbacks, not the default authoring
  model. Every name in the table was checked against the generated allow-list
  before it was written down.
- Two reasons it is a rule and not a preference: a hand-assembled timeline is a
  dozen constants a later revision has to find and move together, and the
  primitive knows things the assembly does not — `keepTogether()` survives a
  page break, three siblings with matching margins do not.
- **Layout ownership.** A property shared by several children belongs to their
  nearest common semantic parent. `margin` positions a component in its
  surroundings, `padding` positions children inside their owner, `spacing` sets
  the repeated gap between them — all three on `AbstractFlowBuilder`, so which
  one you reach for says who owns the geometry. The test is a revision request:
  "move the language list 6pt left" should be one property change, not three.
- **Change the smallest owning property.** Fix a mismatch at its owner, not at
  whatever number can be adjusted to compensate. Widening the search until
  something moves is how a template accumulates constants that each described
  one pass and together describe no layout.

The corpus was censused for the pattern rather than assumed to have it: 862
`margin`/`padding` calls across 35 generated and published templates yield **7
distinct repeated-sibling instances**, five of them trailing-gap margins that
belong on the parent as `spacing(...)`. Worth knowing for the lint that
follows — 21 further groups repeat `DocumentInsets.zero()` three or more times,
which is neutralising a default, not a shared inset, and flagging it would make
the check noise.

**A template can be pixel-perfect and built wrong.** Three siblings each
carrying `margin(0, 0, 5, 0)` render exactly like one parent carrying
`spacing(5)` — the diff between them is zero — but the first is three numbers a
later revision has to find and move together, and the fourth item somebody adds
will not have the margin. Every gate the loop had was blind to it, because none
of them reads the source.

- `scripts/check-structural-smells.mjs` does, and `render-and-diff` folds its
  findings into the loop verdict beside the region-role check. Evidence, not a
  build failure: exit 0 either way, so a reviewer sees the whole list.
- Four rules — `repeated-sibling-offset`, `negative-margin-cluster`,
  `manual-semantic-pattern`, `independent-geometry-cluster`. The last is a count
  of *distinct* literals, so the same derived constant used twenty times is
  fine and twelve unrelated numbers are not.
- The thresholds came from the census rather than from the rule that motivated
  them. Repeated insets fire at **two**, because nothing in the repository
  repeats one three times and a stricter rule would have found nothing at all.
- Three exclusions, each of which would otherwise have made the check noise on
  its first run: a repeated `DocumentInsets.zero()` neutralises a default rather
  than stating shared geometry (21 groups); an inset built from a named constant
  is the relational-geometry rule *working*, not a smell; and the manual-timeline
  rule is gated on the pinned pack actually declaring `addTimeline`, since
  before it existed that construction was the correct answer.
- It reported `skillBar()` as a hand-built timeline while being written — a
  gauge, one rail and one marker, matched because the rule counted the local
  `markerLeft` identifier instead of call sites. Fixed to count real construct
  calls and require three. A rule that misreads one construct as another is
  worse than no rule, because the next real finding is not believed either.
- Run over the corpus it reports exactly the five sites the census found, and
  nothing else.

**A baseline anyone can recount.** The layout-diagnostics work is an investment,
and the only honest way to find out afterwards whether it helped is to write
down what things looked like first, with a date on it.

- `node scripts/telemetry/run-metrics.mjs baseline` counts the corpus:
  revisions, renders, FAILED revisions, revisions that edited Java, how much
  geometry moved between revisions, structural smells and negative insets. The
  numbers are in `docs/benchmarks.md`, dated.
- It needs **no session**, which is the whole point. `report` prices one live
  run from the host's hooks, so it cannot be re-derived later; this reads what
  is on disk, so a comparison a year from now can recompute the "before" on a
  machine that never saw the work.
- **Two figures are recorded as `null`, not approximated**: renders per geometry
  correction, and whether the mismatch owner was right first time. Neither is
  derivable from a revision folder — both need the loop to record what a pass
  was trying to fix. A number that is nearly the thing you wanted gets quoted
  later as if it were the thing.
- The document separates the six tracked projects (19 revisions, reproducible
  from a clone) from the eleven on this machine (53 revisions, not). Comparing
  the second set across machines would silently measure a different corpus.
- And it says which metric to stop expecting anything from: repeated geometry
  literals number two across the tracked corpus, mostly inside immutable
  APPROVED revisions. That figure is there to catch a regression, not to
  demonstrate a win.
- Fixed on the way: `projectCounters` omitted `failedRevisions` on its
  no-revisions branch while the populated branch returned it, so summing across
  projects produced `NaN` as soon as one project had no revisions — the ordinary
  state of a project someone just created. A test had pinned the incomplete
  shape.

**The layout snapshot stopped being fiction.** `layout-snapshot.json` was a
placeholder for most of this project's life: a description of the layout an
agent *intended*, written by hand, with a `notes` field admitting as much. The
tools about to read it cannot tell a fabricated measurement from a real one,
which makes a fake one worse than none.

- `tools/preview-renderer` now writes GraphCompose's own measurement. It calls
  `DocumentSession.layoutSnapshot()` — which the engine produces after layout
  and pagination and before any backend renders bytes — and writes it beside the
  PDF. A real CV comes out as 248 nodes, 247 of them named, with resolved paths,
  measured placement and content boxes, insets, hierarchy and page spans.
- **This needed no engine work.** The spike behind it found the API already
  public and already in the pinned 2.2 allow-list. What was missing was on our
  side: `extract-api.mjs` did not index `com.demcha.compose.document.snapshot`,
  so the pack listed the methods that *return* a snapshot and none of the
  accessors that read one — leaving an agent, under the closed-set rule, unable
  to read a single field. One package prefix and a regenerate.
- `schemas/layout-snapshot.schema.json` pins the shape, and mirrors the engine's
  record field-for-field: a projection that renamed anything would have to be
  kept in step with an upstream release by hand. `formatVersion` is
  GraphCompose's own contract version, carried through verbatim.
- The writer is reflective and driven by `Class.getRecordComponents()`, so a
  component the engine adds later appears without a code change here. A GraphCompose
  older than 1.6.0 yields no snapshot and still renders; the render log records
  which of the two happened.
- **Ten illustrative snapshots were deleted**, along with the artifact
  declarations and prose links that pointed at them. Their own `notes` field
  said they would go when a real renderer shipped. Keeping them would have fed
  invented numbers to an inspector whose entire value is that it measures.
- One limit worth knowing before relying on it: a node spanning pages reports a
  page **range**, not a box per page. The engine's layout model carries no
  per-fragment geometry.

## v0.12.0 — 2026-08-26

**The verdict stopped being a self-report.** The loop's exit condition was the
model's own word, and it reached that state through three steps that each
looked like a check: the review writes `visual-review.json`; `iterate-status`
reads its `verdict` and starts from there; `render-and-diff` asks
`iterate-status` for the loop verdict. A real run ended on
`"gate": { "passed": false, "metric": "diff: 211583 px (9.734%) - CRITICAL" }`
next to `"verdict": "READY_FOR_APPROVAL"`, and nothing anywhere noticed —
the only reader of `gate.passed` in the repository was the markdown renderer
that prints it back out.

- `scripts/lib/review-claims.mjs` is the missing reader. It forms no verdict;
  judging a render against a design reference stays with the model. It asks
  whether the verdict agrees with the evidence in the same folder, and
  downgrades `READY_FOR_APPROVAL` to `REVISE` on four contradictions:
  `binary-gate-failed` (`passed: false` under `exact-diff` / `region-diff`,
  which measure equality), `unresolved-severity` (a `CRITICAL` or `MAJOR` still
  on the list), `human-report-open` (a `humanReportedMismatch` without
  `addressed: true`), and `gate-metric-unmeasured` (the pixel count quoted in
  the review is not the one `visual-diff-stats.json` holds).
- Only the first is liftable, by a new `gate.override.reason` of at least 60
  characters naming what was measured instead — the shape observations already
  use for `retiredNote`. There is no override for the other three: outranking a
  `CRITICAL` is how a review stops meaning anything.
- `passed: false` on the `visual-review` gate deliberately does **not** block.
  That gate compares against a rasterised design image whose anti-aliasing no
  PDF renderer reproduces, so its page percentage is never zero; blocking on it
  would make the override a rubber stamp on every reference-built project,
  which is this defect reintroduced one level up.

**`region-diff` became a tool instead of a paragraph.** `config/pipeline.json`
has declared the gate since Phase 1 — "AE on the affected regions; every region
outside that list must be byte-equal" — and no script implemented it. Grep the
repository and the only hits were the config naming it and the schema mirroring
its vocabulary.

- `tools/visual-diff/src/regionDiff.ts` + `region-diff` CLI cut every region out
  of `visual-analysis.json` and compare it. `--changed <ids>` makes it the gate
  it always claimed to be: exit `2` when a region outside that list carries
  mismatched pixels.
- `render-and-diff` runs it every pass and writes `region-diff-stats.json`. The
  figure that matters is `concentration` — a region's share of the page's
  difference divided by its share of the page's area. Even wear sits near
  `1.00x`, which is what anti-aliasing against a soft reference looks like; a
  region well above it carries damage out of proportion to its size.
- Why it was needed: a whole-page percentage against a rasterised reference
  cannot be checked, only explained. A run explained 9.734% as type rendering —
  correct in outline — while a timeline rail ran through the marker meant to cap
  it. Regions disagree with each other; a page total cannot. Measured on that
  run the tool reproduces the stored page figure exactly and ranks
  `credentials-divider` at 3.3x and `summary` at 2.9x their share of the page.
  It did **not** by itself surface the 13px rail: at region granularity a defect
  that small is inside the noise of a region full of text. It localises, it does
  not replace looking.

**A published bundle is verified by rendering it, not by compiling it.**
`approve-and-publish --verify` now defaults to `render` rather than `static`.
The first bundle published from a real run compiled cleanly and could not
render: `assets-manifest.json` never reached it, so every icon resolved to
nothing. Static verification passed it, and it would have shipped that way if
the agent had not chosen `--render` on its own — which made the good outcome a
matter of who was driving.

**The iteration ceiling stopped charging for work it was not written to
stop.** `maxIterations` counted every revision in the loop, including the ones
that were not the agent's decision.

- A pass carrying a `humanReportedMismatch` id new to this loop is not charged:
  it exists because a person named something. One report buys one free pass, so
  an unaddressed report cannot become unlimited licence. A real run reported
  `9/8` for a correction requested one message earlier; it now reads `8/8, +1
  you asked for`.
- At the ceiling, a loop whose latest pass strictly reduced the number of
  `CRITICAL`/`MAJOR` mismatches gets one more pass, capped by a new
  `limits.maxIterationGrants` (3) and re-earned each time. Circling is already
  caught by `maxSameMismatchAttempts`, which fires on the third attempt at one
  cause however many passes have run. A run reached 8/8 holding two `MINOR`
  fixes whose recipes it had written down, and put them in the bundle's README
  instead of in the document.
- Progress is counted on the severity ledger, never on the page pixel count.
  Capping that timeline rail moved the page total from 211583 px to 211674 —
  *up* — because it repainted a few glyph edges. A convergence test built on
  that number calls the fix a regression.

**Found by reviewing the above, and fixed in the same change.** Each of these
was the same defect the work was about, reintroduced by the work:

- A region declared without `bounds` — which the analysis schema permits, it
  requires only `id`/`label`/`role` — was dropped from the region list instead
  of reported unmeasurable, so `region-diff --changed hero` measured nothing in
  a bounds-less `footer`, found no trespasser, and exited 0 while the footer
  that moved shipped unnoticed. It was simultaneously unguardable and
  unnameable: `--changed footer` threw "names region(s) the analysis does not
  contain". Bounds-less regions now stay on the list as `skipped`, and under
  `--changed` an unmeasurable region outside the changed set is a refusal
  (exit 2), because a gate that could not look at part of the page cannot say
  the page is clean.
- The iteration exemption for a pass the user asked for was uncapped, and
  `humanReportedMismatch` is written by the same model whose verdict this change
  stopped trusting — the schema even sanctions coining a fresh id. An agent
  coining one per pass would hold `agentIterations` at zero forever: the
  self-report closed at the verdict, reopened at the budget. Exemptions are now
  bounded by `maxIterationGrants` as well as deduplicated.
- `convergence()` compared the last two passes *that carry a review*, so a loop
  whose newest revision had none could be granted an extension on an older
  pass's progress while the reason said "the last pass closed N". It now reads
  the last two revisions, and an absent `mismatches` array counts as
  unmeasurable rather than as zero blocking mismatches — reading a damaged
  record as progress would hand out an extension for writing a worse file.
- `gate-metric-unmeasured` compared the review's quoted pixel count against
  `visual-diff-stats.json` without checking which comparison that file holds.
  The file is rewritten by whichever diff ran last, so a revision diffed both
  ways would have a truthful `AE == 0 vs parent` reported as a fabrication. The
  stats say which they are — a reference diff scales into the revision folder,
  a parent diff is handed the parent's `output.png` — and the rule now applies
  only when they match.
- `region-diff` exited via `process.exit(2)`, which truncates a piped `--json`
  payload on exactly the failing runs that matter. `process.exitCode` now, the
  same fix `import-reference` and `page-size` already carry.

**Two older defects the same review surfaced:**

- The aspect-mismatch warning switched itself off on any second run.
  `render-and-diff` preferred the persisted `reference-scaled.png`, which
  already has the render's dimensions, so `--scale-reference` found nothing to
  scale, skipped the measurement, and rewrote the stats *without*
  `aspectMismatch`. The distortion stayed in the pixels; only the notice
  disappeared — and a backstop that turns itself off on retry is worse than
  none, because the first run taught you to trust it. Verified on
  `mocha-profile-cv`: the 9.45% warning vanished on the second run and now
  survives it. The scaler is deterministic by design, so always reading the
  original reproduces the identical scaled file.
- `visual-review-classification.md` — the artifact the review skill tells a
  reader to paste into `visual-review.md` — printed `0.3% — MINOR` with no
  hint the reference had been stretched to produce it. The distortion now
  leads the file, above the numbers it invalidates.
- `page-size --use` settled an `inconsistent` measurement. That verdict means
  the pages disagree with each other, so there is no one page size to confirm;
  recording one exited 0 and silenced the question permanently for every later
  revision. It is refused now, and says to re-import.

**The intermittent full-suite failure is root-caused.** v0.11.2 recorded it as
unexplained; the assertion added there — check the import succeeded before
reading what it wrote — is what made it legible. Caught in a loop of full-suite
runs, it says:

    java.lang.NoClassDefFoundError: org/apache/pdfbox/Loader

`runRender` rebuilds the preview renderer with `mvn package` whenever its
sources are present, which they are in a dev checkout, and
`tools/preview-renderer/pom.xml` gives maven-shade
`<finalName>preview-renderer</finalName>` — so the build **rewrites
`target/preview-renderer.jar` in place**. Six test files can trigger a render,
Node runs test files in parallel, and a JVM that starts from that path while
shade is writing it loads a jar with no PDFBox in it. Nothing to do with
fixtures, which is why checking them found nothing.

It is not a defect in anything released: the shipped jar is prebuilt, an
installed harness has no sources so it never rebuilds, and CI skips these
tests for want of a renderer. It IS a real hazard in a dev checkout — two
harness commands run at once do this to each other. Recorded here and not
fixed in this release, because it was found while cutting it.

**Still open, recorded rather than fixed:** nothing relabels a `CRITICAL` for
you, but nothing stops a review reclassifying one as `ACCEPTED_LIMITATION`
either — the schema says that classification "requires a human note" and no
code enforces one. `unresolved-severity` is only as strong as the honesty of
the severity column.

**The page size is measured now, and asked about when measuring is not
enough.** Nothing in the chain ever looked at how big the reference was. The
design stage had nothing to measure against and wrote "A4", which is what gets
written when nobody made it look — and the gate could not catch it, because
`visual-diff --scale-reference` resamples the reference to the render's exact
width *and* height. A page built at the wrong proportions was stretched to fit
immediately before the pixels were compared. The diff reported parity, the
review read a stretched reference, and the accuracy contract's "page size
matches the reference" was checked against the distortion.

Three projects on disk shipped that way. `mocha-profile-cv` was built at A4
from a reference whose nearest standard is LETTER, 9.5% out; `cv-reference`
4.9%; `navy-executive-cv` 4.2%. Every gate green, and every element placed
against page height in the wrong place on every page.

- `scripts/import-reference.mjs` measures the page at import — the dimensions
  are in the PNG header it just wrote, so it needs no ImageMagick and no build
  output — ranks the standards, and records `referenceGeometry` in
  `template-project.json`. Exit `0` when a standard matches within 1%; **exit
  `5` when the page size is unsettled** — nothing matched, the pages disagree,
  or the header could not be read at all. On a question it carries the whole
  question: the measured size, the nearest standard, what building at it costs
  in percent, and the exact `DocumentPageSize.of(w, h)` that keeps the
  reference's proportions. A measurement that could not be taken is in the same
  bucket on purpose: exit 0 there would make "this is a known standard" and
  "nobody could tell what this is" the same answer to a script.
- Exit 5 is a question, not a failure. The files are imported; what is missing
  is a decision, and it is the user's: a cropped screenshot of a standard page
  and a genuinely custom page measure the same and produce visibly different
  documents. Picking the nearest standard silently would be the same defect
  with a shorter error bar.
- `scripts/page-size.mjs` covers the rest of a project's life. A revision does
  not re-import, so the page size was checked when a project was created and
  never again — and a project created before the measurement existed carried no
  page size at all. It answers "is it settled?" for any project (exit `0` yes,
  `5` no), measures on the spot when nothing was recorded, and `--use` with a
  `--decision` writes the user's answer down so later revisions inherit it
  rather than asking again. `revise-template` runs it as step zero: a wrong page
  size is not in scope for anything. `--decision` is mandatory and length-checked
  — a nearby standard and the exact measured size are both defensible and the
  numbers afterwards do not say which was taken.
- Re-importing a different reference drops a recorded decision. A new reference
  is a new page, and carrying the old answer across would be a settled page size
  that nobody settled.
- Pages that disagree with each other about their own size are their own
  verdict. A document has one page size, so that is a mixed-dpi import or two
  sources, and nothing downstream can be right until it is resolved.
- `visual-analysis.json`'s `page` block now requires the evidence —
  `referencePx`, `aspect`, `sizePt`, `sizeSource`, and `sizeDecision` when the
  user was the one who decided. There is deliberately no enum value for "chose
  without measuring or asking".
- `visual-diff` reports `aspectMismatch` in its stats and warns on stderr when
  it scaled a reference into a shape it did not have, saying which way the
  error runs: a stretched reference makes the mismatch *smaller* than the
  truth. `render-and-diff` carries it into the per-page report and to the top
  level of `result.diff`, so a reader who takes `percent` and stops is still
  told. The rule in `docs/visual-accuracy-contract.md`: a page-size mismatch is
  never MINOR, whatever the pixel percentage, because relational geometry
  derives from the page — get the page wrong and every ratio built on it is
  faithfully wrong.

The tolerance lives in two places, because `visual-diff` builds and ships as
its own package and importing a harness script into it would be the wrong
dependency. `scripts/test/contracts.test.mjs` asserts the two never drift.

## v0.11.2 — 2026-08-25

The v0.11.0 and v0.11.1 tags each point at a commit whose CI is red, so both
are superseded rather than moved. Same defect twice, and it was mine.

**An unmeasured observation is not a failed one.** The test added in 0.11.0
runs `observations verify`, which re-runs the probes. On the Node-only CI job
they cannot run — and every record, retired included, came back "no longer
holds": a verdict about the library that nothing had measured. The first
attempt guarded on Maven being installed, which the runner has, so the guard
passed and the test failed again.

A probe that exists and cannot run is its own bucket now, and every subject
lands in exactly one, so the summary can no longer read "7 of 5 no longer
hold" — which is what it printed.

**And `verify` has three exit codes, because the first fix did not deserve its
green tick.** Returning 0 both when everything was measured and held, and when
nothing could be measured at all, makes those two the same answer to a script
— the vacuous pass this command exists to prevent everywhere else. The prose
distinguished them; the code a caller reads did not. Now: 0 held, 1 changed,
4 not measurable here.

Also: the multi-page import test asserted on the file the import wrote without
first asserting the import succeeded, so any failure surfaced as ENOENT on the
read. One intermittent failure in a full-suite run could not be explained
afterwards for exactly that reason. It names its own cause now.

Still open, and not hidden: that intermittent failure. It appeared twice in
full-suite runs, never in five isolated runs of the same file, and every
fixture it could have chosen was verified byte-identical, so the fixture is
not the cause. Most likely contention spawning JVMs when the whole suite runs
— the suite also warns about eleven exit listeners. Unresolved.

## v0.11.1 — 2026-08-25

**The plugin showed a red error on every load.** `.claude-plugin/plugin.json`
declared `./hooks/hooks.json`, which Claude Code loads on its own — so the
loader refused the explicit reference as a duplicate, and the refusal is for
the whole file. The five hooks worked; the plugin page carried an error
anyway, and a user read it before any test did. `manifest.hooks` is for
*additional* hook files, and there are none. Pinned so it cannot come back.

Also: the retired-observation test added in 0.11.0 ran `observations verify`,
which needs a JDK and Maven. The harness-contracts CI job is the Node-only one
by design, so every probe reported "did not run" and the tag went red on a
toolchain rather than on a behaviour. It skips where probes cannot run now.

Worth recording, unfixed: no CI job runs `observations verify` at all, so a
library release that changes a behaviour under a recorded observation — which
is exactly what 2.2.1 did — is noticed by a person or not at all.

## v0.11.0 — 2026-08-25

GraphCompose 2.2.1, and three things a real proposal run showed.

**The seal is on the revision now, not only on the render.** v0.10.0
stopped a correction rendering into a revision that already carried a
review, and in the first run that hit it the gate worked — the agent
opened a new revision and carried on. The record still came out damaged,
because the edit happens *before* the render:

```text
revision-001  output.pdf                     20:37:32
              visual-review.json             20:39:00
              GeneratedProposalTemplate.java 20:50:54   <- eleven minutes later
```

Nothing was lost — `new-revision` copies the body forward — but
revision-001's template was never rendered and never reviewed, so rolling
back to it hands you code nobody checked, which is the one thing keeping
every revision is for. A source file modified after the review that
judged it is now reported by the render refusal, downgrades the loop
verdict to `REVISE` with the focus `edited-after-review`, and stops
`approve-and-publish` before it can put unreviewed code into a bundle.
Checked against every project on this machine: none of their latest
revisions is affected.

A generated test is deliberately not counted. It exercises the template
rather than composing the document, so editing it changes nothing the
review looked at — and every example here carries one.

**A discovery made while correcting goes into `observations`, not a
README.** The revise workflow mentioned observations zero times, and the
instruction to record one lived only in create-template's probe section —
which an agent reads when it is about to write a probe, not when it has
just measured something while fixing a layout. So a run measured that the
right margin on a rule inside a row cell is counted twice (asked for
15.5pt, got 27.9) and wrote it into a bundle README, where
`observations find` will never look and the next run pays to discover it
again. Step 8 of the revise workflow now says where it goes and why.

**A table header cannot repeat on a page its table never reaches.**
`check-document-integrity` demanded every `table-header` region's label
on every page of the overflow render, and failed a working two-table
proposal three times: its investment table only reaches page 3, and its
timeline header matched two of its four words on page 1 out of prose.
There was no test on the rule at all, which is how it shipped. It reports
a *gap* now — present, missing, present again means the table spans all
three pages and lost its header in the middle, which is unambiguous. On
the run that hit it: three findings before, none after.

## GraphCompose 2.2.1

The public surface is byte-for-byte identical: 2702 members, none added,
none removed. What changed is behaviour, and two recorded observations
stopped holding — both because the defects they described were fixed.

`table-cell-loses-composite-content` was the engine defect. On 2.2.0 a
Row, ShapeContainer or CanvasLayer in a table cell reserved the cell's
height and drew none of its child content, and a Section or LayerStack
drew about 0.4 of the ink. On 2.2.1 all eight node kinds draw in full,
with nothing partial and nothing lost. `row-cannot-nest-in-row-cell` is
lifted the same way: `horizontalInLayerStack` measured false and now
measures true.

Both are retired with those numbers, and the skill pack that had been
teaching their workarounds **as rules** is corrected — a cell takes any
node on 2.2.1, and which half applies is decided by the version in your
build file rather than by the page.

Three gaps surfaced while doing it. `confidence: retired` recorded that
something stopped being true and nothing about *why*, which is how a
measured fact becomes folklore — `retiredNote` is now required when a
record retires. `observations verify` demanded that a retired observation
still hold, so the command that proves the record is current could never
come back clean once anything had been retired; it checks the opposite
now, and reports `BACK` if a retired behaviour returns. And two tests
pinned the exact patch number, so every release of yours broke them while
telling nobody anything — they pin the line and the pack's own
self-consistency instead.

## v0.10.0 — 2026-08-25

Three things a real run showed were missing, and the two fixes the session
that found them had already written.

**A correction has to open a revision, and now it does.** "Every change
creates a NEW revision" is the first non-negotiable in this project's own
contract, and `new-revision` was a command nobody was obliged to run. A
proposal run put three corrections into one revision, which lived 2h 23m:
the template was rewritten, the render replaced, the review overwritten.
So there was no earlier state to roll back to, the two corrections survive
nowhere in the record, and `iterate-status` — which counts iterations by
walking the revision chain — saw one pass where there had been three. Every
loop bound was off for that run.

The signal is exact. A revision carrying a `visual-review.json` has had its
pass judged; rendering into it again is the moment a revision should have
been opened. A failed compile fixed and re-rendered inside the same pass is
not that, because there is no review yet. The refusal happens before Maven
starts, names the command that opens a revision, and leaves
`RENDER_SAME_REVISION=1` for someone who means it.

**Continuation pages stopped costing a process each.** The JVM that builds
the PDF was already rasterising page one in-process and then exiting, and
the harness launched a fresh `java -jar` for every page after it — once for
the clean render and again for the debug one. Measured: 1.7s per launch
against 0.22s of bare JVM startup, so a twelve-page document paid about
thirty-seven seconds of process starts on every loop pass.

`render` and `preview` both take `--pages` now and rasterise inside the
process that already has the document open. On a two-page PDF: 3324ms as
two launches, 1722ms as one — the second page costs about twenty
milliseconds. `import-reference` uses the same path, so a two-hundred-page
book reference is one launch rather than two hundred.

**Publishing accepted only one of the two filenames it produces.** The
render-runner pom has always taken either `generated-template.java` or the
Java-canonical class name, because an IDE renames the file the moment
anyone opens it. The publisher took the first only, so a revision that had
been opened in an IDE approved cleanly and then failed to publish — with
the approval already committed. It takes both now, canonical winning,
matching the pom's own condition.

**And a bundle could not be finished after that failure.** The README is
generated inside `approve-and-publish`, which correctly refuses to re-run
once the revision is APPROVED — so running `publish-template` standalone to
get past the failure above left no way to produce the README except by hand.
`--readme-only` locates the published bundle, regenerates it and verifies,
skipping approve and publish.

The last two are from the session that hit them; imported rather than
rewritten, because they were already right.

## v0.9.2 — 2026-08-25

The `v0.9.1` tag points at a commit whose own test suite fails, so it is
superseded rather than moved.

The smoke test added with the ImageMagick fix reached into
`tools/visual-diff/node_modules` for pngjs — present on a machine that has
run setup, absent on the runner, because the asset-resolver package has no
dependencies and its CI job installs none. It passed locally and failed CI
with `MODULE_NOT_FOUND`.

ImageMagick is already required for that test to mean anything, and it
reports its own pixel statistics exactly: mean alpha over the canvas for how
much of the glyph survived, peak red for whether it is still white. No
decoder, no dependency, same assertions — putting the argument order back
still trips it with the reason in the message.

## v0.9.1 — 2026-08-25

**A light icon rasterised to nothing.** `-background none` is a setting
the SVG delegate reads while rasterising, not an operation applied to the
result, and it sat *after* the input where it did nothing at all. The SVG
was therefore rendered onto white, and a trailing `-transparent white`
knocked that background out again — which works for a dark glyph and
destroys a light one. An icon requested with `color=#FFFFFF`, for a white
glyph inside a coloured badge, came back as a 542-byte PNG with not one
opaque pixel in it, because every pixel of it was white.

Ordering the flag correctly removes the white background *and* the need
to strip it, so `-transparent white` is gone rather than moved. Measured
on a white square: 542 bytes and 0 opaque pixels before, 809 bytes and
4872 after. A smoke test now rasterises a white glyph and a dark one and
asserts that the same number of pixels survives both — proven by putting
the argument order back, which trips it with the reason in the message.

Two things keep this small. It is the fallback path: icons have resolved
as SVG since `0.6.0`, and it is taken only for an SVG outside the
reader's subset. And none of the 151 PNG icons across the published
bundles and examples is empty, because none of them asked for a light
colour. But a fallback that silently produces a valid file containing
nothing is worse than one that fails, and nothing above it would notice.

Found by another session running a pre-`0.6.0` checkout, where every icon
was rasterised unconditionally.

## v0.9.0 — 2026-08-25

What a region *is* now decides how it may be built, and a multi-page
document has to have its page model decided rather than acquire one.

**A footer built with `bleedToEdge` is now a named finding.** From a real
proposal run:

```java
page.addSection("Footer", footer -> footer.spacing(0)
        .fillColor(INK)
        .bleedToEdge(DocumentEdge.LEFT, DocumentEdge.RIGHT, DocumentEdge.BOTTOM))
```

Bleeding extends a fill past the margin to the paper edge, which is the
opposite of the band a footer occupies, and a footer drawn as body
content appears on page one and nowhere else. The API for it exists and
is in the allow-list: `DocumentSession.footer(DocumentHeaderFooter)`.

The odd part is that the harness already knew. `visual-analysis.schema.json`
has described this contract all along, in the description of `role`:
page-header and page-footer "must map to DocumentSession.header/.footer …
never be drawn as body content". Two things kept it inert. `role` was
optional, so nothing wrote it — that run named a region `page-footer`,
labelled it "Footer band", and set `role` on none of its fourteen
regions. And one consumer read `role` at all, for `table-header` only.

`role` is required now, the enum names what documents are actually made
of (`table`, `image`, `icon`, `panel`, `divider` alongside the four that
were there), and `check-region-primitives` compares each region's role
against the render method the plan maps it to. A footer must not bleed
and must go through `footer(`; a header likewise; a table must be
`addTable`, not rows of shapes; `table-header` needs `repeatHeader`; an
image must be `addImage` and an icon `addSvgIcon`, because a rectangle or
a coloured disc the size of the thing matches its box and nothing inside
it. `content`, `background`, `panel` and `divider` carry no contract, and
that is deliberate.

Run against the same revision it came from, it finds the header too: the
analysis note reads "Repeats on both pages unchanged" and the template
builds it inside `page.addSection`, so page two loses it — while page
one, which is what the diff compares, is perfect.

**A multi-page document must decide its page model first.** A book's
first page is not its second: different margins, no running header, often
no page number. `DocumentSession.pageMargins(List.of(PageMarginRule.page(1,
DocumentInsets.zero())))` states that per page, `addPageBreak` puts a
break where the document means one, and `addSection` names a run of
pages. The architecture plan gained a `pagination` block — `pageModel` of
`uniform` / `first-page-different` / `sectioned`, plus what differs on
page one — required once the reference has more than one page.

**And where the flow may not break.** `keepTogether` keeps a block whole;
`keepWithNext` stops a heading being orphaned above its content or a
table header sitting alone at the foot of a page. Both are on
`SectionBuilder` and `ModuleBuilder`. Neither is discoverable from a
render: a template that only ever renders its one-page sample never
exercises a break, so the diff is silent and stays silent until real
content arrives. They go in the same block as `keepRules`, and a rule the
plan decided and the template never built is reported — that is worse
than an unwritten rule, because the plan says it is handled.

All of it runs inside `render-and-diff`, which v0.8.0 made unskippable,
and a finding downgrades a ready verdict the way a dead link does.

Every signature named above was verified against the 2.2 allow-list
before it was written into a contract.

## v0.8.0 — 2026-08-25

Every gate this harness has was optional, and nothing said so.

**A render nobody compared is no longer an iteration.** The page diff,
the footer band, the border topology, the link check and the
document-integrity check all live inside `render-and-diff`. Nothing
required it to have run. An agent that rendered with Maven itself, looked
at the PDF and wrote a review by eye produced a revision the harness
accepted in full — and one did: a real proposal run reached
`visual-review.json` with seven mismatches and carried no `diff.png`, no
`reference-scaled.png` and no `visual-diff-stats.json` at all. Five gates
skipped by not typing one command.

`iterate-status` now refuses to call such a revision ready. The verdict
becomes `REVISE`, the focus becomes `unmeasured-render`, and the report
carries `measurement: { rendered, measured }` as a fact rather than as a
consequence — a revision whose review already said REVISE is still
unmeasured, and saying otherwise would be the opposite of what happened.
`approve-and-publish` refuses outright, with the command that fixes it
and a way through for someone who means it, exactly as it already does
for a BLOCKED verdict.

The argument is the one the link check already makes, one level up. The
person approving is judging the render, and parity with the reference is
the one property judging the render cannot establish: they are looking at
the thing itself, not at the difference between it and what it was
rebuilt from. A review written from the render alone can be entirely
correct about everything it saw and still silent about the page it never
compared.

Judging the render is judgement. Having compared it first is not.

## v0.7.1 — 2026-08-25

A review of v0.7.0, which shipped hours earlier. Four defects, all in the
code that release added, plus one the icon question surfaced.

**A parent comparison that loses a page was blamed on the manifest.**
The two comparisons fail for different reasons and take different fixes.
Against the reference, a short render usually means `render.pages` was
never told how long the document is. Against the parent, the manifest is
not involved at all: the previous revision produced that page and this
one does not, which is exactly the regression the parent gate exists to
catch. It said *"the reference has 2 page(s) … set render.pages"* and
sent the reader to the wrong file.

**`render.pages` never corrected downward.** Importing a shorter
reference over a longer one left the old number, so a project that had
once carried a three-page reference rasterised three pages forever after
a one-page reference replaced it — two renders a pass that nothing
compares, reported as `extraInRender` on every loop. The field follows
the reference now, in both directions.

**The worst page was the biggest one.** Pages are not obliged to share a
size, and picking by raw pixel count let a large page that matches
out-score a small page that is entirely wrong. It picks by share.

**A missing directory resolved against the working directory.** The guard
in `page-pairs` was `?? ""`, which is worse than no guard: an empty path
made the count answer from whatever files happened to be in the process's
cwd. It also only covered the count, so the pairing then threw
`path.join(null, …)` — a Node type error naming neither the caller nor
the argument. Both cases are named refusals now.

**And an icon can ship as SVG missing part of itself.** GraphCompose's
reader draws no `<use>`, `<image>` or `<text>`, so an icon built from
them passes the compatibility check, keeps its geometry and loses the
rest. That is worse than a rasterised fallback because nothing fails: it
renders slightly wrong, and a few hundred wrong pixels are invisible in a
whole-page diff. It was recorded in the manifest and printed once,
mid-run, among every other icon's line. The resolver now repeats it at
the end, together with anything that fell back to PNG and why.

For the record, since the question came up: SVG has priority and it
works. Re-resolving the exact icon set from a run earlier today — the one
whose published bundle carries six PNGs — produces six SVGs, and a mixed
sample of twelve across mdi, entypo-social, simple-icons, logos, twemoji,
fluent-emoji, noto, lucide, tabler, ph and material-symbols produces
twelve. The PNGs on disk are from runs made before SVG-first landed in
`0.6.0`; the installed plugin was still `0.5.5` at the time.

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
