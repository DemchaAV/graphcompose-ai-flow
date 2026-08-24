# GraphCompose AI Flow

[![ci](https://github.com/DemchaAV/graphcompose-ai-flow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DemchaAV/graphcompose-ai-flow/actions/workflows/ci.yml)

Install a GraphCompose harness into your coding agent. Drop in a
document reference. Ask Codex or Claude Code to recreate it. The agent
generates, renders, compares and iterates until the template is ready
for your approval.

```text
Create a GraphCompose CV template from resume.png
```

The output is not a drawing that happens to match one screenshot. It is
a maintainable Java template built from semantic GraphCompose primitives
— sections, rows, weights, anchors — with the content in a JSON data
file, the assets resolved and recorded, and every revision kept.

---

## Install

### Claude Code

```text
/plugin marketplace add DemchaAV/graphcompose-ai-flow
/plugin install graphcompose-flow@graphcompose
```

Then, once: `npm run setup` — two of the tools are TypeScript compiled
into `dist/`, which is not committed, so a fresh install has no build
output. Until setup has run, those two exit with code 69 and say so.
Full instructions and troubleshooting:
[`docs/plugin-installation.md`](docs/plugin-installation.md).

### Codex

```bash
git clone https://github.com/DemchaAV/graphcompose-ai-flow
cd graphcompose-ai-flow
npm run setup
node adapters/codex/install.mjs
```

That copies the runtime to `~/.codex/graphcompose-flow/<version>/` and
installs four skills pointing into it, so **the clone is not needed
afterwards** — move it, rename it or delete it and the skills keep
working. See [`adapters/codex/README.md`](adapters/codex/README.md).

You need Node 20+, Java 21+, Maven and ImageMagick, plus a Java project
that pins GraphCompose — the version in *your* build file decides which
skill pack the agent authors against.

## Use

Open your Java project in the agent, give it the reference, and say what
you want. The skills fire from the words, so no command is needed:

| You say | What happens |
|---|---|
| "Create this in GraphCompose" (+ a screenshot) | analyse → architecture → assets → code → compile → render → diff → fix the largest mismatch → repeat |
| "Make the sidebar wider" | a new revision under the narrowest scope that fits, gated against the right baseline |
| "What's still different?" | a measured verdict and a ranked mismatch list, without changing anything |
| "approve" | DRAFT → APPROVED, the previous approved superseded, the bundle published |

See [`docs/demo.md`](docs/demo.md) for a real transcript of the
deterministic half — version resolution, workspace creation, the chain,
the loop gate.

## What it produces

A two-page CV, reconstructed from the reference on the left. The third
column is the same render with the layout guides on, which is what the
review pass reads:

| Reference | Rendered | With layout guides |
|---|---|---|
| ![reference page 1](examples/cv-reference/reference/reference-page-1.png) | ![rendered page 1](templates/mint-editorial-cv/preview/output-page-1.png) | ![debug page 1](templates/mint-editorial-cv/preview/output-debug-page-1.png) |
| ![reference page 2](examples/cv-reference/reference/reference-page-2.png) | ![rendered page 2](templates/mint-editorial-cv/preview/output-page-2.png) | ![debug page 2](templates/mint-editorial-cv/preview/output-debug-page-2.png) |

Source: [`examples/cv-reference/`](examples/cv-reference/) — reading its
revisions 001 → 009 in order shows what the loop actually does. Result:
[`templates/mint-editorial-cv/`](templates/mint-editorial-cv/), a bundle
you can copy into your own project.

## How it works

The host agent supplies the model, the reasoning and the shell. This
project supplies the workflow, the GraphCompose knowledge and the gates.
Anything a script can decide is decided by a script:

```text
   your words              the loop                        the gate
   ──────────              ────────                        ────────
   reference    →   analyse · architect · code   →   render · diff · evaluate
                              ↑                              │
                              └────── fix one mismatch ──────┘
                                                             │
                                              READY_FOR_APPROVAL / BLOCKED
```

Four things make that more than a prompt:

- **The version decides the API.** `scripts/resolve-version.mjs` reads
  your `pom.xml` or `build.gradle`, maps the line to a skill pack, and
  stops if there is no pack — rather than authoring against an API your
  version does not have.
- **The gate is arithmetic.** A refactor must produce `AE == 0` against
  its parent. A data edit may differ only in the regions it touched. The
  metric is quoted, never paraphrased.
- **The loop is bounded.** `scripts/iterate-status.mjs` counts the
  iterations, the consecutive build failures and the repeats of the same
  mismatch, and answers 0 ready / 2 revise / 3 blocked. An agent going
  round in circles is the last thing qualified to notice it.
- **Nothing is overwritten.** Every change opens a revision; approving
  supersedes rather than replaces; a single component can be restored
  from any earlier one.

[`docs/architecture.md`](docs/architecture.md) has the full picture,
including what this project deliberately does **not** build: no LLM API
integration, no MCP server, no standalone runtime.

## What is honest about the current state

- The four workflow skills, the tools, the schemas, the packaging and
  the CI gates are in place; `npm run verify` runs every gate locally.
  The eleven-agent prompt chain they replaced has been removed.
- The **acceptance runs are outstanding**: whether the skills fire
  unprompted in a clean project, in each host, has not yet been recorded.
- The GraphCompose **2.2 pack ships** and its five fixtures compile,
  test and render against 2.2.0 with every render identical to its
  baseline. The conceptual skills stay `needs-validation` on coverage —
  five fixtures are a subset of what fifteen skills describe. See
  [`skills/README.md`](skills/README.md).
- Details and scope limits: [`docs/limitations.md`](docs/limitations.md),
  progress: [`docs/roadmap.md`](docs/roadmap.md).

## For agents

[`AGENTS.md`](AGENTS.md) dispatches: which skill owns the task, the
seven invariants, the commands, and where each contract is declared.
Start there, not here.

## Working on the harness itself

Clone it, run `npm run setup`, and read
[`docs/quickstart.md`](docs/quickstart.md) — that is the contributor
path, where the workspace is this repository's own `examples/` rather
than a user's project. `npm run verify` runs every gate CI runs.

## Repository

| Path | What |
|---|---|
| [`skills/workflows/`](skills/workflows/README.md) | the four workflow skills and their shared references |
| [`skills/versions/`](skills/) | GraphCompose knowledge, one pack per library line |
| [`config/pipeline.json`](config/pipeline.json) | scope → stages, gates, loop bounds, failure categories |
| [`schemas/`](schemas/) | every on-disk contract |
| [`tools/`](tools/) | revision manager, renderer, visual diff, asset resolver |
| [`scripts/`](scripts/) | version resolver, workspace init, render, pipeline, loop gate, publish, verify |
| [`examples/cv-reference/`](examples/cv-reference/) | a worked chain — revisions 001 → 009 |

## License

[MIT](LICENSE).
