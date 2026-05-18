# Version Resolution

## Target

- GraphCompose version: `1.6.0`
- Skill pack: `skills/versions/graphcompose-1.6`
- Maven artifact: `com.github.DemchaAV:GraphCompose:v1.6.0`
- Java level: 21

## Result

Inherited from `revision-002`. The asset wiring added in this revision
relies on GraphCompose 1.6 primitives that are already documented in
the loaded skill pack:

- `DocumentSession.pageFlow(...)` and the section/row/line/paragraph DSL
  (no change)
- `ImageBuilder.source(Path)` for the contact, social, and expertise
  badge icons — documented in the GraphCompose 1.6 image package
- `DocumentTextStyle.builder().fontName(FontName.POPPINS)` —
  `FontName.POPPINS` is part of the bundled Google Fonts list in
  `com.demcha.compose.font.DefaultFonts.GOOGLE_FONT_FAMILIES` and is
  loaded by default when `GraphCompose.document(...).create()` builds
  the session

No new GraphCompose APIs were introduced; the revision exercises APIs
that were already valid in `1.6.0`.
