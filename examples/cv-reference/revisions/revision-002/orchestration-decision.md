# Orchestration Decision

## Task

Create the first GraphCompose template draft from two supplied CV
reference screenshots.

## Decision

This is a new document-template generation task. The orchestrator creates
`revision-001` as a DRAFT under `examples/cv-reference` and preserves the
source screenshots in the project's `reference/` folder.

## Scope

- Build a two-page semantic CV template.
- Use GraphCompose page flow, rows, sections, paragraphs, lists, and
  simple rules.
- Avoid raw coordinates as the primary layout strategy.
- Render `output.pdf`, `output.png`, and `output-page-2.png`.

## Out Of Scope For This Draft

- Pixel-perfect parity.
- Real Iconify social/contact icons.
- Exact Google Fonts matching.
- Multi-page visual-diff scoring.
