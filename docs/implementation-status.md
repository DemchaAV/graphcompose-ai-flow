# Implementation Status

Current claim/reality matrix for the Phase 1-7 deliverables and CI.
This file supersedes the historical audit notes in `AUDIT.md` when
they disagree with the current tree.

Last checked: 2026-05-18.

## Current Summary

The repository is no longer only documentation. The workflow
scaffold, revision tooling, preview tooling, visual diff tooling,
repository-contract checks, and five GraphCompose skill fixtures all
exist on disk. The Java fixture projects compile and run against
GraphCompose 1.6.0 through JitPack using:

```text
com.github.DemchaAV:GraphCompose:v1.6.0
```

The remaining gap is narrower: `preview-renderer render` can now
execute compiled GraphCompose templates from the supplied classpath
and write `output.pdf` plus `output.png`. The fixtures still do not
have an automated visual baseline refresh (`output.pdf`,
`output.png`, `layout-snapshot.json`, visual diff), and the invoice
example still needs a compiled template project plus sample spec
provider. Because of that, skills remain `status: needs-validation`
until render + visual review complete the loop.

## Deliverables

| Deliverable | Reality | Status |
|---|---|---|
| Documentation MVP | README, docs, AGENTS, prompts, contributing guide, limitations, roadmap | REAL |
| Agent prompt pack | 10 prompt files under `prompts/` | REAL |
| Versioned skill pack | 14 files under `skills/versions/graphcompose-1.6/` with manifest/frontmatter checks | REAL, still `needs-validation` |
| Manual invoice example | Two text-grade revisions under `examples/invoice-reference/` | REAL-WITH-CAVEAT: binary render artifacts pending |
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
- The invoice revisions still list `output.pdf` and `output.png` as
  `pendingArtifacts`.
- Skills stay at `needs-validation` until a full render + preview +
  visual-diff report approves the relevant fixture coverage.

## Status Legend

- **REAL** -- backed by working code, tests, or checked files.
- **REAL-WITH-CAVEAT** -- shipped and useful, but a named part is
  still intentionally incomplete.
- **SMOKE-VERIFIED** -- compile/run proof exists, but full visual
  validation is still pending.
- **PENDING** -- intentionally listed but not yet implemented.
