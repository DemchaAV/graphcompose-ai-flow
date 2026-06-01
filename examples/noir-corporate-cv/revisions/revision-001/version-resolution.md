# Version Resolution

## Target

- GraphCompose version: `1.6.0`
- Skill pack: `skills/versions/graphcompose-1.6`
- Maven artifact: `com.github.DemchaAV:GraphCompose:v1.6.0`
- Java level: 21

## Result

The template uses the canonical GraphCompose 1.6 document DSL:

- `GraphCompose.document(...).pageSize(DocumentPageSize.A4).create()`
- `DocumentSession.pageFlow(...)`
- `RowBuilder` with `weights(...)` for the two-column grid
- `SectionBuilder` for every named region (sidebar blocks, main blocks)
- `ParagraphBuilder` with `inlineImage(...)` for icon + text rows
- `ListBuilder` with `.bullet()` for the work-experience entry bodies
- `LineBuilder` (horizontal underline rules under section headings)
- `DocumentTextStyle` / `DocumentTextDecoration` / `DocumentColor`
- `FontName.POPPINS` (heading) and `FontName.POPPINS` (body) — both
  bundled with the GraphCompose JAR via `DefaultFonts.googleFamilies()`.
- `DocumentImageData.fromPath(...)` + `InlineImageAlignment.CENTER`
  for the contact / interest glyphs resolved by the asset-resolver.

No legacy PDF composer APIs are used. No raw PDFBox imports appear in
the generated template. No coordinate-based drawing primitives
(`CanvasLayer.*` raw paint calls) are used in this revision.
