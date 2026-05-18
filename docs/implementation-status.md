# Implementation Status

Honest claim/reality matrix for every Phase 1-7 deliverable plus the CI
job. "Claim" is where the document/header asserts the deliverable
exists. "Reality" is the on-disk artifact the auditor verified. Path
columns are repo-relative.

| Deliverable | Phase | Claim (where) | Reality (file path) | Status |
|---|---|---|---|---|
| README | 1 | `README.md` (self) | `README.md` | OVERCLAIM (line 124 says "Phase 1"; line 104 says example "is planned... not yet present" while example is committed) |
| LICENSE | 1 | `README.md` reference | `LICENSE` | REAL |
| CONTRIBUTING | 1 | `README.md` reference, `docs/agents.md` | `CONTRIBUTING.md` | OVERCLAIM (line 12 says docs-only Phase 1 even though tools shipped) |
| AGENTS.md | 1 | `docs/agents.md` link | `AGENTS.md` | REAL |
| `docs/overview.md` | 1 | `docs/overview.md` self | `docs/overview.md` | OVERCLAIM (line 105 says Phase 1 only) |
| `docs/workflow.md` | 1 | linked from README | `docs/workflow.md` | REAL |
| `docs/visual-accuracy-contract.md` | 1 | linked from README | `docs/visual-accuracy-contract.md` | REAL |
| `docs/agents.md` | 1 | linked from README | `docs/agents.md` | REAL |
| `docs/revision-model.md` | 1 | linked from README | `docs/revision-model.md` | DOC-ONLY (implementation lacks FAILED and REVERTED statuses) |
| `docs/rollback.md` | 1 | linked from README | `docs/rollback.md` | REAL |
| `docs/versioned-skills.md` | 1 | linked from README | `docs/versioned-skills.md` | REAL |
| `docs/skill-validation.md` | 1 | linked from README, validation/ | `docs/skill-validation.md` | DOC-ONLY (process exists, never executed) |
| `docs/visual-review-loop.md` | 1 | linked from agents/contract | `docs/visual-review-loop.md` | REAL |
| `docs/integration-with-graphcompose.md` | 1 | linked from limitations | `docs/integration-with-graphcompose.md` | REAL |
| `docs/limitations.md` | 1 | linked from README | `docs/limitations.md` | OVERCLAIM (line 22 says no CLI/no renderer/no diff; all three exist) |
| `docs/roadmap.md` | 1 | linked from README | `docs/roadmap.md` | REAL (roadmap is the only doc that reflects current shipped state) |
| Prompt pack | 1 | `prompts/*.md` linked from AGENTS.md | 10 `prompts/*.md` files | REAL |
| `prompts/master-prompt.md` | 1 | repository structure | `prompts/master-prompt.md` | DECORATIVE (verbatim copy of plan §15; nothing executes it) |
| `skills/README.md` | 1 | linked from `docs/versioned-skills.md` | `skills/README.md` | REAL |
| `skills/skill-manifest.json` | 1 | docs/versioned-skills.md, CI | `skills/skill-manifest.json` | REAL (14 entries; all `needs-validation`; honest) |
| Skill pack `graphcompose-1.6` | 2 | `docs/versioned-skills.md` | 14 files under `skills/versions/graphcompose-1.6/` | REAL but with 50+ broken intra-repo links (use `../../docs/...` instead of `../../../docs/...`) |
| `examples/invoice-reference/` structure | 3 | `docs/roadmap.md`, README contradicts | `examples/invoice-reference/` | REAL |
| `examples/invoice-reference/template-project.json` | 3 | example README | `examples/invoice-reference/template-project.json` | REAL-WITH-CAVEAT (names `reference/reference.png` that does not exist on disk; reference.md substituted) |
| Reference image | 3 | example README | `examples/invoice-reference/reference/reference.md` only | PLACEHOLDER (image absent; honestly documented) |
| revision-001 text artifacts | 3 | revision.json | 11 files in `revisions/revision-001/` | REAL (text-grade; honestly tagged "expected outcome") |
| revision-001 `generated-template.java` | 3 | revision.json | `revisions/revision-001/generated-template.java` | OVERCLAIM (imports `com.demcha.graphcompose.*` which does not exist; real package is `com.demcha.compose.document.*`; calls 14 invented BusinessTheme accessors and `DocumentSession.create()`) |
| revision-001 `generated-test.java` | 3 | revision.json | `revisions/revision-001/generated-test.java` | OVERCLAIM (same wrong imports; calls invented `BusinessTheme.defaults()` and `DocumentSession.create()`) |
| revision-001 `output.pdf` / `output.png` | 3 | revision.json `pendingArtifacts` | absent | GAP (correctly listed as pending; render in Phase 6) |
| revision-001 `layout-snapshot.json` | 3 | revision.json | `revisions/revision-001/layout-snapshot.json` | PLACEHOLDER (`notes` field says "illustrative; bounding boxes computed from textual description") |
| revision-001 `visual-review.md` | 3 | revision.json | `revisions/revision-001/visual-review.md` | PLACEHOLDER (entire doc honestly framed as "expected outcome"; parity score "pending") |
| revision-002 text artifacts | 3 | revision.json | 12 files | REAL with same Java caveats |
| revision-002 `patch.diff` | 3 | revision.json | `revisions/revision-002/patch.diff` | DECORATIVE (hand-authored; `git apply --check` returns 0; no tool consumes it) |
| `examples/skill-fixtures/` README | 4 | `validation/skill-validation.md` | `examples/skill-fixtures/README.md` | REAL (honestly tags fixtures as "structural only") |
| 5 fixture skeletons | 4 | `validation/verified-examples.md` | `examples/skill-fixtures/{row-basic,section-basic,table-basic,layer-stack-badge,shape-container-card}/` | OVERCLAIM (tests would not compile -- same wrong imports as revision-001; POMs declare `com.demcha:graphcompose:1.6.0` instead of real `io.github.demchaav:graphcompose`; CI never compiles them) |
| `validation/` discipline docs | 4 | `docs/skill-validation.md` | 7 files under `validation/` | REAL (honest scaffolds) |
| `validation/reports/phase-4-baseline.md` | 4 | validation/README | `validation/reports/phase-4-baseline.md` | REAL (honestly records that nothing has been executed) |
| `tools/revision-manager/` | 5 | README link, roadmap | `tools/revision-manager/` | REAL (22/22 tests pass; CLI smoke test verified) |
| revision-manager `init` | 5 | tool README | `src/commands/init.ts` | REAL (verified by smoke test) |
| revision-manager `new-revision` | 5 | tool README | `src/commands/newRevision.ts` | REAL |
| revision-manager `approve` | 5 | tool README | `src/commands/approve.ts` | REAL (mutates prior APPROVED revision's `revision.json` to SUPERSEDED; artifact files preserved per hash check; document this in `docs/revision-model.md`) |
| revision-manager `reject` | 5 | tool README | `src/commands/reject.ts` | REAL |
| revision-manager `undo` | 5 | tool README | `src/commands/undo.ts` | REAL (owner-specified bug `currentApprovedRevisionId = revision-003, currentDraftRevisionId = revision-001` does NOT reproduce; smoke test shows `currentApprovedRevisionId=revision-002, currentDraftRevisionId=revision-004` with revision-003 SUPERSEDED) |
| revision-manager `revert-approved` | 5 | tool README | `src/commands/revertApproved.ts` | REAL (creates new DRAFT from approved; writes DRAFT not REVERTED marker) |
| revision-manager `restore-component` | 5 | tool README | `src/commands/restoreComponent.ts` | REAL (file-level only, four named files copied; refuses if region not in changedComponents) |
| revision-manager `status` | 5 | tool README | `src/commands/status.ts` | REAL |
| revision-manager `history` | 5 | tool README | `src/commands/history.ts` | REAL |
| revision-manager `diff` | 5 | tool README | `src/commands/diff.ts` | REAL (in-tree LCS unified diff; not a wrapper around `git diff`) |
| `RevisionStatus` type | 5 | `docs/revision-model.md` | `tools/revision-manager/src/types.ts:9` | GAP (omits `FAILED` and `REVERTED`; plan §10.3 requires both) |
| `fail` CLI verb | 5 | none | not implemented | GAP (failed revisions cannot be recorded by the tool; the plan §10.4 mandates the FAILED status) |
| `tools/preview-renderer/` | 6 | README, roadmap | `tools/preview-renderer/` | REAL-WITH-CAVEAT (7/7 tests pass; only the `preview` subcommand is functional) |
| preview-renderer `preview` | 6 | tool README | `src/main/java/.../PreviewCommand.java` | REAL (Apache PDFBox 3; verified by test) |
| preview-renderer `render` | 6 | tool README | `src/main/java/.../RenderCommand.java` | PLACEHOLDER (skeleton with `Class.forName` detection; honestly documented as skeleton; CRITICAL: canary FQCN at line 41 is `com.demcha.graphcompose.DocumentSession` which does not exist in the real library, so detection cannot succeed against a real GraphCompose jar) |
| preview-renderer `ArtifactUpdater` | 6 | tool README | `src/main/java/.../ArtifactUpdater.java` | REAL |
| `tools/visual-diff/` | 7 | README, roadmap | `tools/visual-diff/` | REAL (21/21 tests pass; smoke test against identical fixtures returns IDENTICAL; smoke test against 1-pixel-of-1024 difference returns `mismatchPx: 1`, classification `MINOR`) |
| visual-diff classification thresholds | 7 | tool README | `src/classify.ts` | REAL (matches README table) |
| visual-diff `--update-revision` | 7 | tool README | `src/artifactUpdater.ts` | REAL (covered by tests; never auto-applies ACCEPTED_LIMITATION) |
| `.github/workflows/ci.yml` | all | none external | `.github/workflows/ci.yml` | REAL (4 jobs run; verifies tool tests and JSON parse-ability; does NOT check link sanity, fixture compile, skill frontmatter, or revision artifact presence) |

## Status legend

- **REAL** -- claim is backed by working code/tests/output.
- **DOC-ONLY** -- claim is documentation; no execution proof.
- **PLACEHOLDER** -- file exists but contains stub/illustrative
  content; README must say so.
- **OVERCLAIM** -- README/docs promise more than what is shipped.
- **GAP** -- deliverable in the plan, not yet shipped.

## Honest summary

The infrastructure for an AI-assisted GraphCompose workflow is real:
14 versioned skill files with valid frontmatter, a working revision
manager (CLI verbs plus 22 passing tests, including the owner-specified
undo flow), a working pixel-diff CLI (21 tests), a render skeleton
that fails closed on a missing classpath (7 tests), and four CI jobs
that exercise all of the above. The example folder demonstrates a
two-revision document workflow with all text artifacts in place and
honestly tags the binary artifacts as pending Phase 6.

What is not real is the Java surface. Every `generated-template.java`,
every `generated-test.java`, every fixture test, and the
preview-renderer canary class refer to `com.demcha.graphcompose.*`
packages that do not exist in the GraphCompose library at
`C:/Users/Demch/OneDrive/Java/GraphCompose` (the real package root is
`com.demcha.compose.document.*`). 14 invented `BusinessTheme` accessor
methods and an invented `DocumentSession.create()` factory appear at
every call site. The fixture POMs declare the wrong Maven groupId
(`com.demcha` instead of `io.github.demchaav`). None of this fails CI
because no job compiles the Java -- the four CI jobs verify tool
tests and JSON parse-ability only. The skill manifest is honest about
this (every skill is `needs-validation`) but four public-facing docs
(README, CONTRIBUTING, docs/overview.md, docs/limitations.md) still
claim "Phase 1: tools and examples not yet implemented", which
contradicts the rest of the repository.

The project is honest where it could be (revision JSON
`pendingArtifacts`, manifest `needs-validation`, visual-review.md
"expected outcome", layout-snapshot `notes`) and overclaims where the
plan tempted it to (Java code presented as if it compiled). Closing
the gap requires either regenerating the Java against the real
GraphCompose surface or demoting the Java files to illustrative
pseudocode until the Phase 6 fixture run resolves the API.
