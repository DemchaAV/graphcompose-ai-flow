# asset-resolver

Resolves the design assets that a GraphCompose template needs — icons from
[iconify.design](https://icon-sets.iconify.design/) and fonts from
[Google Fonts](https://fonts.google.com/) — and writes them into the
revision folder so the Template Coder agent can wire them into the
generated Java template.

The resolver is the only step that talks to the outside world. Every
artifact it produces lives inside the revision folder, which keeps each
revision self-contained and rollback-safe.

## Inputs and outputs

```text
<revision>/asset-request.json     ← written by Architecture Mapper Agent
<revision>/assets/icons/*.png     ← written by asset-resolver
<revision>/assets/fonts/*.ttf     ← written by asset-resolver (when downloads land)
<revision>/assets-manifest.json   ← written by asset-resolver, read by Template Coder
```

`asset-request.json` schema:

```json
{
  "icons": [
    {
      "token": "phone",
      "query": "phone outline",
      "preferredSets": ["mdi", "tabler", "lucide"],
      "size": 64,
      "pointSize": 9,
      "color": "#181818"
    },
    {
      "token": "expertise-badge",
      "iconSet": "mdi:check-circle-outline",
      "size": 96,
      "pointSize": 38,
      "color": "#181818"
    }
  ],
  "fonts": [
    { "role": "heading", "family": "Poppins", "weights": [400, 700],
      "source": "graphcompose-bundled" },
    { "role": "body",    "family": "Helvetica",
      "source": "standard14" }
  ]
}
```

`size` controls the rasterized PNG height in pixels and `pointSize`
controls the document-space height in PDF points. The template reads
`pointSize` from the manifest, so the flow — not the Java code —
decides how big each icon renders.

`assets-manifest.json` keys icons by `token` and fonts by `role`:

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "...",
  "revisionDir": "examples/cv-reference/revisions/revision-003",
  "icons": {
    "phone": {
      "iconSet":   "mdi:phone",
      "file":      "assets/icons/phone.png",
      "size":      64,
      "pointSize": 9,
      "color":     "#181818",
      "pickedBy":  "preferred"
    }
  },
  "fonts": {
    "heading": {
      "role":         "heading",
      "family":       "Poppins",
      "fontName":     "POPPINS",
      "source":       "graphcompose-bundled",
      "status":       "ok",
      "registration": "default-fonts"
    }
  }
}
```

## How icons are picked

1. If the request gives an explicit `iconSet` (e.g. `mdi:phone`), that
   icon is downloaded directly.
2. Otherwise the resolver calls
   `https://api.iconify.design/search?query=...&prefixes=mdi,tabler,...`
   and picks the first match that lives in the request's preferred set
   priority list.
3. If no preferred set matches, the resolver falls back to the broad
   `search?query=` result and takes the first hit. The choice is
   recorded in the manifest under `pickedBy: "preferred" | "search" |
   "explicit"`.

PNGs are downloaded from `api.iconify.design/<prefix>/<name>.png` with
the requested `height` and `color`.

## Playwright fallback (optional)

If an icon request includes `"visual": true` and the CLI is invoked
with `--playwright`, the resolver opens
`https://icon-sets.iconify.design/?query=<token>` in headless Chromium,
captures a screenshot next to the icon manifest, and reads the
top-listed `data-icon` attribute as the suggested pick. The resolver
then downloads that pick through the normal HTTP API path.

Playwright is an OPTIONAL peer dependency. Install with:

```powershell
npm install --no-save playwright
npx playwright install chromium
```

If `playwright` cannot be imported, the visual fallback is skipped and
the HTTP API path runs as usual. The flow does not break.

## How fonts are resolved

| Source                  | What the resolver does | Template-side registration |
|---|---|---|
| `standard14`            | Verify family is one of Helvetica / Times / Courier. | None — always available. |
| `graphcompose-bundled`  | Verify family appears in `DefaultFonts.googleFamilies()` and map to a `FontName.*` constant. | `DefaultFonts.library(doc)` already loads them; reference via `FontName.POPPINS` etc. |
| `google-fonts`          | Mark as `manual_drop_required` and emit a clear note. | Drop TTFs into `assets/fonts/` and register via `FontFamilyDefinition.files(...)`. |

The bundled list mirrors `DefaultFonts.GOOGLE_FONT_FAMILIES` in
GraphCompose 1.6.0 — see [google-fonts.mjs](./src/google-fonts.mjs) for
the table.

## CLI

```powershell
node tools\asset-resolver\src\cli.mjs `
  --revision examples\cv-reference\revisions\revision-003 `
  [--request examples\cv-reference\revisions\revision-003\asset-request.json] `
  [--playwright]
```

- `--revision` (required) – revision folder; the resolver writes into
  `<revision>/assets/` and `<revision>/assets-manifest.json`.
- `--request` (optional) – path to the request JSON; defaults to
  `<revision>/asset-request.json`.
- `--playwright` (optional) – enable visual fallback for icons whose
  request entry has `"visual": true`. No-op if `playwright` is not
  installed.

## Failure mode

The resolver is intentionally strict so the agent chain catches
mistakes before they reach Template Coder. It fails (non-zero exit)
when:

- `asset-request.json` is missing, malformed, or has duplicate
  tokens/roles
- An iconify HTTP call returns a non-2xx response or empty body
- A font request asks for `graphcompose-bundled` but the family is not
  in the bundled list

A `manual_drop_required` font is NOT a failure — the manifest records
the drop instruction and the Template Coder must include the manual
registration block.
