---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/10-recipe-certificate-and-poster.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Recipe: Certificate And Poster

## Status
Verified / Round 34 documentation extraction

## Learning level
Intermediate to advanced

## What this page explains
This is the tenth extracted developer guide from the private LLM Wiki tree and
the third recipe guide. It shows how to build a fixed visual page - certificate,
diploma, badge, event poster, or one-page award - using page backgrounds, bleed,
canvas, shapes, and fixed positioning.

It answers:

```text
I need to place text and graphics at exact positions on one page. Do I use Flow,
rows, shape containers, or canvas?
```

> Render caveat: this recipe is coordinate-driven and font-sensitive. The
> compile-smoke markers prove the snippets compile against the current module;
> they do NOT prove the layout looks right. A real certificate or poster must be
> visually checked with a rendered PDF or image snapshot, because fixed
> coordinates depend on page size, fonts, and copy length.

## Developer question
Most documents start with Flow. A certificate or poster is different: the design
is usually one fixed canvas with known coordinates. Which primitive do I reach
for, and how do I keep page-level color separate from fixed placement?

## Mental model
Flow is still the default for prose. For a fixed visual page, reserve a canvas
and position children at exact coordinates; use page color and bleed for the
page-level fill.

```text
1. pageBackground(color)              <- page-level fill behind everything
2. addSection(...).bleedToEdge(...)   <- a flow block whose color reaches the edge
3. addContainer(...) (shape)          <- a framed block that still holds children
4. addCanvas(w, h, canvas -> ...)     <- exact (x, y) placement, atomic block
       .position(node, x, y)          <- coordinates are local to the canvas
```

Canvas coordinates are local to the canvas rectangle: `(0, 0)` is its top-left.
A canvas is atomic - it does not split across pages.

## When to use this
- Canvas for certificates, diplomas, badges, posters, and other fixed page
  designs.
- Page background when the whole page or repeated bands need color behind
  content.
- Bleed when a section color should reach the page edges.
- Shapes for rules, frames, separators, and decorative panels.
- `ClipPolicy.CLIP_BOUNDS` when content must stay inside the fixed canvas.

## When not to use this
- Do not use canvas for normal long-form reports, invoices, proposals, or CVs.
- Do not use absolute coordinates for content that should paginate naturally.
- Do not use page background for foreground content. Backgrounds do not affect
  layout and repeat behind every page.
- Do not create custom render handlers just to draw rules or frames. Use shapes
  first.

## How it works in GraphCompose
The certificate path uses a canonical `DocumentSession`, a flow page, and
`addCanvas(width, height, canvas -> ...)` to reserve a fixed block. Inside the
canvas, `canvas.position(node, x, y)` places child nodes built with
`ParagraphBuilder` (text) and `ShapeBuilder` (rules and geometry). Optional
clipping uses `ClipPolicy.CLIP_BOUNDS`.

Page-level color comes from `pageBackground(...)`. A flow block whose color
reaches the page edge uses `bleedToEdge(DocumentEdge...)`. A framed block with
children uses a shape container (`addContainer(...)`).

## Decision tree
```text
I have a fixed visual page.
|
+-- Does the whole page (or a band) need a color behind content?
|   -> pageBackground(...).
|
+-- Should a flow block's color reach the page edge?
|   -> addSection(...).fillColor(...).bleedToEdge(...).
|
+-- Is it a framed block that still contains flowing children?
|   -> addContainer(...) (shape container).
|
+-- Do elements need exact x/y inside one reserved rectangle?
    -> addCanvas(w, h, canvas -> canvas.position(node, x, y)).
```

## Certificate example
A certificate block inside an A4 page: a fixed canvas with a rule shape and two
centered text nodes at known coordinates.

<!-- snippet-smoke: id=round34-recipe-certificate mode=method since=current -->
```java
DocumentTextStyle eyebrow = DocumentTextStyle.builder()
        .fontName(FontName.HELVETICA_BOLD)
        .size(12)
        .color(DocumentColor.rgb(119, 86, 37))
        .build();

DocumentTextStyle name = DocumentTextStyle.builder()
        .fontName(FontName.TIMES_BOLD)
        .size(34)
        .color(DocumentColor.rgb(32, 38, 52))
        .build();

try (DocumentSession document = GraphCompose.document(Path.of("certificate.pdf"))
        .pageSize(DocumentPageSize.A4)
        .pageBackground(DocumentColor.rgb(252, 250, 246))
        .margin(36, 36, 36, 36)
        .create()) {

    document.pageFlow(page -> page.addCanvas(523, 360, canvas -> canvas
            .name("Certificate")
            .clipPolicy(ClipPolicy.CLIP_BOUNDS)
            .position(new ShapeBuilder()
                    .name("TopRule")
                    .size(503, 1.4)
                    .fillColor(DocumentColor.rgb(191, 143, 57))
                    .build(), 10, 32)
            .position(new ParagraphBuilder()
                    .text("CERTIFICATE OF ACHIEVEMENT")
                    .textStyle(eyebrow)
                    .align(TextAlign.CENTER)
                    .build(), 0, 72)
            .position(new ParagraphBuilder()
                    .text("Jordan Rivera")
                    .textStyle(name)
                    .align(TextAlign.CENTER)
                    .build(), 0, 150)));

    document.buildPdf();
}
```

Source marker: verified against
`07-recipes/04-build-a-certificate-or-poster.md` (marker
`recipe-certificate-canvas-minimal`),
`examples/src/main/java/com/demcha/examples/features/canvas/CanvasLayerExample.java`,
`src/main/java/com/demcha/compose/document/dsl/CanvasLayerBuilder.java`, and
`src/main/java/com/demcha/compose/document/dsl/ShapeBuilder.java`.

