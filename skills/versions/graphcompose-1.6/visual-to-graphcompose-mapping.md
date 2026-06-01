---
skillId: visual-to-graphcompose-mapping
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.7
status: needs-validation
lastValidated: 2026-06-01
---

# Visual to GraphCompose Mapping Skill

Use this skill when converting a screenshot, mockup, PDF preview, or visual reference into a GraphCompose template.

## Core rule

Do not start from coordinates.

Start from semantic document structure.

## Mapping rules

| Visual element | Use GraphCompose primitive |
|---|---|
| Top header | RowBuilder |
| Hero block | SectionBuilder |
| Invoice/item table | TableBuilder |
| Repeated card | reusable private render method |
| Accent strip | section accent / shape container |
| Background panel | section background / soft panel |
| Floating badge | LayerStack |
| Icon with semantic label | Iconify-sourced asset + semantic container |
| Overlapping decorative element | LayerStack / CanvasLayer |
| Exact geometric decoration | Shape container |
| Multi-page content | pageFlow + pagination |
| Repeated page header | header/footer/chrome |
| Data-driven content | DocumentTemplate<T> |
| Visual-only pixel detail | CanvasLayer only as last resort |

## Decision rule

Prefer semantic GraphCompose DSL first.

Use low-level drawing only when:

- the element is purely decorative
- the DSL cannot represent it cleanly
- the visual reference requires exact geometry
- the low-level element is isolated and documented

When the reference contains icons and the exact source is unknown,
search/select replacements through [Iconify](https://iconify.design/)
and record the icon set/name in `visual-analysis.md` or
`architecture-plan.md`. Do not invent an icon asset or silently draw a
rough substitute with low-level shapes unless the visual review
documents that limitation.

## When to load

Load this skill whenever a reference image is being analyzed. That
includes:

- new generation tasks where the user supplies a screenshot, mockup,
  or PDF preview
- revisions where the user points to a region of the reference and
  asks for a change
- visual review work where the output preview is being compared back
  against the reference

The Visual Analyzer Agent and the Architecture Mapper Agent both
depend on this skill. If a task does not involve a visual reference
(for example, refactoring an existing template's data model), this
skill can be skipped.

This skill chains naturally into
[`layout-primitives`](layout-primitives.md) for the per-primitive
decisions and into [`tables`](tables.md) when the reference contains
tabular content.

## Common mistakes

The mapping table above is only useful if the agent avoids the
following recurring failures.

- Starting from coordinates instead of semantics. The agent looks at
  the reference, picks an x/y position, and reaches for a canvas
  primitive before asking "what does this region mean?" Always
  classify the region semantically first, then map it through the
  table above.
- Dropping into the canvas layer too early. A canvas layer is the
  last resort, not the first option. Most reference elements
  (headers, panels, tables, badges) are expressible with the
  documented primitives. If an early draft is canvas-heavy, the
  semantic pass was skipped.
- Inventing primitives. If the table above does not list a primitive
  that matches the visual element, the agent must not invent a new
  builder name. Instead, decompose the element into the closest
  documented primitives and document the gap in `visual-review.md`.
  See the no-invented-API rule in
  [`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md).
- Mixing rows and tables. A horizontal arrangement of unrelated
  items (logo plus address plus QR code) is a row, not a one-row
  table. A grid of cells with shared column meaning is a table, not
  a stack of rows. See [`tables`](tables.md) for when the table
  primitive is the wrong tool.
- Forgetting the layer stack option for overlaps. When a badge sits
  on top of a card, or a watermark sits behind content, the answer
  is a layer stack, not fake spacing or absolute positioning. Layer
  stack work is detailed in the parallel-lane
  `layer-stacks-and-overlays.md` skill.

## Output expectation

When this skill is in play, the Architecture Mapper Agent must
produce an `architecture-plan.md` whose Component Mapping section
labels every region with the chosen primitive from the table above.
Regions that cannot be cleanly mapped must be flagged as Visual
Risks in the same plan, not silently lowered to canvas drawing. The
visual accuracy contract in
[`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
requires these decisions to be auditable.
