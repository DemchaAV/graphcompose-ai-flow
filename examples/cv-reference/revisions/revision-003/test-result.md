# Test Result

## Build

- `mvn -f tools/preview-renderer/pom.xml package` — PASS
- `mvn -f examples/cv-reference/render-runner/pom.xml -Drevision.id=revision-003 package` — PASS
- `mvn -f examples/cv-reference/render-runner/pom.xml -Drevision.id=revision-003 dependency:build-classpath` — PASS

## Asset Resolver

`node tools/asset-resolver/src/cli.mjs --revision examples/cv-reference/revisions/revision-003`

- 9 icons downloaded from `api.iconify.design` (SVG) and rasterized to PNG via ImageMagick (`magick`)
- 3 font roles validated: `heading` and `body` map to `FontName.POPPINS` (bundled), `fallback` maps to `FontName.HELVETICA` (standard14)
- `assets-manifest.json` written; every icon recorded with `pickedBy: "explicit"`

## Render

`node scripts/render-cv-reference.mjs revision-003`

- `output.pdf` generated (2 pages)
- `output.png` generated (preview of page 1 at 150 DPI)
- `output-page-2.png` generated (preview of page 2 at 150 DPI)
- No exceptions; renderer reports `status=rendered`

## Smoke Test

The companion test class `GeneratedCvTemplateTest` (in
`generated-test.java`) asserts:

- `compose(DocumentSession)` does not throw
- every icon listed in `assets-manifest.json` exists on disk under
  `<revision>/assets/icons/`

These assertions exercise the asset-resolver hand-off contract:
if the resolver did not run, or if the manifest names an icon that is
not present, the test fails.

## Minimum Checks Per docs/workflow.md

| Check | Result |
|---|---|
| template compiles | PASS |
| PDF generated | PASS |
| PDF not empty | PASS |
| preview image generated | PASS |
| page-2 preview generated | PASS |
| render does not throw | PASS |
| every asset on disk before render | PASS |
