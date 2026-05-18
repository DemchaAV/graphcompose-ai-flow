# Visual Analysis

## Page Structure

No change from `revision-002`. The reference is a two-page A4 portrait
resume. Page 1 has a centered identity header, a thick mint horizontal
divider, and a two-column content grid. Page 2 continues the
two-column grid without the large identity header.

## Visual Tokens

| Token | Value |
|---|---|
| Accent | muted mint, approximately `#8BCFBE` |
| Body text | near black |
| Secondary text | dark gray |
| Background | white |
| Heading style | spaced uppercase text |
| Main font intent | clean geometric sans-serif (Poppins-like) |

## Page 1 Regions

- Header: large centered `ROSE HARRIS`, smaller mint `GRAPHIC DESIGNER`.
- Divider: thick mint horizontal rule.
- Left sidebar: Contact, Interests, Education.
- Main column: Profile and Experience.

## Page 2 Regions

- Left sidebar: Expertise (with a check-decagram badge above the
  uppercase category list), Skills, Social.
- Main column: Experience, Awards, References.

## Icons in the reference

The reference shows small monochrome glyphs in two regions:

- Contact lines: phone, email, map-pin, globe.
- Social lines: Twitter bird, Facebook `f`, Pinterest `P`, LinkedIn
  `in`.
- Expertise: a circled check / badge above the category list.

Iconify is the chosen source. Outline-style glyphs match the
minimalist editorial feel of the reference. The exact icon set names
are recorded in `architecture-plan.md` and downloaded by the Asset
Resolver Agent.

## Typography

The reference uses a geometric sans-serif with spaced uppercase
headings. `Poppins` is the closest bundled GraphCompose family by
silhouette and x-height. `Helvetica` remains the documented PDF-safe
fallback per `skills/versions/graphcompose-1.6/typography.md`.

## Risks

- The PNG-rasterized Iconify icons are size-dependent; the request
  sets `size: 64` so the icons stay sharp at the 10×10 pt placement.
- Poppins letter spacing differs from the original reference font;
  spaced uppercase strings will still approximate tracking.
- The check-decagram glyph from Iconify is heavier than the
  hand-drawn badge in the reference. Classified as MINOR.
