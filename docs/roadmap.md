# Roadmap

The project ships in seven phases. The first three are documentation
and one manual example. Tooling starts at Phase 5.

## Current phase

Phase 1 — Documentation MVP. In progress. First commit pending.

## Phase 1 — Documentation MVP

Goal: create the repository skeleton and explain the workflow
clearly.

Tasks:

```text
[ ] Create README.md
[ ] Create LICENSE
[ ] Create CONTRIBUTING.md
[ ] Create AGENTS.md
[ ] Create docs/workflow.md
[ ] Create docs/visual-accuracy-contract.md
[ ] Create docs/agents.md
[ ] Create docs/revision-model.md
[ ] Create docs/rollback.md
[ ] Create docs/versioned-skills.md
[ ] Create docs/limitations.md
[ ] Create prompts/*.md
[ ] Create skills/README.md
[ ] Create skills/skill-manifest.json
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
[ ] Create skills/versions/graphcompose-1.6/
[ ] Add graphcompose-basics.md
[ ] Add visual-to-graphcompose-mapping.md
[ ] Add layout-primitives.md
[ ] Add tables.md
[ ] Add themes-and-colors.md
[ ] Add spacing-and-alignment.md
[ ] Add visual-regression.md
[ ] Add revision-discipline.md
[ ] Add skill metadata headers
[ ] Link skills from skill-manifest.json
```

Commit:

```text
docs: add versioned GraphCompose skill pack
```

## Phase 3 — Manual Example

Goal: show one full revision cycle manually.

Tasks:

```text
[ ] Add examples/invoice-reference/
[ ] Add reference/reference.png
[ ] Add template-project.json
[ ] Add revision-001 user-request.md
[ ] Add revision-001 visual-analysis.md
[ ] Add revision-001 architecture-plan.md
[ ] Add generated-template.java
[ ] Add generated-test.java
[ ] Add output.pdf
[ ] Add output.png
[ ] Add layout-snapshot.json
[ ] Add visual-review.md
[ ] Add test-result.md
[ ] Add revision-002 with a small user-request patch
```

Commit:

```text
docs: add manual invoice visual matching example
```

## Phase 4 — Skill Validation Fixtures

Goal: prove that skills are not fantasy documentation.

Tasks:

```text
[ ] Add validation/ docs
[ ] Add skill-fix-template.md
[ ] Add examples/skill-fixtures/row-basic
[ ] Add examples/skill-fixtures/section-basic
[ ] Add examples/skill-fixtures/table-basic
[ ] Add examples/skill-fixtures/layer-stack-badge
[ ] Add examples/skill-fixtures/shape-container-card
[ ] Add validation reports
```

Commit:

```text
test: add skill validation fixtures
```

## Phase 5 — Revision Helper Tool

Goal: introduce the file-based revision manager.

Tasks:

```text
[ ] Add tools/revision-manager
[ ] Implement init
[ ] Implement status
[ ] Implement new revision
[ ] Implement approve
[ ] Implement reject
[ ] Implement undo
[ ] Implement revert-approved
[ ] Implement history
[ ] Implement diff
```

Commit:

```text
tools: add file-based revision manager
```

## Phase 6 — Render and Preview Workflow

Goal: automate the compile/render/preview loop.

Tasks:

```text
[ ] Add preview-renderer tool
[ ] Render template through GraphCompose
[ ] Generate output.pdf
[ ] Convert PDF to output.png
[ ] Save logs
[ ] Attach artifacts to revision
```

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

The CLI commands described in the plan — `graphcompose-flow init`,
`new-revision`, `approve`, `reject`, `undo`, `revert-approved`,
`restore-component`, `status`, `history`, `diff`, `validate-skills`,
`validate-skill`, `list-skills`, `check-version`,
`report-skill-drift`, `render`, `compare` — are planned for Phase 5
and later. They are documented here for design continuity but they
are not part of Phase 1. See [limitations.md](limitations.md) for the
honest "not a tool, yet" framing.
