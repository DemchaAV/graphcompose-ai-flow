---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/01-getting-started-developer-guide.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Getting Started Developer Guide

## Status
Verified / Round 25 documentation extraction

## Learning level
Beginner

## What this page explains
This page is the first extracted developer guide from the private LLM Wiki tree.
It turns the internal decision tree into a practical getting-started tutorial.

It answers the first real developer question:

```text
I have a Java project and I want to generate a document.
What should I choose first, why, and what code should I write?
```

This page intentionally covers the stable beginner path only:

- choose a maintained template when the document family already exists;
- otherwise start with `GraphCompose.document(...)`;
- create one `DocumentSession`;
- author content with `pageFlow(...)`;
- render to a file or stream;
- read the next capability page only after the lifecycle is clear.

## Developer question
I want to build my first GraphCompose document. Should I start with a template,
Flow, nodes, or engine internals?

## Mental model
GraphCompose is session-first.

```text
GraphCompose.document(...)
    -> DocumentSession
        -> pageFlow(...)
            -> semantic document nodes
                -> layout and pagination
                    -> PDF output
```

Most developers should not start from low-level nodes, layout internals, PDFBox,
or custom render handlers.

Start from intent:

```text
Known document family?
    -> use a maintained template

Custom document?
    -> use DocumentSession + pageFlow(...)

Need reusable application blocks?
    -> write helpers/widgets on top of the DSL

Need a new primitive/backend?
    -> advanced extension path
```

## When to use this
Use this guide when:

- you are evaluating GraphCompose for the first time;
- you need a small custom PDF;
- you need a stable lifecycle shape before learning tables, images, layout
  primitives, templates, or tests;
- you are writing documentation and need the safest beginner extraction path.

## When not to use this
Do not use this page as a full API reference.

Do not use it for exact-position certificates, posters, complex tables, DOCX
support matrices, preview images, TOC/page references, or extension APIs. Those
belong to later capability and advanced pages.

Do not treat old `wiki/tutorial/` pages as source of truth for this guide.
Round 24 keeps them as compact historical summaries only.

## How it works in GraphCompose
The stable public entry point is `GraphCompose.document(...)`.

There are two common starts:

| Need | Start |
| --- | --- |
| Write a PDF file to a known path | `GraphCompose.document(Path.of("out.pdf"))` |
| Stream a PDF to an existing `OutputStream` | `GraphCompose.document()` |

Calling `create()` returns a `DocumentSession`. The session owns one document
graph, output settings, layout cache, and render/export operations. Use
try-with-resources so session resources are released even if rendering fails.

Inside the session, the beginner authoring path is `pageFlow(...)`. A page flow
is a reading-order document body: modules, sections, paragraphs, lists, tables,
rows, and images are added top to bottom, then GraphCompose resolves layout and
pagination.

### The problem
New document libraries often push developers into drawing coordinates too
early. That creates fragile PDFs: every text change can require manual
positioning work.

### The simple way
Start with Flow. Describe document structure in reading order and let the
engine handle placement and page breaks.

### Why this works
GraphCompose stores semantic document nodes first, then resolves layout and PDF
rendering later. Your code describes intent, not PDF drawing commands.

### Another possible way
If your document belongs to a maintained family, use a template:

| Document family | First route |
| --- | --- |
| CV or cover letter | layered `cv.v2.*` / `coverletter.v2.*` templates |
| Invoice or proposal | `InvoiceTemplateV2` / `ProposalTemplateV2` |
| Weekly schedule | current V1 weekly schedule template |
| Custom report, letter, catalog, generated business PDF | `GraphCompose.document(...)` + `pageFlow(...)` |

Templates still compose into a `DocumentSession`; they are not a separate
engine.

### How to choose
- If a maintained template matches the document family, start there.
- If the document is custom, start with `pageFlow(...)`.
- If content should sit side by side, add rows after learning Flow.
- If content needs exact coordinates inside a fixed box, learn canvas later.
- If you only need repeated application blocks, write helper methods on top of
  the DSL before considering custom nodes.
- If existing primitives cannot express the behavior, move to extension APIs
  after the beginner path is clear.

### What not to do
- Do not start with `engine.*`.
- Do not call PDFBox directly for normal document authoring.
- Do not use canvas for ordinary prose.
- Do not share one `DocumentSession` across parallel requests.
- Do not call no-argument `buildPdf()` unless the session was created with a
  default output path.

## Minimal example
This is the smallest useful file-output shape: create one session, add one
page flow, render the configured PDF path, and close the session.

<!-- snippet-smoke: id=round25-getting-started-hello-file mode=class since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

