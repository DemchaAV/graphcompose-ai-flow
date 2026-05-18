# Example: invoice-reference

A worked manual revision cycle for an A4 portrait invoice. This example
shows the full artifact set the workflow produces for a single document
project, including a first generation pass (`revision-001`) and a small
follow-up revision (`revision-002`).

## Status

Phase 3 of the project roadmap (manual example), now refreshed with
real render artifacts through the local render runner. Every text
artifact a real run would produce is included, and both committed
revisions now have `output.pdf` plus `output.png`.

| Artifact | Present here | Comes from |
|---|---|---|
| `revision.json` | yes | Revision Manager Agent |
| `user-request.md` | yes | User input |
| `orchestration-decision.md` | yes | Template Orchestrator |
| `version-resolution.md` | yes | Version + Skill Resolver |
| `skill-validation-report.md` | yes | Skill Validator |
| `visual-analysis.md` | yes | Visual Analyzer |
| `architecture-plan.md` | yes | Architecture Mapper |
| `generated-template.java` | yes | Template Coder |
| `generated-test.java` | yes | Template Coder |
| `layout-snapshot.json` | yes (illustrative) | Test + Render |
| `output.pdf` | yes | Test + Render |
| `output.png` | yes | Test + Render |
| `visual-review.md` | yes (describes expected outcome) | Visual Review |
| `test-result.md` | yes (describes expected outcome) | Test + Render |
| `status.md` | yes | Revision Manager |
| `patch.diff` (revision-002 only) | yes | Template Coder |

The binary render artifacts were generated with
[`../../scripts/render-invoice-reference.mjs`](../../scripts/render-invoice-reference.mjs),
which compiles the selected revision template through
[`render-runner/`](render-runner/) and invokes
[`../../tools/preview-renderer`](../../tools/preview-renderer/).
`visual-review.md` still remains provisional because this example has
only a textual reference (`reference/reference.md`), not a committed
`reference.png` baseline for visual-diff.

## Layout

```text
examples/invoice-reference/
  README.md
  template-project.json
  reference/
    README.md
    reference.md          # textual description of the reference document
  render-runner/          # Maven project used to compile selected revisions
  revisions/
    revision-001/         # initial generation (DRAFT)
    revision-002/         # follow-up tweak (DRAFT, builds on revision-001)
```

## How to read this example

1. Start with [`reference/reference.md`](reference/reference.md) — what the
   target invoice looks like in plain English.
2. Read [`template-project.json`](template-project.json) — project state.
3. Walk through [`revisions/revision-001/`](revisions/revision-001/) in the
   order listed in the table above. Every file there is what a real run
   would have written.
4. Then look at [`revisions/revision-002/`](revisions/revision-002/) and
   compare its `patch.diff` against `revision-001/generated-template.java`.

## Re-render locally

```powershell
node ..\..\scripts\render-invoice-reference.mjs revision-001
node ..\..\scripts\render-invoice-reference.mjs revision-002
```

The script builds `tools/preview-renderer`, compiles the selected
revision through `render-runner`, writes `output.pdf` / `output.png`,
and clears those names from the revision's `pendingArtifacts`.

## What this example does not claim

It does not claim the generated template is the final or only solution.
It does not claim pixel-perfect parity with the reference (that is the job
of the Visual Review loop across many revisions). It is an illustration of
the workflow's artifacts and discipline, not a finished product.
