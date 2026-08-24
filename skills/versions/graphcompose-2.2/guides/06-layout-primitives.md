---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/06-layout-primitives.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Layout Primitives

## Status
Verified / Round 30 documentation extraction

## Learning level
Beginner to intermediate

## What this page explains
This is the sixth extracted developer guide from the private LLM Wiki tree and
the fourth everyday-capability guide (after text, lists/tables, and
images/graphics).

It answers the placement question:

```text
I need to place objects on a page. Should I let them flow, put them in columns,
paint a background, overlap layers, frame them in a shape, or use exact
coordinates?
```

It turns the internal layout-primitives capability page into a beginner-friendly
guide with when-to-use, when-not, why, a decision tree, and compile-checked
snippets for the most common placement primitives. Layer stacks, shape
containers, and bleed are routed in prose to the source pages.

## Developer question
Flow is the default, but some content needs columns, a background, overlap, a
frame, or fixed coordinates. Which primitive expresses each relationship, and
which is the weakest one that still works?

## Mental model
Flow is the default. Every stronger primitive should answer a specific placement
problem. Choose the weakest primitive that expresses the relationship clearly.

```text
1. pageFlow / addSection / module        <- normal top-to-bottom reading order
2. addRow(row -> row.weights(...))        <- side-by-side content that still flows
3. pageBackground(s)(...)                 <- fill behind every page (no flow space)
4. addLayerStack(...) / addContainer(...) <- overlap aligned relative to another object
5. addCanvas(w, h, ...)                   <- exact (x, y) inside a fixed box
```

The key distinctions: rows and flow participate in layout; page backgrounds do
not; layer stacks align objects relative to each other; canvas uses fixed
coordinates and is atomic for pagination.

## When to use this
- Page flow / sections / modules for almost every document: reports, invoices,
  CVs, letters, proposals, manuals - anything that should paginate naturally.
- Rows for two-column or multi-column content that should stay in the flow:
  sidebar + main column, label/value pairs, KPI rows.
- Page backgrounds for repeated page-wide fills: sidebar tint, header/footer
  band, full-page paper color, watermark-like wash behind all content.
- Layer stacks or shape containers for overlap and alignment relationships:
  badge over card, label inside pill, icon centered on a shape.
- Canvas only when fixed `(x, y)` placement is the requirement: certificate,
  diploma, poster, fixed badge/map area.

## When not to use this
Do not choose canvas as the first layout tool for regular documents. It does not
flow or wrap its children, and it is atomic for pagination.

Do not use page backgrounds for actual content. They paint behind the document
and never participate in layout or pagination.

Do not use a table as a layout row. Tables are data grids; rows are layout.

Do not use a layer stack when side-by-side flow is enough. Rows paginate and
measure more predictably for column content.

Do not use fixed coordinates for content that can grow from user input. Let the
flow engine measure and paginate it.

## How it works in GraphCompose
`pageFlow(...)` adds semantic roots in reading order. Flow containers expose
content builders (paragraphs, lists, images, tables) and layout builders (rows,
containers, canvas, layer stacks).

`RowBuilder` accepts child nodes and row-local options: `weights(...)` for
proportional splits and `columns(...)` for fixed/auto/weighted column specs.
`pageBackground(...)` and `pageBackgrounds(...)` live on `DocumentSession`;
`PageBackgroundFill` definitions are ratio-based and repeat on every page.
`LayerStackBuilder` layers children with alignment helpers and optional z-index.
`ShapeContainerBuilder` makes a shape host aligned child content.
`CanvasLayerBuilder` reserves a fixed rectangle and positions children at
canvas-local coordinates (`(0, 0)` is top-left; the canvas is atomic for
pagination).

## Decision tree
Read top to bottom and stop at the first branch that matches.

```text
I need to place content.
|
+-- Should it read top to bottom and paginate?
|   -> YES: pageFlow / addSection / module. This is the default.
|
+-- Side by side, but still part of the flow?
|   -> YES: addRow(row -> row.weights(...).addSection(...)).
|
+-- A fill behind every page that must not push content down?
|   -> YES: pageBackground(...) / pageBackgrounds(...).
|
+-- Overlap aligned relative to another object?
|   -> YES: addLayerStack(...) or a shape container.
|
+-- Exact (x, y) inside a fixed box (poster/certificate)?
    -> YES: addCanvas(width, height, canvas -> canvas.position(node, x, y)).
```

## Row example
The first layout pattern for a custom document: a flowing two-column row, not
absolute coordinates. The columns still wrap and paginate.

