# Visual Review — revision-001

## Sources

- Reference: [`../../reference/reference.png`](../../reference/reference.png)
- Output (clean): [`output.pdf`](output.pdf) /
  [`output.png`](output.png)
- Output (debug, with guide-lines): [`output-debug.pdf`](output-debug.pdf) /
  [`output-debug.png`](output-debug.png)

## Parity classification

This is the FIRST revision of a brand-new template. There is no
parent draft to AE-compare against, so this review reads as a list
of regions and a classification of each against the reference, per
[`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md):

| Region                  | Classification           | Notes |
|-------------------------|--------------------------|-------|
| Two-column geometry     | MATCH                    | Sidebar ≈ 33 % of usable width, main ≈ 67 %; the row weights derive from `SIDEBAR_WEIGHT = 0.33`. |
| Identity badge text     | MATCH                    | Centered `C V` in bold spaced uppercase. |
| Sidebar headings        | MATCH (style only)       | `CONTACT`, `SKILLS`, `LANGUAGES`, `INTEREST` in bold spaced uppercase with thin underline rules. |
| Contact icons + values  | MATCH                    | Four Iconify glyphs (`location`, `email`, `phone`, `website`) render inline at 10 pt next to the value text. |
| Main column section bars | DOCUMENTED SUBSTITUTION | Reference has WHITE text on DARK PLUM filled bars. Revision-001 renders the heading as dark-plum text with a thin accent rule because the panel-fill primitive is deferred. |
| Identity card background | DOCUMENTED SUBSTITUTION | Reference has a dark plum rounded card hosting a darker filled `CV` circle. Revision-001 renders the `CV` text only (no card, no circle). |
| Cream sidebar plate     | DOCUMENTED SUBSTITUTION  | Reference paints the sidebar column with a cream beige plate. Revision-001 leaves the sidebar transparent on the page-white background. |
| Skill / Language meters | DOCUMENTED SUBSTITUTION  | Reference uses 5 filled / open CIRCLE glyphs (U+25CF / U+25CB). Poppins does not include these codepoints, so revision-001 falls back to `•` (U+2022 BULLET) + lowercase `o`. |
| Work-experience markers | DOCUMENTED SUBSTITUTION  | Reference renders each entry with a black filled circle and a horizontal connector line that flows into the title. Revision-001 renders the marker as `•` followed by spaces and the title — connector geometry is deferred. |
| Interest rows           | MATCH                    | Three Iconify glyphs (`music`, `book`, `travel`) at 13 pt followed by the label. |
| Education entries       | MATCH                    | Year range in accent + paragraph body matches the reference layout. |
| Work-experience bodies  | MATCH                    | Italicized company name under the title + bullet list of highlights. |

`DOCUMENTED SUBSTITUTION` items are tracked against the
`ACCEPTED_LIMITATION` row of
[`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md);
they will be lifted to MATCH in a follow-up revision.

## Follow-up revisions

Tracked as future scope (in priority order):

1. **revision-002** — wire `backgrounds-and-panels` to render
   - the cream sidebar plate (full-bleed left column)
   - the dark plum identity card behind the `CV` badge
   - the dark plum filled name-bar above `PROFESSIONAL PROFILE`
   - the dark plum filled section-header bars on the main column
2. **revision-003** — wire `shapes-and-containers` for the
   filled CV circle inside the identity card, and replace the
   `• / o` text meter with a pair of pre-rasterized dot PNGs
   (filled / open) rendered inline so the meter reads as filled
   circles regardless of body font.
3. **revision-004** — replace the embedded fixture with a typed
   `NoirCorporateCvSpec` record plus a Jackson-backed
   `NoirCorporateCvSpecProvider` (mirrors how `cv-reference`
   evolved between its revision-001 and revision-005).

## Recommendation

Save revision-001 as a DRAFT and proceed to revision-002 once the
user signs off on the structural skeleton. The structural skeleton
is faithful to the reference; only the visual fills and the
glyph-image meter are deferred.
