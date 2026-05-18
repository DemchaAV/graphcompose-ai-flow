# Overview

GraphCompose AI Template Flow is a companion/lab repository for the
[GraphCompose](https://github.com/DemchaAV/GraphCompose) Java PDF
library. It documents and demonstrates a strict AI-assisted workflow
in which agents reproduce visual document references as maintainable
GraphCompose Java templates, using versioned skills, API validation,
visual comparison, revision history, and rollback.

## What this is

This repository documents and demonstrates an experimental workflow
where AI agents:

1. analyze a visual document reference
2. map it to GraphCompose primitives
3. generate Java template code
4. render the result
5. compare output against the reference
6. revise the template
7. preserve revision history
8. support rollback and selective rollback

## What this is not

This project must not claim perfect automatic screenshot-to-code
conversion.

Correct wording:

```text
This project provides a structured AI-assisted workflow.
It helps agents analyze, plan, generate, render, compare, and revise GraphCompose templates.
Human review remains part of the process.
```

Do not write:

```text
Automatically converts any screenshot into perfect production-ready Java code.
```

Better:

```text
The goal is strict visual parity with the reference, achieved through an iterative render/compare/revise workflow.
Remaining differences must be documented.
```

## Workflow at a glance

```text
Start
  ↓
Detect Task Type
  ↓
Detect / Select GraphCompose Version
  ↓
Load Matching Skill Pack
  ↓
Validate Skills Against Library / Verified Fixtures
  ↓
Analyze Reference
  ↓
Create Architecture Plan
  ↓
Generate Template Code
  ↓
Compile
  ↓
Render PDF
  ↓
Convert PDF to Preview Image
  ↓
Compare Preview Against Reference
  ↓
Create Visual Review
  ↓
Revise if Needed
  ↓
Approve / Reject / Rollback
```

See [workflow.md](workflow.md) for the per-step contract.

## Documentation map

The docs site is split into 12 self-contained pages:

- [overview.md](overview.md) — this page; landing summary and pointers
- [workflow.md](workflow.md) — full workflow with inputs, outputs, and per-step agent owners
- [visual-accuracy-contract.md](visual-accuracy-contract.md) — strict parity rules and mismatch classification
- [agents.md](agents.md) — the 9 agents that own the chain
- [revision-model.md](revision-model.md) — project metadata, revision metadata, statuses, artifact inventory
- [rollback.md](rollback.md) — undo, revert to approved, selective rollback
- [versioned-skills.md](versioned-skills.md) — skills as versioned contracts, manifest, statuses, no-invented-API rule
- [skill-validation.md](skill-validation.md) — how the planned validation discipline works
- [visual-review-loop.md](visual-review-loop.md) — how reference and output are compared and reviewed
- [integration-with-graphcompose.md](integration-with-graphcompose.md) — relationship to the main GraphCompose repository
- [limitations.md](limitations.md) — honest scope of this repository
- [roadmap.md](roadmap.md) — development phases and acceptance criteria

## Phase status

Phases 1 through 7 of the project plan are shipped. The
[`tools/`](../tools/) folder hosts a Node revision-manager CLI, a
Java + Maven preview-renderer (with a working `preview` subcommand
and a `render` skeleton), and a Node visual-diff CLI. All three have
passing test suites and are wired to GitHub Actions CI.

The remaining external gate is that GraphCompose 1.6 has not yet
been published to a Maven repository reachable from this build, so
the `render` subcommand cannot resolve the real GraphCompose
classpath today. Until that lands, every skill in the manifest stays
at `status: needs-validation` and every revision's `output.pdf` and
`output.png` are listed under `pendingArtifacts`. See
[roadmap.md](roadmap.md) for the per-phase table,
[implementation-status.md](implementation-status.md) for the honest
claim-vs-reality matrix, and [limitations.md](limitations.md) for
what is intentionally out of scope today.
