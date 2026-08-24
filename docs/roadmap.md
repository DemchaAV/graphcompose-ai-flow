# Roadmap

The original project shipped in seven phases: the first three
documentation and one manual example, tooling from Phase 5 onward.
Those seven are done. The project has since entered a second arc —
the harness migration — described below and in
[architecture.md](architecture.md).

## Current phase

The harness migration (Phase 0 of the new arc) has started. The
seven original phases are shipped. GraphCompose 1.9.0
is reachable for fixture validation through Maven Central as
`io.github.demchaav:graph-compose:1.9.0` (JitPack
`com.github.DemchaAV:GraphCompose:vX.Y.Z` remains the fallback for
pre-1.6.7 pins), and the five skill fixtures compile and run against
it. `preview-renderer render` can
now execute compiled template classes, write `output.pdf`, generate
`output.png`, and clear pending artifacts. The invoice reference
example has a render-runner and committed binary outputs. The
remaining gate before skills can be promoted out of
`needs-validation` is visual validation orchestration: produce real
layout snapshots and feed visual-diff against committed baselines.

| Phase | Status |
|---|---|
| 1 — Documentation MVP | shipped |
| 2 — Versioned Skills MVP | shipped |
| 3 — Manual Example | shipped (binary artifacts generated; reference image still absent) |
| 4 — Skill Validation Fixtures | shipped (discipline + scaffolds + compile/run smoke) |
| 5 — Revision Helper Tool | shipped |
| 6 — Render and Preview Workflow | shipped (`preview` works; `render` executes compiled templates when runtime is on classpath) |
| 7 — Visual Diff Experiment | shipped |

## Harness migration

The seven phases above built a workflow kit: a human reads the docs,
an agent interprets eleven prompt files, and the work happens inside
a clone of this repository. The second arc turns that into an
installable harness — an Agent Skill package for Claude Code and
Codex that works inside the user's own Java project. The reasoning,
the layer split and what is deliberately excluded are in
[architecture.md](architecture.md).

| Phase | Goal | Status |
|---|---|---|
| 0 — Architecture of record | Capture the target architecture; clean the repo root | done |
| 1 — Single routing source | `config/pipeline.json` replaces the scope→stages duplication | done |
| 2 — Structured contracts | JSON schemas for orchestration, visual analysis, architecture, review | not started |
| 3 — Workspace decoupling | Tools accept an external root; version resolved from the user's build file | not started |
| 4 — Workflow skills | Eleven agent prompts become four skills | not started |
| 5 — GraphCompose 2.2 skill pack | New default pack; 1.9 frozen alongside 1.6/1.7 | not started |
| 6 — Progressive disclosure | Load only the topic skills a document kind needs | not started |
| 7 — Claude Code plugin | Plugin manifest, slash commands, clean-project acceptance | not started |
| 8 — Autonomous loop | Iterate to READY_FOR_APPROVAL or BLOCKED without prompting | not started |
| 9 — Codex adapter | Same skills and tools, adapter only, no workflow fork | not started |
| 10 — Harness tests and CI | Contract tests, routing fixtures, plugin package validation | not started |
| 11 — Finalization | Short AGENTS.md, new README, demo, release | not started |

Post-MVP, each needing its own plan: the `graphcompose-verify` GitHub
Action, marketplace distribution, an MCP server (only once remote
services exist), and a standalone runtime (only if running outside
Codex/Claude ever becomes necessary).

The step-by-step execution plan behind this table — actions,
verification and resume points per phase — is kept locally under
`docs/private/`, which is gitignored.

## Original phases (shipped)

The seven sections below are the first arc. They are numbered
independently of the harness-migration phases above.

### Phase 1 — Documentation MVP

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

### Phase 2 — Versioned Skills MVP

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
troubleshooting. All 14 skills remain at `status: needs-validation`
until visual validation is wired.)

Commit:

```text
docs: add versioned GraphCompose skill pack
```

### Phase 3 — Manual Example

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
[x] Add output.pdf
[x] Add output.png
[x] Add layout-snapshot.json               (illustrative, not engine-produced)
[x] Add visual-review.md                   (provisional; waits on reference.png for visual-diff)
[x] Add test-result.md                     (refreshed with real render output)
[x] Add revision-002 with a small user-request patch
```

Commit:

```text
docs: add manual invoice visual matching example
```

### Phase 4 — Skill Validation Fixtures

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
[x] Execute fixtures against the runtime    (Maven smoke via JitPack)
[ ] Compare fixture outputs visually        (waits on full render loop)
```

Commit:

```text
test: add skill validation fixtures
```

### Phase 5 — Revision Helper Tool

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

### Phase 6 — Render and Preview Workflow

Goal: automate the compile/render/preview loop.

Tasks:

```text
[x] Add preview-renderer tool
[x] Render compiled template through GraphCompose
[x] Generate output.pdf
[x] Convert PDF to output.png                  (preview command, Apache PDFBox 3)
[x] Save logs                                  (build.log, render.log in the revision folder)
[x] Attach artifacts to revision               (ArtifactUpdater clears pendingArtifacts in revision.json)
```

Built with Java 21 + Maven + Apache PDFBox 3 + JUnit 5. 9 tests
green. See [`tools/preview-renderer/README.md`](../tools/preview-renderer/README.md)
for usage. The `render` subcommand keeps the non-fatal skipped
message when GraphCompose is absent. When GraphCompose is present on
the classpath, it instantiates the compiled template class, supports
data-driven `compose(DocumentSession, Spec)` templates through
`--spec-provider`, writes `output.pdf`, converts it to `output.png`,
and updates `revision.json`.

Commit:

```text
tools: add experimental render and preview workflow
```

### Phase 7 — Visual Diff Experiment

Goal: introduce basic visual comparison.

Tasks:

```text
[x] Add visual-diff placeholder                (working CLI, not just a placeholder)
[x] Compare reference.png and output.png       (pngjs + pixelmatch)
[x] Generate diff image
[x] Generate visual-review scaffold            (visual-review-classification.md snippet)
[x] Classify differences manually or semi-automatically  (auto by mismatch %; thresholds in classify.ts)
```

Built with Node 20 + TypeScript + Commander + pixelmatch + pngjs +
vitest. 21 tests green. See [`tools/visual-diff/README.md`](../tools/visual-diff/README.md)
for usage. The `ACCEPTED_LIMITATION` label is never assigned
automatically -- it always requires a human note in
[`visual-review.md`](../examples/invoice-reference/revisions/revision-001/visual-review.md).

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
`list-skills`, `check-version`, `report-skill-drift`) and full
fixture visual-baseline orchestration are still planned follow-ups.
See [limitations.md](limitations.md) for the honest framing of the
pieces that have not landed.
