# Status

One-page status summary written by the Revision Manager Agent. The
agent's responsibilities are documented in
[`../../../../docs/agents.md`](../../../../skills/workflows/README.md)
and the safety rule is verbatim from the project plan: never
overwrite the approved revision directly; every change creates a
new revision.

## Revision

`revision-001`, status `DRAFT`.

## Parent

None. This is the first revision in the `invoice-reference`
project. The Template Orchestrator Agent confirmed in
[`./orchestration-decision.md`](./orchestration-decision.md) that
no prior approved or draft revision existed.

## Outcome

`DRAFT`. The full text-artifact chain is present:

- [`./revision.json`](./revision.json)
- [`./user-request.md`](./user-request.md)
- [`./orchestration-decision.md`](./orchestration-decision.md)
- [`./version-resolution.md`](./version-resolution.md)
- [`./skill-validation-report.md`](./skill-validation-report.md)
- [`./visual-analysis.md`](./visual-analysis.md)
- [`./architecture-plan.md`](./architecture-plan.md)
- [`./generated-template.java`](./generated-template.java)
- [`./generated-test.java`](./generated-test.java)
- `layout-snapshot.json`
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

## Next agent

Either human review (read the visual review and the architecture
plan, then decide whether the template structure is correct
before any pixels are spent on it) or `revision-002` (a small
refinement that builds on this draft). The recommended next
revision in
[`./visual-review.md`](./visual-review.md#recommended-next-revision)
suggests tightening the alignment of the summary block under the
line-items table.

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