class GettingStartedHelloFile {
    public static void main(String[] args) throws Exception {
        try (DocumentSession document = GraphCompose.document(Path.of("hello.pdf"))
                .pageSize(DocumentPageSize.A4)
                .margin(24, 24, 24, 24)
                .create()) {

            document.pageFlow(page -> page
                    .module("Summary",
                            module -> module.paragraph("Hello GraphCompose")));

            document.buildPdf();
        }
    }
}
```

Source marker: verified against `GraphCompose.java`, `DocumentSession.java`,
`AbstractFlowBuilder.java`, `ModuleBuilder.java`,
`03-getting-started/01-first-document.md`, and the Round 18
`first-document-hello` compile-smoke proof.

Compile-smoke marker: `round25-getting-started-hello-file`, `mode=class`,
added in Round 25.

## Practical example
After the minimal example works, build a small custom document with several
modules. This is still Flow: no manual x/y coordinates, no PDFBox calls, and no
engine internals.

<!-- snippet-smoke: id=round25-getting-started-profile-flow mode=class since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

class GettingStartedProfileFlow {
    public static void main(String[] args) throws Exception {
        try (DocumentSession document = GraphCompose.document(Path.of("profile.pdf"))
                .pageSize(DocumentPageSize.A4)
                .margin(24, 24, 24, 24)
                .create()) {

            document.pageFlow()
                    .name("CandidateProfile")
                    .spacing(12)
                    .module("Professional Summary", module -> module.paragraph(
                            "Backend engineer focused on clean Java APIs, stable document output, "
                                    + "and reusable template architecture."))
                    .module("Technical Skills", module -> module.bullets(
                            "Java 21 and Spring Boot",
                            "PDF document generation with GraphCompose",
                            "Layout snapshot testing and render regression checks"))
                    .module("Projects", module -> module.rows(
                            "GraphCompose - declarative document layout engine.",
                            "CVRewriter - profile-aware CV tailoring platform."))
                    .build();

            document.buildPdf();
        }
    }
}
```

Source marker: verified against `03-getting-started/03-first-flow-document.md`,
`examples/src/main/java/com/demcha/examples/flagships/ModuleFirstFileExample.java`,
`DocumentSession.java`, `AbstractFlowBuilder.java`, and `ModuleBuilder.java`.

Compile-smoke marker: `round25-getting-started-profile-flow`, `mode=class`,
added in Round 25.

## Server output example
When the caller already owns the destination stream, create the session without
a default path and call `writePdf(OutputStream)`.

<!-- snippet-smoke: id=round25-getting-started-streaming-output mode=members since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.io.OutputStream;

void writeProfilePdf(OutputStream outputStream) throws Exception {
    try (DocumentSession document = GraphCompose.document().create()) {
        document.pageFlow(page -> page
                .module("Summary",
                        module -> module.paragraph("Generated for an HTTP response.")));

        document.writePdf(outputStream);
    }
}
```

Source marker: verified against `04-core-concepts/01-session-lifecycle.md`,
`DocumentSession.writePdf(OutputStream)`, and the Round 19
`core-session-lifecycle-streaming-helper` compile-smoke proof.

Compile-smoke marker: `round25-getting-started-streaming-output`,
`mode=members`, added in Round 25.

## Dependency
For the current stable local project version, the main artifact coordinates are:

```xml
<dependency>
    <groupId>io.github.demchaav</groupId>
    <artifactId>graph-compose</artifactId>
    <version>1.8.0</version>
</dependency>
```

Use font/bundle artifacts only when the document needs bundled font families.
Pure text and standard-14 font documents can start with the main artifact.

Source marker: verified against the root `pom.xml` and
`03-getting-started/01-first-document.md`.

## What to read next
After this guide, choose the next page by intent:

| Next question | Read |
| --- | --- |
| "Should I use a template, Flow, helpers, or extensions?" | `02-decision-tree/02-authoring-paths.md` |
| "How does Flow really place content?" | `04-core-concepts/02-page-flow-mental-model.md` |
| "How do I add text, lists, tables, images, or layout blocks?" | `05-capabilities/` |
| "How do I stream, test, or debug output?" | `05-capabilities/05-output-and-testing.md` |
| "How do I build an invoice, proposal, CV, report, or certificate?" | `07-recipes/` |

## Common mistakes
- Choosing custom nodes before trying Flow.
- Treating templates and Flow as competing engines. Templates compose into the
  same session model.
- Building normal prose with canvas coordinates.
- Reusing one `DocumentSession` for several unrelated documents or parallel
  requests.
- Assuming compile-smoke proof is render proof. Visual recipes still need
  rendered PDF/image review before public visual claims.
- Copying old `wiki/tutorial/` snippets without checking the formal tree and
  the snippet-smoke register.

## Related pages
- `02-decision-tree/01-root-developer-entry.md`
- `02-decision-tree/02-authoring-paths.md`
- `03-getting-started/01-first-document.md`
- `03-getting-started/03-first-flow-document.md`
- `04-core-concepts/01-session-lifecycle.md`
- `04-core-concepts/02-page-flow-mental-model.md`
- `05-capabilities/05-output-and-testing.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`
- `11-gap-backlog/13-tutorial-draft-disposition.md`

## Source files checked
- `pom.xml`
- `docs/architecture/overview.md`
- `docs/architecture/package-map.md`
- `src/main/java/com/demcha/compose/GraphCompose.java`
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/PageFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ModuleBuilder.java`
- `examples/src/main/java/com/demcha/examples/flagships/ModuleFirstFileExample.java`
- `.llm-wiki/02-decision-tree/01-root-developer-entry.md`
- `.llm-wiki/02-decision-tree/02-authoring-paths.md`
- `.llm-wiki/03-getting-started/01-first-document.md`
- `.llm-wiki/03-getting-started/03-first-flow-document.md`
- `.llm-wiki/04-core-concepts/01-session-lifecycle.md`
- `.llm-wiki/11-gap-backlog/12-documentation-extraction-readiness.md`
- `.llm-wiki/11-gap-backlog/13-tutorial-draft-disposition.md`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 25 adds the first actual documentation-extraction guide under
`12-docs-extraction/`.

The three Java snippets in this guide are new extraction snippets derived from
previously verified getting-started/core examples. They are marked separately so
the private harness checks the guide itself, not only the source pages it was
extracted from.

Round 25 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=26`, `generated=26`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation
warnings and a JDK/Lombok warning during `test-compile`, but the snippet-smoke
report itself had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
