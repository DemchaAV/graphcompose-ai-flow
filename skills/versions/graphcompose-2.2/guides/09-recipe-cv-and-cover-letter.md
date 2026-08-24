---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/09-recipe-cv-and-cover-letter.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Recipe: CV And Cover Letter

## Status
Verified / Round 33 documentation extraction

## Learning level
Intermediate

## What this page explains
This is the ninth extracted developer guide from the private LLM Wiki tree and
the second recipe guide. It shows how to build a paired CV and cover letter with
the layered v2 template system, sharing one identity across both documents.

It answers:

```text
I need a CV and a matching cover letter. Do I use Flow, nodes, or the CV v2
template presets - and how do I keep the two documents consistent?
```

It turns the internal CV/cover-letter recipe into a "use when" guide with the
shared-identity pattern, the compose-first contract, when-to-use, when-not, why,
and compile-checked snippets.

## Developer question
A CV is a structured profile (identity plus sections), not just a page layout. A
cover letter is a separate document that should feel like part of the same
application pack. How do I model both without duplicating data or hand-placing
fields?

## Mental model
The preset owns visual composition. Your code owns the candidate data. One
`CvIdentity` feeds both documents.

```text
1. Build CvIdentity once         -> name, job title, contact, links
2. Build CvDocument              -> typed CvSection values (summary, skills, ...)
3. Build CoverLetterDocument     -> same identity + greeting/paragraphs/closing
4. Pick presets                  -> BoxedSections.create() / BoxedSectionsLetter.create()
5. Use each preset's margin      -> *.RECOMMENDED_MARGIN
6. Compose + render two PDFs     -> template.compose(document, data); buildPdf()
```

Reusing the same `CvIdentity` is what makes the CV and the letter feel like one
pack: identical name, contact lines, and links.

## When to use this
- CV v2 presets when you want a maintainable resume with structured sections and
  consistent visual treatment.
- Cover-letter v2 presets when the letter should match the CV identity and theme.
- The preset's recommended margin unless you have verified a different margin
  visually.
- Direct Flow only when the document is not a CV-like artifact, or when you are
  authoring a new preset/widget.

## When not to use this
- Do not hand-place every CV field with canvas. CVs need natural flow and
  pagination.
- Do not put profile data directly into paragraphs if a v2 data type exists.
- Do not mix `BusinessTheme` into CV v2 templates. CV templates use `CvTheme` or
  the preset default.
- Do not make a template render itself. The caller still creates and renders the
  `DocumentSession`.

## How it works in GraphCompose
The layered v2 model is data, theme, components, widgets, and presets. The public
authoring route is:

For the CV:

1. Build `CvIdentity`.
2. Build `CvDocument` with typed `CvSection` values (`ParagraphSection`,
   `SkillsSection`, `EntriesSection`, ...).
3. Pick a CV preset such as `BoxedSections.create()`.
4. Create a `DocumentSession` with `BoxedSections.RECOMMENDED_MARGIN`.
5. Call `template.compose(document, cv)`.
6. Render the PDF.

For the cover letter:

1. Reuse the same `CvIdentity`.
2. Build `CoverLetterDocument` with greeting, paragraphs, and closing.
3. Pick a matching preset such as `BoxedSectionsLetter.create()`.
4. Use its recommended margin, compose, and render a separate PDF.

## Decision tree
```text
I need a candidate-facing document.
|
+-- Is it a resume with structured sections?
|   -> CvDocument + a CV v2 preset (BoxedSections.create()).
|
+-- Is it a letter that should match that resume?
|   -> CoverLetterDocument with the SAME CvIdentity + BoxedSectionsLetter.create().
|
+-- Do I need both as one application pack?
|   -> build CvIdentity once, feed it into both builders, render two PDFs.
|
+-- Is it not really a CV/letter?
    -> build it custom with pageFlow(...). See choose-authoring-path.
```

## CV example
Build the shared identity and a small CV data model, then compose with a preset.

<!-- snippet-smoke: id=round33-recipe-cv mode=method since=current -->
```java
CvIdentity identity = CvIdentity.builder()
        .name("Jane", "Rivera")
        .jobTitle("Backend Engineer")
        .contact("+44 7700 900123", "jane.rivera@example.com", "London, UK")
        .link("GitHub", "https://github.com/janerivera")
        .link("LinkedIn", "https://linkedin.com/in/janerivera")
        .build();

CvDocument cv = CvDocument.builder()
        .identity(identity)
        .section(new ParagraphSection("Professional Summary",
                "Backend engineer building secure Java systems and document automation products."))
        .section(SkillsSection.builder("Skills")
                .group("Backend", "Java", "Spring Boot", "REST APIs", "SQL")
                .group("Delivery", "Docker", "Flyway", "JUnit 5")
                .build())
        .section(EntriesSection.builder("Experience")
                .entry("Backend Engineer", "Product Studio", "2023-Present",
                        "Built PDF generation workflows, secure APIs, and regression checks.")
                .build())
        .build();

DocumentTemplate<CvDocument> template = BoxedSections.create();
float margin = (float) BoxedSections.RECOMMENDED_MARGIN;

try (DocumentSession document = GraphCompose.document(Path.of("cv.pdf"))
        .pageSize(DocumentPageSize.A4)
        .margin(margin, margin, margin, margin)
        .create()) {
    template.compose(document, cv);
    document.buildPdf();
}
```

