---
skillId: graphcompose-basics
targetLibrary: GraphCompose
targetVersion: 1.9.x
verifiedAgainst: 1.9.0
status: needs-validation
lastValidated: 2026-06-07
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

## Authoritative API reference

When a skill page does not document the exact method signature, the
agent MUST resolve it against the authoritative references below — NOT
guess, and NOT grep an unverified copy of the GraphCompose source. Two
references are authoritative, in this order:

1. **The allow-list — [`00-api-surface.md`](00-api-surface.md) in this
   pack.** It lists the public authoring methods and constants for the
   resolved target version, generated from the `v1.9.0` tag. It is a
   CLOSED SET: **if a method, overload, or enum constant is not listed
   there, it does not exist for this version — do not invent one.**

   ⚠️ This pack was produced by a *source* parser that has since been
   retired, so it cannot see members Lombok generates and it attributes
   a nested type's members to the enclosing type. Treat an absence here
   as a reason to check the 1.9.0 Javadoc, not as proof. Packs from 2.2
   on are read from the compiled class files and have neither problem. Before writing a call, grep the builder you are about to use
   (`TableBuilder`, `ParagraphBuilder`, `LayerStackBuilder`, …) in
   `00-api-surface.md` and confirm the exact signature is present.
2. **The hosted Javadoc**, for the prose, parameter names, and
   `@since` / `@Beta` tags the allow-list does not carry:
   - **Maven Central Javadoc (canonical):**
     [javadoc.io/doc/io.github.demchaav/graph-compose/1.9.0](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.9.0)
   - **Stable-version alias** (always points at the latest published
     release): [javadoc.io/doc/io.github.demchaav/graph-compose](https://javadoc.io/doc/io.github.demchaav/graph-compose)

Lookup priorities, in order:

1. The relevant skill page for the resolved target version — semantics
   and when to reach for a primitive.
2. The **allow-list** ([`00-api-surface.md`](00-api-surface.md)) —
   authoritative for existence and exact signatures. Not listed = does
   not exist; do not invent.
3. The **engine guides** ([`guides/00-index.md`](guides/00-index.md)) —
   the how-to-use-the-engine layer: verified, render-proven snippets that
   show how to wire the primitives together. The allow-list says WHAT
   exists; the guides show HOW to use it.
4. The hosted Javadoc at the version pinned in the skill manifest's
   `verifiedAgainst` (currently 1.9.0) — for parameter names and tags.
5. A fixture project under [`examples/skill-fixtures/`](../../../examples/skill-fixtures/)
   that uses the API in question (proves it actually resolves).
6. Only after all of the above fail, ask the user — do not invent.

Class-level `@since` tags landed in 1.6.6 on every entry-point type
(`DocumentSession`, `DocumentDsl`, `BusinessTheme`, the 19 DSL
builders, `PageBackgroundFill`, `RichText`, `Transformable`), so the
hosted Javadoc shows the introduction version at a glance. Types
marked `@Beta` (e.g. `NodeDefinition` — the custom-node SPI) are
Extension SPI: callers MAY implement them, but the shape may evolve
between minors. Treat `@Beta` signatures as load-bearing only after
cross-checking against the current pinned version.

The additive 1.7.0 primitives carry their own `@since 1.7.0` tags
(`InlineShapeRun`, `ShapeLayer`, `TextVerticalAlign`,
`DocumentDashPattern`, the timeline DSL, `FontName.JETBRAINS_MONO`, the
`headingBar(...)` / per-corner `roundedRect(...)` overloads), so the
hosted Javadoc shows them as 1.7.0 introductions — see "New in 1.7.0"
below.

## New in 1.7.0 — additive DSL primitives

GraphCompose 1.7.0 is additive over 1.6.x (zero breaking changes): it
adds public API but removes none, so every 1.6.x mapping in this pack
still holds. Each new primitive is worth reaching for because it
replaces a workaround the older packs had to describe. Load the topic
skill named in brackets for the usage rules.

- **Inline shape runs** — geometry-drawn dots, diamonds, stars,
  arrows, chevrons, and checkboxes that ride the text baseline
  (`InlineShapeRun`, authored via `ParagraphBuilder` / `RichText`
  `dot(...)`, `diamond(...)`, `star(...)`, `arrow(...)`, `chevron(...)`,
  `checkbox(...)`, `shape(ShapeOutline, ...)`). Skill-rating dots
  (`●●●●○`), custom bullets, and inline status markers no longer depend
  on a font shipping the glyph. [`typography`](typography.md),
  [`shapes-and-containers`](shapes-and-containers.md)
- **Polygon shape geometry** — `ShapeOutline` gains a `Polygon` kind
  and factories (`diamond`, `triangle`, `star`, `arrow`, `chevron`,
  `checkmark`, `plus`, `regularPolygon(sides)`), usable block-level and
  inline. [`shapes-and-containers`](shapes-and-containers.md)
- **Per-corner rounded rectangles** — `roundedRect(w, h,
  DocumentCornerRadius)` rounds each corner independently (no more
  CLIP_PATH-parent workaround).
  [`shapes-and-containers`](shapes-and-containers.md)
- **Vertical text alignment** — `ParagraphBuilder.verticalAlign(
  TextVerticalAlign)` seats a single line (TOP / CENTER / BOTTOM) in a
  taller box. [`spacing-and-alignment`](spacing-and-alignment.md),
  [`typography`](typography.md)
- **Semantic timelines** — `addTimeline(...)` lays out a marker-and-
  content rail (work history, milestones, process steps).
  [`layout-primitives`](layout-primitives.md)
- **Dashed / dotted lines** — `LineBuilder.dashed(...)` for dividers,
  connectors, cut-here rules.
  [`layout-primitives`](layout-primitives.md)
- **`headingBar(...)`** — a one-call filled, rounded title band.
  [`backgrounds-and-panels`](backgrounds-and-panels.md),
  [`layout-primitives`](layout-primitives.md)
- **`softPanel(..., stroke)`** — rounded fill + outline on one flow
  node. [`backgrounds-and-panels`](backgrounds-and-panels.md)
- **`FontName.JETBRAINS_MONO`** — bundled monospaced family.
  [`typography`](typography.md)
- **`DocumentSession.availableHeight()`** — usable page content height
  (page minus top/bottom margins). [`pagination`](pagination.md)
- **Fix:** `position(node, dx, dy, align)` offsets are now honored for
  stacks nested inside a fixed slot.
  [`layer-stacks-and-overlays`](layer-stacks-and-overlays.md)

These are documented in the GraphCompose 1.7.0 changelog; cross-check
exact method overloads against the allow-list
([`00-api-surface.md`](00-api-surface.md)) and the 1.9.0 Javadoc before
relying on a specific signature, per the lookup priority above.

This "New in 1.7.0" list is historical and is NOT the complete 1.9.0
surface — 1.8.x and 1.9.0 added further public API (e.g.
`addTableOfContents(...)`, `addPageReference(...)`, the `toImage(...)` /
`toImages(...)` output methods). The allow-list is the authoritative,
exhaustive set for the resolved target version; treat it, not this
section, as the completeness source.

## Known limitations

This skill describes the 1.9.x semantics conceptually. It does not
list the exact method signatures of every builder — that is the job of
the allow-list ([`00-api-surface.md`](00-api-surface.md)), the
source-generated closed set for this version. Specific method
signatures must be confirmed against the allow-list first (not listed =
does not exist), then cross-checked against the
[`verifiedAgainst: 1.9.0`](../../../docs/versioned-skills.md) Javadoc.
When uncertain, the agent must:

- confirm the method exists in the allow-list before calling it; if it
  is absent, treat it as non-existent and do not invent
- prefer documented primitives over guessed methods
- describe the intended behavior in `architecture-plan.md`
- mark uncertain mappings as risks in `visual-review.md`
- fall back to conservative templates rather than invent API

See the no-invented-API rule in
[`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md)
and the skill drift handling in
[`../../../docs/skill-validation.md`](../../../docs/skill-validation.md).
