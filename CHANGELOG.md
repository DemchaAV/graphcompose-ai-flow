# Changelog

All notable changes to **GraphCompose AI Template Flow** are recorded here.
The project follows [Semantic Versioning](https://semver.org/) and stays in
`0.x` while the workflow stabilizes — skills are still `needs-validation`, and
the full visual-baseline pass is the gate to `1.0.0`.

## Unreleased

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
