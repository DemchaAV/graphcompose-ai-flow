# Architecture Plan

## Target GraphCompose Version

`1.6.0` (skill pack `skills/versions/graphcompose-1.6`).

## Selected Skills

`graphcompose-basics`, `layout-primitives`, `themes-and-colors`,
`typography`, `spacing-and-alignment`, `shapes-and-containers`,
`backgrounds-and-panels`, `pagination`, `tables`,
`visual-to-graphcompose-mapping`, `revision-discipline`.

## Document Structure

Inherited from `revision-003`: two-page A4 portrait, centered header,
full-width mint rule, two-column grid on both pages.

## Component Mapping

| Region | GraphCompose primitive | Change vs r-003 |
|---|---|---|
| Document | `DocumentSession.pageFlow(...)` | unchanged |
| Header | `SectionBuilder` paragraphs | unchanged |
| Horizontal divider | full-bleed `LineBuilder` | unchanged |
| Page-one / page-two grids | `RowBuilder` columns | unchanged |
| Contact line | inline-image paragraph | unchanged |
| Social line | inline-image paragraph | NEW icon set (entypo-social *-with-circle), pt size 13 |
| Expertise badge | `SectionBuilder.addImage(...)` | NEW glyph (mdi:check-circle-outline), pt size 38 |
| Awards | `TableBuilder` with 2 fixed columns, per-line plain-text cells | NEW true two-column grid |
| References | `TableBuilder` with 2 fixed columns, per-line plain-text cells | NEW true two-column grid |
| Skills | label paragraph + horizontal rule + vertical marker line | unchanged |

## Why per-line table cells (not composed SectionNode cells)

`DocumentTableCell.node(SectionNode)` is in the public API but the
v1.6 PDF backend renders the cell box without dispatching the
section's child paragraph fragments (only `ParagraphNode` and
`ListNode` composed cells render correctly today). Two visual
lines per award/reference entry — each with its own
`labelStyle` / `smallStyle` — cannot fit in a single paragraph
without an inline-style switch.

The working pattern is therefore a per-line plain-text cell with a
per-cell `DocumentTableStyle` carrying the right text style and
bottom-padding. Each Award entry becomes two table rows (label,
subtext); each Reference entry becomes four (name, company, phone,
email). The two columns are `DocumentTableColumn.fixed(130)` with
the left column adding 28pt of right-padding to create the visible
gap between award/reference pairs.

To suppress the engine's default 1pt black cell border the per-cell
style explicitly sets a zero-width stroke
(`DocumentStroke.of(DocumentColor.WHITE, 0)`) — under
`TableCellLayoutStyle.merge`, a null stroke inherits the default
border, so the zero-width override is the canonical "no border".

## Theme Tokens

Inherited from `revision-003`. Icon color stays `BLACK` (#181818) so
the icons sit on the same visual weight as the labels.

## Design Assets

Icons are sourced from [iconify.design](https://icon-sets.iconify.design/).
The `entypo-social` icon set carries the brand-name-with-circle badge
style the reference uses; `mdi` covers the contact and expertise
glyphs. Every icon now declares both a PNG raster size (`size`, in
pixels) and a document point size (`pointSize`, in PDF points).

| Token | Iconify id | size (px) | pointSize (pt) |
|---|---|---:|---:|
| `phone`           | `mdi:phone-outline`                  | 64  |  9 |
| `email`           | `mdi:email-outline`                  | 64  |  9 |
| `location`        | `mdi:map-marker-outline`             | 64  |  9 |
| `website`         | `mdi:web`                            | 64  |  9 |
| `twitter`         | `entypo-social:twitter-with-circle`  | 96  | 13 |
| `facebook`        | `entypo-social:facebook-with-circle` | 96  | 13 |
| `pinterest`       | `entypo-social:pinterest-with-circle`| 96  | 13 |
| `linkedin`        | `entypo-social:linkedin-with-circle` | 96  | 13 |
| `expertise-badge` | `mdi:check-circle-outline`           | 192 | 38 |

Fonts unchanged: `Poppins` (bundled GraphCompose Google family) for
heading + body, `Helvetica` standard-14 as fallback. Recorded in
[`asset-request.json`](./asset-request.json) and confirmed in
[`assets-manifest.json`](./assets-manifest.json).

## Template Class Shape

```java
public final class GeneratedCvTemplate {
    private static final Map<String, IconSpec> ICONS = Map.ofEntries(...);
    // Populated by the Template Coder agent from assets-manifest.json
    // so the Java side never needs to parse JSON at runtime.

    private record IconSpec(String fileName, double pointSize) {}

    public void compose(DocumentSession document) { ... }

    private void iconLine(SectionBuilder section, String iconToken, String value) {
        IconSpec spec = ICONS.get(iconToken);
        // ... addParagraph().inlineImage(..., spec.pointSize(), spec.pointSize()) ...
    }

    private void renderAwards(SectionBuilder section) {
        section.addTable(table -> table
            .columns(DocumentTableColumn.fixed(130), DocumentTableColumn.fixed(130))
            .rowCells(...));
    }
}
```

## Render Methods

Same set as `revision-003`, plus the new `gridText` /
`cellStyle(textStyle, bottomPadding, rightPadding)` helpers that
build no-border, per-line table cells for Awards and References.

## Testing Plan

Inherited from `revision-003`. Smoke test
(`GeneratedCvTemplateTest#composeDoesNotThrow`,
`resolvedAssetsAreOnDisk`) still applies: every icon in
`assets-manifest.json` must exist on disk and the template must
render without throwing.

## Visual Risks

- The two-column gap is fixed at 28pt; if the Main column ever shrinks,
  the right column's "AWARD NAME HERE" might wrap.
- The references entry-end uses 18pt bottom padding on the last small
  line; if line spacing changes globally, that spacing may need to be
  retuned.
- `entypo-social:*-with-circle` icons are filled black circles, so
  they print darker than the contact line glyphs. Visual review
  acknowledges this as intentional reference parity, not a defect.

## Known Limitations

- Same as `revision-003`: multi-page visual-diff scoring is still out
  of scope, and the `google-fonts` non-bundled download path is not
  exercised here.
- `DocumentTableCell.node(SectionNode)` is not yet usable in the v1.6
  PDF backend for cells that must carry multiple styled paragraphs.
  Recorded as a known limitation; the workaround is the per-line
  table-row approach used here.
