---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/02-choose-authoring-path.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Choose The Authoring Path

## Status
Verified / Round 26 documentation extraction

## Learning level
Beginner to intermediate

## What this page explains
This is the second extracted developer guide from the private LLM Wiki tree.

The first guide (`12-docs-extraction/01-getting-started-developer-guide.md`)
answered "I have a Java project, how do I generate my first document?" This
guide answers the very next question:

```text
I have an idea for a document. Which GraphCompose path should I build it with:
a template, Flow, helpers, layout primitives, custom nodes, or a custom backend?
```

It turns the internal decision-tree and core-concept pages into a single
beginner-friendly path-selection guide. It explains, for each authoring layer,
when to use it, when not to use it, and why, and it gives compile-checked
snippets only for the beginner-safe paths.

## Developer question
There are several ways to build a document in GraphCompose. Which one should I
start with, and how do I know I have not picked a layer that is too powerful or
too low-level for my problem?

## Mental model
The authoring options are not eight equal peers. They are a ladder, from "least
code, most maintained" at the top to "most power, closest to the engine" at the
bottom. Start at the top and move down only when the layer above genuinely
cannot express your document.

```text
1. Maintained template              <- known document family + structured data
2. GraphCompose.document() session  <- the entry every custom document uses
3. Flow content (pageFlow/modules)  <- reading-order body, top to bottom
4. Helpers / widgets over the DSL   <- the same DSL shape repeats in your app
5. Layout primitives                <- specific placement: rows, canvas, shapes
6. Detached / raw nodes             <- a helper hands back a reusable node
7. Custom DocumentNode + NodeDefinition <- a brand-new semantic concept
8. Custom backend / export API      <- a new output format or render behavior
```

Layers 1-5 are normal application authoring. Layers 6-8 are reuse and extension
work. A beginner should almost never start at layers 6-8.

Every normal path still enters through `GraphCompose.document(...)` and a
`DocumentSession`. Templates and hand-written DSL both compose the same semantic
document nodes into the same session; they are not competing engines.

## When to use this
Use this page:

- before writing the first file for a new document feature;
- when deciding "do I use a maintained template, or build this myself?";
- when you are tempted to reach for custom nodes or extension APIs;
- when reviewing whether a teammate picked the right layer.

## When not to use this
Do not use this page for fine-grained placement choices inside `pageFlow(...)`.
Once you are committed to a custom Flow document, the placement decision (flow
vs row vs canvas vs shape container) belongs to the layout choice tree.

Do not use this page to choose the output format. PDF vs streamed PDF vs
semantic DOCX is an output decision, made after authoring.

Do not use this page as a full API reference, and do not use it to pick a
specific template preset. It only routes you to the right layer.

## How it works in GraphCompose
GraphCompose exposes a stable public authoring surface:

- `GraphCompose.document(...)` to open a `DocumentSession`;
- `DocumentDsl` and flow builders such as `PageFlowBuilder`, `ModuleBuilder`,
  and `SectionBuilder`;
- maintained templates that compose into the same `DocumentSession`.

The risk for a beginner is not "too few options". It is choosing a powerful or
low-level layer too early. The table below is the quick router; the prose after
it explains each path.

| Path | Use when | Avoid when | Why |
| --- | --- | --- | --- |
| Maintained template | The whole document is a known family (CV, cover letter, invoice, proposal, weekly schedule) and you have structured data. | The document is not actually that family. | The template already encodes a stable structure, theme hooks, and rendering choices. |
| `DocumentSession` + `pageFlow(...)` | The document is custom and should read top to bottom. | A maintained template already fits. | This is the default direct authoring surface; the engine owns placement and pagination. |
| Flow content (modules/sections) | You are inside a flow and adding ordinary body content. | You need fixed coordinates or overlap. | Modules and sections keep related content together and still paginate. |
| Helpers / widgets over the DSL | The same DSL shape repeats across your app. | It only appears once. | Reuse application vocabulary without bypassing the public surface. |
| Layout primitives (row, canvas, shape container) | Content has a specific placement relationship. | Normal flow would already read correctly. | Pick the weakest primitive that expresses the placement clearly. |
| Detached / raw nodes | A helper needs to build a block and hand it back. | You can stay inside the flow callback. | A helper can return a `DocumentNode` and the caller `add(...)`s it. |
| Custom `DocumentNode` + `NodeDefinition` | No existing primitive can express a new semantic concept. | A helper, widget, or existing primitive would do. | This is the beta extension SPI; it must participate in layout, pagination, and render. |
| Custom backend / export API | You need a new output format or different render behavior. | PDF, streamed PDF, or semantic DOCX already cover it. | Backends consume the resolved `LayoutGraph` or the `DocumentGraph`. |