Compile-smoke marker: `round34-recipe-certificate`, `mode=method`, added in
Round 34.

## Poster example
A poster combines a page background, a bleed masthead (a flow section whose color
reaches the edges), and a canvas for a fixed accent block and date.

<!-- snippet-smoke: id=round34-recipe-poster mode=method since=current -->
```java
try (DocumentSession document = GraphCompose.document(Path.of("poster.pdf"))
        .pageSize(DocumentPageSize.A4)
        .pageBackground(DocumentColor.rgb(247, 248, 245))
        .margin(36, 36, 36, 36)
        .create()) {

    document.pageFlow(page -> page
            .addSection("PosterMasthead", masthead -> masthead
                    .fillColor(DocumentColor.rgb(24, 42, 59))
                    .padding(24, 24, 24, 24)
                    .bleedToEdge(DocumentEdge.TOP, DocumentEdge.LEFT, DocumentEdge.RIGHT)
                    .addParagraph(p -> p.text("GraphCompose Workshop")
                            .textStyle(DocumentTextStyle.builder()
                                    .fontName(FontName.HELVETICA_BOLD)
                                    .size(28)
                                    .color(DocumentColor.WHITE)
                                    .build())))
            .addCanvas(523, 220, canvas -> canvas
                    .position(new ShapeBuilder()
                            .name("AccentBlock")
                            .size(120, 120)
                            .fillColor(DocumentColor.rgb(191, 143, 57))
                            .build(), 360, 40)
                    .position(new ParagraphBuilder()
                            .text("26 June 2026")
                            .textStyle(DocumentTextStyle.builder()
                                    .fontName(FontName.HELVETICA_BOLD)
                                    .size(18)
                                    .build())
                            .build(), 36, 72)));

    document.buildPdf();
}
```

Source marker: verified against
`07-recipes/04-build-a-certificate-or-poster.md` (practical example),
`docs/recipes/page-backgrounds.md`,
`examples/src/main/java/com/demcha/examples/features/layout/BleedExample.java`,
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
(`bleedToEdge(DocumentEdge...)`), and
`src/main/java/com/demcha/compose/document/style/DocumentEdge.java`.

Compile-smoke marker: `round34-recipe-poster`, `mode=method`, added in Round 34.

## Choosing between the primitives
- Page background: repeated behind every page, or a large page-level fill.
- Bleed section: a flow block whose color reaches the page edge.
- Shape container: a framed block with children and optional clipping.
- Canvas: exact x/y placement inside one reserved rectangle.

## Common mistakes
- Using canvas before deciding whether the page can be normal flow plus rows.
- Forgetting that canvas coordinates are local to the canvas rectangle.
- Expecting canvas content to split across pages. Treat canvas as an atomic
  fixed visual block.
- Using page background for foreground text or logos.
- Hard-coding coordinates before final page size and margins are chosen.

## What to read next
| Next question | Read |
| --- | --- |
| "Which placement primitive for my relationship?" | `12-docs-extraction/06-layout-primitives.md` |
| "How do I add shapes, images, or barcodes?" | `12-docs-extraction/05-images-and-graphics.md` |
| "How do I render and visually verify?" | `12-docs-extraction/07-output-and-testing.md` |
| "How do I pick fonts and colors?" | `06-advanced-capabilities/04-fonts-custom-themes-and-template-tokens.md` |
| "Which authoring path am I even on?" | `12-docs-extraction/02-choose-authoring-path.md` |

## Related pages
- `12-docs-extraction/05-images-and-graphics.md`
- `12-docs-extraction/06-layout-primitives.md`
- `12-docs-extraction/07-output-and-testing.md`
- `07-recipes/04-build-a-certificate-or-poster.md`
- `02-decision-tree/03-layout-choice-tree.md`
- `06-advanced-capabilities/04-fonts-custom-themes-and-template-tokens.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/CanvasLayerBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ShapeBuilder.java`
- `src/main/java/com/demcha/compose/document/style/DocumentTextStyle.java`
- `src/main/java/com/demcha/compose/document/style/DocumentEdge.java`
- `src/main/java/com/demcha/compose/document/style/ClipPolicy.java`
- `src/main/java/com/demcha/compose/font/FontName.java`
- `.llm-wiki/07-recipes/04-build-a-certificate-or-poster.md`
- `.llm-wiki/12-docs-extraction/06-layout-primitives.md`
- `examples/src/main/java/com/demcha/examples/features/canvas/CanvasLayerExample.java`
- `examples/src/main/java/com/demcha/examples/features/layout/BleedExample.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 34 adds the tenth documentation-extraction guide under
`12-docs-extraction/` and the third recipe guide. It is built from the Round 8
certificate/poster recipe and the Round 30 layout-primitives guide.

The certificate snippet reuses the source recipe shape already compile-smoke
proven in Round 22 (`recipe-certificate-canvas-minimal`). The poster snippet
promotes the previously source-only poster shape to compile-smoke-proven; its
`bleedToEdge(DocumentEdge...)`, `fillColor`, `padding`, and `DocumentEdge`
signatures were re-checked against `AbstractFlowBuilder.java` and
`DocumentEdge.java` before marking.

This recipe is coordinate-driven, so compile-smoke proves only that the snippets
compile, not that the layout is visually correct. The render caveat is stated at
the top of the guide and must be honored before any external publication: render
the PDF and check it visually.

Round 34 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=53`, `generated=53`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
