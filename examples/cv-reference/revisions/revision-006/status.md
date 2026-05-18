# Status

- Template: **Mint Editorial CV** (`cv-reference`)
- Revision: `revision-006`
- Parent: `revision-005`
- Status: `DRAFT`
- Renderable: YES
- Data-driven: YES — see [`cv-data.json`](./cv-data.json) and
  [`data-schema.md`](./data-schema.md)
- New clickable links vs revision-005: References emails
  (`mailto:hello@email.com`) and Contact email + website

## How to edit content

Open [`cv-data.json`](./cv-data.json) and change any field. The
template re-renders from JSON on the next run — no Java edits
required.

| Want to change... | Edit... |
|---|---|
| Name / title       | `header.name` / `header.title` |
| Phone, email, addr | `contact[].value` (and `contact[].url` for clickable) |
| Profile paragraph  | `profile` |
| Job entries        | `experiencePage1[]` / `experiencePage2[]` |
| Interests          | `interests[]` (array of strings) |
| Skill bars         | `skills[].name` and `skills[].level` (0.0 – 1.0) |
| Social profiles    | `social[].url` |
| Awards             | `awards[].name` / `awards[].meta` |
| References + email | `references[].email` (becomes a `mailto:` link) |

Spaced-uppercase styling is applied automatically by the template
via `letterSpace(...)`. Write `"Rose Harris"` in JSON — the PDF
shows `R O S E  H A R R I S`.

## How to re-render locally

```powershell
node .\scripts\render-cv-reference.mjs revision-006
```

The script:

1. Runs the asset-resolver (downloads icons via Iconify SVG →
   ImageMagick PNG conversion).
2. Builds the preview-renderer and the cv-reference runner.
3. Detects `cv-data.json` next to the template and passes
   `--spec-provider com.demcha.examples.cv.MintEditorialCvSpecProvider`
   to the renderer.
4. Renders `output.pdf`, `output.png`, `output-page-2.png`.

## Spec ↔ JSON ↔ Template wiring

| Layer | File |
|---|---|
| Java spec record | [`MintEditorialCvSpec`](../../render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpec.java) |
| Spec provider    | [`MintEditorialCvSpecProvider`](../../render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpecProvider.java) |
| Content fixture  | [`cv-data.json`](./cv-data.json) |
| Schema docs      | [`data-schema.md`](./data-schema.md) |
| Template         | [`generated-template.java`](./generated-template.java) |
