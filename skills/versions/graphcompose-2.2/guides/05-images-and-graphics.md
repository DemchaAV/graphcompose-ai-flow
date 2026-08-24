---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/05-images-and-graphics.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Images And Graphics

## Status
Verified / Round 29 documentation extraction

## Learning level
Beginner to intermediate

## What this page explains
This is the fifth extracted developer guide from the private LLM Wiki tree and
the third everyday-capability guide (after text and lists/tables).

It answers a common visual-content question:

```text
I need a logo, photo, divider, QR code, chart, icon, or small inline graphic.
Which GraphCompose API should I use, and when is an image the wrong tool?
```

It turns the internal images-and-graphics capability page into a
beginner-friendly guide with when-to-use, when-not, why, a decision tree, and
compile-checked snippets for the simple block visuals. Data-driven charts, SVG
icons, emoji, and inline graphic runs are routed in prose to the source pages
because they need data or asset context.

## Developer question
I have a visual. Is it an image asset, a vector primitive, a chart, a barcode,
or a small inline decoration - and which API matches?

## Mental model
Choose by the origin and purpose of the visual, not by how it looks.

```text
1. addImage(image -> image.source(...).fitToBounds(...))  <- existing raster file
2. addShape(...) / addLine(...) / addEllipse(...)         <- vector rule/accent/geometry
3. chart(ChartSpec.bar/line/pie(...))                     <- data visualization
4. addBarcode(barcode -> barcode.qrCode()...)             <- machine-readable code
5. RichText.svgIcon(...)/emoji(...)/image(...)            <- small visual inside text
6. addCanvas(...) / layer stack / shape container         <- exact poster placement
```

Images are assets. Shapes, lines, charts, barcodes, and SVG icons are
semantic/vector content the layout and render pipeline can reason about and keep
crisp in PDF. Reach for the vector primitive before rasterizing.

## When to use this
- `addImage(...)` for logos, photos, screenshots, external assets, user uploads,
  and embedded image bytes.
- Shapes and lines for dividers, rules, background accents, badges, panels, and
  simple geometry.
- Charts when the source is data and you want deterministic vector output that
  can be snapshot-tested.
- Barcodes for QR, Code 128, Code 39, EAN-13, EAN-8, and similar generated
  codes.
- Inline image / SVG / emoji / graphic runs when the visual belongs inside a
  text line, not as a separate block.

## When not to use this
Do not rasterize a chart yourself when the chart APIs render vector geometry
from `ChartData` and `ChartSpec`.

Do not use `addImage(...)` for a simple divider or colored rectangle. Use a line
or shape; it stays vector and easier to style.

Do not use canvas just to place a normal image in reading order. Add the image
to page flow unless it truly needs fixed coordinates.

Do not assume semantic DOCX export preserves fixed-layout graphic behavior
(exact placement, clipping, page backgrounds, chart fidelity).

## How it works in GraphCompose
`AbstractFlowBuilder` exposes the block-visual entry points to flow containers:
`addImage(...)`, `addShape(...)`, `addLine(...)`, `addEllipse(...)`,
`addBarcode(...)`, and `chart(...)`.

`ImageBuilder` accepts a `DocumentImageData`, byte array, `Path`, or string path.
It can set explicit width/height, `size(...)`, `scale(...)`, `fitToBounds(...)`,
`fitMode(...)`, links, anchors, bookmarks, padding, margin, and transforms.
`DocumentImageFitMode` controls how an image maps into a fixed box (`STRETCH`,
`CONTAIN`, `COVER`); `fitToBounds(...)` uses contain semantics unless overridden.

Shapes and lines are vector nodes - good for rules, accents, badges, cards, and
geometry that should stay crisp. Charts live in
`com.demcha.compose.document.chart` and split into `ChartData` (numbers),
`ChartSpec` (bar/line/pie), `ChartStyle` (visual overrides), and an internal
resolver that emits ordinary primitives. Barcodes are generated through
`BarcodeBuilder`. Rich text also has inline visual runs (inline image, SVG icon,
emoji, shape, checkbox, sparkline).

## Decision tree
Read top to bottom and stop at the first branch that matches.

```text
I have a visual.
|
+-- Is it an existing raster file (PNG/JPEG/...)?
|   -> YES: addImage(image -> image.source(...).fitToBounds(...)).
|
+-- Is it a divider, rule, accent, or simple geometry?
|   -> YES: addShape(...) / addLine(...) / addEllipse(...). Stay vector.
|
+-- Is it a visualization of data?
|   -> YES: chart(ChartSpec.bar()/line()/pie()). See the source chart docs.
|
+-- Is it a machine-readable code (QR, Code 128, EAN, ...)?
|   -> YES: addBarcode(barcode -> barcode.qrCode()...).
|
+-- Is it a small icon/emoji inside a sentence?
|   -> YES: a rich inline run (svgIcon/emoji/image). See the text guide.
|
+-- Does it need exact x/y placement (poster/certificate)?
    -> That is layout. Use a canvas / layer stack / shape container.
```

## Image example
The first logo/photo block: add a raster asset and bound its size. The asset path
is illustrative - the file does not need to exist to compile.

