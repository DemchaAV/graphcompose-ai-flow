---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/11-recipe-server-and-preview.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Recipe: Server And Preview

## Status
Verified / Round 35 documentation extraction

## Learning level
Intermediate

## What this page explains
This is the eleventh extracted developer guide from the private LLM Wiki tree and
the fourth (final) recipe guide. It shows how to render GraphCompose documents in
backend and server workflows: one session per request, file vs stream vs bytes,
preview images, and production boundaries.

It answers:

```text
I generate documents from a backend. Should I write a file, stream the PDF,
return bytes, or render preview images - and how do I keep it production-safe?
```

It turns the internal server/preview recipe into a "use when" guide with the
one-session-per-request rule, the output-by-destination decision, when-to-use,
when-not, why, and compile-checked snippets. Preview images are documented in
prose because they are release-sensitive.

## Developer question
`DocumentSession` is a per-document working object. In a server, how do I scope
it correctly, pick the right output method for the destination, and avoid the
common production mistakes?

## Mental model
Create one session for one request, compose, write the output, and close the
session. Never share a session between requests. Pick output by destination.

```text
Per request:
    create session -> compose -> render -> close (try-with-resources)

Output by destination:
1. buildPdf() / buildPdf(Path)   <- batch jobs, scheduled exports, local files
2. writePdf(OutputStream)        <- HTTP responses, cloud, large documents
3. toPdfBytes()                  <- tests, small payloads, byte-array APIs
4. toImages(...) / toImage(...)  <- previews, thumbnails (release-sensitive)
```

`DocumentSession` is mutable and not thread-safe. `writePdf(...)` writes to the
stream but does not close it - the caller owns stream lifecycle.

## When to use this
- `writePdf(OutputStream)` for servlet/Spring response streams and large
  documents.
- `toPdfBytes()` when the caller explicitly needs an in-memory byte array.
- `buildPdf()` when the session has a default output path.
- `buildPdf(Path)` when a batch job chooses the path late.
- `toImages(...)` / `toImage(...)` for previews and thumbnails (see the
  release-sensitivity note).
- Layout snapshots or visual regression for testable document behavior - see
  `12-docs-extraction/07-output-and-testing.md`.

## When not to use this
- Do not keep a `DocumentSession` as a singleton or cache it between users.
- Do not close a response stream inside a rendering helper unless your web
  framework expects it. `writePdf` does not close the stream.
- Do not use `toPdfBytes()` for very large documents just because it is easy.
- Do not enable debug overlays in production output.
- Do not log user-provided document content without a clear privacy policy.

## How it works in GraphCompose
The source-backed server flow is:

1. Build or receive application data.
2. Create a `DocumentSession` inside the request/job scope.
3. Compose the document with Flow or a template.
4. Render to the selected output method.
5. Close the session (try-with-resources).

The production guidance recommends one session per request and notes that
`DocumentSession` is not thread-safe. The HTTP streaming example writes a
document to an `OutputStream` and leaves stream ownership to the caller.

## Decision tree
```text
I rendered a document on the backend. Where does it go?
|
+-- Into the HTTP response or a cloud stream?
|   -> writePdf(OutputStream). Do not close the caller's stream.
|
+-- A byte array for a test or small API payload?
|   -> toPdfBytes(). Avoid for very large documents.
|
+-- A file from a batch/scheduled job?
|   -> buildPdf() (default path) or buildPdf(Path) (chosen late).
|
+-- A preview image for a review UI?
    -> toImages(...) / toImage(...). Release-sensitive - check the caveat.
```

## Stream output example
Direct streaming for an HTTP endpoint or service method. The caller owns the
sink stream.

<!-- snippet-smoke: id=round35-recipe-server-stream mode=members since=current -->
```java
public void streamInvoiceTo(InvoiceDocumentSpec invoice, OutputStream sink) throws IOException {
    BusinessTheme theme = BusinessTheme.modern();
    InvoiceTemplateV2 template = new InvoiceTemplateV2(theme);

    try (DocumentSession document = GraphCompose.document()
            .pageSize(DocumentPageSize.A4)
            .pageBackground(theme.pageBackground())
            .margin(DocumentInsets.of(28))
            .create()) {
        template.compose(document, invoice);
        document.writePdf(sink);
    }
}
```

Source marker: verified against
`07-recipes/05-render-in-a-server-or-preview-flow.md` (marker
`recipe-server-streaming-helper`),
`examples/src/main/java/com/demcha/examples/features/streaming/HttpStreamingExample.java`,
`docs/operations/production-rendering.md`, and
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`.

Compile-smoke marker: `round35-recipe-server-stream`, `mode=members`, added in
Round 35.

## Byte-array output example
Use `toPdfBytes()` when a test or integration layer truly needs bytes. It holds
the full PDF in memory, so prefer streaming for large production output.

<!-- snippet-smoke: id=round35-recipe-server-bytes mode=method since=current -->
```java
byte[] pdf;

try (DocumentSession document = GraphCompose.document()
        .pageSize(DocumentPageSize.A4)
        .margin(DocumentInsets.of(28))
        .create()) {
    document.pageFlow(page -> page.addParagraph(p -> p.text("PDF bytes")));
    pdf = document.toPdfBytes();
}
```

Source marker: verified against
`07-recipes/05-render-in-a-server-or-preview-flow.md` (marker
`recipe-server-pdf-bytes-minimal`),
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`, and
`src/test/java/com/demcha/testing/visual/HttpStreamingDemoTest.java`.

Compile-smoke marker: `round35-recipe-server-bytes`, `mode=method`, added in
Round 35.

