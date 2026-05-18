# Status

- Template: **Mint Editorial CV** (`cv-reference`)
- Revision: `revision-004`
- Parent: `revision-003`
- Status: `APPROVED` (2026-05-18T23:00:00Z)
- Renderable: YES
- Pixel-perfect: NO (see `visual-review.md` for the remaining MINOR
  differences)
- Asset flow controls icon sizes: YES (via `pointSize` in
  `asset-request.json` → `assets-manifest.json` → `ICONS` table in
  the generated template)

## How to re-render locally

```powershell
node .\scripts\render-cv-reference.mjs revision-004
```

The script runs the asset-resolver to refresh icons (downloads SVG
from `api.iconify.design`, rasterizes via ImageMagick), then renders
under `-Dgraphcompose.revision.dir=<revisionDir>` so the static
`ICONS_DIR` in the template resolves to this revision's
`assets/icons/` folder.

## Asset summary

| Asset role | Source / icon set | PNG size | pointSize |
|---|---|---:|---:|
| phone           | `mdi:phone-outline`                  |  64 px |  9 pt |
| email           | `mdi:email-outline`                  |  64 px |  9 pt |
| location        | `mdi:map-marker-outline`             |  64 px |  9 pt |
| website         | `mdi:web`                            |  64 px |  9 pt |
| twitter         | `entypo-social:twitter-with-circle`  |  96 px | 13 pt |
| facebook        | `entypo-social:facebook-with-circle` |  96 px | 13 pt |
| pinterest       | `entypo-social:pinterest-with-circle`|  96 px | 13 pt |
| linkedin        | `entypo-social:linkedin-with-circle` |  96 px | 13 pt |
| expertise-badge | `mdi:check-circle-outline`           | 192 px | 38 pt |
| heading font    | bundled Poppins                      | — | — |
| body font       | bundled Poppins                      | — | — |
| fallback font   | standard14 Helvetica                 | — | — |
