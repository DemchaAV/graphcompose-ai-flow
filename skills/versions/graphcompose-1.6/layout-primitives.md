---
skillId: layout-primitives
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.7
status: needs-validation
lastValidated: 2026-06-01
---

# Layout Primitives Skill

Use this skill when deciding which GraphCompose layout primitive to use.

## Row

Use RowBuilder when elements are arranged horizontally.

Examples:
- logo + company information
- billing address + invoice metadata
- two-column summary
- icon + text

## Section

Use SectionBuilder when content belongs to one semantic block.

Examples:
- hero block
- payment instructions
- notes
- footer message
- warning box

## Table

Use TableBuilder when content is structured into rows and columns.

Examples:
- invoice line items
- pricing table
- schedule
- comparison table

## Layer stack

Use LayerStack when elements overlap visually.

Examples:
- badge over card
- watermark behind content
- decorative shape behind header
- label crossing a panel border

## Shape container

Use shape containers when the reference uses strong visual shapes.

Examples:
- rounded card
- circle avatar placeholder
- pill badge
- clipped image area
- ellipse/circle highlight

## Canvas layer

Use CanvasLayer only when semantic primitives are not enough.

CanvasLayer is allowed for:
- tiny decorative details
- exact background geometry
- non-semantic ornaments
- visual marks that do not affect document structure

CanvasLayer must not become coordinate soup.

## When to load

Load this skill whenever the Architecture Mapper Agent or the
Template Coder Agent has to choose between two or more primitives
for the same visual region. It pairs with
[`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md):
the mapping skill decides which primitive *family* applies to a
region, and this skill explains the differences between the
primitives inside that family.

It is also the first skill to load when an existing template is
being refactored — for example, when a long canvas-heavy block needs
to be promoted into proper rows, sections, or tables before further
revisions can land safely.

## Decision flow

Use the following decision chain when classifying a region. Stop at
the first matching branch.

```text
Is the content tabular (shared column meaning across rows)?
  -> the table primitive (see tables.md)

Else, is the region a horizontal arrangement of unrelated items?
  -> the row primitive

Else, is the region a semantically grouped block of related content?
  -> the section primitive

Else, do elements overlap visually (badge over card, watermark)?
  -> a layer stack (see layer-stacks-and-overlays.md)

Else, is the region a strong visual shape (rounded card, pill, circle)?
  -> a shape container (see shapes-and-containers.md)

Else, is the element pure decoration that the DSL cannot express?
  -> the canvas layer, last resort, kept small and documented
```

If two branches feel equally valid, prefer the higher-level
primitive in the chain. A table beats a stack of rows. A section
beats a single-cell row. A layer stack beats a canvas layer for
overlaps. Promoting a region one level up the chain almost always
improves maintainability and selective rollback safety.

## Componentization expectation

Whichever primitive is chosen, the implementation must live in a
small private render method named after the region:
`renderHeader`, `renderHero`, `renderLineItems`, `renderFooter`,
`renderBadge`, and so on. The componentization rule comes from
[`graphcompose-basics`](graphcompose-basics.md) and is required by
the selective rollback semantics documented in the parallel-lane
`revision-discipline.md`.

## Cross-references

- [`tables`](tables.md) for the table primitive decision in depth
- [`themes-and-colors`](themes-and-colors.md) for the styling tokens
  that the primitives consume
- [`typography`](typography.md) for the font hierarchy applied
  inside each primitive
- [`spacing-and-alignment`](spacing-and-alignment.md) for the gaps
  between primitives and the padding inside them
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  for the parity rules that constrain primitive choices
