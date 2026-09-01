# Implementation Status

> **A frozen record, not the current state.** Everything below — every
> version number, count and verdict — is as it stood on **2026-05-18**,
> before the workflow kit became an installable harness. It is kept as
> the record of what was claimed and when, and it is not maintained.
>
> Read it that way and the numbers are informative. Read it as a
> description of today and every one is wrong: the pack it calls *the*
> versioned pack is one of five, the pin it names is three minor lines
> back, and the suite it counts has grown by an order of magnitude.
>
> The current state is in [`docs/roadmap.md`](roadmap.md), the "What is
> honest about the current state" section of the [README](../README.md),
> and [`limitations.md`](limitations.md) — and only there. This banner
> once named "the two gaps that matter today" and one of them had since
> closed, which is exactly the failure a staleness warning creates when
> it goes stale itself: it tells the reader what to trust.

Current claim/reality matrix for the Phase 1-7 deliverables and CI.
This file supersedes the historical audit notes in `history/AUDIT-2026-05.md` when
they disagree with the current tree.

Last checked: 2026-05-18.

## Current Summary

The repository is no longer only documentation. The workflow
scaffold, revision tooling, preview tooling, visual diff tooling,
repository-contract checks, and five GraphCompose skill fixtures all
exist on disk. The Java fixture projects compile and run against
GraphCompose 1.9.0 through Maven Central using:

```text
io.github.demchaav:graph-compose:1.9.0
```

Older pins (≤ v1.6.5) continue to resolve via JitPack as
`com.github.DemchaAV:GraphCompose:vX.Y.Z`. GraphCompose 1.9.0 is
compiled for Java 21, so GraphCompose-backed Maven jobs run on Java
21 in CI. The invoice and CV reference examples
both render through local render-runner projects.

The remaining gap is narrower: `preview-renderer render` can now
execute compiled GraphCompose templates from the supplied classpath
and write `output.pdf` plus `output.png`. The invoice reference
example now has a render-runner project and committed binary outputs
for three revisions. The fixtures still do not have an automated
visual baseline refresh (`layout-snapshot.json`, visual diff).
Because of that, skills remain `status: needs-validation` until the
visual review loop completes against committed baselines.

## Deliverables

| Deliverable | Reality | Status |
|---|---|---|
| Documentation MVP | README, docs, AGENTS, prompts, contributing guide, limitations, roadmap | REAL |
| Agent prompt pack | 10 prompt files under `prompts/` | REAL |
| Versioned skill pack | 15 files under `skills/versions/graphcompose-1.9/` (source-generated allow-list + 14 conceptual skills) with manifest/frontmatter checks | REAL; allow-list `active`, 14 conceptual still `needs-validation` |
| Manual invoice example | Three revisions under `examples/invoice-reference/`, render-runner, committed `output.pdf`/`output.png` | REAL-WITH-CAVEAT: visual baseline absent |
| Manual CV example | Two two-page drafts under `examples/cv-reference/`, render-runner, committed `output.pdf`, `output.png`, and `output-page-2.png` for the current draft | REAL-WITH-CAVEAT: visual baseline absent |
| Revision statuses | `DRAFT`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `FAILED`, `REVERTED` in `tools/revision-manager/src/types.ts` | REAL |
| `graphcompose-flow fail` | Implemented in `tools/revision-manager/src/commands/fail.ts` | REAL |
| Revision manager CLI | `init`, `status`, `new-revision`, `approve`, `reject`, `fail`, `undo`, `revert-approved`, `restore-component`, `history`, `diff` | REAL, 27 tests |
| Preview renderer | PDF to PNG `preview`, artifact updater, classpath-aware `render` for compiled templates, `--spec-provider` support | REAL-WITH-CAVEAT, 9 tests |
| Visual diff CLI | Pixel comparison, classification, diff image, revision artifact update | REAL, 21 tests |
| Repository contract | Checks skill frontmatter, revision artifacts, markdown links, and fake GraphCompose imports | REAL |
| Skill fixtures | `row-basic`, `section-basic`, `table-basic`, `layer-stack-badge`, `shape-container-card` | SMOKE-VERIFIED: `mvn test` passes locally against JitPack |
| CI | Tool tests, preview-renderer tests, repository-contract, and skill-fixture Maven tests | REAL |

## Verified Commands

The current tree has been checked with:

```text
npm test                         # tools/revision-manager, 27 tests
npm test                         # tools/visual-diff, 21 tests
mvn test                         # tools/preview-renderer, 9 tests
node .github/scripts/repository-contract.mjs
mvn test                         # each examples/skill-fixtures/* project
```

All commands passed on 2026-05-18.

## Remaining Gaps

- `tools/preview-renderer render` executes compiled template classes
  from the supplied classpath, but it does not compile raw
  `generated-template.java` files or generate business data/specs.
- Fixture smoke tests prove the documented API calls compile and run,
  but they do not yet compare rendered PDFs/PNGs to committed visual
  baselines.
- `examples/invoice-reference/reference/reference.png` is still
  absent; the example uses `reference.md` as its textual stand-in.
- Skills stay at `needs-validation` until a full render + preview +
  visual-diff report approves the relevant fixture coverage.

## Status Legend

- **REAL** -- backed by working code, tests, or checked files.
- **REAL-WITH-CAVEAT** -- shipped and useful, but a named part is
  still intentionally incomplete.
- **SMOKE-VERIFIED** -- compile/run proof exists, but full visual
  validation is still pending.
- **PENDING** -- intentionally listed but not yet implemented.
