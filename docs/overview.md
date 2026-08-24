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

The docs site is split into 16 self-contained pages:

- [overview.md](overview.md) — this page; landing summary and pointers
- [architecture.md](architecture.md) — the target harness architecture and the layer split
- [demo.md](demo.md) — real captured output of the deterministic half, end to end
- [plugin-installation.md](plugin-installation.md) — installing the harness into Claude Code
- [quickstart.md](quickstart.md) — practical setup, first render, and new-project workflow
- [workflow.md](workflow.md) — full workflow with inputs, outputs, and per-step agent owners
- [visual-accuracy-contract.md](visual-accuracy-contract.md) — strict parity rules and mismatch classification
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
and a `render` path for compiled GraphCompose templates), and a Node
visual-diff CLI. All three have passing test suites and are wired to
GitHub Actions CI.

GraphCompose 1.9.0 is reachable through Maven Central as
`io.github.demchaav:graph-compose:1.9.0` (JitPack
`com.github.DemchaAV:GraphCompose:vX.Y.Z` still resolves for
pre-1.6.7 pins), and the five fixture projects under
[`examples/skill-fixtures/`](../examples/skill-fixtures/) compile
and run against that artifact. `preview-renderer render` now
executes compiled template classes and produces PDF/PNG artifacts
when the runtime is on the classpath. The invoice reference example
uses that path through its render-runner and now has committed
PDF/PNG outputs. The remaining gate is visual validation
orchestration: generate real layout snapshots and feed the visual-diff
step against committed image baselines. Until that full loop lands,
every skill in the manifest stays at `status: needs-validation`. See
[roadmap.md](roadmap.md) for the per-phase table,
[implementation-status.md](implementation-status.md) for the honest
claim-vs-reality matrix, and [limitations.md](limitations.md) for
what is intentionally out of scope today.
