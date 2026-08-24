# Architecture

This page describes the **target architecture** of GraphCompose AI
Flow: an installable harness for coding agents rather than a workflow
kit a human has to read and an agent has to interpret by hand.

> **Status: migration in progress.** Most of what follows is a
> contract being built, not a description of what ships today. The
> current, honest state is
> [implementation-status.md](implementation-status.md); the migration
> phases are tracked in [roadmap.md](roadmap.md) § Harness migration.
> Sections below marked *(planned)* do not exist yet.

## The core principle

The project does not build its own coding agent. Codex and Claude
Code already provide the model loop, reasoning, vision, filesystem
access, shell execution and context management. Rebuilding any of
that — an LLM API client, a model provider abstraction, a sandbox, a
context manager — would duplicate the host and add nothing.

What they do *not* provide is knowing how to reconstruct a document
with GraphCompose primitives, when a change needs a new revision, and
what "close enough to the reference" means. That is this project's
job.

> The host agent thinks and edits code. GraphCompose AI Flow decides
> **how** a GraphCompose task must be carried out.

```text
                    USER
                      │
                      ▼
           Codex / Claude Code
              host agent runtime
                      │
                      ▼
          GraphCompose AI Flow
            plugin / Agent Skills
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Skills      Workflow      Rules
          │                       │
          └───────────┬───────────┘
                      ▼
              deterministic tools
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
    renderer      visual-diff     assets
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                    Maven
                      │
                      ▼
                 GraphCompose
```

## Division of responsibility

Three layers, each owning something the other two must not
re-implement.

| Layer | Owns |
|---|---|
| **Codex / Claude Code** (host) | model, reasoning, vision, filesystem interaction, code editing, shell execution, context mechanics |
| **GraphCompose AI Flow** (harness) | workflow, GraphCompose knowledge, scope routing, revision semantics, iteration rules, verification, visual parity, acceptance criteria, publishing |
| **Deterministic tools** | compile, render, pixel diff, asset retrieval, revision persistence, publishing |

The practical test: anything a script can decide must not be left to
the model, and anything the model decides must be recorded in a file
a script can read back.

## From eleven agents to four skills

The repository historically described an 11-agent chain, with every
stage written as a prompt the host agent was expected to open and
follow. Most of those "agents" never needed a model at all — they
were deterministic steps in prose. The classification changes:

| Stage | Becomes |
|---|---|
| Orchestrator | host LLM capability |
| Version Resolver | deterministic tool |
| Skill Validator | deterministic tool |
| Visual Analyzer | LLM task |
| Architecture Mapper | LLM task |
| Asset Resolver | deterministic tool |
| Template Coder | LLM task |
| Test + Render | deterministic tool |
| Visual Review | deterministic metrics + LLM interpretation |
| Revision Manager | deterministic tool |
| Publisher | deterministic tool |

What remains is four workflow skills, one per user gesture, plus the
tools they call *(planned)*:

- **`create-template`** — "Create this document", "Recreate this
  screenshot", "Build a template from this reference". Runs the full
  chain: version → skills → visual analysis → architecture → assets →
  code → compile → render → diff → evaluate → revise loop.
- **`revise-template`** — "Make the header darker", "Change the
  email", "Use Lato", "Refactor this template". Routes by scope and
  runs only the stages that scope requires.
- **`review-template`** — "What's still different?", "Compare it with
  the screenshot". Evaluates the current state without opening a new
  revision.
- **`approve-template`** — "approve", "save". Almost no model
  involvement: flip DRAFT → APPROVED, supersede the previous
  APPROVED, publish the bundle.

GraphCompose API knowledge stays separate from workflow, in the
versioned skill packs under [`skills/versions/`](../skills/), and is
loaded selectively — a two-column CV needs rows, weights, sections,
typography and layer stacks, not the table and canvas documentation.

## The iteration loop

The heart of the harness. One mismatch per iteration, never a full
rewrite:

