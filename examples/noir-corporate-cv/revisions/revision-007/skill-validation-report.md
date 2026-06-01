# Skill Validation Report

## Result

PASS for the APIs used by this revision.

## Concrete Validation

The following command completed successfully:

```powershell
node scripts\render-noir-corporate-cv.mjs revision-007
```

That command performed:

- asset resolution from `asset-request.json`
- `mvn package` for `tools/preview-renderer`
- `mvn package` for `examples/noir-corporate-cv/render-runner`
- Maven dependency classpath generation
- clean render to `output.pdf` and `output.png`
- debug render to `output-debug.pdf` and `output-debug.png`

## Drift Found

The filled black circle glyph `●` is not available in the active PDF font path:

```text
could not find the glyphId for the character: ?, codePoint: 9679 (0x25CF)
```

The work timeline marker was changed to the supported bullet glyph while the
vertical connector line stays a real `LineBuilder.vertical(...)` primitive.

## Skills Exercised

| Skill | Status in manifest | Revision-007 evidence |
|---|---:|---|
| `backgrounds-and-panels` | needs-validation | cream sidebar plate, dark name bar, dark section bars render |
| `shapes-and-containers` | needs-validation | circular CV badge renders via `ShapeContainerBuilder.circle(...)` |
| `typography` | needs-validation | larger sidebar/main heading text compiles and renders |
| `spacing-and-alignment` | needs-validation | column gap, main body padding, and sidebar spacing compile and render |
| `visual-regression` | needs-validation | preview rendered; visual review records pass/draft classification |
