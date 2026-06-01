# Skill Validation Report

## Result

PASS for the APIs used by this revision.

## Concrete Validation

The following command completed successfully:

```powershell
node scripts\render-noir-corporate-cv.mjs revision-003
```

That command performed:

- asset resolution from `asset-request.json`
- `mvn package` for `tools/preview-renderer`
- `mvn package` for `examples/noir-corporate-cv/render-runner`
- Maven dependency classpath generation
- clean render to `output.pdf` and `output.png`
- debug render to `output-debug.pdf` and `output-debug.png`

## Drift Found

Nested `Row` inside a row-owned section does not render in GraphCompose 1.6.0.
The renderer failed with:

```text
Row 'NoirCorporateCv[0]/MainGrid[0]/Sidebar[0]/Skills[2]/RatingRow[2]' cannot contain a nested horizontal row; use a section column instead.
```

The template was corrected to avoid nested rows. This behavior should be folded
back into the skills as a caution under `layout-primitives` and
`spacing-and-alignment`.

## Skills Exercised

| Skill | Status in manifest | Revision-003 evidence |
|---|---:|---|
| `backgrounds-and-panels` | needs-validation | cream sidebar plate, dark name bar, dark section bars render |
| `shapes-and-containers` | needs-validation | circular CV badge renders via `ShapeContainerBuilder.circle(...)` |
| `typography` | needs-validation | Poppins heading/body roles compile and render |
| `spacing-and-alignment` | needs-validation | top-level row weights and margins compile and render |
| `visual-regression` | needs-validation | preview rendered; normalized compare metric recorded in visual review |