Source marker: verified against
`07-recipes/03-build-a-cv-and-cover-letter.md` (marker `recipe-cv-v2-minimal`),
`docs/templates/v2-layered/quickstart.md`,
`src/main/java/com/demcha/compose/document/templates/cv/v2/data/CvDocument.java`, and
`src/main/java/com/demcha/compose/document/templates/cv/v2/presets/BoxedSections.java`.

Compile-smoke marker: `round33-recipe-cv`, `mode=method`, added in Round 33.

## Cover letter example
Build the matching letter. In a real app the identity comes from profile data and
is reused; this self-contained snippet builds a small identity inline.

<!-- snippet-smoke: id=round33-recipe-cover-letter mode=method since=current -->
```java
CvIdentity identity = CvIdentity.builder()
        .name("Jane", "Rivera")
        .jobTitle("Backend Engineer")
        .contact("+44 7700 900123", "jane.rivera@example.com", "London, UK")
        .build();

CoverLetterDocument letter = CoverLetterDocument.builder()
        .identity(identity)
        .greeting("Dear Hiring Manager,")
        .paragraph("I am applying for the Backend Engineer role and bring hands-on experience with Java, Spring Boot, and production document workflows.")
        .paragraph("My recent work includes building secure APIs, PDF generation paths, and regression checks for document-heavy products.")
        .closing("Sincerely,")
        .build();

DocumentTemplate<CoverLetterDocument> letterTemplate = BoxedSectionsLetter.create();
float letterMargin = (float) BoxedSectionsLetter.RECOMMENDED_MARGIN;

try (DocumentSession document = GraphCompose.document(Path.of("cover-letter.pdf"))
        .pageSize(DocumentPageSize.A4)
        .margin(letterMargin, letterMargin, letterMargin, letterMargin)
        .create()) {
    letterTemplate.compose(document, letter);
    document.buildPdf();
}
```

Source marker: verified against
`07-recipes/03-build-a-cv-and-cover-letter.md` (practical example),
`examples/src/main/java/com/demcha/examples/templates/coverletter/v2/CvBoxedSectionsLetterV2Example.java`,
`src/main/java/com/demcha/compose/document/templates/coverletter/v2/data/CoverLetterDocument.java`, and
`src/main/java/com/demcha/compose/document/templates/coverletter/v2/presets/BoxedSectionsLetter.java`.

Compile-smoke marker: `round33-recipe-cover-letter`, `mode=method`, added in
Round 33.

## Application pack example
This is the headline pattern: build the identity once and feed it into both the
CV and the letter, rendering two separate PDFs that stay consistent.

<!-- snippet-smoke: id=round33-recipe-shared-identity mode=members since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.templates.api.DocumentTemplate;
import com.demcha.compose.document.templates.cv.v2.data.CvDocument;
import com.demcha.compose.document.templates.cv.v2.data.CvIdentity;
import com.demcha.compose.document.templates.cv.v2.data.ParagraphSection;
import com.demcha.compose.document.templates.cv.v2.presets.BoxedSections;
import com.demcha.compose.document.templates.coverletter.v2.data.CoverLetterDocument;
import com.demcha.compose.document.templates.coverletter.v2.presets.BoxedSectionsLetter;

import java.nio.file.Path;

