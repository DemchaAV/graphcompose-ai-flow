---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/07-output-and-testing.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Output And Testing

## Status
Verified / Round 31 documentation extraction

## Learning level
Beginner to intermediate

## What this page explains
This is the seventh extracted developer guide from the private LLM Wiki tree and
the fifth (final) everyday-capability guide, after text, lists/tables,
images/graphics, and layout primitives.

It answers what to do once a document is authored:

```text
I built a GraphCompose document. Do I call buildPdf, writePdf, toPdfBytes,
preview images, or DOCX export - and how do I protect it with tests?
```

It turns the internal output-and-testing capability page into a beginner-friendly
guide with when-to-use, when-not, why, a decision tree, and compile-checked
snippets for the stable output paths and the layout-snapshot test. Preview
images, visual regression, and semantic DOCX export are routed in prose because
they are release-sensitive or need a baseline/dependency context.

## Developer question
The document is built. Which output method matches my destination (file, stream,
bytes, images, DOCX), and which test layer protects it (smoke, geometry
snapshot, pixel regression)?

## Mental model
Choose the output by where the document goes next, and choose the test by what
must stay stable.

```text
Output:
1. buildPdf() / buildPdf(path)   <- write a PDF file
2. writePdf(OutputStream)        <- HTTP response / cloud / caller-owned stream
3. toPdfBytes()                  <- small docs, tests, byte-array APIs
4. toImages(...) / toImage(...)  <- previews, thumbnails, pixel diffs (see caveat)
5. export(new DocxSemanticBackend()) <- editable semantic Word (not PDF parity)

Test:
A. smoke render            <- it compiles and renders at all
B. layout snapshot         <- deterministic geometry and pagination
C. visual regression       <- rendered PDF pixels (fonts, colors, glyphs)
```

The PDF fixed-layout path is the main output path. Testing splits into cheap
geometry snapshots and heavier pixel-level visual baselines.

## When to use this
- `buildPdf()` when the session was created from `GraphCompose.document(path)`.
- `buildPdf(Path)` when the path is known at render time but was not passed to
  the builder.
- `writePdf(OutputStream)` for backend services, HTTP responses, cloud storage,
  and any path where the caller owns the stream.
- `toPdfBytes()` for small documents in tests or APIs that require a byte array.
  Prefer streaming for large production output.
- Layout snapshots for deterministic geometry protection: node positions, page
  breaks, dimensions, sibling order, layers.
- Visual regression when the final appearance matters: fonts, colors,
  anti-aliasing, missing glyphs, rendered-pixel fidelity.

## When not to use this
Do not share one mutable `DocumentSession` across requests or worker threads.
Create one session per render request and close it with try-with-resources.

Do not call no-argument `buildPdf()` unless the builder was given a default
output path.

Do not use `toPdfBytes()` by default in production HTTP paths. It holds the full
PDF in memory before returning; stream instead.

Do not rely on visual regression as the only geometry guard. Layout snapshots
are cheaper, deterministic, and easier to diff.

Do not enable snapshot approve/update flags in CI verification, and do not leave
debug guide overlays enabled in production output.

## How it works in GraphCompose
`DocumentSession` owns the document until render/export. It exposes
`writePdf(OutputStream)`, `toPdfBytes()`, `buildPdf()`, `buildPdf(Path)`,
`toImages(int dpi)` / `toImage(int pageIndex, int dpi)`, `layoutSnapshot()` /
`pageIndex()`, render-only `guideLines(...)` / `debug(...)`, and chrome mutators
(`metadata`, `watermark`, `header`, `footer`, `protect`). It is request-scoped,
mutable, and not thread-safe.

Testing has three protection layers: a smoke render (it renders at all), a
layout snapshot (deterministic geometry and pagination via
`LayoutSnapshotAssertions`), and visual regression (rendered PDF pixels via
`PdfVisualRegression`).

## Decision tree
Read top to bottom and stop at the first branch that matches.

