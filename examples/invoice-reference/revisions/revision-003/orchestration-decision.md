# Orchestration Decision

## Task

Create `revision-003` from `revision-002` to fix the rendered invoice
starting flush against the top-left page edge.

## Decision

This is a page-level spacing defect, not a GraphCompose engine change.
The current draft (`revision-002`) stays intact as history and this
revision becomes the new draft.

## Scope

- Preserve the `revision-002` line-item and summary structure.
- Add one named page spacing token in `generated-template.java`.
- Apply the token to the root `pageFlow` with
  `padding(DocumentInsets.of(PAGE_MARGIN))`.
- Re-render `output.pdf` and `output.png` through the local render runner.

## Expected Output

The preview must show visible white space above and to the left of the
invoice content while keeping the hero line on one row.
