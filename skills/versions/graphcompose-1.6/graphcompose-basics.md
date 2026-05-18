---
skillId: graphcompose-basics
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.0
status: needs-validation
lastValidated: 2026-05-18
---

# GraphCompose Basics Skill

GraphCompose is a semantic Java document layout engine.

The agent must understand that GraphCompose templates describe document intent, not PDF coordinates.

Use:

- DocumentSession for document composition
- pageFlow for page content
- rows for horizontal structure
- sections for grouped content
- tables for tabular data
- themes for consistent styling
- layer stacks for overlays
- shape containers for visual containers
- layout snapshots for testing
- visual regression for rendered output comparison

Do not use:

- direct PDFBox imports
- raw coordinates as the main layout strategy
- one huge compose method
- duplicated visual code
- hardcoded magic values everywhere

## When to load this skill

Always. This skill is the foundation of every other skill in the
pack. Load it before any other skill so that the agent shares the
vocabulary the rest of the pack relies on: `DocumentSession`,
`pageFlow`, the row primitive, the section primitive, the table
primitive, themes, layer stacks, shape containers, layout snapshots,
and visual regression.

Loading order recommendation when the orchestrator pulls in the pack:

1. `graphcompose-basics` (this file) — the shared vocabulary
2. [`visual-to-graphcompose-mapping`](visual-to-graphcompose-mapping.md)
   when a reference image is involved
3. The specific primitive skill that matches the work
   ([`layout-primitives`](layout-primitives.md),
   [`tables`](tables.md), [`themes-and-colors`](themes-and-colors.md),
   [`typography`](typography.md),
   [`spacing-and-alignment`](spacing-and-alignment.md))
4. The cross-cutting skills shipped by the parallel lane
   (`pagination`, `backgrounds-and-panels`, `layer-stacks-and-overlays`,
   `shapes-and-containers`, `visual-regression`,
   `revision-discipline`, `troubleshooting`)

## Core mental model

GraphCompose templates declare a document, not pixels. A template is
written once and rendered against many data inputs. The agent must
treat the DSL as a description of semantic structure:

- a document is a `DocumentSession`
- pages are composed through `pageFlow`
- horizontal arrangements are rows
- semantically grouped blocks are sections
- structured row and column data is a table
- repeated styling is centralized through a theme
- overlapping content is a layer stack
- decorative containers are shape containers
- pure decoration of last resort is a canvas layer

If a visual element cannot be cleanly expressed with the above, the
agent must document the gap rather than invent new primitives. See
the no-invented-API rule in
[`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md).

## Why not direct PDFBox

Direct PDFBox usage in a template defeats the purpose of using
GraphCompose: it ties the template to coordinate-level code, breaks
the semantic mapping the rest of the pack depends on, and prevents
the visual-regression and revision tooling from understanding the
template's structure. Use GraphCompose primitives instead.

## Componentization is part of the contract

Templates must be composed of small private render methods, one per
semantic block. This is not a style preference. The
[revision model](../../../docs/visual-accuracy-contract.md) and
the selective rollback rules in `revision-discipline.md` rely on the
ability to swap one component (for example `renderHeader`) from a
previous revision while keeping another (for example
`renderLineItems`) from the current draft. A monolithic compose
method makes selective rollback unreliable.

## Known limitations

This skill describes the 1.6.x semantics conceptually. It does not
list the exact method signatures of every builder. Specific method
signatures must be cross-checked against the
[`verifiedAgainst: 1.6.0`](../../../docs/versioned-skills.md) examples
once the Phase 4 fixtures land. Until then, when uncertain, the
agent must:

- prefer documented primitives over guessed methods
- describe the intended behavior in `architecture-plan.md`
- mark uncertain mappings as risks in `visual-review.md`
- fall back to conservative templates rather than invent API

See the no-invented-API rule in
[`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md)
and the skill drift handling in
[`../../../docs/skill-validation.md`](../../../docs/skill-validation.md).
