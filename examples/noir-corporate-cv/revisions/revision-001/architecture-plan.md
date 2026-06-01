# Architecture Plan

## Template Shape

The template is implemented as `GeneratedCvTemplate` with a direct
`compose(DocumentSession)` method. The sample content is embedded in
the template body because the first goal is to prove the visual
template shape; a typed spec record + JSON-backed provider is
deferred to revision-002+ once the dark-panel pass lands.

## Component Map

| Region                              | GraphCompose primitive                          |
|-------------------------------------|-------------------------------------------------|
| Document                            | `GraphCompose.document(...)` → `pageFlow(...)`  |
| Two-column grid                     | `RowBuilder` with `weights(SIDEBAR_WEIGHT, MAIN_WEIGHT)` |
| Sidebar column                      | `SectionBuilder` with vertical spacing          |
| Identity card                       | `SectionBuilder` + bold spaced-uppercase `CV` (panel fill deferred) |
| Contact / Skills / Languages / Interest | `SectionBuilder` per block                  |
| Section underline rules             | `LineBuilder.horizontal(width).thickness(0.5)`  |
| Icon + text rows                    | `ParagraphBuilder.inlineImage(...)` + `inlineText(...)` |
| Rating dots                         | `ParagraphBuilder` text with Unicode `●` / `○`  |
| Name bar / profile / education / work-experience headings | `ParagraphBuilder` with bold spaced uppercase (dark-bar fill deferred) |
| Work-experience entry marker        | `ParagraphBuilder` with bold `●` followed by a `LineBuilder.horizontal(...)` connector |
| Work-experience entry body          | `ListBuilder.bullet().items(...)`               |

## Theme tokens (constants in the template)

```
ACCENT       = dark aubergine #3D2E3F      // dark-bar / avatar tint (used as text color in revision-001; fill in revision-002+)
BLACK        = #181818                     // body text
MUTED        = #5A5A5A                     // secondary text (italic company name, dates)
RULE         = #C6BCAE                     // thin underline rules in the sidebar
PAPER        = #FFFFFF                     // page background (and future panel content background)
CREAM        = #E8DFD0                     // future sidebar plate fill (unused in revision-001)
DARK_ON_DARK = #FFFFFF                     // future white text on dark bars (unused in revision-001 because bars are deferred)
```

## Base constants and derived widths

The constants live in the template body and follow the relational-
geometry rule from
[`prompts/template-coder-agent.md`](../../../../prompts/template-coder-agent.md):

```
FULL_PAGE_WIDTH     = 595        // A4 portrait
PAGE_MARGIN_TOP     = 36
PAGE_MARGIN_SIDE    = 36
PAGE_MARGIN_BOTTOM  = 36
COLUMN_GAP          = 28
SIDEBAR_WEIGHT      = 0.33
MAIN_WEIGHT         = 1.0 - SIDEBAR_WEIGHT
USABLE_WIDTH        = FULL_PAGE_WIDTH - 2 * PAGE_MARGIN_SIDE - COLUMN_GAP
SIDEBAR_WIDTH       = USABLE_WIDTH * SIDEBAR_WEIGHT
MAIN_WIDTH          = USABLE_WIDTH * MAIN_WEIGHT
RULE_WIDTH_SIDEBAR  = SIDEBAR_WIDTH
RULE_WIDTH_MAIN     = MAIN_WIDTH
```

Genuinely independent dimensions (theme-level visual choices, not
derived from page geometry):

```
ICON_POINT_SIZE_CONTACT   = 10
ICON_POINT_SIZE_INTEREST  = 11
HEADING_RULE_THICKNESS    = 0.6
WORK_MARKER_CONNECTOR_LEN = 18
WORK_MARKER_THICKNESS     = 0.8
```

## Important Constraints

- The render-runner pom copies `revisions/<id>/generated-template.java`
  to `target/generated-sources/revision/com/demcha/examples/cv/GeneratedCvTemplate.java`,
  so the file's public class MUST be `GeneratedCvTemplate` and live
  in package `com.demcha.examples.cv`.
- Each iconified row uses ONE paragraph with an inline image + inline
  text run so the icon and text stay on the same line. Bare images
  followed by paragraphs would push the text onto the next line.
- Section underline rules use `LineBuilder.horizontal(width)` with the
  sidebar / main width as the relational value, NOT a hard pixel.

## Known Follow-Up Revisions

- Wire `backgrounds-and-panels` to render the cream sidebar plate, the
  dark name bar, and the dark section-header bars on the main column.
- Wire `shapes-and-containers` to render the rounded identity card and
  the dark filled `CV` circle.
- Replace Unicode dot meters with a glyph-image or filled-circle
  `TableBuilder` row so the rating reads visually instead of as text.
- Split content out into a `NoirCorporateCvSpec` record plus a
  `NoirCorporateCvSpecProvider` Jackson loader and move the fixture
  to `cv-data.json` (mirrors how `cv-reference` evolved from revision-
  001 to revision-008).
- Re-run the visual diff after the panel pass and re-classify the
  pixel-AE delta.