### Path 1: maintained template
Choose a template when the entire document is a known family and the input is
structured data. Good fits are CVs and cover letters (layered `cv.v2.*` /
`coverletter.v2.*`), invoices and proposals (`InvoiceTemplateV2` /
`ProposalTemplateV2`), and weekly schedules (current V1 template until a V2
ships). The template shapes the structure for you; if your document is not
really that family, a custom Flow document is clearer.

### Path 2 and 3: session and Flow
Every custom document opens a `DocumentSession` with `GraphCompose.document(...)`
and then describes a `pageFlow(...)`. A page flow is the document body in
reading order: modules, sections, paragraphs, lists, tables, rows, and images
are added top to bottom, and GraphCompose resolves layout and pagination. This
is the default for reports, letters, statements, catalogs, and most generated
business PDFs.

### Path 4: helpers and widgets over the DSL
When the same DSL shape repeats across your application, wrap it in a helper
method or widget that still emits normal DSL content. This keeps a reusable
application-level vocabulary without dropping below the public surface. Use a
helper before you ever consider a custom node.

### Path 5: layout primitives
Inside a flow, reach for a layout primitive only when the content has a specific
placement need: side-by-side columns (row), a framed surface (shape container),
or fixed coordinates inside a fixed box (canvas). The rule is to choose the
weakest primitive that expresses the relationship. Details and the full decision
tree live in the layout-choice and layout-primitives pages.

### Paths 6-8: detached nodes and extension APIs
A detached node is the reuse seam: a helper builds a `DocumentNode` with
`document.dsl()` and returns it, and the caller adds it to a flow. A custom
`DocumentNode` plus a `NodeDefinition` is a true extension: a new semantic
concept that participates in layout, pagination, and rendering. A custom backend
is for a new output format. These are advanced, not beginner, paths. They need
source-level verification and tests, and `document.layout` is marked internal
except for the `@Beta` `NodeDefinition` seam.

## Decision tree
Read the tree top to bottom and stop at the first branch that matches.

```text
I have a document idea.
|
+-- Is it a family GraphCompose already maintains?
|   (CV, cover letter, invoice, proposal, weekly schedule)
|   -> YES: use the maintained template. Stop.
|
+-- Is it custom, but mostly reads top to bottom?
|   -> YES: GraphCompose.document(...) + pageFlow(...). This is the default.
|
+-- Inside that flow, do I need a specific placement?
|   (columns, exact coordinates, a shape that frames content)
|   -> YES: use a layout primitive (row, canvas, shape container).
|           See the layout choice tree.
|
+-- Does the same DSL shape repeat across my app?
|   -> YES: extract a helper method or widget that emits DSL content.
|
+-- Does a helper need to hand back a ready-made block?
|   -> YES: build a detached DocumentNode and add(...) it.
|
+-- Can no existing primitive express the concept at all?
|   -> YES: extension work - custom DocumentNode + NodeDefinition,
|           or a custom backend. Not a beginner path.
|
+-- Am I writing layout-engine code?
    -> That is the internal/shared-engine lane, not document authoring.
```

## Minimal example
The default custom path: open a session, describe a page flow, render. No manual
coordinates and no engine internals.

