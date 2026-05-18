# Status

- Revision: `revision-003`
- Parent: `revision-002`
- Status: `DRAFT`
- Renderable: YES
- Pixel-perfect: NO (see `visual-review.md` for the classified
  remaining differences)
- Iconify-backed icons: YES (9 tokens via `mdi` outline / brand
  variants; rasterized to PNG by ImageMagick via the asset-resolver)
- Google Fonts: YES (`Poppins`, bundled in `DefaultFonts`)

## How to re-render locally

```powershell
node .\scripts\render-cv-reference.mjs revision-003
```

The script invokes `tools/asset-resolver/src/cli.mjs` first
(downloading icons, validating fonts, writing
`assets-manifest.json`), then builds the runner and renders the PDF
under `-Dgraphcompose.revision.dir=<revisionDir>`.

## Asset summary

| Asset role | Source / icon set | Output |
|---|---|---|
| phone           | `mdi:phone-outline`          | `assets/icons/phone.png`           |
| email           | `mdi:email-outline`          | `assets/icons/email.png`           |
| location        | `mdi:map-marker-outline`     | `assets/icons/location.png`        |
| website         | `mdi:web`                    | `assets/icons/website.png`         |
| twitter         | `mdi:twitter`                | `assets/icons/twitter.png`         |
| facebook        | `mdi:facebook`               | `assets/icons/facebook.png`        |
| pinterest       | `mdi:pinterest`              | `assets/icons/pinterest.png`       |
| linkedin        | `mdi:linkedin`               | `assets/icons/linkedin.png`        |
| expertise-badge | `mdi:check-decagram-outline` | `assets/icons/expertise-badge.png` |
| heading font    | bundled Poppins              | `FontName.POPPINS`                 |
| body font       | bundled Poppins              | `FontName.POPPINS`                 |
| fallback font   | standard14 Helvetica         | `FontName.HELVETICA`               |