void buildApplicationPack(CvIdentity identity) throws Exception {
    CvDocument cv = CvDocument.builder()
            .identity(identity)
            .section(new ParagraphSection("Professional Summary",
                    "Backend engineer building secure Java systems and document automation."))
            .build();

    DocumentTemplate<CvDocument> cvTemplate = BoxedSections.create();
    float cvMargin = (float) BoxedSections.RECOMMENDED_MARGIN;
    try (DocumentSession document = GraphCompose.document(Path.of("cv.pdf"))
            .pageSize(DocumentPageSize.A4)
            .margin(cvMargin, cvMargin, cvMargin, cvMargin)
            .create()) {
        cvTemplate.compose(document, cv);
        document.buildPdf();
    }

    CoverLetterDocument letter = CoverLetterDocument.builder()
            .identity(identity)
            .greeting("Dear Hiring Manager,")
            .paragraph("I am applying for the Backend Engineer role.")
            .closing("Sincerely,")
            .build();

    DocumentTemplate<CoverLetterDocument> letterTemplate = BoxedSectionsLetter.create();
    float letterMargin = (float) BoxedSectionsLetter.RECOMMENDED_MARGIN;
    try (DocumentSession document = GraphCompose.document(Path.of("cover-letter.pdf"))
            .pageSize(DocumentPageSize.A4)
            .margin(letterMargin, letterMargin, letterMargin, letterMargin)
            .create()) {
        letterTemplate.compose(document, letter);
        document.buildPdf();
    }
}
```

Source marker: verified against
`07-recipes/03-build-a-cv-and-cover-letter.md`,
`src/main/java/com/demcha/compose/document/templates/cv/v2/data/CvDocument.java`,
`src/main/java/com/demcha/compose/document/templates/coverletter/v2/data/CoverLetterDocument.java`, and
the `BoxedSections` / `BoxedSectionsLetter` preset factories.

Compile-smoke marker: `round33-recipe-shared-identity`, `mode=members`, added in
Round 33.

## Customizing in order
If a preset is close but not exact, prefer these moves in order:

1. Check whether a v2 data type already models the section you need
   (`ParagraphSection`, `SkillsSection`, `EntriesSection`, ...).
2. Switch to a different CV/letter preset.
3. Adjust the `CvTheme` or use the preset default; do not bring in
   `BusinessTheme`.
4. Only author a new preset/widget when the change is structural, not data
   ordering. See `06-advanced-capabilities/04-fonts-custom-themes-and-template-tokens.md`.

The full preset catalog (16 CV v2 presets, 15 cover-letter v2 presets) is in
`11-gap-backlog/03-template-preset-catalog.md`.

## Common mistakes
- Treating CV v2 as a PDF-only layout shortcut. It is a structured data model
  plus preset renderer.
- Recreating identity separately for the CV and the letter, which causes
  inconsistent headers.
- Using `BusinessTheme` for CV presets. Use `CvTheme` or the preset default.
- Ignoring preset recommended margins, then debugging avoidable layout shifts.
- Writing a new preset when the change is only data ordering or section choice.

## What to read next
| Next question | Read |
| --- | --- |
| "Which authoring path / template family?" | `12-docs-extraction/02-choose-authoring-path.md` |
| "How do I theme CV presets?" | `06-advanced-capabilities/04-fonts-custom-themes-and-template-tokens.md` |
| "What presets exist?" | `11-gap-backlog/03-template-preset-catalog.md` |
| "How do I stream or test the output?" | `12-docs-extraction/07-output-and-testing.md` |
| "How do I build an invoice/proposal instead?" | `12-docs-extraction/08-recipe-invoice-and-proposal.md` |

## Related pages
- `12-docs-extraction/02-choose-authoring-path.md`
- `12-docs-extraction/07-output-and-testing.md`
- `12-docs-extraction/08-recipe-invoice-and-proposal.md`
- `07-recipes/03-build-a-cv-and-cover-letter.md`
- `03-getting-started/04-first-template-document.md`
- `04-core-concepts/05-styles-themes-and-template-themes.md`
- `06-advanced-capabilities/04-fonts-custom-themes-and-template-tokens.md`
- `11-gap-backlog/03-template-preset-catalog.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/templates/api/DocumentTemplate.java`
- `src/main/java/com/demcha/compose/document/templates/cv/v2/data/CvIdentity.java`
- `src/main/java/com/demcha/compose/document/templates/cv/v2/data/CvDocument.java`
- `src/main/java/com/demcha/compose/document/templates/cv/v2/data/ParagraphSection.java`
- `src/main/java/com/demcha/compose/document/templates/cv/v2/data/SkillsSection.java`
- `src/main/java/com/demcha/compose/document/templates/cv/v2/data/EntriesSection.java`
- `src/main/java/com/demcha/compose/document/templates/cv/v2/presets/BoxedSections.java`
- `src/main/java/com/demcha/compose/document/templates/coverletter/v2/data/CoverLetterDocument.java`
- `src/main/java/com/demcha/compose/document/templates/coverletter/v2/presets/BoxedSectionsLetter.java`
- `.llm-wiki/07-recipes/03-build-a-cv-and-cover-letter.md`
- `.llm-wiki/12-docs-extraction/08-recipe-invoice-and-proposal.md`
- `examples/src/main/java/com/demcha/examples/templates/cv/v2/CvBoxedV2Example.java`
- `examples/src/main/java/com/demcha/examples/templates/coverletter/v2/CvBoxedSectionsLetterV2Example.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 33 adds the ninth documentation-extraction guide under
`12-docs-extraction/` and the second recipe guide. It is built from the Round 8
CV/cover-letter recipe and the Round 32 invoice/proposal recipe.

The CV snippet reuses the source recipe shape already compile-smoke proven in
Round 22 (`recipe-cv-v2-minimal`). The cover-letter snippet promotes the
previously source-only letter shape to compile-smoke-proven, and the application
pack snippet shows the shared-identity pattern. The
`CoverLetterDocument.builder()` / `BoxedSectionsLetter.create()` /
`RECOMMENDED_MARGIN` signatures were re-checked against
`CoverLetterDocument.java` and `BoxedSectionsLetter.java` before marking.

Round 33 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=51`, `generated=51`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
