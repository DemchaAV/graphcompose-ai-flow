# Visual Analysis

## Page Structure

The reference is a single-page A4 portrait corporate CV. The page is
divided vertically into two columns: a narrow left identity sidebar
(~33 % of usable width) and a wider main column (~67 %). The sidebar
runs floor-to-ceiling against the cream plate; the main column
opens with a dark header bar and then alternates dark heading bars
with white-background content blocks.

## Visual Tokens

| Token            | Value                                  |
|------------------|----------------------------------------|
| Page background  | white `#FFFFFF`                        |
| Sidebar plate    | cream beige approximately `#E8DFD0`    |
| Dark plate       | dark aubergine approximately `#3D2E3F` |
| Body text        | near black approximately `#181818`     |
| Secondary text   | dark gray approximately `#5A5A5A`      |
| Accent (on dark) | white `#FFFFFF`                        |
| Heading family   | bold uppercase wide-tracked sans       |
| Body family      | regular sentence-case sans             |

## Relational geometry (proposed)

The Template Coder will derive every layout dimension from a small
set of base constants. The proposed base set is:

```
FULL_PAGE_WIDTH    = 595      # A4 portrait
PAGE_MARGIN_TOP    = 0        # the sidebar bleeds to the top of the page
PAGE_MARGIN_SIDE   = 0        # the sidebar bleeds to the left edge
PAGE_MARGIN_BOTTOM = 0        # the sidebar bleeds to the bottom edge
INNER_PAD_X        = 28       # paragraph padding inside each column
INNER_PAD_Y        = 28       # paragraph padding inside each column
COLUMN_GAP         = 0        # the sidebar plate butts directly against main
SIDEBAR_WEIGHT     = 0.33
MAIN_WEIGHT        = 1.0 - SIDEBAR_WEIGHT
```

Derived widths:

```
USABLE_WIDTH    = FULL_PAGE_WIDTH - 2 * PAGE_MARGIN_SIDE - COLUMN_GAP
SIDEBAR_WIDTH   = USABLE_WIDTH * SIDEBAR_WEIGHT
MAIN_WIDTH      = USABLE_WIDTH * MAIN_WEIGHT
ICON_COLUMN_W   = 16          # contact / interest icon point size
```

Revision-001 sets `PAGE_MARGIN_TOP/SIDE/BOTTOM = 0` and uses inner
section padding instead so that the future cream sidebar plate can
later bleed edge-to-edge without needing a separate base-constant
change.

## Region inventory

### Left sidebar

1. **IdentityCard** — dark plum rounded plate hosting the CV circle.
   Revision-001: bold spaced-uppercase `CV` rendered with the heading
   style; the dark plate and rounded circle are DEFERRED.
2. **Contact** — heading `CONTACT` + thin underline rule + four
   icon+text rows (location, email, phone, website).
3. **Skills** — heading `SKILLS` + underline rule + four labeled
   five-dot rating rows (`Valuable skill` + meter).
4. **Languages** — heading `LANGUAGES` + underline rule + three
   labeled five-dot rating rows.
5. **Interest** — heading `INTEREST` + underline rule + three
   icon+label rows (Music, Book, Traveling).

### Right main column

1. **NameBar** — dark plum bar with `NAME SURENAME` and
   `YOUR JOB POSITION` stacked. Revision-001: spaced-uppercase
   heading text only.
2. **ProfessionalProfile** — heading bar `PROFESSIONAL PROFILE` +
   one body paragraph.
3. **Education** — heading bar `EDUCATION` + two year-range entries
   each followed by a short paragraph.
4. **WorkExperience** — heading bar `WORK EXPERIENCE` + three
   entries. Each entry has a filled-bullet + connector marker (a
   small dark circle followed by a thin horizontal rule into the
   entry title), an italic company name beneath the title, and a
   bullet-list body.

## Risks

- The cream sidebar plate and the dark plum bars are panel fills.
  Until the `backgrounds-and-panels` skill is wired into this
  template, the sidebar block will read as a stacked text column on
  the white page. Visual Review must classify the missing fills as
  `ACCEPTED_LIMITATION` per
  [`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md).
- The dark `CV` circle inside the identity card requires a clipped
  shape primitive. Until `shapes-and-containers` is wired in, the
  circle is omitted and the badge is rendered as bold spaced
  uppercase `CV`.
- The rating dots use Unicode `●` / `○` glyphs in body copy. Exact
  vertical alignment between the label and the meter depends on the
  font; minor drift relative to the reference is expected.
- Pixel-perfect parity is not promised by this draft. The Visual
  Review for revision-001 will mark missing fills as documented
  substitutions, not as defects.
