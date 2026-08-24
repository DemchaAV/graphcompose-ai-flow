---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/12-advanced-pdf-chrome.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Advanced: PDF Chrome

## Status
Verified / Round 39 documentation extraction

## Learning level
Intermediate to advanced

## What this page explains
This is the twelfth extracted developer guide from the private LLM Wiki tree and
the first advanced guide. It covers document-level PDF "chrome": metadata,
watermarks, headers, footers, page numbering, and protection - the output
settings applied around the resolved document, not authored into the page body.

It answers:

```text
My document body is composed. How do I add production PDF details - title
metadata, page numbers, a header/footer, a draft watermark, or a password -
without mixing them into ordinary page-flow content?
```

It turns the internal PDF-chrome capability page into a "use when" guide with the
body-vs-chrome separation, when-to-use, when-not, why, and compile- and
render-checked snippets.

## Developer question
Chrome is not another paragraph in the body. It is output configuration the
backend applies around the document. Which session method adds each kind of
chrome, and which ones are safe to use?

## Mental model
Separate body content from document chrome.

```text
Body content        -> pageFlow(...) -> modules, paragraphs, tables, images
Document chrome     -> metadata(...) / watermark(...) / header(...) / footer(...) / protect(...)
                       -> or the chrome() fluent facade
Diagnostics         -> guideLines(...) / debug(...)   (render-only, off in prod)
Delivery            -> buildPdf(Path) / writePdf(OutputStream) / toPdfBytes()
```

`session.chrome()` is a fluent facade over the same canonical mutators; the
top-level methods and the facade set equivalent state. The output records live
under `document.output` and are renderer-neutral, but the fixed-layout PDF
backend is where chrome fully applies.

## When to use this
- Metadata when the PDF should carry a title, author, subject, keywords, or
  producer visible in PDF properties.
- A watermark for draft / confidential / sample overlays that should appear
  across pages without being authored repeatedly in the body.
- Headers and footers for repeated running text: report name, date, page
  numbers (`{page}` / `{pages}` placeholders), revision labels, separators.
- `DocumentPageNumbering` when numbering should start later, count from a
  specific value, or use a non-decimal style.
- Protection when a PDF needs PDF-level permissions (print, copy, modify,
  form-fill). Treat it as PDF permission metadata, not application security.

## When not to use this
- Do not use headers/footers as a workaround for ordinary repeated body
  sections. Use templates or flow helpers for content that participates in
  layout.
- Do not leave debug overlays (`guideLines(...)`, `debug(...)`) enabled in
  production.
- Do not rely on PDF protection as access control. Enforce access before
  rendering and delivery.
- Do not expect DOCX export to honor PDF chrome. The DOCX semantic backend
  honors metadata but skips watermarks, headers, footers, and protection.

## How it works in GraphCompose
`DocumentSession` exposes the canonical output mutators
`metadata(DocumentMetadata)`, `watermark(DocumentWatermark)`,
`header(DocumentHeaderFooter)`, `footer(DocumentHeaderFooter)`, and
`protect(DocumentProtection)`, plus the `chrome()` facade over the same state.

Headers and footers carry a zone (`DocumentHeaderFooterZone.HEADER` /
`FOOTER`), text slots (left / center / right), a separator, font size, colors,
and the page-number placeholders `{page}` and `{pages}`. Page numbering itself is
customizable through `DocumentPageNumbering`. Debug overlays are render-only
diagnostics and must be disabled in production.

## Decision tree
```text
My body is composed. What document-level detail do I need?
|
+-- PDF properties (title/author/...)?            -> metadata(...)
+-- A cross-page DRAFT/CONFIDENTIAL overlay?       -> watermark(...)
+-- Running header/footer or page numbers?         -> header(...) / footer(...) with {page}/{pages}
+-- PDF permissions (print/copy/modify)?           -> protect(...)  (not app security)
+-- A diagnostic overlay while developing?         -> guideLines(...) / debug(...)  (off in prod)
```

## Watermark and footer example
Add metadata, a centered DRAFT watermark behind the content, and a page-number
footer around an ordinary page flow.

<!-- snippet-smoke: id=round39-chrome-watermark-footer mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.output.DocumentHeaderFooter;
import com.demcha.compose.document.output.DocumentHeaderFooterZone;
import com.demcha.compose.document.output.DocumentMetadata;
import com.demcha.compose.document.output.DocumentWatermark;
import com.demcha.compose.document.output.DocumentWatermarkLayer;
import com.demcha.compose.document.output.DocumentWatermarkPosition;
import com.demcha.compose.document.style.DocumentColor;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("chrome.pdf")).create()) {
    document.metadata(DocumentMetadata.builder()
            .title("Quarterly report")
            .author("GraphCompose")
            .subject("Internal review")
            .keywords("report,review")
            .build());

    document.watermark(DocumentWatermark.builder()
            .text("DRAFT")
            .fontSize(72f)
            .rotation(45f)
            .color(DocumentColor.rgb(120, 120, 120))
            .opacity(0.12f)
            .layer(DocumentWatermarkLayer.BEHIND_CONTENT)
            .position(DocumentWatermarkPosition.CENTER)
            .build());

    document.footer(DocumentHeaderFooter.builder()
            .zone(DocumentHeaderFooterZone.FOOTER)
            .centerText("Page {page} of {pages}")
            .fontSize(9f)
            .showSeparator(true)
            .build());

    document.pageFlow(page -> page.addParagraph("Report body"));
    document.buildPdf();
}
```

Source marker: verified against
`06-advanced-capabilities/02-pdf-chrome-production-options.md` (marker
`advanced-pdf-chrome-minimal`),
`docs/recipes/pdf-chrome.md`,
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`, and
`src/main/java/com/demcha/compose/document/output/DocumentHeaderFooter.java`.