```text
       ┌──────────────────────┐
       │ Current Goal / Issue │
       └──────────┬───────────┘
                  ↓
             LLM changes
                  ↓
                build
                  ↓
               render
                  ↓
                diff
                  ↓
              evaluate
                  ↓
         ┌────────┴────────┐
         ↓                 ↓
      REVISE             READY
         │                 │
         └────── loop      ↓
                       user approval
```

Each pass: find the biggest actionable mismatch, fix only that,
compile, render, measure, evaluate, repeat.

### Deterministic gates

The model does not get to declare success. Each scope has a gate a
script decides:

| Scope | Gate |
|---|---|
| refactor-only | `magick compare -metric AE` == 0 against the parent |
| data-only | difference allowed in the affected regions, AE == 0 everywhere else |
| asset-only | difference allowed in the asset regions, AE == 0 everywhere else |
| visual-change / theme-only | layer-by-layer review against the reference image |
| any | compilation exit code 0 |

"Looks identical" is not a verdict; the metric is quoted verbatim.

### Bounds and failure categories

An agent must not iterate forever. The bounds are declared in
`config/pipeline.json`; enforcing them is still *(planned)*:

```text
maxIterations: 8
maxConsecutiveBuildFailures: 3
maxSameMismatchAttempts: 3
```

When a bound is hit, or the work cannot proceed, the run stops with a
category rather than a vague apology: `BUILD_FAILED`,
`RENDER_FAILED`, `ASSET_FAILED`, `VISUAL_MISMATCH`,
`GRAPHCOMPOSE_API_LIMITATION`, `MISSING_REFERENCE_INFORMATION`,
`ITERATION_LIMIT`.

## Contracts

Two rules keep the harness from drifting apart.

**One routing source.** Which stages a scope runs, and which gate it
ends on, is declared once in [`config/pipeline.json`](../config/pipeline.json)
and read through `scripts/lib/pipeline-config.mjs`. The same routing
used to be written in three places — `scripts/run-pipeline.mjs`, the
orchestrator prompt and `schemas/revision.schema.json` — and the docs
had already drifted apart on how many agents the chain even has. The
prompt and the schema now point at the config instead of restating
it, and `scripts/test/pipeline-config.test.mjs` fails the build when
a copy comes back. The config also carries the iteration bounds and
failure categories below, so the loop reads its own limits.

**JSON is the machine source of truth; Markdown is the human view.**
The loop has to read decisions back, and prose is not readable by a
script. Every stage that produces a judgement writes a schema-validated
`.json` first, and the `.md` beside it is the rendering of that file.
The schemas live in [`schemas/`](../schemas/) and are enforced by the
repo-wide validator; the stages that populate them are being migrated
phase by phase:

```text
orchestration-decision.json    →  routing decision
visual-analysis.json           →  regions, ratios, anchors
architecture-plan.json         →  region → render method → primitives
visual-review.json             →  verdict, score, ranked mismatches
```

A verdict is therefore a structure, not a paragraph:

```json
{
  "schemaVersion": 1,
  "verdict": "REVISE",
  "score": 91,
  "mismatches": [
    {
      "id": "header-height",
      "region": "header",
      "component": "renderHeader",
      "severity": "MAJOR",
      "reason": "Header is taller than reference",
      "action": "Reduce vertical padding"
    }
  ]
}
```

The next iteration then works on `renderHeader`, and repeated attempts
at the same `id` are what `maxSameMismatchAttempts` counts.

The schemas are deliberately asymmetric: they require the
decision-bearing fields — a verdict, a region id, a render method —
and leave everything descriptive optional. The Markdown stays the
richer document; the JSON stays cheap enough that an agent produces it
without ceremony.

## Workspace: where the harness ends and the work begins

Two roots were conflated while this repository *was* the workspace,
both of them called `repoRoot`:

| Root | Holds | Resolved from |
|---|---|---|
| **install root** | `prompts/`, `skills/`, `config/`, `schemas/`, `tools/` — the harness itself | the script's own location, always |
| **workspace root** | projects, revisions, references, published bundles — the user's work | the resolution order below |