<!-- snippet-smoke: id=round26-authoring-flow-method mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("report.pdf"))
        .pageSize(DocumentPageSize.A4)
        .margin(24, 24, 24, 24)
        .create()) {

    document.pageFlow(page -> page
            .module("Summary", module -> module.paragraph(
                    "A custom business document the engine lays out top to bottom."))
            .module("Details", module -> module.bullets(
                    "No manual coordinates",
                    "Automatic pagination",
                    "Describe structure, not drawing commands")));

    document.buildPdf();
}
```

Source marker: verified against
`12-docs-extraction/01-getting-started-developer-guide.md`,
`02-decision-tree/02-authoring-paths.md`,
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`,
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`, and
`src/main/java/com/demcha/compose/document/dsl/ModuleBuilder.java`. The same
`pageSize`/`margin`/`module`/`paragraph`/`bullets` shapes are compile-smoke
proven by Round 25 `round25-getting-started-hello-file` and
`round25-getting-started-profile-flow`.

Compile-smoke marker: `round26-authoring-flow-method`, `mode=method`, added in
Round 26.

## Reusable helper example
When the same shape repeats, extract a helper that takes the flow builder and
emits DSL content. This is path 4: still the public DSL, just packaged for reuse.

<!-- snippet-smoke: id=round26-authoring-helper-over-dsl mode=members since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;

import java.nio.file.Path;

void buildStatement(Path output) throws Exception {
    try (DocumentSession document = GraphCompose.document(output).create()) {
        document.pageFlow(page -> {
            balanceSection(page, "Opening balance", "1,200.00");
            balanceSection(page, "Closing balance", "1,540.00");
        });
        document.buildPdf();
    }
}

void balanceSection(PageFlowBuilder page, String title, String amount) {
    page.module(title, module -> module.paragraph(amount));
}
```

Source marker: verified against
`02-decision-tree/02-authoring-paths.md` (Path C: reusable helpers),
`04-core-concepts/03-dsl-builders-and-semantic-nodes.md`,
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`, and
`src/main/java/com/demcha/compose/document/dsl/ModuleBuilder.java`. The helper
calls the same `module(title, ...)` / `paragraph(...)` surface used by the
compile-smoke-proven getting-started snippets.

Compile-smoke marker: `round26-authoring-helper-over-dsl`, `mode=members`, added
in Round 26.

## Detached node example
A helper can also build a node and hand it back instead of writing into the flow
directly. This is the reuse seam (path 6): build with `document.dsl()`, then
`add(...)` the node to a flow.

<!-- snippet-smoke: id=round26-authoring-detached-node mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.node.ParagraphNode;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("detached.pdf")).create()) {

    ParagraphNode badge = document.dsl()
            .paragraph()
            .name("StatusBadge")
            .text("Status: Ready")
            .build();

    document.pageFlow(page -> page.add(badge));

    document.buildPdf();
}
```

Source marker: verified against
`04-core-concepts/03-dsl-builders-and-semantic-nodes.md` (detached builder
shape),
`src/main/java/com/demcha/compose/document/dsl/DocumentDsl.java`,
`src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`, and
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`.

Compile-smoke marker: `round26-authoring-detached-node`, `mode=method`, added in
Round 26.

## Template path
When the document is a maintained family, do not rebuild it by hand. A template
maps a structured data object into the session, then you render as usual:

```text
build a typed data object (for example a CvDocument)
    -> pick a template / preset (for example BoxedSections.create())
    -> template.compose(document, data)
    -> document.buildPdf()
