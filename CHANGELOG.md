# Changelog

All notable changes to **GraphCompose AI Template Flow** are recorded here.
The project follows [Semantic Versioning](https://semver.org/) and stays in
`0.x` while the workflow stabilizes — skills are still `needs-validation`, and
the full visual-baseline pass is the gate to `1.0.0`.

## Unreleased

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
