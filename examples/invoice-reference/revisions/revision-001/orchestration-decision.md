# Orchestration Decision

Output of the Template Orchestrator Agent for the first pass on the
`invoice-reference` project. The decision follows the
"Example decision: new generation" shape in the project plan
(`§5.1`).

## Detected task type

New generation. The user request is "Create an A4 invoice template
from the reference image." There is no prior approved revision and
no prior draft, so no patching path is available. The orchestrator
routes the request through the full agent chain.

## Selected base revision

None. This is the first revision in the project. The
`template-project.json` file shows
`currentApprovedRevisionId: null` and a draft pointer that has not
yet been written. The Revision Manager Agent will create
`revision-001` from scratch rather than copying any earlier folder.

## Pipeline plan

The seven specialized agents run in the order documented in
[`../../../../docs/agents.md`](../../../../docs/agents.md):

1. Version + Skill Resolver Agent &mdash; reads
   `template-project.json` and `skills/skill-manifest.json` to pick
   the GraphCompose 1.6.x skill pack. Writes
   [`./version-resolution.md`](./version-resolution.md).
2. Skill Validator Agent &mdash; reports the validation state of
   every skill in the pack. Writes
   [`./skill-validation-report.md`](./skill-validation-report.md).
3. Visual Analyzer Agent &mdash; reads
   [`../../reference/reference.md`](../../reference/reference.md)
   and produces [`./visual-analysis.md`](./visual-analysis.md).
4. Architecture Mapper Agent &mdash; converts the analysis into a
   GraphCompose plan. Writes
   [`./architecture-plan.md`](./architecture-plan.md).
5. Template Coder Agent &mdash; writes
   [`./generated-template.java`](./generated-template.java) and
   [`./generated-test.java`](./generated-test.java) using only the
   primitives the skill pack documents.
6. Test + Render Agent &mdash; would compile, render, and capture a
   layout snapshot. In Phase 3 the renderer is not yet wired, so it
   writes [`./layout-snapshot.json`](./layout-snapshot.json) as an
   illustrative document and reports the render and preview steps as
   pending in [`./test-result.md`](./test-result.md).
7. Visual Review Agent &mdash; would compare `output.png` to
   `reference.png` and classify mismatches per the visual accuracy
   contract. Until binaries exist, it writes the *expected* review
   to [`./visual-review.md`](./visual-review.md).

The Revision Manager Agent then collects the artifacts, writes
[`./status.md`](./status.md), and parks the revision as `DRAFT`. No
approval is performed.

## Expected output

A `revision-001` folder with all text artifacts populated and the
status set to `DRAFT`. The binary artifacts `output.pdf` and
`output.png` are recorded in `revision.json` under
`pendingArtifacts`; they are produced by the Phase 6 render and
preview tool described in
[`../../../../docs/roadmap.md`](../../../../docs/roadmap.md). The
Revision Manager Agent must not approve this revision until the
binaries exist and the Visual Review Agent has run against them.
