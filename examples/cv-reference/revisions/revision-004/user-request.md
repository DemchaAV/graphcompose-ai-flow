# User request

Iterate on revision-003 to address three reference-parity gaps the user
flagged on `examples/cv-reference/reference/reference-page-2.png`:

1. The Expertise badge in the reference is a clean thin-line circle with
   a check inside, and it is visibly LARGE — much larger than the
   contact icons. revision-003 used `mdi:check-decagram-outline` at
   ~22pt, which is both the wrong glyph and too small. Switch to
   `mdi:check-circle-outline` and render at ~38pt.
2. The social icons in the reference are filled black circle badges
   with a white brand glyph inside. revision-003 used the plain
   `mdi:twitter` / `mdi:facebook` etc. — outline glyphs without the
   badge background. Switch to `entypo-social:*-with-circle` for all
   four social platforms and size them around 13pt.
3. Awards and References on the reference are real TWO-COLUMN layouts
   inside the Main column — each row has two award/reference entries
   side by side. revision-003 fakes this with whitespace-padded text
   which cascades and misaligns. Replace with a proper two-column
   layout (TableBuilder with two auto columns inside the Main section).

Also: the flow itself must support per-icon point sizes. Extend
`asset-request.json` with a `pointSize` field and surface it through
`assets-manifest.json` so the Template Coder can dimension each icon
from the manifest instead of hard-coded constants.
