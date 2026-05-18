# Roadmap

The project ships in seven phases. The first three are documentation
and one manual example. Tooling starts at Phase 5.

## Current phase

Phases 1–5 are shipped. Phase 6 (renderer) and Phase 7 (visual diff)
are next. Until those land, every skill in
[`skill-manifest.json`](../skills/skill-manifest.json) stays at
`status: needs-validation` and every revision's `output.pdf` /
`output.png` are listed under `pendingArtifacts`.

| Phase | Status |
|---|---|
| 1 — Documentation MVP | shipped |
| 2 — Versioned Skills MVP | shipped |
| 3 — Manual Example | shipped |
| 4 — Skill Validation Fixtures | shipped (discipline + scaffolds; execution waits on Phase 6/7) |
| 5 — Revision Helper Tool | shipped |
| 6 — Render and Preview Workflow | not started |
| 7 — Visual Diff Experiment | not started |

## Phase 1 — Documentation MVP

Goal: create the repository skeleton and explain the workflow
clearly.

Tasks:

```text
[x] Create README.md
[x] Create LICENSE
[x] Create CONTRIBUTING.md
[x] Create AGENTS.md
[x] Create docs/workflow.md
[x] Create docs/visual-accuracy-contract.md
[x] Create docs/agents.md
[x] Create docs/revision-model.md
[x] Create docs/rollback.md
[x] Create docs/versioned-skills.md
[x] Create docs/limitations.md
[x] Create prompts/*.md
[x] Create skills/README.md
[x] Create skills/skill-manifest.json
```

Commit:

```text
docs: introduce strict GraphCompose AI template flow
```

## Phase 2 — Versioned Skills MVP

Goal: create the first skill pack for the current GraphCompose
version.

Tasks:

```text
[x] Create skills/versions/graphcompose-1.6/
[x] Add graphcompose-basics.md
[x] Add visual-to-graphcompose-mapping.md
[x] Add layout-primitives.md
[x] Add tables.md
[x] Add themes-and-colors.md
[x] Add spacing-and-alignment.md
[x] Add visual-regression.md
[x] Add revision-discipline.md
[x] Add skill metadata headers
[x] Link skills from skill-manifest.json
```

(Phase 2 also shipped six additional skills not listed in the
original task list: typography, backgrounds-and-panels,
layer-stacks-and-overlays, shapes-and-containers, pagination,
troubleshooting. All 14 skills are at `status: needs-validation`.)

Commit:

```text
docs: add versioned GraphCompose skill pack
```

## Phase 3 — Manual Example

Goal: show one full revision cycle manually.

Tasks:

```text
[x] Add examples/invoice-reference/
[ ] Add reference/reference.png            (replaced by reference.md until a real reference image lands)
[x] Add template-project.json
[x] Add revision-001 user-request.md
[x] Add revision-001 visual-analysis.md
[x] Add revision-001 architecture-plan.md
[x] Add generated-template.java
[x] Add generated-test.java
[ ] Add output.pdf                         (pending Phase 6 renderer)
[ ] Add output.png                         (pending Phase 6 renderer)
[x] Add layout-snapshot.json               (illustrative, not engine-produced)
[x] Add visual-review.md                   (expected-outcome; refreshed by Phase 6 run)
[x] Add test-result.md                     (expected-outcome; refreshed by Phase 6 run)
[x] Add revision-002 with a small user-request patch
```

Commit:

```text
docs: add manual invoice visual matching example
```

## Phase 4 — Skill Validation Fixtures

Goal: prove that skills are not fantasy documentation.

Tasks:

```text
[x] Add validation/ docs
[x] Add skill-fix-template.md
[x] Add examples/skill-fixtures/row-basic
[x] Add examples/skill-fixtures/section-basic
[x] Add examples/skill-fixtures/table-basic
[x] Add examples/skill-fixtures/layer-stack-badge
[x] Add examples/skill-fixtures/shape-container-card
[x] Add validation reports                  (phase-4-baseline.md)
[ ] Execute fixtures against the runtime    (waits on Phase 6)
```

Commit:

```text
test: add skill validation fixtures
```

## Phase 5 — Revision Helper Tool

Goal: introduce the file-based revision manager.

Tasks:

```text
[x] Add tools/revision-manager
[x] Implement init
[x] Implement status
[x] Implement new-revision
[x] Implement approve
[x] Implement reject
[x] Implement undo
[x] Implement revert-approved
[x] Implement restore-component             (file-level; see tool README)
[x] Implement history
[x] Implement diff                          (in-tree LCS unified diff)
```

Built with Node 20 + TypeScript + Commander + vitest. 22 tests
green. See [`tools/revision-manager/README.md`](../tools/revision-manager/README.md)
for usage and the smoke-test sequence.

Commit:

```text
tools: add file-based revision manager
```

## Phase 6 — Render and Preview Workflow

Goal: automate the compile/render/preview loop.

Tasks:

```text
[x] Add preview-renderer tool
[ ] Render template through GraphCompose       (skeleton; waits on GraphCompose 1.6 reaching a reachable Maven repo)
[ ] Generate output.pdf                        (waits on the render path above)
[x] Convert PDF to output.png                  (preview command, Apache PDFBox 3)
[x] Save logs                                  (build.log, render.log in the revision folder)
[x] Attach artifacts to revision               (ArtifactUpdater clears pendingArtifacts in revision.json)
```

Built with Java 17 + Maven + Apache PDFBox 3 + JUnit 5. 7 tests
green. See [`tools/preview-renderer/README.md`](../tools/preview-renderer/README.md)
for usage. The `render` subcommand currently detects GraphCompose
absence and exits with a clear message; it becomes fully functional
once GraphCompose 1.6 is on the classpath.

Commit:

```text
tools: add experimental render and preview workflow
```

## Phase 7 — Visual Diff Experiment

Goal: introduce basic visual comparison.

Tasks:

```text
[ ] Add visual-diff placeholder
[ ] Compare reference.png and output.png
[ ] Generate diff image
[ ] Generate visual-review scaffold
[ ] Classify differences manually or semi-automatically
```

Commit:

```text
tools: add visual comparison workflow
```

## Acceptance criteria for first version

The first public version is ready when:

```text
[ ] README explains the project in under 2 minutes.
[ ] Visual accuracy contract is documented.
[ ] Workflow is clear.
[ ] Agent roles are documented.
[ ] Prompt pack exists.
[ ] Versioned skills exist.
[ ] Skill manifest exists.
[ ] Skill validation process exists.
[ ] Revision model exists.
[ ] Rollback model exists.
[ ] Example folder structure exists.
[ ] Limitations are honest.
[ ] Main GraphCompose repo can link to it.
```

## Note on future tooling

The revision commands — `init`, `new-revision`, `approve`, `reject`,
`undo`, `revert-approved`, `restore-component`, `status`, `history`,
`diff` — are now shipped in
[`tools/revision-manager/`](../tools/revision-manager/).

The skill-validation commands (`validate-skills`, `validate-skill`,
`list-skills`, `check-version`, `report-skill-drift`) and the render
commands (`render`, `compare`) are still planned for Phase 6 and
later. See [limitations.md](limitations.md) for the honest
"not a tool, yet" framing of the pieces that have not landed.