Compile-smoke marker: `round39-chrome-watermark-footer`, `mode=method`, added in
Round 39.

## Header and footer example
A running header and footer use the same builder, differing only by zone. Page
numbers come from the `{page}` / `{pages}` placeholders.

<!-- snippet-smoke: id=round39-chrome-header-footer mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.output.DocumentHeaderFooter;
import com.demcha.compose.document.output.DocumentHeaderFooterZone;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("chrome-header-footer.pdf")).create()) {
    document.header(DocumentHeaderFooter.builder()
            .zone(DocumentHeaderFooterZone.HEADER)
            .centerText("Quarterly Report")
            .fontSize(10f)
            .showSeparator(true)
            .build());

    document.footer(DocumentHeaderFooter.builder()
            .zone(DocumentHeaderFooterZone.FOOTER)
            .centerText("Page {page} of {pages}")
            .fontSize(9f)
            .showSeparator(true)
            .build());

    document.pageFlow(page -> page
            .addParagraph("Body content with a running header and a page-number footer."));
    document.buildPdf();
}
```

Source marker: verified against
`06-advanced-capabilities/02-pdf-chrome-production-options.md`,
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`
(`header(...)` / `footer(...)`),
`src/main/java/com/demcha/compose/document/output/DocumentHeaderFooter.java`, and
`src/main/java/com/demcha/compose/document/output/DocumentHeaderFooterZone.java`.

Compile-smoke marker: `round39-chrome-header-footer`, `mode=method`, added in
Round 39.

## Protection and streaming
Protection and streaming are not shown as render snippets here:

- Protection (`protect(DocumentProtection.builder().userPassword(...).canPrint(...).keyLength(128).build())`)
  produces an encrypted PDF. It is PDF permission metadata, not application
  security; enforce access before rendering. An encrypted PDF is not rasterized
  for visual review in this wiki.
- Streaming output (`writePdf(OutputStream)`) is covered by
  `12-docs-extraction/11-recipe-server-and-preview.md`. Chrome composes the same
  way before any output method; create one session per request.

The full source-verified protection and streaming snippets are in
`06-advanced-capabilities/02-pdf-chrome-production-options.md`.

## DOCX note
The DOCX semantic backend honors metadata but skips watermarks, headers,
footers, and protection. Do not promise PDF chrome round-tripping into DOCX; see
`11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "Which output method / how do I stream?" | `12-docs-extraction/07-output-and-testing.md`, `12-docs-extraction/11-recipe-server-and-preview.md` |
| "What does DOCX export keep?" | `11-gap-backlog/01-docx-pptx-support-matrix.md` |
| "How do I add links, bookmarks, or a TOC?" | `06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md` |
| "Which authoring path am I even on?" | `12-docs-extraction/02-choose-authoring-path.md` |

## Common mistakes
- Putting repeated page numbers into every page-flow section by hand.
- Leaving `guideLines(true)` or debug node labels enabled in production.
- Using byte arrays for every server response when streaming would be simpler.
- Treating PDF protection as application authentication or authorization.
- Expecting PDF watermarks, headers, and footers to round-trip into DOCX.

## Related pages
- `12-docs-extraction/07-output-and-testing.md`
- `12-docs-extraction/11-recipe-server-and-preview.md`
- `06-advanced-capabilities/02-pdf-chrome-production-options.md`
- `04-core-concepts/01-session-lifecycle.md`
- `02-decision-tree/04-output-choice-tree.md`
- `11-gap-backlog/01-docx-pptx-support-matrix.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `src/main/java/com/demcha/compose/document/output/DocumentMetadata.java`
- `src/main/java/com/demcha/compose/document/output/DocumentWatermark.java`
- `src/main/java/com/demcha/compose/document/output/DocumentHeaderFooter.java`
- `src/main/java/com/demcha/compose/document/output/DocumentHeaderFooterZone.java`
- `src/main/java/com/demcha/compose/document/output/DocumentProtection.java`
- `src/main/java/com/demcha/compose/document/output/DocumentPageNumbering.java`
- `.llm-wiki/06-advanced-capabilities/02-pdf-chrome-production-options.md`
- `.llm-wiki/12-docs-extraction/07-output-and-testing.md`
- `examples/src/main/java/com/demcha/examples/features/chrome/PdfChromeExample.java`
- `target/llm-wiki-render-proof/render-proof-report.txt`

## Verification notes
Round 39 adds the twelfth documentation-extraction guide under
`12-docs-extraction/` and the first advanced guide. It is built from the Round 7
PDF-chrome capability page.

The watermark/footer snippet reuses the source recipe shape already compile-smoke
proven in Round 21 (`advanced-pdf-chrome-minimal`). The header/footer snippet
reuses the same `DocumentHeaderFooter` builder methods with the `HEADER` zone; the
`HEADER`/`FOOTER` zone values and the `header(...)` / `footer(...)` mutators were
re-checked against source before marking. Both snippets are self-contained file
writers, so they are also render-provable; protection (encrypted output) and
streaming are documented in prose with links.

Both new markers were verified with the snippet generation step
(`marked=58`, `generated=58`, `skipped=0`, `warnings=0`) and compiled via the
render-proof harness (the harness reuses `target/classes`, so it is unaffected by
the unrelated `cv/v2/presets/Panel.java` compile error that blocks the full Maven
`-Compile` gate). Both were also rendered to PDF and the chrome (watermark,
header, footer, page number) was visually reviewed; see
`10-review/05-render-proof-register.md`.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