Inside this repo they are the same directory, which is why the
distinction never had to exist. Once the harness is installed as a
plugin they are not: the tools live in the plugin directory and the
work belongs to whichever Java project the user has open. Anything
reaching for a project asks
[`scripts/lib/workspace.mjs`](../scripts/lib/workspace.mjs); joining
`examples/` onto the install root is now a bug.

A workspace is a directory inside the user's Java project:

```text
my-java-app/
├── pom.xml                        the GraphCompose pin lives here
├── src/main/java/…
└── graphcompose-flow/             the workspace
    ├── flow.config.json           manifest — presence marks the workspace
    ├── projects/<project-id>/     template-project.json, reference/, revisions/
    └── templates/<template-id>/   published bundles
```

It is a visible directory rather than a dotfile because its contents
are work product the user reviews, edits and commits — revisions, data
JSON, rendered previews — not tool internals to be hidden away.

Resolution order, first match wins:

1. an explicit `--root`
2. the `GRAPHCOMPOSE_FLOW_ROOT` environment variable
3. a `graphcompose-flow/flow.config.json` found by walking up from the
   current directory — so standing anywhere inside the Java project
   works with no flags
4. the install root's own `examples/` and `templates/` — development
   mode, which is how this repository keeps dogfooding the same code
   path it ships

Every command prints which workspace it resolved and how, except in
development mode where the answer is "the repository you are standing
in".

The GraphCompose version comes from the user's build file, not from a
prompt: [`scripts/resolve-version.mjs`](../scripts/resolve-version.mjs)
reads `pom.xml` or `build.gradle(.kts)`, finds the
`io.github.demchaav:graph-compose` (or JitPack) coordinate, and maps
its major.minor line to a pack under `skills/versions/`. A line with
no pack exits `3` and says so. It is never rounded to the nearest pack
that happens to exist — authoring against a different line's allow-list
produces calls that do not compile, so an honest gap beats a
confident wrong answer.

## Target repository shape

```text
graphcompose-ai-flow/
├── AGENTS.md                  dispatcher only — identify the task, point at a skill
├── README.md                  install → drop reference → ask
│
├── config/
│   └── pipeline.json          scope → stages, limits, failure categories
│
├── skills/
│   ├── workflows/             create / revise / review / approve
│   └── versions/              GraphCompose API knowledge, per version
│
├── adapters/
│   ├── claude/
│   └── codex/
│
├── .claude-plugin/
│   └── plugin.json            Claude Code packaging
│
├── schemas/                   revision, orchestration, visual-analysis,
│                              architecture-plan, visual-review
├── tools/                     revision-manager, preview-renderer,
│                              visual-diff, asset-resolver
├── scripts/                   render, verify, publish
├── docs/
├── examples/
└── templates/
```

The workflow, skills, schemas and tools are shared. The adapters are
thin: packaging differences between hosts must never fork the
workflow.

## Deliberately out of scope

Each of these is a real option that was considered and declined for
the first version, because the host or a plain CLI already covers it:

- **No LLM API integration.** No `OPENAI_API_KEY`, no
  `ANTHROPIC_API_KEY`, no model provider, no token manager. The user
  already runs a host that supplies the model.
- **No MCP server.** The host can already reach the filesystem,
  shell, Maven, Node, Java and Git; an Agent Skill invoking a
  deterministic CLI is enough. MCP earns its place only if remote
  services appear — a hosted renderer, a template registry, remote
  documentation search.
- **No standalone runtime.** A `graphcompose-flow run …` binary
  outside Codex/Claude would require the agent loop, sandbox and
  context manager this architecture exists to avoid.
- **No CI Action yet.** A `graphcompose-verify` GitHub Action that
  compiles, renders and diffs on pull requests is a good product
  layer, but it follows the plugin MVP rather than preceding it.

## Where to read next

- [roadmap.md](roadmap.md) — migration phases and their status
- [workflow.md](workflow.md) — the per-step pipeline contract
- [revision-model.md](revision-model.md) — revision metadata and statuses
- [visual-accuracy-contract.md](visual-accuracy-contract.md) — parity rules and mismatch classification
- [versioned-skills.md](versioned-skills.md) — skill packs as versioned contracts
- [implementation-status.md](implementation-status.md) — what actually works today