<!-- snippet-smoke: id=round29-image-minimal mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("images.pdf")).create()) {
    document.pageFlow(page -> page
            .addImage(image -> image
                    .source(Path.of("assets/logo.png"))
                    .fitToBounds(96, 48)));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/03-images-and-graphics.md` (marker `capability-image-minimal`),
`docs/recipes/images.md`, and
`src/main/java/com/demcha/compose/document/dsl/ImageBuilder.java`.

Compile-smoke marker: `round29-image-minimal`, `mode=method`, added in Round 29.

## Vector divider example
A divider is geometry, not an asset. A thin shape stays vector and is easier to
style than an image rule.

<!-- snippet-smoke: id=round29-shape-divider mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.style.DocumentColor;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("divider.pdf")).create()) {
    document.pageFlow(page -> page
            .addParagraph("Section one")
            .addShape(180, 2, DocumentColor.rgb(210, 214, 220))
            .addParagraph("Section two"));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/03-images-and-graphics.md`,
`docs/recipes/shapes.md`, and
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
(`addShape(double, double, DocumentColor)`).

Compile-smoke marker: `round29-shape-divider`, `mode=method`, added in Round 29.

## Barcode example
A QR code is generated vector content, not an image asset. Pick the symbology,
set the data, and bound the size.

<!-- snippet-smoke: id=round29-barcode-qr mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("qr.pdf")).create()) {
    document.pageFlow(page -> page
            .addBarcode(barcode -> barcode
                    .qrCode()
                    .data("https://demcha.io/graphcompose")
                    .size(72, 72)));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/03-images-and-graphics.md` (practical example),
`docs/recipes/barcodes.md`,
`src/main/java/com/demcha/compose/document/dsl/BarcodeBuilder.java`, and
`examples/src/main/java/com/demcha/examples/features/barcodes/BarcodeShowcaseExample.java`.

Compile-smoke marker: `round29-barcode-qr`, `mode=method`, added in Round 29.

## Charts, inline icons, and emoji
These are real GraphCompose features but they are not shown as runnable snippets
here, because they need data or asset context and have deeper styling surfaces:

- Charts: build `ChartData`, pick `ChartSpec.bar()/line()/pie()`, optionally add
  `AxisSpec`, `LegendPosition`, `ChartSize`, and `NumberFormatSpec`, then
  `chart(...)`. The source capability page
  `05-capabilities/03-images-and-graphics.md` has the full source-verified chart
  example, and chart styling is routed to deeper recipe pages.
- Inline SVG icons, emoji, inline images, and sparklines live in rich text runs
  (`RichText.svgIcon(...)`, `emoji(...)`, `image(...)`, `sparkline(...)`). See
  `12-docs-extraction/03-text-and-rich-content.md` and the source capability
  page.
- SVG parser/style limits and barcode validation/error behavior are catalogued
  in `11-gap-backlog/02-svg-barcode-limits.md`.

## DOCX and PPTX note
These snippets target the canonical fixed-layout PDF path, the primary verified
path for graphics. Semantic DOCX export maps images but does not guarantee
fixed-layout graphic behavior such as exact placement, clipping, page
backgrounds, or chart fidelity. Before promising any graphic feature in
DOCX/PPTX, check `11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "How do I place a visual at exact coordinates?" | `05-capabilities/04-layout-primitives.md` |
| "How do inline icons/emoji work?" | `12-docs-extraction/03-text-and-rich-content.md` |
| "What SVG/barcode limits exist?" | `11-gap-backlog/02-svg-barcode-limits.md` |
| "How do I snapshot/visual-test a chart?" | `05-capabilities/05-output-and-testing.md` |
| "Which authoring path am I even on?" | `12-docs-extraction/02-choose-authoring-path.md` |

## Common mistakes
- Rasterizing vector-friendly content such as charts, dividers, or simple
  badges.
- Forgetting to constrain photo dimensions with `size(...)`, `width(...)`, or
  `fitToBounds(...)`.
- Using `COVER` when cropping would hide important content such as a logo.
- Putting a block image inside a rich text run when it should be a flow block.
- Using canvas for every visual. Canvas is for fixed coordinates, not ordinary
  flow.
- Assuming every SVG/CSS feature is supported without checking the SVG limits.

## Related pages
- `12-docs-extraction/01-getting-started-developer-guide.md`
- `12-docs-extraction/02-choose-authoring-path.md`
- `12-docs-extraction/03-text-and-rich-content.md`
- `12-docs-extraction/04-lists-and-tables.md`
- `05-capabilities/03-images-and-graphics.md`
- `05-capabilities/04-layout-primitives.md`
- `11-gap-backlog/02-svg-barcode-limits.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ImageBuilder.java`
- `src/main/java/com/demcha/compose/document/image/DocumentImageFitMode.java`
- `src/main/java/com/demcha/compose/document/dsl/BarcodeBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ShapeBuilder.java`
- `.llm-wiki/05-capabilities/03-images-and-graphics.md`
- `.llm-wiki/12-docs-extraction/03-text-and-rich-content.md`
- `.llm-wiki/12-docs-extraction/04-lists-and-tables.md`
- `examples/src/main/java/com/demcha/examples/features/barcodes/BarcodeShowcaseExample.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 29 adds the fifth documentation-extraction guide under
`12-docs-extraction/` and the third everyday-capability guide. It is built from
the Round 6 images-and-graphics capability page and the Round 5 core-concept
pages.

The three Java snippets reuse block-visual shapes from the source capability
page: the minimal `addImage(...)` block (the `capability-image-minimal` shape),
a vector divider via `addShape(double, double, DocumentColor)`, and a QR
`addBarcode(...)` block. The exact `addBarcode`/`qrCode`/`data`/`size`,
`addShape`, and `addImage` signatures were re-checked against
`BarcodeBuilder.java` and `AbstractFlowBuilder.java` before marking.

Charts, inline SVG icons, emoji, and inline graphic runs are documented in prose
with links rather than repeated as runnable snippets, because they need data or
asset context and have deeper styling surfaces. This keeps every `java` fence in
this guide compile-checkable.

Round 29 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=38`, `generated=38`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