## Batch file output example
A scheduled or batch job often builds the session without a default path and
chooses the output file late with `buildPdf(Path)`.

<!-- snippet-smoke: id=round35-recipe-batch-file mode=method since=current -->
```java
try (DocumentSession document = GraphCompose.document()
        .pageSize(DocumentPageSize.A4)
        .margin(DocumentInsets.of(28))
        .create()) {
    document.pageFlow(page -> page.addParagraph(p -> p.text("Scheduled batch export")));
    document.buildPdf(Path.of("exports/report-2026-06.pdf"));
}
```

Source marker: verified against
`07-recipes/05-render-in-a-server-or-preview-flow.md`,
`12-docs-extraction/07-output-and-testing.md`, and
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`
(`buildPdf(Path)`).

Compile-smoke marker: `round35-recipe-batch-file`, `mode=method`, added in
Round 35.

## Preview images (release-sensitive)
A review UI may need the first page (or every page) as an image before download.
The APIs are:

- `BufferedImage page = document.toImage(0, 150);` - one page, zero-based index,
  at a chosen DPI.
- `List<BufferedImage> pages = document.toImages(150);` - every page at a chosen
  DPI.

These are NOT shown as runnable `since=current` snippets here. In the current
local source audit `toImage(...)` and `toImages(...)` are post-`v1.8.0`,
`@since 1.9.0` APIs that are not present in the latest local `v1.8.0` tag. Check
a real `v1.9.0` release before presenting them as stable published-artifact APIs.
See `11-gap-backlog/05-release-sensitive-api-status.md`. Choose a DPI suitable
for the UI - image previews are not free.

## Common mistakes
- Sharing a `DocumentSession` across requests.
- Rendering to bytes and then writing those bytes to a response when direct
  streaming would be enough.
- Closing the servlet response stream inside a utility unexpectedly.
- Building documents from mutable global state instead of request data.
- Assuming image previews are free. Choose a DPI suitable for the UI.
- Depending on preview image APIs without checking release status when working
  against a published artifact rather than the local source tree.

## What to read next
| Next question | Read |
| --- | --- |
| "Which output method, in detail?" | `12-docs-extraction/07-output-and-testing.md` |
| "How is the session scoped/closed?" | `04-core-concepts/01-session-lifecycle.md` |
| "Is the preview-image API in my artifact?" | `11-gap-backlog/05-release-sensitive-api-status.md` |
| "How do I build the document I stream?" | `12-docs-extraction/08-recipe-invoice-and-proposal.md` |
| "What PDF chrome (watermark/header/protect) is there?" | `06-advanced-capabilities/02-pdf-chrome-production-options.md` |

## Related pages
- `12-docs-extraction/07-output-and-testing.md`
- `12-docs-extraction/08-recipe-invoice-and-proposal.md`
- `07-recipes/05-render-in-a-server-or-preview-flow.md`
- `04-core-concepts/01-session-lifecycle.md`
- `06-advanced-capabilities/02-pdf-chrome-production-options.md`
- `11-gap-backlog/05-release-sensitive-api-status.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `src/main/java/com/demcha/compose/document/style/DocumentInsets.java`
- `src/main/java/com/demcha/compose/document/templates/builtins/InvoiceTemplateV2.java`
- `.llm-wiki/07-recipes/05-render-in-a-server-or-preview-flow.md`
- `.llm-wiki/12-docs-extraction/07-output-and-testing.md`
- `.llm-wiki/11-gap-backlog/05-release-sensitive-api-status.md`
- `examples/src/main/java/com/demcha/examples/features/streaming/HttpStreamingExample.java`
- `src/test/java/com/demcha/testing/visual/HttpStreamingDemoTest.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 35 adds the eleventh documentation-extraction guide under
`12-docs-extraction/` and the fourth and final recipe guide. It is built from the
Round 8 server/preview recipe and the Round 31 output guide.

The stream and byte-array snippets reuse the source recipe shapes already
compile-smoke proven in Round 22 (`recipe-server-streaming-helper`,
`recipe-server-pdf-bytes-minimal`). The batch-file snippet adds `buildPdf(Path)`;
its `buildPdf(Path)` and `DocumentInsets.of(double)` signatures were re-checked
against `DocumentSession.java` and `DocumentInsets.java` before marking.

Preview images (`toImage`/`toImages`) are documented in prose with the
release-sensitivity caveat rather than marked as `since=current` snippets,
because they are post-`v1.8.0` `@since 1.9.0` APIs in the current local source
audit. This keeps every marked `java` fence compile-checkable against the current
local module without implying released-artifact availability.

Round 35 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

Snippet generation succeeded: the private report showed `marked=56`,
`generated=56`, `skipped=0`, and `warnings=0`. However, the Maven-backed
`-Compile` gate was blocked before it could `javac` the snippets, by a
pre-existing compile error in the working tree's in-progress production source:
`src/main/java/com/demcha/compose/document/templates/cv/v2/presets/Panel.java`
references a missing `TextStyles` symbol (`cannot find symbol`). This is an
unrelated template-refactor error in the engine/template source, not in any wiki
snippet, and is the same class of blocker recorded in Round 21.

The three new Round 35 snippets were instead verified with a manual `javac`
fallback (the Round 21 precedent): compiled against the current `target/classes`,
`target/test-classes`, and the Maven test-scope dependency classpath. All three
produced class files with javac exit 0. The stream and byte-array shapes are also
already compile-smoke proven from Round 22.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified. The `Panel.java` compile error pre-existed
this round and was not introduced by the wiki work.
