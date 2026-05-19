# Mint Editorial CV

Two-page editorial-style resume / CV template for a graphic designer,
built on [GraphCompose 1.6](https://github.com/DemchaAV/GraphCompose).
Centered identity header with a full-width mint accent rule,
two-column body grids, Iconify-backed contact and social glyphs,
filled-badge social icons, two-column Awards and References grids,
and bundled `Poppins` typography.

| | |
|---|---|
| Template id          | `mint-editorial-cv` |
| Display name         | **Mint Editorial CV** |
| Source project       | `examples/cv-reference` |
| Source revision      | `revision-008` (APPROVED; supersedes revision-007, revision-004) |
| GraphCompose version | `1.6.0` |
| Spec record          | [`MintEditorialCvSpec`](src/MintEditorialCvSpec.java) |
| Render class         | [`MintEditorialCvTemplate`](src/MintEditorialCvTemplate.java) |

## Preview

`preview/output-page-1.png` and `preview/output-page-2.png` show the
finished render against the bundled `cv-data.example.json`. The full
[`preview/output.pdf`](preview/output.pdf) carries clickable contact
email, contact website, four social profile URLs, and four reference
`mailto:` links.

## What's in this bundle

```text
mint-editorial-cv/
├── template.json                       ← machine-readable manifest
├── README.md                           ← you are here
├── src/
│   ├── MintEditorialCvTemplate.java    ← render class (compose method)
│   ├── MintEditorialCvSpec.java        ← typed content record
│   └── MintEditorialCvSpecProvider.java ← Jackson-backed JSON loader
├── data/
│   └── cv-data.example.json            ← fixture content (Rose Harris)
├── assets/
│   ├── asset-request.json              ← reproducible icon spec
│   └── icons/*.png                     ← pre-rasterized Iconify glyphs
└── preview/
    ├── output.pdf
    ├── output-page-1.png
    └── output-page-2.png
```

## Copy into your own project

1. Drop the three `src/*.java` files into your own
   `com.demcha.examples.cv` package (or rename the package — search
   and replace, no internal references rely on the exact name).
2. Add the two dependencies to your `pom.xml`:

   ```xml
   <dependency>
     <groupId>com.github.DemchaAV</groupId>
     <artifactId>GraphCompose</artifactId>
     <version>v1.6.0</version>
   </dependency>
   <dependency>
     <groupId>com.fasterxml.jackson.core</groupId>
     <artifactId>jackson-databind</artifactId>
     <version>2.17.2</version>
   </dependency>
   ```

3. Copy `data/cv-data.example.json` into your project. Rename to
   `cv-data.json` and edit the fields — name, contact, experience,
   skills, social URLs, awards, references. The schema is mirrored
   in `MintEditorialCvSpec` and documented in the original
   revision's
   [`data-schema.md`](../../examples/cv-reference/revisions/revision-006/data-schema.md).

4. Copy the entire `assets/` folder. The icon PNGs are
   pre-rasterized at the resolution and color the template expects;
   you can swap them by editing `asset-request.json` and re-running
   the [asset-resolver](../../tools/asset-resolver) CLI.

5. Render:

   ```java
   System.setProperty(
       "graphcompose.revision.dir",
       Paths.get("path/to/your/data-folder").toString());

   try (DocumentSession session = GraphCompose.document(Paths.get("out.pdf"))
           .pageSize(DocumentPageSize.A4)
           .create()) {
       MintEditorialCvSpec spec = MintEditorialCvSpecProvider.create();
       new MintEditorialCvTemplate().compose(session, spec);
       session.buildPdf();
   }
   ```

   `graphcompose.revision.dir` must point at the folder that contains
   BOTH `cv-data.json` and the `assets/` subfolder. If you keep
   them together (recommended), set the property to that folder.

## Edit content (no Java)

Open `data/cv-data.example.json` and change any field — name,
contact lines, jobs, awards, social URLs, references with emails.
The template re-renders from JSON; you never touch the Java source.

Spaced-uppercase styling ("R O S E  H A R R I S") is applied
automatically by the template at render time. Write `"Rose Harris"`
in JSON.

Clickable links live on the data side:

- `contact[].url` → makes a contact row clickable
  (`mailto:`, `tel:`, `https://`).
- `social[].url` → makes the icon + label clickable as one rectangle.
- `references[].email` → wrapped in a `mailto:` link automatically.

## Fonts

The template uses **Poppins** for both heading and body. Poppins ships
inside the GraphCompose JAR (via `DefaultFonts.googleFamilies()`), so
**no `.ttf` files travel with this bundle** — the GraphCompose
dependency is enough. `template.json#fonts` exposes the manifest:

```json
"fonts": [
  { "role": "heading",  "family": "Poppins",   "fontName": "POPPINS",   "source": "graphcompose-bundled", "registration": "default-fonts" },
  { "role": "body",     "family": "Poppins",   "fontName": "POPPINS",   "source": "graphcompose-bundled", "registration": "default-fonts" },
  { "role": "fallback", "family": "Helvetica", "fontName": "HELVETICA", "source": "standard14",           "registration": "standard14" }
]
```

To swap typography:

| Replacement family                              | What to do                                                                                                                                                                                                |
|---|---|
| Any **bundled GraphCompose** family (Lato, Fira Sans, IBM Plex, Kanit, ...)         | Change `HEADING_FONT` / `BODY_FONT` constants in `MintEditorialCvTemplate.java`. No registration, no file copy.                                                                                            |
| **Standard 14** (Helvetica / Times / Courier)   | Use `FontName.HELVETICA` / `FontName.TIMES_ROMAN` / `FontName.COURIER`. Always available.                                                                                                                  |
| **Custom Google font** (e.g. Inter, Roboto Mono) or in-house family | 1. Drop `.ttf`/`.otf` files under `assets/fonts/` (the bundle has the folder waiting if a future revision needs it). 2. Register before opening the session — `FontFamilyDefinition.files(...).boldPath(...).build()` then `FontLibrary.addFont(...)`. 3. Point `HEADING_FONT` / `BODY_FONT` at `FontName.of("Inter")` (etc). |

If you go the custom-font route in a downstream project, add the
font role to your own `asset-request.json` with
`"source": "google-fonts"` so the asset-resolver records the
`manual_drop_required` marker against it. The bundled template here
ships with NO `assets/fonts/` folder by design — the asset-resolver
only creates the directory when a non-bundled font role asks for it.

## Customize visuals

All tuning knobs live in `MintEditorialCvTemplate.java` as
`private static final` constants:

| Constant                       | Tunes                              |
|---|---|
| `ACCENT`, `BLACK`, `MUTED`, `RULE` | Theme colors                  |
| `HEADING_FONT`, `BODY_FONT`        | Typography (any bundled Google family works without registration) |
| `PAGE_MARGIN_*`, `COLUMN_GAP`      | Page geometry                  |
| `SIDEBAR_WIDTH`, `SKILL_BAR_WIDTH` | Sidebar / skill bar sizing     |
| `GRID_COLUMN_WIDTH`, `GRID_COLUMN_GAP` | Awards / References two-column grid |
| `ICONS` (map)                       | Per-icon point sizes (mirror of `asset-request.json#pointSize`) |

For more invasive changes (new section, different page layout,
swapping templates entirely), open a new revision in
`examples/cv-reference/revisions/`. The publish step regenerates
this bundle when that revision is APPROVED.

## Reference

- Source flow: [`examples/cv-reference/revisions/revision-006/`](../../examples/cv-reference/revisions/revision-006)
- Original visual reference: [`reference-page-1.png`](../../examples/cv-reference/reference/reference-page-1.png)
  and [`reference-page-2.png`](../../examples/cv-reference/reference/reference-page-2.png)
- Asset-resolver: [`tools/asset-resolver/`](../../tools/asset-resolver)
- Schema doc: [`data-schema.md`](../../examples/cv-reference/revisions/revision-006/data-schema.md)
