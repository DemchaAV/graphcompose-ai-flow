# Visual Analysis

## Reference

The source image is a single-page A4-like corporate CV with:

- cream sidebar card/plate on the left
- dark plum top name bar on the right
- dark plum section heading bars in the main column
- circular dark `CV` badge
- small contact/interest icons
- compact body text
- skills/languages dot meters
- work-experience entries with a marker and bullet-list details

## Revision-002 Target

This revision focuses on the missing high-signal visual surfaces from
revision-001:

- cream sidebar fill
- dark plum name bar
- dark plum main heading bars
- circular `CV` shape badge
- JSON-backed reusable data model

## Visual Tokens

| Token | Value |
|---|---|
| Page background | `#FFFFFF` |
| Sidebar | `#E8DFD0` |
| Dark plum | `#3D2E3F` |
| Darker circle | `#312633` |
| Body text | `#181818` |
| Muted text | `#5A5A5A` |
| Sidebar rule | `#847C72` |
| On-dark text | `#FFFFFF` |

## Geometry

The top-level grid keeps the reference relationship:

- sidebar: about one third of usable width
- main: about two thirds of usable width
- all column widths derive from page width, margins, gap, and weights

The main heading bars are deliberately fixed to derived `MAIN_WIDTH` so they
read as real horizontal bars rather than text labels.

## Remaining Visual Risk

- The screenshot is a low-resolution raster reference. Exact font metrics,
  crop height, and anti-aliased color edges cannot be recovered perfectly.
- Rating meters are font-safe text marks, not separate filled/open circle
  shapes.
- Work-experience connector lines are simplified to a title prefix because
  nested horizontal rows are not valid inside the top-level grid in
  GraphCompose 1.6.0.
