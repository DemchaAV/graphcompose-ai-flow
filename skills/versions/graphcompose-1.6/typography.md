---
skillId: typography
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.0
status: needs-validation
lastValidated: 2026-05-18
---

# Typography Skill

Use this skill when deciding which fonts, weights, and sizes apply
to each region of a GraphCompose template, and how to handle the
common case where the reference uses a font the renderer cannot
reproduce exactly.

## Font matching strategy

The agent should treat font matching as a three-step decision, not
as a guess.

1. Identify the reference font, or describe it precisely. Look at
   stroke contrast (modulated vs uniform), serifs (present, slab,
   absent), letter widths, x-height, and any obvious style markers.
   Record the identification or the description in
   `visual-analysis.md`.
2. Decide whether the reference font is licensable and embeddable
   in the renderer environment. Many display and custom commercial
   fonts cannot be embedded; treat licensing as a hard constraint,
   not a wish.
3. If the reference font cannot be used, pick the closest fallback
   in the same family (serif, sans-serif, slab, monospace) and the
   same weight class. Record the substitution in `visual-review.md`
   per the color substitution policy in
   [`themes-and-colors`](themes-and-colors.md).

Do not invent a font name that is not available in the renderer.
Default to a documented PDF-safe family when uncertain.

## Typographic hierarchy

Every template has a layered hierarchy. The agent must define each
of the following roles, even if some collapse to the same actual
font and size:

- `title` — the document's headline. Used once near the top.
  Purpose: identify the document at a glance.
- `subtitle` — supporting line under the title. Purpose: clarify
  document scope, version, or context without competing with the
  title.
- `sectionHeading` — heading inside a major region (Hero, Parties,
  Payment Instructions). Purpose: split the document into scannable
  blocks.
- `body` — default text. Purpose: convey the bulk of the content
  comfortably at reading size.
- `caption` — small, secondary text such as fine print, labels, or
  legends. Purpose: present supporting metadata without drawing
  attention.
- `tableCell` — the font used inside table cells. Purpose: keep
  tabular content compact and legible at the chosen column widths.

The hierarchy is named, not hardcoded. The same naming discipline
described in [`themes-and-colors`](themes-and-colors.md) applies:
use roles, not visual descriptors. `title` survives a font swap;
`bigBoldBlue` does not.

## Fallback chain

When the renderer cannot use the chosen font, the agent must use a
PDF-safe fallback. The standard 14 PDF base fonts (Times, Helvetica,
Courier, Symbol, ZapfDingbats and their bold/italic variants) are
always available and require no embedding. For most templates the
fallback chain follows the family of the original:

- sans-serif reference -> Helvetica family
- serif reference -> Times family
- monospace reference -> Courier family
- decorative or display reference -> closest sans-serif fallback,
  document the substitution

A custom fallback list is allowed when the project ships embedded
fonts, but the chain must still end with a PDF-safe family so the
template cannot fail to render. Specific font registration APIs
must match the verified 1.6.0 examples — do not invent them.

## When to load

Load this skill any time:

- a new template defines its initial font hierarchy
- a revision touches font size, weight, or family in any region
- the reference uses a non-standard font and the agent has to pick a
  fallback
- visual review flags a typography mismatch that needs to be
  classified per
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)

This skill chains with [`themes-and-colors`](themes-and-colors.md)
(font color), [`spacing-and-alignment`](spacing-and-alignment.md)
(line spacing, padding around text), and [`tables`](tables.md)
(table cell typography).

## Known limitations

- Exact font matching is not guaranteed, especially for custom
  commercial fonts that cannot be embedded. Document substitutions
  in `visual-review.md` with the reference font name (or
  description) and the chosen fallback.
- Sub-pixel kerning and hinting may differ between renderers. Treat
  small visual differences in glyph spacing as `MINOR` per the
  visual accuracy contract.
- Non-Latin scripts may require explicit font selection that the
  PDF-safe fallback chain does not cover. When the reference uses
  such scripts, capture the requirement in `architecture-plan.md`
  and verify against the 1.6.0 examples before promising parity.
- Line height and leading conventions may not match the reference's
  source design tool exactly. If the rendered text breaks
  differently from the reference, document the break point and
  classify it; do not invent a "force line break here" API.

## Cross-references

- [`graphcompose-basics`](graphcompose-basics.md) for the role of
  typography in the semantic model
- [`themes-and-colors`](themes-and-colors.md) for color pairing and
  the naming convention this skill inherits
- [`spacing-and-alignment`](spacing-and-alignment.md) for the gaps
  around text and the leading between lines
- [`tables`](tables.md) for table cell typography
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  for mismatch classification
