# Architecture Plan

## Template Shape

The template is implemented as `GeneratedCvTemplate` with a direct
`compose(DocumentSession)` method. The sample content is embedded because
the first goal is to prove the visual template shape, not a reusable data
model.

## Component Map

| Region | GraphCompose primitive |
|---|---|
| Document | `DocumentSession.pageFlow(...)` |
| Header | `SectionBuilder` |
| Horizontal divider | `LineBuilder` |
| Page one grid | `RowBuilder` with sidebar/main sections |
| Page two grid | `RowBuilder` with sidebar/main sections |
| Contact / interests / education | `SectionBuilder` + paragraphs |
| Experience | `SectionBuilder` + paragraphs + list |
| Awards / references | `SectionBuilder` text grid approximation |
| Skills | `SectionBuilder` labels + rule text approximation |

## Important Constraint

GraphCompose rows cannot be nested inside a row column in this layout.
The first implementation therefore avoids nested horizontal rows inside
the sidebar/main sections and uses section-local text blocks for contact,
social, awards, and references.

## Known Follow-Up Revisions

- Replace text icon placeholders with real assets.
- Improve the expertise badge.
- Add a reusable CV data/spec model.
- Add page-specific visual diff baselines.
