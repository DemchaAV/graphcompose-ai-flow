# Visual Review

## Summary

`revision-006` is a behind-the-scenes refactor — content moves out
of Java into `cv-data.json`, the template becomes a pure renderer,
References emails become clickable `mailto:` links. The rendered
pages are pixel-identical to `revision-005`.

Rendered artifacts:

- [`./output.pdf`](./output.pdf)
- [`./output.png`](./output.png)
- [`./output-page-2.png`](./output-page-2.png)

## Passes

- Both pages render with the same layout as `revision-005`.
- Letter-spaced headings ("R O S E  H A R R I S",
  "C O N T A C T", "A W A R D S", "R E F E R E N C E S") are now
  computed from natural-form strings via `letterSpace(...)`. The
  JSON file carries `"Rose Harris"`, `"Contact"`, `"Awards"`,
  `"References"`.
- Award names and reference names are letter-spaced through the
  same helper.
- References emails are clickable `mailto:` links. PDF inspection
  shows 4 `mailto:` annotations (one per reference) plus the
  existing 1 contact-email `mailto:`, the 4 social `https://`
  links, and the 1 contact-website `https://` link — `/URI` count
  total 76 (each annotation produces multiple internal references).
- Contact `email` and `website` are clickable thanks to the
  optional `url` field on the `ContactEntry` record.
- `cv-data.json` is the SINGLE source of truth for content. The
  Java source has zero content literals (only structural tokens
  like `"Contact"`, `"Skills"` used as section keys that
  `letterSpace` transforms into the rendered form).

## Flow Verification

```text
asset-request.json           ← Architecture Mapper
                  ↓
asset-resolver CLI           ← Asset Resolver Agent
                  ↓
assets-manifest.json
assets/icons/*.png
                  ↓
cv-data.json                 ← Template Coder Agent
generated-template.java
                  ↓
preview-renderer --spec-provider MintEditorialCvSpecProvider
                  ↓
output.pdf, output.png, output-page-2.png
```

The render script picks up `cv-data.json` automatically: if the
file is present in the revision folder it passes
`--spec-provider com.demcha.examples.cv.MintEditorialCvSpecProvider`
to the renderer. Older revisions (002 / 003 / 004 / 005) without a
`cv-data.json` continue to render via the no-spec path.

## Known Differences

- None. Pixel-identical to `revision-005` on both pages —
  verified by `magick compare -metric AE`:
  `output.png` 0 / `output-page-2.png` 0.

### Footnote: the inverted-conditional bug

An earlier render of this revision had the references entry-end
padding condition inverted (`lastPair ? entryEnd : zero` instead
of `lastPair ? zero : entryEnd`), which collapsed the gap between
the first and second reference pair and stacked the rows on top
of each other. Caught via `magick compare`; fix is the only diff
between the two render passes of this revision. The lesson:
visual parity vs the parent revision is a hard gate, not a
nice-to-have — diff every byte-equivalent refactor against its
parent before declaring success.

## Recommendation

Promote `revision-006` to the current draft and use it as the new
APPROVED candidate after one more reference-parity pass (or just
flip approved → 006 if no further changes are needed). The template
is now extensible: any future content change is a one-file edit in
`cv-data.json`. Any future styling/structure change is a new
revision under `examples/cv-reference/revisions/`.
