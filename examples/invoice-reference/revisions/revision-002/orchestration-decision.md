# Orchestration Decision

Output of the Template Orchestrator Agent for the second pass on the
`invoice-reference` project. The decision follows the
"Example decision: simple revision" shape in the project plan
(`§5.1`).

## Detected task type

Revision. The user request is "Tighten alignment of the summary
block under the line-items table." There is already a draft on
disk (`revision-001`), and the request describes a small structural
change to one region rather than a fresh generation. The
orchestrator therefore routes the request through a patch-style
pipeline rather than through the full agent chain.

## Selected base revision

`revision-001`. It is both the current draft and the only revision
in the project at this point, so it is used as the parent. The
Revision Manager Agent will create `revision-002` by copying
forward the unchanged artifacts (version resolution, skill
validation, visual analysis) and writing only the artifacts that
this revision changes.

## Pipeline plan

The orchestrator runs a reduced pipeline for this revision:

1. Architecture Mapper Agent &mdash; runs a light pass over
   [`../revision-001/architecture-plan.md`](../revision-001/architecture-plan.md)
   and writes [`./architecture-plan.md`](./architecture-plan.md)
   describing only the delta (the new `Summary` region and the
   updated `renderLineItems` method). The full plan is unchanged
   for the regions that this revision does not touch.
2. Template Coder Agent &mdash; writes the updated
   [`./generated-template.java`](./generated-template.java) and a
   matching [`./generated-test.java`](./generated-test.java), plus
   [`./patch.diff`](./patch.diff) describing the textual delta
   against the parent template.
3. Test + Render Agent &mdash; would compile, render, and capture
   a fresh layout snapshot. In Phase 3 the renderer is not yet
   wired, so it writes [`./layout-snapshot.json`](./layout-snapshot.json)
   reflecting the new `Summary` region and reports the render and
   preview steps as pending in
   [`./test-result.md`](./test-result.md).
4. Visual Review Agent &mdash; rewrites
   [`./visual-review.md`](./visual-review.md) for the changed
   regions only (LineItems and the new Summary). All other regions
   point back at the rev-001 review.

The Revision Manager Agent then collects the artifacts, writes
[`./status.md`](./status.md), and parks the revision as `DRAFT`.

## Skipped stages and why

- Visual Analyzer Agent &mdash; SKIPPED. The reference is
  unchanged from `revision-001` and the analysis at
  [`../revision-001/visual-analysis.md`](../revision-001/visual-analysis.md)
  is the authoritative source for this revision. Re-running the
  analyzer would only produce the same artifact.
- Skill Validator Agent &mdash; SKIPPED. The skill pack is the
  same `skills/versions/graphcompose-1.6` pack the parent used and
  the manifest has not been touched between revisions. The
  validation result at
  [`../revision-001/skill-validation-report.md`](../revision-001/skill-validation-report.md)
  is reused; this revision's
  [`./skill-validation-report.md`](./skill-validation-report.md)
  records the skip explicitly so the artifact set stays complete.
- Version + Skill Resolver Agent &mdash; SKIPPED in effect. The
  parent revision already pinned the target version; this revision
  commits [`./version-resolution.md`](./version-resolution.md)
  for auditability but does not redo any detection work.

## Expected output

A `revision-002` folder with all text artifacts populated, a
`patch.diff` describing the structural change, and `status = DRAFT`.
The binary artifacts `output.pdf` and `output.png` are again
recorded in `revision.json` under `pendingArtifacts`; they remain
the responsibility of the Phase 6 render and preview tool described
in [`../../../../docs/roadmap.md`](../../../../docs/roadmap.md).
The Revision Manager Agent must not approve this revision until the
binaries exist and the Visual Review Agent has run against them.