<!-- snippet-smoke: id=round30-layout-row mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("layout-row.pdf")).create()) {
    document.pageFlow(page -> page
            .addRow(row -> row
                    .weights(0.34, 0.66)
                    .addSection(sidebar -> sidebar
                            .addParagraph("Skills")
                            .addParagraph("Java, Spring Boot, SQL"))
                    .addSection(main -> main
                            .addParagraph("Experience")
                            .addParagraph("Backend systems and document generation"))));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/04-layout-primitives.md` (marker `capability-layout-row-minimal`),
`docs/recipes/layered-page-design.md`, and
`src/main/java/com/demcha/compose/document/dsl/RowBuilder.java`.

Compile-smoke marker: `round30-layout-row`, `mode=method`, added in Round 30.

## Page background example
A page background is a fill behind every page. It does not consume flow space, so
body content keeps flowing over it.

<!-- snippet-smoke: id=round30-layout-page-background mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.api.PageBackgroundFill;
import com.demcha.compose.document.style.DocumentColor;

import java.nio.file.Path;
import java.util.List;

try (DocumentSession document = GraphCompose.document(Path.of("layout-background.pdf")).create()) {
    document.pageBackgrounds(List.of(
            PageBackgroundFill.leftColumn(0.34, DocumentColor.rgb(28, 42, 56))));

    document.pageFlow(page -> page
            .addRow(row -> row
                    .weights(0.34, 0.66)
                    .addSection(sidebar -> sidebar.addParagraph("Sidebar"))
                    .addSection(main -> main.addParagraph("Main content flows over the tint."))));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/04-layout-primitives.md` (practical example),
`docs/recipes/page-backgrounds.md`,
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`
(`pageBackgrounds(List)`), and
`src/main/java/com/demcha/compose/document/api/PageBackgroundFill.java`
(`leftColumn(...)`).

Compile-smoke marker: `round30-layout-page-background`, `mode=method`, added in
Round 30.

## Canvas example
Use a canvas only when the design is coordinate-driven. The canvas is a fixed
block; its children do not flow or wrap, and it does not split across pages.

<!-- snippet-smoke: id=round30-layout-canvas mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.ClipPolicy;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("certificate.pdf")).create()) {
    DocumentNode title = document.dsl()
            .paragraph()
            .text("CERTIFICATE OF ACHIEVEMENT")
            .align(TextAlign.CENTER)
            .build();

    document.pageFlow(page -> page
            .addCanvas(523, 300, canvas -> canvas
                    .name("Certificate")
                    .clipPolicy(ClipPolicy.CLIP_BOUNDS)
                    .position(title, 0, 40)));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/04-layout-primitives.md` (practical example),
`docs/recipes/absolute-placement.md`,
`src/main/java/com/demcha/compose/document/dsl/CanvasLayerBuilder.java`
(`position(DocumentNode, double, double)`, `clipPolicy(...)`), and
`src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
(`align(TextAlign)`).

Compile-smoke marker: `round30-layout-canvas`, `mode=method`, added in Round 30.

## Layer stacks, shape containers, and bleed
These are real placement primitives but are not shown as runnable snippets here,
because they are more situational and overlap with the layout choice tree:

- Layer stacks (`addLayerStack(...)`) align overlapping children relative to each
  other (badge over card, centered icon) with optional z-index.
- Shape containers (`addContainer(...)`) make a shape the host/frame for aligned
  inner content (callout bubble, rounded card, clipped component).
- Bleed lets content reach the physical page edge for full-bleed designs.

The full source-verified examples and the placement decision rules are in
`05-capabilities/04-layout-primitives.md` and
`02-decision-tree/03-layout-choice-tree.md`. The certificate/poster recipe
`07-recipes/04-build-a-certificate-or-poster.md` combines canvas, backgrounds,
shapes, and bleed end to end.

## DOCX and PPTX note
These snippets target the canonical fixed-layout PDF path, the primary verified
path for layout. Semantic DOCX export flattens many layout primitives and does
not guarantee fixed-layout behavior such as exact placement, page backgrounds,
overlap, or clipping. Before promising any layout feature in DOCX/PPTX, check
`11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "Which placement primitive for my relationship?" | `02-decision-tree/03-layout-choice-tree.md` |
| "How does Flow place and paginate content?" | `04-core-concepts/02-page-flow-mental-model.md` |
| "How do I build a certificate or poster?" | `07-recipes/04-build-a-certificate-or-poster.md` |
| "How do I render, stream, or test the output?" | `05-capabilities/05-output-and-testing.md` |
| "Which authoring path am I even on?" | `12-docs-extraction/02-choose-authoring-path.md` |

## Common mistakes
- Starting with canvas when page flow would solve the document.
- Painting sidebar content as a page background. Backgrounds are fills, not
  content.
- Forgetting that row weight/column counts must match the number of row
  children.
- Using a row for overlapping content that should be a layer stack or shape
  container.
- Using a layer stack for long text that should wrap and paginate in flow.
- Expecting a large canvas to split across pages. Canvas is an atomic block.

## Related pages
- `12-docs-extraction/02-choose-authoring-path.md`
- `12-docs-extraction/05-images-and-graphics.md`
- `05-capabilities/04-layout-primitives.md`
- `02-decision-tree/03-layout-choice-tree.md`
- `04-core-concepts/02-page-flow-mental-model.md`
- `07-recipes/04-build-a-certificate-or-poster.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/RowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/CanvasLayerBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `src/main/java/com/demcha/compose/document/api/PageBackgroundFill.java`
- `src/main/java/com/demcha/compose/document/style/ClipPolicy.java`
- `src/main/java/com/demcha/compose/document/node/TextAlign.java`
- `.llm-wiki/05-capabilities/04-layout-primitives.md`
- `.llm-wiki/02-decision-tree/03-layout-choice-tree.md`
- `.llm-wiki/12-docs-extraction/05-images-and-graphics.md`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 30 adds the sixth documentation-extraction guide under
`12-docs-extraction/` and the fourth everyday-capability guide. It is built from
the Round 6 layout-primitives capability page and the Round 3 layout choice
tree.

The three Java snippets reuse placement shapes from the source capability page:
the minimal flowing `addRow(...)` (the `capability-layout-row-minimal` shape), a
`pageBackgrounds(...)` fill with `PageBackgroundFill.leftColumn(...)`, and a fixed
`addCanvas(...)` with a positioned paragraph node. The exact
row/canvas/background/paragraph signatures were re-checked against
`RowBuilder.java`, `CanvasLayerBuilder.java`, `DocumentSession.java`,
`PageBackgroundFill.java`, `ParagraphBuilder.java`, `ClipPolicy.java`, and
`TextAlign.java` before marking, promoting the previously source-only background
and canvas shapes to compile-smoke-proven.

Layer stacks, shape containers, and bleed are documented in prose with links
rather than repeated as runnable snippets, so every `java` fence in this guide is
compile-checkable.

Round 30 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=41`, `generated=41`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
