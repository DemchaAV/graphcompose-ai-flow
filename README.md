# GraphCompose AI Template Flow

[![ci](https://github.com/DemchaAV/graphcompose-ai-flow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DemchaAV/graphcompose-ai-flow/actions/workflows/ci.yml)

**Turn visual document references into maintainable GraphCompose Java templates.**

This is not a magic screenshot-to-code app. It is a local workflow kit that
helps an AI agent analyze a reference, generate a semantic GraphCompose
template, render it, compare it visually, revise it, and publish an approved
template bundle. See [docs/quickstart.md](docs/quickstart.md) for the 5-minute
setup.

**Works for any document kind** GraphCompose primitives can express — CV,
cover letter, invoice, proposal, report, brochure, datasheet, single-page
brand collateral. The four canonical template surfaces upstream are
first-class targets as of GraphCompose 1.6.6:

| Surface | Generation | Shape |
|---|---|---|
| `cv` | V2 layered | data → theme → components → widgets → preset orchestrator |
| `coverletter` | V2 layered | pairs with a CV preset (shared `CvIdentity` + `CvTheme`) |
| `invoice` | V1 classic | single canonical `InvoiceTemplate` interface, swap-in presets |
| `proposal` | V2 single-preset | one preset (`ModernProposal`) + flat `ProposalSpec` |

Anything outside the four routes through the same generic skill pack
and DSL primitives. Reference examples skew toward CV today because
those were the first end-to-end runs — the pipeline itself is
document-kind agnostic by design.

![GraphCompose AI Template Flow — visual reference on the left, the 11-agent semantic GraphCompose mapping in the middle, the rendered template on the right](assets/readme/graphcompose-ai-flow.png)

## What you can run now

- Render the [invoice reference example](examples/invoice-reference/) — three committed revisions with real `output.pdf` / `output.png`.
- Render the [two-page CV reference example](examples/cv-reference/) end-to-end, with bundled `Poppins`, Iconify icons, and `mailto:` links.
- Inspect revision history with the [`revision-manager`](tools/revision-manager/) CLI (`list`, `diff`, `undo`, `revert-approved`, `restore-component`).
- Copy the published [`mint-editorial-cv`](templates/mint-editorial-cv/) bundle (Java source + data JSON + assets + previews + README) into your own project.

## Example output

The CV reference flows through the pipeline and lands in a published bundle.

| Reference | Rendered (clean) | Rendered (debug overlay) |
|---|---|---|
| ![reference page 1](examples/cv-reference/reference/reference-page-1.png) | ![rendered page 1](templates/mint-editorial-cv/preview/output-page-1.png) | ![debug page 1](templates/mint-editorial-cv/preview/output-debug-page-1.png) |
| ![reference page 2](examples/cv-reference/reference/reference-page-2.png) | ![rendered page 2](templates/mint-editorial-cv/preview/output-page-2.png) | ![debug page 2](templates/mint-editorial-cv/preview/output-debug-page-2.png) |

Source reference: [`examples/cv-reference/`](examples/cv-reference/) → published bundle: [`templates/mint-editorial-cv/`](templates/mint-editorial-cv/).

## Current status

| Area | Status |
|---|---|
| Revision manager CLI | Working |
| Preview renderer (PDF/PNG + GraphCompose render path) | Working |
| Visual diff CLI | Working |
| Invoice reference example | Renders, 3 committed revisions |
| CV reference example | Renders end-to-end |
| Published template bundle (`mint-editorial-cv`) | Available |
| GitHub Actions CI matrix | Green (Node 20 + Java 21 + Maven) |
| Full visual baseline orchestration | In progress |
| Skills under `skills/versions/graphcompose-1.6/` | `needs-validation` until baseline pass lands |

Full claim-vs-reality matrix: [`docs/implementation-status.md`](docs/implementation-status.md).

## For AI agents

If you are an AI agent picking up this repository, read [`AGENTS.md`](AGENTS.md)
FIRST. It is the onboarding file — explains the 11-agent chain, the
user-gesture dispatch table, the cross-cutting principles (relational
geometry, engine anchors, data-spec contract, parity gate), and where every
artifact lives.

---

A strict AI-assisted visual matching workflow for turning document references
into maintainable GraphCompose Java templates.

AI-generated document code often becomes coordinate soup.

This project explores a stricter approach.

Instead of asking an AI agent to draw PDF elements with raw coordinates, the
agent is given a visual reference and must reconstruct it using GraphCompose
semantic primitives: sections, rows, tables, themes, layer stacks, shape
containers, layout snapshots, and visual regression checks.

The goal is strict visual parity with the reference.

Every generated output is rendered, compared, reviewed, revised, and stored as
a revision.

GraphCompose becomes the target language for the agent.

The agent does not just draw.

The agent builds a maintainable document template.

## What this is

This repository documents and demonstrates an experimental workflow where AI
agents analyze a visual reference, map it onto GraphCompose primitives,
generate Java template code, render the result, compare the output against
the reference, revise the template, and preserve revision history with
support for undo, revert-to-approved, and selective rollback.

This is a companion/lab repository for GraphCompose. It does not modify
GraphCompose core.

## Quickstart

New users should start with [docs/quickstart.md](docs/quickstart.md).
It explains what this repository is, how to install the local tooling,
how to render the invoice example, and how to start a new document
project.

## Why this exists

AI-generated PDF code tends to drift toward raw coordinates and one-shot
draw calls. Those outputs are hard to read, hard to revise, and impossible to
diff in a meaningful way.

GraphCompose offers a semantic document language. By forcing the agent to
target that language under a strict visual-matching contract, the workflow
yields document templates that are reviewable, testable, and revisable like
any other Java code.

## Core idea

```text
AI does not draw the PDF with raw coordinates.
AI reconstructs the document using semantic GraphCompose components.
```

## Visual accuracy contract

The generated result must visually match the reference. Any visible mismatch
is treated as a defect unless it is explicitly classified and documented as a
known or accepted limitation. Revisions are approved only when no critical
mismatches remain and all required artifacts exist. See
[docs/visual-accuracy-contract.md](docs/visual-accuracy-contract.md).

## Workflow

The workflow runs: detect task type, resolve GraphCompose version, load and
validate the matching skill pack, analyze the reference, plan the
architecture, resolve external design assets (icons + fonts), generate the
template, compile, render twice (clean + debug-with-guidelines), compare
against the reference, write a visual review, then approve, reject, or
roll back. On approval the publisher emits a polished bundle under
[`templates/`](templates/). Every change creates a new revision. See
[docs/workflow.md](docs/workflow.md).

## Agent architecture

Eleven agents form a strict chain: Orchestrator, Version + Skill Resolver,
Skill Validator, Visual Analyzer, Architecture Mapper, **Asset Resolver**
(icons + fonts), Template Coder, Test + Render, Visual Review, Revision
Manager, and **Template Publisher** (publish-quality bundles on APPROVE).
Each agent has a fixed set of inputs, outputs, and forbidden behaviors. See
[docs/agents.md](docs/agents.md) and [AGENTS.md](AGENTS.md).

## Data, assets, and published templates

- **Asset Resolver** lives in [`tools/asset-resolver/`](tools/asset-resolver/)
  and downloads Iconify icons (SVG → PNG via ImageMagick) and validates
  Google Fonts against the GraphCompose bundled set. Output is a
  per-revision `assets-manifest.json` plus the icon bundle.
- **Data-driven templates** keep visible content in a per-revision
  JSON file (e.g. `cv-data.json`) and a typed Java spec record loaded
  through a `--spec-provider`. Editing content is one file change, no
  Java edits.
- **Template Publisher** runs only on APPROVE: it copies the polished
  template, the spec record, the example data, the asset bundle, the
  clean preview PDF, and the debug preview PDF (with GraphCompose
  guide-line overlays) into [`templates/<template-id>/`](templates/). The
  bundle is what downstream consumers copy into their own projects.

## Versioned skills

Skills are versioned contracts between the agent and a specific GraphCompose
API. The agent must identify the target GraphCompose version, load the
matching skill pack from `skills/versions/`, and never invent APIs. If the
library and the skill disagree, the library wins and the skill is fixed. See
[docs/versioned-skills.md](docs/versioned-skills.md).

## Revision model

Every change creates a new revision under `revisions/`. Revisions have
explicit statuses (`DRAFT`, `APPROVED`, `REJECTED`, `REVERTED`,
`SUPERSEDED`, `FAILED`), a parent pointer, and a fixed artifact layout.
Approved revisions are never overwritten directly. See
[docs/revision-model.md](docs/revision-model.md).

## Example

A documentation-grade manual revision cycle for an invoice reference
lives under [`examples/invoice-reference/`](examples/invoice-reference/).
It ships three revisions with every text artifact the workflow produces.
The binary render artifacts (`output.pdf`, `output.png`) are now
committed for all example revisions. They are produced by
[`scripts/render-invoice-reference.mjs`](scripts/render-invoice-reference.mjs),
which compiles the selected revision through
[`examples/invoice-reference/render-runner`](examples/invoice-reference/render-runner/)
and then calls [`tools/preview-renderer`](tools/preview-renderer/).

A second worked reference under
[`examples/cv-reference/`](examples/cv-reference/) shows the full flow
end-to-end for a two-page graphic-designer CV screenshot pair —
asset-resolver-managed Iconify icons (`mdi:phone-outline`,
`entypo-social:*-with-circle`, ...), bundled `Poppins`, data-driven
content via [`cv-data.json`](examples/cv-reference/revisions/revision-006/cv-data.json),
clickable contact and social links, and references with `mailto:`
hyperlinks. The approved baseline is published as
[`templates/mint-editorial-cv/`](templates/mint-editorial-cv/), a
self-contained bundle (Java + data + assets + previews + README) that
can be dropped into another project.

## Limitations

This project does not promise perfect screenshot-to-code conversion. Human
review remains part of the loop. Exact font matching and exact pixel parity
may be limited depending on the renderer and the available fonts. See
[docs/limitations.md](docs/limitations.md).

## Roadmap

The project ships in phases: documentation MVP, versioned skill pack, manual
example, skill validation fixtures, revision helper tool, render and preview
workflow, and visual diff experiment. See [docs/roadmap.md](docs/roadmap.md).

## Status

Phases 1 through 7 of the project plan have shipped. The
[`tools/`](tools/) folder hosts three modules: a Node revision-manager
CLI ([`revision-manager`](tools/revision-manager/)), a Java + Maven
preview-renderer ([`preview-renderer`](tools/preview-renderer/) with a
working `preview` PDF→PNG subcommand and a `render` path that executes
compiled GraphCompose templates when the runtime is on the classpath),
and a Node
visual-diff CLI ([`visual-diff`](tools/visual-diff/)). All three ship
with passing test suites and are wired to GitHub Actions CI.

GraphCompose 1.6.6 is reachable for fixture validation through
Maven Central as `io.github.demchaav:graph-compose:1.6.6`
(JitPack `com.github.DemchaAV:GraphCompose:vX.Y.Z` still resolves for
pre-1.6.6 pins). The five fixture projects under
[`examples/skill-fixtures/`](examples/skill-fixtures/) compile and
run against that artifact. The invoice reference example
also renders through the shared preview-renderer path. The remaining
gate is now visual validation orchestration: produce real layout
snapshots and run visual-diff against committed baselines. Until that
full visual pass exists, every skill in the manifest stays at
`status: needs-validation`.
See [`AUDIT.md`](AUDIT.md) for the historical audit and
[`docs/implementation-status.md`](docs/implementation-status.md) for
the current claim-vs-reality matrix.

## Positioning

```text
GraphCompose-AI-Template-Flow is an experimental companion project for GraphCompose.

It demonstrates how AI agents can turn visual document references into maintainable Java templates through a strict workflow:

Analyze -> Version -> Skills -> Plan -> Generate -> Render -> Compare -> Revise -> Approve / Rollback

The project treats GraphCompose as a semantic target language for AI-assisted document generation.

It does not promise magic screenshot-to-code conversion.

It focuses on engineering discipline:

- versioned skills
- API validation
- semantic mapping
- visual parity
- testable output
- revision history
- rollback safety
```
