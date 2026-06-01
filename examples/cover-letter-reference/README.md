# Cover Letter Reference

A scaffold project for the first cover-letter run through the
GraphCompose AI Template Flow. Lives alongside the CV and invoice
reference examples to keep the pipeline honest as a multi-doc-kind
workflow rather than a CV-only one.

## State

**Awaiting reference image.** The project skeleton exists, but
`reference/reference.png` is intentionally absent. See
[`reference/PLACEHOLDER.md`](reference/PLACEHOLDER.md) for the
kick-off gesture that opens `revision-001`.

## Surface

V2 layered (`com.demcha.compose.document.templates.coverletter.v2.*`)
on GraphCompose 1.6.7 — the only surface upstream for cover letters
as of the 1.6.7 release. See the upstream
[v2-layered authoring cheatsheet](https://github.com/DemchaAV/GraphCompose/blob/main/docs/templates/v2-layered/authoring-presets.md)
for the canonical reference.

## Pairing contract

A cover letter on V2 layered pairs with a CV preset via shared
`CvIdentity` + `CvTheme` — the masthead and body font / colour /
size render through the identical widget path so the CV and letter
read as one matched set. The single letter-specific renderer is
`coverletter.v2.components.LetterBody` (greeting + body paragraphs +
closing). See
[`prompts/template-coder-agent.md`](../../prompts/template-coder-agent.md)
§ "CV ↔ cover-letter pairing (V2 layered only)" for the full
contract.

## Folder layout (current vs after first revision)

```text
examples/cover-letter-reference/
├── README.md                       ← this file
├── template-project.json           ← project metadata (awaiting reference)
├── reference/
│   └── PLACEHOLDER.md              ← kick-off instructions (deleted once revision-001 lands)
│   └── reference.png               ← USER DROPS THIS to start the flow
└── revisions/                      ← created by orchestrator on first gesture
    └── revision-001/
        ├── user-request.md
        ├── orchestration-decision.md
        ├── version-resolution.md
        ├── skill-validation-report.md
        ├── visual-analysis.md
        ├── architecture-plan.md
        ├── asset-request.json
        ├── assets-manifest.json
        ├── data-schema.md
        ├── cover-letter-data.json
        ├── generated-template.java
        ├── generated-test.java
        ├── layout-snapshot.json
        ├── output.pdf
        ├── output.png
        ├── visual-review.md
        ├── test-result.md
        ├── status.md
        └── revision.json
```

## Related published bundles

- [`templates/mint-editorial-cv/`](../../templates/mint-editorial-cv/) —
  the existing CV bundle the first cover letter is likely to pair
  against.
- [`templates/invoice-classic/`](../../templates/invoice-classic/) —
  the existing invoice bundle (V1 classic surface; here for
  comparison of doc-kind coverage).
