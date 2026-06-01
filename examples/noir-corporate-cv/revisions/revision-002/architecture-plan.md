# Architecture Plan

## Revision Goal

Turn the `revision-001` structural draft into a usable visual draft for the
supplied single-page corporate CV reference.

## Layout

Base constants:

```text
FULL_PAGE_WIDTH   = 595
PAGE_MARGIN_SIDE  = 20
COLUMN_GAP        = 24
SIDEBAR_WEIGHT    = 0.335
MAIN_WEIGHT       = 1.0 - SIDEBAR_WEIGHT
```

Derived widths:

```text
USABLE_WIDTH  = FULL_PAGE_WIDTH - 2 * PAGE_MARGIN_SIDE - COLUMN_GAP
SIDEBAR_WIDTH = USABLE_WIDTH * SIDEBAR_WEIGHT
MAIN_WIDTH    = USABLE_WIDTH * MAIN_WEIGHT
```

Only the top-level `MainGrid` is a `RowBuilder`. Inner layout stays in
sections, tables, paragraphs, line primitives, and shape containers because
GraphCompose 1.6.0 rejects nested horizontal rows under a row-owned section.

## Component Mapping

| Reference region | GraphCompose mapping |
|---|---|
| Cream left plate | `SectionBuilder.fillColor(SIDEBAR)` on `Sidebar` |
| CV circular badge | `ShapeContainerBuilder.circle(...)` with centered paragraph |
| Dark top name bar | `SectionBuilder.fillColor(DARK)` on `NameBar` |
| Main dark section bars | one-cell `TableBuilder` with dark fill and fixed `MAIN_WIDTH` |
| Contact / Interest icons | Iconify PNGs rendered as inline images |
| Skills / Languages meters | font-safe five-token meter (`bullet` + `o`) |
| Work experience | paragraph title, italic company, GraphCompose bullet list |

## Data Contract

The template now renders through:

- `NoirCorporateCvSpec`
- `NoirCorporateCvSpecProvider`
- `cv-data.json`

The template body owns only layout, styling, section labels, and visual
transform helpers. Variable content is read from `cv-data.json`.

## Assets

Reused from parent revision:

- `mdi:map-marker`
- `mdi:email`
- `mdi:phone`
- `mdi:web`
- `mdi:music-circle`
- `mdi:book-open-variant`
- `mdi:airplane`

Fonts:

- heading: Poppins, GraphCompose bundled `FontName.POPPINS`
- body: Poppins, GraphCompose bundled `FontName.POPPINS`
- fallback: Helvetica

## Known Design Tradeoffs

- Section heading bars now use tables to force full `MAIN_WIDTH`; direct
  `SectionBuilder.fillColor` shrank to text width in this renderer.
- Rating dots remain text-based because shape dots would require nested row
  layout or separate raster dot assets.
- Work-experience marker connector remains simplified because nested marker
  rows are not allowed inside the top-level grid.
