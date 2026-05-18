# Mint Editorial CV (`cv-reference`)

A two-page editorial-style resume/CV template for a graphic designer,
built from the supplied reference screenshots. The "Mint Editorial CV"
display name covers both pages: a centered identity header with a
full-width mint accent rule, two-column body grids on each page,
Iconify-backed contact and social glyphs, and bundled Poppins
typography.

| Field | Value |
|---|---|
| Project slug                | `cv-reference` |
| Display name                | **Mint Editorial CV** |
| Approved revision           | `revision-004` |
| Current draft               | `revision-006` (data-driven refactor — content in `cv-data.json`) |
| Spec class                  | [`MintEditorialCvSpec`](render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpec.java) |
| Data schema                 | [`revisions/revision-006/data-schema.md`](revisions/revision-006/data-schema.md) |
| Target GraphCompose version | `1.6.0` |

## Editing content

Open [`revisions/revision-006/cv-data.json`](revisions/revision-006/cv-data.json)
and change any field — name, contact info, jobs, awards, social
links, references with emails. The template re-renders from JSON
on the next `node scripts/render-cv-reference.mjs revision-006`.
No Java edits needed.

Spaced-uppercase styling ("R O S E  H A R R I S") is applied
automatically by the template via `letterSpace(...)`. Write
`"Rose Harris"` in JSON.

Clickable links live on the data side:

- `contact[].url` makes a contact row clickable
  (`mailto:`, `tel:`, `https://`).
- `social[].url` makes the icon + label clickable.
- `references[].email` is wrapped in a `mailto:` link automatically.

## Status

`revision-004` is APPROVED as the **Mint Editorial CV** baseline. It is
the first revision wired into the documented asset flow:

```text
Architecture Mapper → asset-request.json
                  ↓
Asset Resolver     → assets/icons/*.png + assets-manifest.json
                  ↓
Template Coder     → generated-template.java reads the manifest
                  ↓
Test + Render      → output.pdf + output.png + output-page-2.png
```

Compared to `revision-002`, the chain replaces letter placeholders
with real [iconify.design](https://icon-sets.iconify.design/) glyphs
and switches typography to bundled `Poppins`. `revision-004` then
tightens reference parity: the Expertise badge is
`mdi:check-circle-outline` at 38pt, the four social entries use the
filled circular `entypo-social:*-with-circle` badges, and Awards and
References render as real two-column `TableBuilder` grids. Per-icon
point sizes are declared in `asset-request.json` and surfaced through
`assets-manifest.json` — the flow controls sizing, not Java
constants.

`revision-005` (current draft) adds clickable hyperlinks on the four
Social entries — both the badge icon and the visible label open the
profile URL when clicked in a PDF reader. The pages are pixel-
identical to `revision-004`; the difference is purely in the PDF
annotation layer.

See [`revisions/revision-005/visual-review.md`](revisions/revision-005/visual-review.md)
for the current parity status.

## Re-render Locally

```powershell
node ..\..\scripts\render-cv-reference.mjs revision-006
```

The script invokes the asset-resolver first (downloads icons from
Iconify, rasterizes SVG → PNG with ImageMagick, validates fonts
against `DefaultFonts.googleFamilies()`, writes
`assets-manifest.json`), then builds the runner and renders the PDF
under `-Dgraphcompose.revision.dir=<revisionDir>`.

Outputs:

```text
examples/cv-reference/revisions/revision-006/output.pdf
examples/cv-reference/revisions/revision-006/output.png
examples/cv-reference/revisions/revision-006/output-page-2.png
examples/cv-reference/revisions/revision-006/assets-manifest.json
examples/cv-reference/revisions/revision-006/assets/icons/*.png
examples/cv-reference/revisions/revision-006/cv-data.json   ← content
```

The same script can re-render an older revision by passing its id
(e.g. `node ..\..\scripts\render-cv-reference.mjs revision-002`).
Older revisions without `asset-request.json` simply skip the
asset-resolver step.

## Layout

```text
examples/cv-reference/
  README.md
  template-project.json
  reference/
    reference.png
    reference-page-1.png
    reference-page-2.png
    reference.md
  render-runner/
    pom.xml
    src/main/java/com/demcha/examples/cv/
      MintEditorialCvSpec.java          ← stable spec record
      MintEditorialCvSpecProvider.java  ← reads cv-data.json via Jackson
  revisions/
    revision-001/
    revision-002/
    revision-003/
    revision-004/  ← APPROVED (Mint Editorial CV baseline)
    revision-005/  ← DRAFT (adds clickable Social hyperlinks)
    revision-006/  ← DRAFT (data-driven: content in cv-data.json)
      asset-request.json
      assets-manifest.json
      assets/
        icons/*.png
      cv-data.json                       ← content (edit this!)
      data-schema.md                     ← schema of cv-data.json
      generated-template.java
      ...
```
