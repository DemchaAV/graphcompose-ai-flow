# Reference Description

## Document

- Type: single-page A4 portrait resume/CV.
- Style: corporate two-column CV with a dark aubergine identity sidebar.
- Palette:
  - page background `#FFFFFF`
  - sidebar fill (cream beige) approximately `#E8DFD0`
  - dark plum / aubergine for bars, avatar card, and circle approximately `#3D2E3F`
  - body text near black `#181818`
  - secondary text dark gray approximately `#5A5A5A`
- Typography: heavy uppercase wide-tracked headings, regular sentence-case body.
- Layout: two columns. A narrow left identity sidebar (~33 % of usable width)
  and a wider main column (~67 %). The sidebar carries a dark plum
  rounded card at the very top with a centered circular CV badge.

## Page 1 — left sidebar

Top:

- A dark plum rounded rectangle that fills the full sidebar width and
  hosts the identity card.
- Inside the card, centered, a dark plum circle (slightly darker than
  the card itself) with the text `CV` in bold white, all caps.
- The bottom of the card has a clipped curve that flows downward into
  the cream sidebar plate.

Sidebar plate (cream):

- The cream sidebar plate runs the full height of the page below the
  identity card.

CONTACT block:

- Heading `CONTACT` left-aligned on a thin uppercase line, with a thin
  horizontal rule directly under it.
- Four rows, each with a small circular dark icon and a short text:
  - address (`1231 Main Street, Your City`)
  - email (`your@email.com`)
  - phone (`012 345 6789`)
  - website / company (`www.yourcompany.com`)

SKILLS block:

- Heading `SKILLS` with the same thin underline.
- Four labeled rating rows; each row has a left-aligned label
  `Valuable skill` and a right-aligned dot meter `● ● ● ● ●` where
  some dots are filled (dark) and the rest are open / lighter — the
  visual reads as a 5-step rating scale.

LANGUAGES block:

- Heading `LANGUAGES` with the same thin underline.
- Three rating rows with the same dot-meter pattern, labels
  `Language (Native)`, `Some Language`, `Another Language`.

INTEREST block:

- Heading `INTEREST` with the same thin underline.
- Three icon rows with a circular dark interest icon on the left and a
  short label on the right (`Music`, `Book`, `Traveling`).

## Page 1 — right main column

Top:

- A full-width-of-main dark plum bar that contains the identity
  heading:
  - `NAME SURENAME` in bold uppercase white, tracked wide
  - `YOUR JOB POSITION` underneath in a lighter weight white
- The bar runs from the right edge of the sidebar to the right page
  edge.

PROFESSIONAL PROFILE block:

- Heading on a dark plum bar reading `PROFESSIONAL PROFILE` in white
  uppercase.
- One short paragraph of body copy under the bar (Lorem-ipsum style).

EDUCATION block:

- Heading on a dark plum bar reading `EDUCATION` in white uppercase.
- Two entries; each entry has a years range (`2015 – 2019`) on a line
  of its own followed by a short description paragraph.

WORK EXPERIENCE block:

- Heading on a dark plum bar reading `WORK EXPERIENCE` in white
  uppercase.
- Three entries. Each entry has a filled black bullet marker followed
  by a horizontal connector rule that runs into the entry:
  - `Your Job Position | 2024` as the entry title
  - small italicized `Company name` under the title
  - bullet-list body of two to four lines of body text

## First-Draft Scope

The first revision should:

- reproduce the two-column geometry (narrow sidebar + wide main)
- preserve the section order in both columns
- use semantic GraphCompose rows, sections, paragraphs, lists, lines
- avoid raw coordinate drawing as the main layout strategy
- pull contact and interest glyphs from Iconify via the asset-resolver
- render `output.pdf` and `output.png` (single page)

Known first-draft limitations (deferred to later revisions):

- the dark sidebar identity card and the dark section-header bars are
  rendered as plain text-only blocks, not as filled panels. The
  background-panel primitive and any rounded-shape clipping (avatar
  card, circle) are deferred to revision-002+ once
  `backgrounds-and-panels` + `shapes-and-containers` are wired into
  this template.
- the rating dots are rendered as Unicode `●` / `○` glyphs in body
  copy. A real glyph-image or filled-circle table will replace them
  in a later revision.
- the cream sidebar plate behind CONTACT / SKILLS / LANGUAGES /
  INTEREST is also deferred to the panel pass; revision-001 leaves
  the sidebar background page-white.
- the `CV` circle in the identity card is rendered as bold spaced-
  uppercase text only; the dark filled circle behind it is part of
  the deferred panel pass.
