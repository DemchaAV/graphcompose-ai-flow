# AGENTS.md — start here

Agent: this file dispatches. It tells you which skill owns your task and
where each contract is declared. It does not restate the contracts —
everything below is a pointer, and where a pointer and this page ever
disagree, the pointer wins.

## What this project is

A harness that turns a document reference — a screenshot, a PDF, a
design image — into a maintainable GraphCompose Java template, then
renders it, compares it against the reference, and iterates until it is
ready for approval.

It is not a code generator you run once. The loop is the method: a first
render never matches, and the value is in the measured comparison and
the one-fix-per-pass cycle that follows.

The harness supplies workflow, GraphCompose knowledge and gates. The
host agent (Claude Code, Codex) supplies the model, the reasoning and
the shell. Deterministic work — version resolution, asset fetching,
rendering, diffing, revision bookkeeping, publishing — is done by CLIs,
not by prose. See [`docs/architecture.md`](docs/architecture.md).

## Is this a GraphCompose task?

Yes, if the user wants a document produced or changed and the project
pins `io.github.demchaav:graph-compose`. Check with:

```bash
node scripts/resolve-version.mjs --project-dir <java-project> --json
```

Exit 0 means there is a skill pack for their pinned line. Exit 3 means
there is not — stop and say so; authoring against another line's
allow-list emits calls that do not compile. Exit 4 means the project
does not use GraphCompose, so this is not your task.

## Which skill