```

The full, compile-smoke-proven template example lives in
`12-docs-extraction/01-getting-started-developer-guide.md` and
`03-getting-started/04-first-template-document.md` (marker
`first-template-cv-v2`). This guide does not repeat the full `CvDocument` build;
it only routes you to the template layer. Picking a specific preset is a later
decision covered by the template catalog.

## Advanced paths: custom nodes and backends
If no existing primitive, helper, or template can express your document, the
last resort is extension work: a custom `DocumentNode` plus a `NodeDefinition`,
a custom PDF fragment handler, or a custom backend. These are deliberately not
shown as runnable beginner snippets here, because they are advanced and tied to
internal contracts.

Before writing any of them, confirm in order:

1. existing DSL builders cannot express the document;
2. a helper or widget cannot package the repeated shape;
3. a template or preset cannot own the family;
4. only then add a `DocumentNode` and `NodeDefinition`, with render/export
   support and snapshot or visual-regression tests.

The full advanced guidance, including a compile-smoke-proven PDF fragment
handler snippet, is in
`06-advanced-capabilities/05-extension-apis-custom-nodes-and-backends.md`.

## What to read next
Choose the next page by the path you landed on.

| You chose... | Read next |
| --- | --- |
| Maintained template | `03-getting-started/04-first-template-document.md`, then `11-gap-backlog/03-template-preset-catalog.md` |
| Custom Flow document | `04-core-concepts/02-page-flow-mental-model.md`, then `05-capabilities/` |
| A layout primitive | `02-decision-tree/03-layout-choice-tree.md`, then `05-capabilities/04-layout-primitives.md` |
| Helpers or detached nodes | `04-core-concepts/03-dsl-builders-and-semantic-nodes.md` |
| Custom node or backend | `06-advanced-capabilities/05-extension-apis-custom-nodes-and-backends.md` |

## Common mistakes
- Treating templates and Flow as competing engines. Both compose into the same
  `DocumentSession`.
- Choosing a template for a document that is not actually that family, then
  fighting the template structure.
- Choosing custom Flow for a known template family, then hand-rebuilding the
  template's behavior.
- Jumping to custom nodes or extension APIs because one layout detail is
  unclear. Try a helper or an existing layout primitive first.
- Starting from `engine.*`, `document.layout`, or PDFBox for normal authoring.
  Those are internal layers, not the beginner path.
- Treating "Flow vs nodes" as the first decision. Flow is the beginner authoring
  API; nodes are the semantic structure beneath it.

## Related pages
- `02-decision-tree/01-root-developer-entry.md`
- `02-decision-tree/02-authoring-paths.md`
- `02-decision-tree/03-layout-choice-tree.md`
- `03-getting-started/02-choose-api-path.md`
- `03-getting-started/04-first-template-document.md`
- `04-core-concepts/02-page-flow-mental-model.md`
- `04-core-concepts/03-dsl-builders-and-semantic-nodes.md`
- `05-capabilities/04-layout-primitives.md`
- `06-advanced-capabilities/05-extension-apis-custom-nodes-and-backends.md`
- `12-docs-extraction/01-getting-started-developer-guide.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/GraphCompose.java`
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `src/main/java/com/demcha/compose/document/dsl/DocumentDsl.java`
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/PageFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ModuleBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
- `src/main/java/com/demcha/compose/document/node/ParagraphNode.java`
- `src/main/java/com/demcha/compose/document/layout/NodeDefinition.java`
- `.llm-wiki/02-decision-tree/01-root-developer-entry.md`
- `.llm-wiki/02-decision-tree/02-authoring-paths.md`
- `.llm-wiki/02-decision-tree/03-layout-choice-tree.md`
- `.llm-wiki/03-getting-started/02-choose-api-path.md`
- `.llm-wiki/04-core-concepts/02-page-flow-mental-model.md`
- `.llm-wiki/04-core-concepts/03-dsl-builders-and-semantic-nodes.md`
- `.llm-wiki/05-capabilities/04-layout-primitives.md`
- `.llm-wiki/06-advanced-capabilities/05-extension-apis-custom-nodes-and-backends.md`
- `.llm-wiki/12-docs-extraction/01-getting-started-developer-guide.md`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 26 adds the second documentation-extraction guide under
`12-docs-extraction/`. It is a path-selection guide built from the Round 3
decision-tree pages, the Round 4 API-path page, and the Round 5 core-concept
pages.

The three Java snippets are new extraction snippets that reuse API shapes already
compile-smoke proven in earlier rounds (session creation, `pageFlow(...)`,
`module(...)`, `paragraph(...)`, `bullets(...)`, the detached-builder
`document.dsl().paragraph()...build()` shape, and `add(DocumentNode)`). They are
marked separately so the private harness checks this guide directly.

The template path and the custom-node/backend paths are described in prose with
links rather than repeated as runnable snippets here: the full compile-smoke
proof for the template path lives in
`12-docs-extraction/01-getting-started-developer-guide.md` and
`03-getting-started/04-first-template-document.md`, and the advanced extension
snippet lives in
`06-advanced-capabilities/05-extension-apis-custom-nodes-and-backends.md`. This
keeps every `java` fence in this guide compile-checkable while still covering all
eight authoring paths.

Round 26 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=29`, `generated=29`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
