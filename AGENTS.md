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
| Resolve version and skill pack | `node scripts/resolve-version.mjs --project-dir <dir> --json` |
| Create the workspace (first thing in a new project) | `node scripts/init-workspace.mjs --project-dir <dir> --project <id>` |
| Print the chain for a project | `node scripts/run-pipeline.mjs <project-id>` |
| Open a revision | `node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<gesture>" --project <dir>` |
| Render | `node scripts/render.mjs <project-id> <revision-id> [--root <workspace>]` |
| Generate an artifact's reading copy | `node scripts/render-artifact-md.mjs --revision <revision-dir>` |
| Measure a diff | `node tools/visual-diff/bin/visual-diff.mjs <reference.png> <output.png> --json --update-revision <revision>` |
| Ask whether the loop may continue | `node scripts/iterate-status.mjs <project-id>` — exit 0 ready, 2 revise, 3 blocked |
| Approve and publish | `graphcompose-flow approve <id> --project <dir>` then `node scripts/publish-template.mjs --project <id>` |
| Verify a published bundle | `node scripts/verify-published-template.mjs --template-id <id> --render` |
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
- [`examples/cv-reference/`](examples/cv-reference/) — a worked chain; reading revisions 001 → 009 shows what iteration actually looks like

> **Historical:** the eleven-agent prompt chain this harness replaced,
> and the document describing it, have both been removed. They are in git
> history before the removal commit; `CHANGELOG.md` records what replaced
> them.