| The user wants | Skill |
|---|---|
| **To use a template that already exists** | no skill — `node scripts/templates.mjs`, then `use-template`. Check this **first**: reuse is a file copy, reconstruction is the whole loop. See [Template Reuse First](skills/workflows/references/scope-routing.md#template-reuse-first--before-any-scope) |
| A template from a reference they supplied | [`create-template`](skills/workflows/create-template/SKILL.md) |
| An existing template changed | [`revise-template`](skills/workflows/revise-template/SKILL.md) |
| To know what is still different | [`review-template`](skills/workflows/review-template/SKILL.md) |
| To accept the current draft | [`approve-template`](skills/workflows/approve-template/SKILL.md) |
| To undo, revert, or restore one component | no skill — `graphcompose-flow undo` / `revert-approved` / `restore-component` |

Read the skill before acting. Each is short and links to the four shared
references: [workspace](skills/workflows/references/workspace.md),
[scope routing](skills/workflows/references/scope-routing.md),
[the iteration loop](skills/workflows/references/iteration-loop.md),
[authoring rules](skills/workflows/references/authoring-rules.md).

## Core invariants

Seven rules. Everything else is judgement.

1. **Never invent GraphCompose API.** The pinned pack's
   `00-api-surface.md` is a closed set: absent means it does not exist.
   If a skill disagrees with the library, the skill is wrong.
2. **Every change opens a new revision.** Never overwrite an APPROVED
   one. Statuses are owned by `tools/revision-manager`, not by editing
   `revision.json`.
3. **Derive geometry, do not hardcode it.** Widths and weights come from
   a small set of base constants. A pixel value is for a genuinely
   independent dimension only.
4. **Anchor, do not compute offsets.** `LayerAlign`, `TextAlign`,
   `weights(...)`. A computed offset bakes today's font metrics into the
   template.
5. **Content lives in `<doc-kind>-data.json`**, behind a typed spec. If
   changing an email means editing Java, the contract is broken.
6. **Prove parity, do not assert it.** "Looks identical" is not a gate
   result; `magick compare -metric AE == 0` is. Quote the metric.
7. **One visible region, one named render method.** That name is what
   review, `changedComponents` and selective rollback all address.

## Commands

Every command is a plain `node …` invocation, so it runs unchanged in
PowerShell, cmd and bash.

| Do | Command |
|---|---|
| **Start here in a new run** | `node scripts/preflight.mjs --project-dir <dir> [--project <id>]` |
| Does this API exist? | `node scripts/api-query.mjs --exists <Type>.<method>` — exit 0 yes, 3 no |
| What is there for a topic? | `node scripts/api-query.mjs --version 2.2 --query footer` |
| Regenerate the allow-list from the pinned jar | `node tools/api-surface/extract-api.mjs --version <x.y.z>` (`--check` to compare) |
| Does any skill still teach a superseded construction? | `node scripts/check-knowledge-drift.mjs` — exit 1 names the passage and the primitive that replaced it (also runs inside `npm run verify`) |
| Resolve version and skill pack | `node scripts/resolve-version.mjs --project-dir <dir> --json` |
| Create the workspace (first thing in a new project) | `node scripts/init-workspace.mjs --project-dir <dir> --project <id>` |
| Print the chain for a project | `node scripts/run-pipeline.mjs <project-id>` |
| Open a revision | `node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<gesture>" --project <dir>` |
| One loop pass: render + diff + verdict | `node scripts/render-and-diff.mjs --project <id> --revision <id>` — exit 0 ready, 2 revise, 3 blocked |
| Render only | `node scripts/render.mjs <project-id> <revision-id> [--root <workspace>]` |
| Generate an artifact's reading copy | `node scripts/render-artifact-md.mjs --revision <revision-dir>` |
| Ask how the library behaves | `node scripts/probe.mjs --list` · `node scripts/probe.mjs <name>` — how *GraphCompose* behaves, by running it. For how *this template* laid out, use `layout.mjs` below |
| What previous runs learned about a call | `node scripts/observations.mjs find <symbol>` — exit 0 with the workaround, 3 if nothing is on record |
| What previous runs learned | `node scripts/observations.mjs list` · `verify` — each record says whether it was `learned here` or `shipped` |
| Record what *this* run learned | `node scripts/observations.mjs record <file.json>` — writes into the **workspace**, never the install tree. The install tree is one plugin version's payload and is replaced on upgrade; a finding written there is lost at the next release |
| Which build is this pin, really? | `node scripts/resolve-version.mjs --project-dir <dir> --json` → `artifact`. A `-SNAPSHOT` names no single build: `preflight` exits **6** until someone records `--accept-build --decision "..."`, and that acceptance binds to the jar it was given for |
| Crop both images to one region | `node tools/visual-diff/bin/crop-region.mjs --revision <dir> --region <id>` |
| Measure a diff | `node tools/visual-diff/bin/visual-diff.mjs <reference.png> <output.png> --json --update-revision <revision>` |
| Ask whether the loop may continue | `node scripts/iterate-status.mjs <project-id>` — exit 0 ready, 2 revise, 3 blocked |
| Are the links in the data live in the render? | `node scripts/check-links.mjs --project <id> --revision <id>` — exit 0 clean, 1 a declared href is missing (also runs inside the two composites) |
| Is a multi-page document whole? | `node scripts/check-document-integrity.mjs --project <id> --revision <id>` — page count, "Page N of M", content preservation (runs inside render-and-diff) |
| Do the render and the reference draw the same rules? | `node scripts/check-border-topology.mjs --project <id> --revision <id> --region <id>` — a missing internal divider may be the design; this says which side is missing it |
| Where did this node end up? | `node scripts/layout.mjs inspect <node> --project <id> --revision <id>` — placement box, computed content box, insets and page, for the node you name (`Languages`, not its full path) |
| **Why** is it there? | `node scripts/layout.mjs explain <node> <coordinate>` (x, y, width, height, contentX, contentY) — the additive chain, naming every node that contributes. Says `not derivable` when the snapshot cannot answer, rather than estimating |
| Was the text set in the font the style asked for? | `node scripts/layout.mjs inspect <node> …` reports `declaredFont → resolvedFont` when they differ. A standard-14 face like `Helvetica-Bold` is an alias of its family, so it renders regular and nothing else reports it. Needs GraphCompose 2.2.2+ |
| Which font family is that? | `node scripts/typography.mjs match --reference <crop.png> --text "<string>"` — sets every candidate in one render and ranks them by how wide the string runs and by the letterforms. Reports the gap to the runner-up, because a photo finish is not a result |
| What size is that text? | `node scripts/typography.mjs search --reference <crop.png> --text "<string>" --family <NAME> --from 9 --to 12 --step 0.25 --scale <px-per-point>` — returns the best value **and the curve**; a flat curve says the measurement cannot separate the candidates, so do not re-render to find out |
| Is this layout built the way it will need to be changed? | `node scripts/layout.mjs doctor --project <id> --revision <id>` — geometry that sits on children when one value on the parent would say it once. Evidence, exit 0 either way; complements `check-structural-smells.mjs`, which reads the source and can tell a repeated literal from one shared constant |
| What would a change to this node reach? | `node scripts/layout.mjs impact <node> …` — its children, deeper descendants, and the siblings stacked after it. Structural reach only; what the page then looks like needs a re-render |
| **What kind of thing is wrong?** | `node scripts/evidence.mjs --project <id> --revision <id> --region <id>` (`--mismatch <id>`, `--all`) — joins the reference regions, the measured pixel difference and the layout snapshot into ~4 KB: the owning node, its displacement, and the properties that produced its position. Assigns only what two measurements settle; `UNKNOWN` with candidates otherwise |
| Did the patch move only what it meant to? | `node scripts/layout.mjs diff <revA> <revB> --project <id>` (`--region <node>` to scope) — separates what a person edited from what the engine then computed, and names anything that moved with no edit to explain it. Evidence, exit 0 either way (runs inside `render-and-diff`) |
| Where did every node actually end up? | `<revision>/layout-snapshot.json` — GraphCompose's own post-layout measurement, written by the renderer. Needs GraphCompose 1.6.0+; the render log says so when a project pins older. **Query it with `layout.mjs`; never read it into context** — 227 KB for a one-page CV |
| Is the geometry on the right node? | `node scripts/check-structural-smells.mjs --project <id> --revision <id>` — siblings repeating an inset that belongs on their parent, negative-margin clusters, a hand-built timeline. Evidence, exit 0 either way (runs inside `render-and-diff`) |
| Import the reference (png/jpg/webp/pdf) | `node scripts/import-reference.mjs --project <id> --file <path>` — also measures the page: exit 0 a standard matched, **5 the page size is a question to put to the user before designing** |
| Is the page size settled? | `node scripts/page-size.mjs --project <id>` — exit 0 settled, 5 unanswered; `--use <A4\|LETTER\|LEGAL\|WxH> --decision "..."` records the user's answer once, for every later revision |
| Approve and publish | `node scripts/approve-and-publish.mjs --project <id>` — one command: approve, publish, README, verify |
| Verify a published bundle | `node scripts/verify-published-template.mjs --template-id <id> --render` |
| **What has already been published?** | `node scripts/templates.mjs` (`--json` for an agent) — ask this before rebuilding a layout the user names |
| How do I use a published bundle? | `node scripts/templates.mjs inspect <template-id>` — classes, data file, assets, dependencies, and the call, from the manifest |
| Put a published template into a project | `node scripts/use-template.mjs <template-id> --target <java-project>` — copies the sources, assets and data, then reports what the build file is missing. It never edits the build file |
| A runnable project from a published template | `node scripts/use-template.mjs <template-id> --new-project <dir>` — pom, runner, sources, data, README; compiles it before reporting success |
| Report what a run cost | `node scripts/telemetry/run-metrics.mjs report --project <id>` |
| Recount the corpus, for a before/after | `node scripts/telemetry/run-metrics.mjs baseline` — needs no session, so anyone can re-derive it later; the recorded numbers are in [`docs/benchmarks.md`](docs/benchmarks.md) |
| Run every gate locally | `npm run verify` (`--quick` skips Java/Maven) |

Exit 69 from `graphcompose-flow` or `visual-diff` means the tools are
not built: run `npm run setup`.

## Where things are declared

Each of these is declared once. Do not restate them anywhere.

| Contract | Declared in |
|---|---|
| Which stages a scope runs, its gate, the loop bounds, the failure categories | [`config/pipeline.json`](config/pipeline.json) |
| What GraphCompose can do, per version | [`skills/versions/`](skills/) — start at the pack's `00-loading-map.md` |
| The shape of every on-disk artifact | [`schemas/`](schemas/) |
| Where the work goes | [`scripts/lib/workspace.mjs`](scripts/lib/workspace.mjs) |

## Where state lives

Work belongs to the user's project, not to this repository:

```text
<their Java project>/
└── graphcompose-flow/
    ├── flow.config.json           marks the workspace
    ├── projects/<project-id>/     template-project.json, reference/, revisions/
    └── templates/<template-id>/   published bundles
```

`node scripts/init-workspace.mjs --project-dir <dir>` creates it. Nothing
else does, and without it commands fall back to the harness install's own
`examples/` — so the work would be written into the installed runtime.

Commands find it by walking up from the current directory; override with
`--root` or `GRAPHCOMPOSE_FLOW_ROOT`. Inside a clone of this repository
the workspace is its own `examples/` and `templates/`, which is correct
here and nowhere else. Every command prints which workspace it resolved
and how — believe that line.

## Working on the harness itself

Template work flows normally. Changes to the harness — `scripts/`,
`tools/`, `skills/`, `config/`, `schemas/`, the docs — go on a topic
branch and merge to `main` when finished; `main` is the clean state
renders come from. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

Before committing: `npm run verify`.

## Documentation map

- [`docs/architecture.md`](docs/architecture.md) — the layer split, the loop, the contracts, what is deliberately excluded
- [`docs/plugin-installation.md`](docs/plugin-installation.md) — installing into Claude Code
- [`adapters/codex/README.md`](adapters/codex/README.md) — installing into Codex
- [`docs/workflow.md`](docs/workflow.md) — the sixteen steps in full
- [`docs/revision-model.md`](docs/revision-model.md) · [`docs/rollback.md`](docs/rollback.md) — statuses, undo, selective rollback
- [`docs/visual-accuracy-contract.md`](docs/visual-accuracy-contract.md) — mismatch classification
- [`docs/limitations.md`](docs/limitations.md) · [`docs/roadmap.md`](docs/roadmap.md) — honest scope, and what is coming
- [`docs/benchmarks.md`](docs/benchmarks.md) — the measured baseline, and the protocol for the next one
- [`examples/cv-reference/`](examples/cv-reference/) — a worked chain; reading revisions 001 → 009 shows what iteration actually looks like

> **Historical:** the eleven-agent prompt chain this harness replaced,
> and the document describing it, have both been removed. They are in git
> history before the removal commit; `CHANGELOG.md` records what replaced
> them.
