# Architecture Plan

## Target GraphCompose Version

`1.6.0` (skill pack `skills/versions/graphcompose-1.6`).

## Selected Skills

`graphcompose-basics`, `layout-primitives`, `themes-and-colors`,
`typography`, `spacing-and-alignment`, `shapes-and-containers`,
`backgrounds-and-panels`, `pagination`, `visual-to-graphcompose-mapping`,
`revision-discipline`.

## Document Structure

Unchanged from `revision-002` at the page-flow level: two-page A4
portrait, centered header, full-width mint rule, two-column grid on
both pages.

## Component Mapping

| Region | GraphCompose primitive | Change vs r-002 |
|---|---|---|
| Document | `DocumentSession.pageFlow(...)` | unchanged |
| Header | `SectionBuilder` paragraphs | font swap to `FontName.POPPINS` |
| Horizontal divider | full-bleed `LineBuilder` | unchanged |
| Page-one / page-two grids | `RowBuilder` columns | unchanged |
| Contact line | row of `ImageBuilder` + paragraph | NEW: image replaces text marker |
| Social line | row of `ImageBuilder` + paragraph | NEW: image replaces text marker |
| Expertise badge | `ImageBuilder` above category list | NEW: image replaces `V` glyph |
| Education / experience / awards / references | section paragraphs and lists | font swap only |
| Skills | label paragraph + horizontal rule + vertical marker line | font swap only |

## Theme Tokens

| Token | Hex | Used for |
|---|---|---|
| `ACCENT` | `#8BCFBE` | divider, section headings |
| `BLACK` | `#181818` | body text, skill markers, icon color |
| `MUTED` | `#525252` | secondary text |
| `RULE` | `#464646` | skill-bar baseline |

Icon color matches `BLACK` so the contact and social glyphs sit on
the same visual weight as the labels.

## Design Assets

Icons are sourced from [iconify.design](https://icon-sets.iconify.design/).
The preferred set is `mdi` (Material Design Icons), with `tabler` and
`lucide` as the priority fallback. Every icon is downloaded as PNG
into `assets/icons/<token>.png` at 64 px height so it scales sharply
to the 10 × 10 pt placement.

| Token | Iconify id | Purpose |
|---|---|---|
| `phone`           | `mdi:phone-outline`           | contact – phone |
| `email`           | `mdi:email-outline`           | contact – email |
| `location`        | `mdi:map-marker-outline`      | contact – address |
| `website`         | `mdi:web`                     | contact – website |
| `twitter`         | `mdi:twitter`                 | social – Twitter |
| `facebook`        | `mdi:facebook`                | social – Facebook |
| `pinterest`       | `mdi:pinterest`               | social – Pinterest |
| `linkedin`        | `mdi:linkedin`                | social – LinkedIn |
| `expertise-badge` | `mdi:check-decagram-outline`  | expertise – check badge |

Fonts use the GraphCompose bundled Google Fonts list. `Poppins` was
chosen as the body family because its silhouette and x-height are the
closest match to the geometric sans-serif in the reference; `Bold`
weight covers headings and labels through the existing
`DocumentTextDecoration.BOLD` style. The standard 14 PDF fallback
remains `Helvetica`.

| Role | Family | Weights | Source | GraphCompose `FontName` |
|---|---|---|---|---|
| `heading` | `Poppins`   | 400, 700 | `graphcompose-bundled` | `POPPINS` |
| `body`    | `Poppins`   | 400, 700 | `graphcompose-bundled` | `POPPINS` |
| `fallback`| `Helvetica` | 400, 700 | `standard14`           | `HELVETICA` |

The exact icon set ids and font family/source/weights are mirrored in
[`asset-request.json`](./asset-request.json); the Asset Resolver Agent
writes the verified, downloaded paths into
[`assets-manifest.json`](./assets-manifest.json).

## Data Model Assumptions

Inherited from `revision-002`. Content is embedded; no external spec
is required.

## Template Class Shape

```java
public final class GeneratedCvTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));
    private static final Path ICONS_DIR = REVISION_DIR.resolve("assets").resolve("icons");

    public void compose(DocumentSession document) {
        // pageFlow → header → divider → page-one grid → pageBreak → page-two grid
    }

    private void contactLine(SectionBuilder section, String iconFile, String value) {
        section.addRow(row -> { /* image + paragraph */ });
    }

    private void socialLine(SectionBuilder section, String iconFile, String label) {
        section.addRow(row -> { /* image + paragraph */ });
    }
}
```

## Render Methods

`renderHeader`, `renderPageOne`, `renderPageTwo`, `renderContact`,
`renderInterests`, `renderEducation`, `renderProfile`,
`renderExperiencePageOne`, `renderExpertise`, `renderSkills`,
`renderSocial`, `renderExperiencePageTwo`, `renderAwards`,
`renderReferences`, plus helpers `iconRow`, `skillBar`, `heading`,
`label`, `body`, `style`, `labelStyle`, `bodyStyle`, `smallStyle`.

## Testing Plan

Inherited from `revision-002`. `tools/preview-renderer` invokes
`GeneratedCvTemplate#compose(DocumentSession)` through reflection and
writes `output.pdf`, `output.png`, and `output-page-2.png`. The
two-page PDF must render without throwing, every icon file in
`assets-manifest.json` must exist on disk before rendering starts,
and `FontName.POPPINS` must resolve to the bundled face.

## Visual Risks

- Icon raster size: 64 px PNGs rendered at 10 × 10 pt may be slightly
  fuzzy on screen but print cleanly. If the preview shows blur,
  re-resolve at 96 px in a follow-up revision.
- Poppins tracking differs from the reference; spaced uppercase
  strings still approximate the original letter spacing.
- `mdi:check-decagram-outline` is heavier than the reference badge.
  Classified MINOR; can be swapped for `mdi:check-circle-outline` in
  a follow-up.

## Known Limitations

- Multi-page visual-diff scoring is still out of scope (covered in
  `docs/visual-review-loop.md`).
- The `google-fonts` source path (downloading non-bundled families) is
  not exercised by this revision. The Asset Resolver Agent supports it
  by marking the family `manual_drop_required`; that capability is
  reserved for a future revision that needs a truly bespoke face.
