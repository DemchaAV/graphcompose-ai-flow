---
skillId: themes-and-colors
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.6
status: needs-validation
lastValidated: 2026-06-01
---

# Themes and Colors Skill

Use theme tokens for repeated colors.

Do not scatter random hex values across the template.

Create named tokens for:

- primary accent
- secondary accent
- background
- panel background
- muted text
- border
- table header
- warning/success badges

If exact color matching is not possible, document the substitution in visual-review.md.

## When to load

Load this skill any time:

- a new template is being authored and a theme must be defined
- a revision changes colors (the table is "too dark", the accent
  should be "warmer", the panels should be "softer")
- a reference is being mapped and the agent has to decide whether a
  color is part of the theme or local to one component
- visual review work flags color mismatches that need to be
  classified per the visual accuracy contract in
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)

This skill is also a prerequisite for [`tables`](tables.md) (for
header and zebra colors) and for the parallel-lane
`backgrounds-and-panels.md` skill (for page and section
backgrounds).

## Token naming convention

Token names must describe role, not appearance. The same token
should survive a complete palette redesign without renaming. Pick
semantic names that describe what the token does in the template.

- Good: `accentPrimary`, `accentSecondary`, `panelBackground`,
  `tableHeader`, `tableRowAlt`, `borderMuted`, `textMuted`,
  `badgeWarning`, `badgeSuccess`.
- Bad: `darkBlue`, `lightGray`, `red`, `theBlueOne`,
  `headerColor3`, `lighterGrayThanTheOtherGray`.

The visual name is allowed to *change* without the token name
changing. If the brand swaps the primary accent from blue to green,
`accentPrimary` is still the right token; only its hex value moves.
Hardcoding `darkBlue` everywhere would force a global rename and
would scatter color decisions across the template.

## Color substitution policy

Sometimes the reference uses a color that the agent cannot match
exactly — a custom brand color outside the documented palette, a
print-only spot color, or a gradient the engine cannot reproduce.
When exact match is not possible, the agent must document the
substitution rather than silently approximate.

Each substitution must be recorded in `visual-review.md` with:

- the reference hex (or a printed swatch description if hex is
  unknown)
- the hex the template uses
- the reason for the substitution (out of gamut, gradient
  unavailable, accessibility constraint, brand alternative)
- the mismatch classification per
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md):
  typically `MINOR` for a small shift or `ACCEPTED_LIMITATION` when
  the renderer cannot represent the original

Undocumented color drift is a defect under the visual accuracy
contract.

## Where colors should live

- Theme tokens belong in a dedicated theme value
  (`BusinessTheme`-style object) that is constructed once and passed
  into the template. The exact constructor surface is part of the
  verified examples — do not invent setters on it. See the
  no-invented-API rule in
  [`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md).
- Inside render methods, refer to tokens by name. Do not inline hex
  values. Comments next to the token definition are the right place
  for "reference brand blue, RGB 23 56 120" notes.
- One-off colors that legitimately belong to one component (a
  watermark tint, a single highlight) may live next to that
  component, but they should still be named constants, not bare
  hex literals scattered through compose code.

## Accessibility note

When a token serves as text-on-background, the agent should check
contrast against the relevant background token. Failed contrast is a
visual defect even when the reference itself fails — the agent must
flag it in `visual-review.md` and propose an alternative if the user
has not explicitly accepted the original. Treat this as `MINOR`
unless the failure makes content unreadable.

## Cross-references

- [`graphcompose-basics`](graphcompose-basics.md) for the place of
  themes in the mental model
- [`tables`](tables.md) for table-specific tokens
- [`typography`](typography.md) for font-color pairing
- [`spacing-and-alignment`](spacing-and-alignment.md) for the
  spacing tokens that share the same naming discipline
- parallel-lane `backgrounds-and-panels.md` and
  `shapes-and-containers.md` for token usage in panel and shape
  styling
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  for the classification rules that govern color substitutions
