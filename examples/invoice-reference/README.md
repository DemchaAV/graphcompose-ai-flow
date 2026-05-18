# Example: invoice-reference

A worked manual revision cycle for an A4 portrait invoice. This example
shows the full artifact set the workflow produces for a single document
project, including a first generation pass (`revision-001`) and a small
follow-up revision (`revision-002`).

## Status

Phase 3 of the project roadmap (manual example). The example is
documentation-grade: every text artifact a real run would produce is
included, but the binary render artifacts are intentionally absent.

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
| `output.pdf` | pending Phase 6 | Test + Render |
| `output.png` | pending Phase 6 | Test + Render |
| `visual-review.md` | yes (describes expected outcome) | Visual Review |
| `test-result.md` | yes (describes expected outcome) | Test + Render |
| `status.md` | yes | Revision Manager |
| `patch.diff` (revision-002 only) | yes | Template Coder |

The binary render artifacts (`output.pdf`, `output.png`) ship when the
Phase 6 render-and-preview tool is in place. Until then, `visual-review.md`
and `test-result.md` document the *expected* outcome for the template in
the revision; once the renderer is wired, those documents will be
regenerated from the real run.

## Layout

```text
examples/invoice-reference/
  README.md
  template-project.json
  reference/
    README.md
    reference.md          # textual description of the reference document
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

## What this example does not claim

It does not claim the generated template is the final or only solution.
It does not claim pixel-perfect parity with the reference (that is the job
of the Visual Review loop across many revisions). It is an illustration of
the workflow's artifacts and discipline, not a finished product.
