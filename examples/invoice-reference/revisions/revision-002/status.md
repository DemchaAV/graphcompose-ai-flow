# Status

One-page status summary written by the Revision Manager Agent. The
agent's responsibilities are documented in
[`../../../../docs/agents.md`](../../../../skills/workflows/README.md)
and the safety rule is verbatim from the project plan: never
overwrite the approved revision directly; every change creates a
new revision.

## Revision

`revision-002`, status `DRAFT`.

## Parent

`revision-001`. The Template Orchestrator Agent confirmed in
[`./orchestration-decision.md`](./orchestration-decision.md) that
the parent revision is the current draft on disk; the structural
change in this revision is the one anticipated by the parent's
[`Recommended Next Revision`](../revision-001/visual-review.md#recommended-next-revision)
section.

## Outcome

`DRAFT`. The full text-artifact chain is present:

- [`./revision.json`](./revision.json)
- [`./user-request.md`](./user-request.md)
- [`./orchestration-decision.md`](./orchestration-decision.md)
- [`./version-resolution.md`](./version-resolution.md)
- [`./skill-validation-report.md`](./skill-validation-report.md)
- [`./architecture-plan.md`](./architecture-plan.md)
- [`./generated-template.java`](./generated-template.java)
- [`./generated-test.java`](./generated-test.java)
- [`./patch.diff`](./patch.diff)
- [`./layout-snapshot.json`](./layout-snapshot.json)
- [`./output.pdf`](./output.pdf)
- [`./output.png`](./output.png)
- [`./visual-review.md`](./visual-review.md)
- [`./test-result.md`](./test-result.md)
- [`./status.md`](./status.md) (this file)

The binary render artifacts (`output.pdf`, `output.png`) are now
present and `pendingArtifacts` is empty in
[`./revision.json`](./revision.json). Visual confirmation against a
reference image is still deferred because this example has only
[`../../reference/reference.md`](../../reference/reference.md), not a
committed `reference.png` baseline.

## Next options

The Revision Manager Agent is waiting on visual confirmation, then
on human approval. From this DRAFT the user has four mechanical
paths:

- **APPROVE** &mdash; once a visual baseline exists and the Visual
  Review Agent reruns with no `CRITICAL` or unaccepted `MAJOR`
  mismatches, the Revision Manager Agent flips this revision to
  `APPROVED` and updates
  `currentApprovedRevisionId` in
  [`../../template-project.json`](../../template-project.json).
- **REJECT** &mdash; the user discards revision-002. The folder
  stays on disk with `status = REJECTED` and a new draft is
  created from `revision-001` (which becomes the parent again).
  This is the "undo" path described in
  [`../../../../docs/rollback.md`](../../../../docs/rollback.md#undo-last-change).
- **UNDO** &mdash; equivalent to the REJECT path in this project's
  current state: a fresh draft (`revision-003`) is created from
  `revision-001`, and `revision-002` is relabelled `REJECTED` or
  `SUPERSEDED`. The mechanics are documented in the same rollback
  page.
- **REVISE further** &mdash; a new `revision-003` is created with
  this revision as its parent. The
  [`./visual-review.md#recommended-next-revision`](./visual-review.md#recommended-next-revision)
  section suggests two candidate tweaks (verifying the `TOTAL`
  label weight and raising the divider stroke width above the
  total) against the rendered artifact.

The Revision Manager Agent must not approve this revision until:

1. a real `reference.png` is committed or another explicit visual
   baseline is approved
2. the Visual Review Agent reruns against the real `output.png`
   and produces a concrete Reference Parity Score
3. no `CRITICAL` or unaccepted `MAJOR` mismatches remain per the
   visual accuracy contract in
   [`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md)
4. the user explicitly approves

Until those four conditions are met, the revision stays in
`DRAFT`. The approved-revision pointer in
[`../../template-project.json`](../../template-project.json)
remains `null`.