```text
The document is built. Where does it go?
|
+-- Write a PDF file at a known path?
|   -> buildPdf() (configured path) or buildPdf(Path).
|
+-- Into a stream the caller owns (HTTP/cloud)?
|   -> writePdf(OutputStream). It writes but does not close the stream.
|
+-- A byte array for a test or small API?
|   -> toPdfBytes(). Stream instead for large production output.
|
+-- A preview image or pixel diff?
|   -> toImages(...) / toImage(...). Release-sensitive; see the caveat below.
|
+-- Editable Word output?
    -> export(new DocxSemanticBackend()). Semantic, not PDF parity.

What must stay stable?
|
+-- Geometry / pagination -> LayoutSnapshotAssertions.assertMatches(...).
+-- Rendered pixels       -> PdfVisualRegression...assertMatchesBaseline(...).
```

## File output example
The simplest path: a session created with a default file path, rendered with
`buildPdf()`.

<!-- snippet-smoke: id=round31-output-file mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("report.pdf")).create()) {
    document.pageFlow(page -> page
            .module("Summary", module -> module.paragraph("Written to a configured file path.")));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/05-output-and-testing.md` (marker `capability-output-pdf-minimal`),
`docs/recipes/streaming.md`, and
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`.

Compile-smoke marker: `round31-output-file`, `mode=method`, added in Round 31.

## Stream output example
For an HTTP response or cloud upload, create the session without a default path
and write to the caller-owned stream. `writePdf(...)` writes but does not close
the stream.

<!-- snippet-smoke: id=round31-output-stream mode=members since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.io.OutputStream;

void writeReport(OutputStream out) throws Exception {
    try (DocumentSession document = GraphCompose.document().create()) {
        document.pageFlow(page -> page
                .module("Summary",
                        module -> module.paragraph("Streamed to a caller-owned stream.")));
        document.writePdf(out);
    }
}
```

Source marker: verified against
`05-capabilities/05-output-and-testing.md`,
`04-core-concepts/01-session-lifecycle.md`, and
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`
(`writePdf(OutputStream)`).

Compile-smoke marker: `round31-output-stream`, `mode=members`, added in
Round 31.

## Byte-array output example
For a unit test or an API that truly needs a byte array, use `toPdfBytes()`. It
holds the full PDF in memory, so prefer streaming for large production output.

<!-- snippet-smoke: id=round31-output-bytes mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

try (DocumentSession document = GraphCompose.document().create()) {
    document.pageFlow(page -> page
            .module("Summary", module -> module.paragraph("Held in memory as PDF bytes.")));

    byte[] pdf = document.toPdfBytes();
}
```

Source marker: verified against
`05-capabilities/05-output-and-testing.md`,
`07-recipes/05-render-in-a-server-or-preview-flow.md`, and
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`
(`toPdfBytes()`).

Compile-smoke marker: `round31-output-bytes`, `mode=method`, added in Round 31.

## Layout snapshot test example
Protect geometry and pagination with a layout snapshot. The first run records a
baseline; later runs fail if node positions, page breaks, dimensions, or order
drift.

<!-- snippet-smoke: id=round31-test-layout-snapshot mode=class since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.testing.layout.LayoutSnapshotAssertions;
import org.junit.jupiter.api.Test;

class Round31LayoutSnapshotTest {

    @Test
    void shouldKeepLayoutStable() throws Exception {
        try (DocumentSession document = GraphCompose.document()
                .pageSize(DocumentPageSize.A4)
                .margin(22, 22, 22, 22)
                .create()) {

            document.pageFlow(page -> page
                    .module("Snapshot Example",
                            module -> module.paragraph("Hello GraphCompose")));

            LayoutSnapshotAssertions.assertMatches(
                    document,
                    "features/round31_output_layout");
        }
    }
}
```

Source marker: verified against
`05-capabilities/05-output-and-testing.md` (practical example),
`docs/operations/layout-snapshot-testing.md`, and
`src/main/java/com/demcha/compose/testing/layout/LayoutSnapshotAssertions.java`
(`assertMatches(DocumentSession, String)`).

Compile-smoke marker: `round31-test-layout-snapshot`, `mode=class`, added in
Round 31.

## Preview images, visual regression, and DOCX
These are real features but are not shown as runnable snippets here because they
are release-sensitive or need a baseline/dependency context:

- Preview images: `toImages(int dpi)` and `toImage(int pageIndex, int dpi)`
  return rendered page images. In the current local source audit these are
  post-`v1.8.0`, `@since 1.9.0` APIs - keep release wording until the target
  artifact is confirmed. See
  `11-gap-backlog/05-release-sensitive-api-status.md`.
- Visual regression: `PdfVisualRegression.standard().assertMatchesBaseline(...)`
  compares rendered PDF pixels against a checked-in baseline. It needs that
  baseline and an approve/update workflow; see
  `08-troubleshooting/05-testing-and-regression-troubleshooting.md`.
- Semantic DOCX export: `export(new DocxSemanticBackend())` produces editable
  Word output that maps paragraphs/lists/basic tables but is not fixed-layout
  PDF parity. See `06-advanced-capabilities/03-docx-pptx-semantic-export.md` and
  `11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "Which output for my destination?" | `02-decision-tree/04-output-choice-tree.md` |
| "How do I run a server/preview render flow?" | `07-recipes/05-render-in-a-server-or-preview-flow.md` |
| "How do snapshots and visual baselines differ?" | `08-troubleshooting/05-testing-and-regression-troubleshooting.md` |
| "What PDF chrome (watermark/header/protect) is there?" | `06-advanced-capabilities/02-pdf-chrome-production-options.md` |
| "Which authoring path am I even on?" | `12-docs-extraction/02-choose-authoring-path.md` |

## Common mistakes
- Rendering an empty document. `DocumentSession` checks for at least one root
  before PDF/image output.
- Reusing one session for multiple users or parallel requests.
- Calling `buildPdf()` without a configured default output path.
- Using `toPdfBytes()` for every HTTP response instead of streaming.
- Forgetting that `writePdf(...)` writes to but does not close the stream.
- Approving snapshot or visual baselines without reviewing the artifacts.
- Treating DOCX semantic export as fixed-layout PDF parity.
- Leaving guide lines or debug labels enabled in production output.

## Related pages
- `12-docs-extraction/02-choose-authoring-path.md`
- `12-docs-extraction/06-layout-primitives.md`
- `05-capabilities/05-output-and-testing.md`
- `02-decision-tree/04-output-choice-tree.md`
- `04-core-concepts/01-session-lifecycle.md`
- `07-recipes/05-render-in-a-server-or-preview-flow.md`
- `08-troubleshooting/05-testing-and-regression-troubleshooting.md`
- `11-gap-backlog/05-release-sensitive-api-status.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `src/main/java/com/demcha/compose/testing/layout/LayoutSnapshotAssertions.java`
- `.llm-wiki/05-capabilities/05-output-and-testing.md`
- `.llm-wiki/04-core-concepts/01-session-lifecycle.md`
- `.llm-wiki/07-recipes/05-render-in-a-server-or-preview-flow.md`
- `.llm-wiki/11-gap-backlog/05-release-sensitive-api-status.md`
- `.llm-wiki/12-docs-extraction/06-layout-primitives.md`
- `docs/recipes/streaming.md`
- `docs/operations/layout-snapshot-testing.md`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 31 adds the seventh documentation-extraction guide under
`12-docs-extraction/` and the fifth and final everyday-capability guide. It is
built from the Round 6 output-and-testing capability page, the Round 5 session
lifecycle page, and the Round 8 server/preview recipe.

The four Java snippets reuse output and test shapes from the source capability
page: `buildPdf()` to a configured path (the `capability-output-pdf-minimal`
shape), `writePdf(OutputStream)`, `toPdfBytes()`, and a JUnit layout-snapshot
test calling `LayoutSnapshotAssertions.assertMatches(document, ...)`. The
`toPdfBytes`, `writePdf`, and `assertMatches(DocumentSession, String)`
signatures were re-checked against `DocumentSession.java` and
`LayoutSnapshotAssertions.java` before marking, promoting the previously
source-only stream/bytes/snapshot shapes to compile-smoke-proven.

Preview images (`toImage`/`toImages`, post-`v1.8.0` `@since 1.9.0`), visual
regression (`PdfVisualRegression`), and semantic DOCX export are documented in
prose with links and release caveats rather than repeated as runnable snippets,
so every `java` fence in this guide is compile-checkable against the current
local module.

Round 31 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=45`, `generated=45`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
