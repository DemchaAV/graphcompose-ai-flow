---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/03-text-and-rich-content.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Text And Rich Content

## Status
Verified / Round 27 documentation extraction

## Learning level
Beginner to intermediate

## What this page explains
This is the third extracted developer guide from the private LLM Wiki tree.

The first two guides answered "how do I generate my first document?"
(`12-docs-extraction/01-getting-started-developer-guide.md`) and "which
authoring path do I pick?" (`12-docs-extraction/02-choose-authoring-path.md`).
This guide is the first everyday-capability guide. It answers the most common
content question:

```text
I need to put words into my document. Which text API do I reach for:
a plain paragraph, a configured paragraph, rich inline runs, reusable rich text,
or a navigation target?
```

It turns the internal text-and-rich-content capability page into a
beginner-friendly guide with when-to-use, when-not, why, a decision tree, and
compile-checked snippets for the verifiable text surfaces.

## Developer question
There are several ways to write text in GraphCompose. Which is the smallest
surface that matches the text I have: a label, a heading, a mixed-style
sentence, a reusable phrase, or a clickable/anchored line?

## Mental model
Use the smallest text surface that matches the shape of the text. Reach for a
stronger surface only when the text actually needs it.

```text
1. addParagraph("...")            <- one block of one-style text
2. addParagraph(p -> ...)         <- one paragraph + paragraph-level options
3. addRich(rich -> ...)           <- one line with mixed inline styles/objects
4. RichText.text(...)...          <- a reusable inline phrase, composed once
5. anchor / inlineLink / bookmark <- text that participates in navigation
```

A paragraph is a flow block. Rich text is still text content; it just carries
several inline runs inside one paragraph area. Rich text does not replace page
flow - it lives inside it. Text APIs choose inline content, not page placement;
placement is the job of rows, sections, layer stacks, shape containers, and
canvas.

## When to use this
- `addParagraph("...")` for ordinary body text, headings, captions, labels, and
  simple one-style lines.
- `addParagraph(p -> ...)` when the paragraph needs alignment, a shared
  `DocumentTextStyle`, line spacing, padding, margin, an anchor, a bookmark, or
  link metadata.
- `addRich(rich -> ...)` when one line needs mixed inline styling: bold words,
  colored spans, code chips, badges, inline links, inline images, icons, or
  emoji.
- `RichText` values when a styled phrase should be built once and reused in more
  than one place.
- `anchor(...)`, inline links, and `bookmark(...)` when text participates in
  internal navigation, page references, or the PDF outline.

## When not to use this
Do not split one sentence into several paragraphs just to make one word bold.
That changes layout, spacing, and pagination. Use rich inline runs instead.

Do not use rich text to build multi-column or overlapping layouts. That is a
placement decision (rows, sections, layer stacks, shape containers, canvas).

Do not start from `ParagraphNode` for normal authoring. The DSL builders are the
beginner-and-intermediate surface; direct nodes are for reusable helpers or
advanced extension work.

Do not assume every text feature has the same fidelity in DOCX/PPTX as in PDF.
The canonical fixed-layout PDF path is the primary verified path.

## How it works in GraphCompose
Flow containers (page flow, modules, sections) expose the text entry points from
`AbstractFlowBuilder`:

- `addParagraph(String)` for a simple block;
- `addParagraph(p -> ...)` for a configured `ParagraphBuilder`;
- `addRich(rich -> ...)` for a `RichText` callback.

`ParagraphBuilder` owns paragraph-level decisions: text, text style, alignment,
line spacing, padding, margin, links, anchors, bookmarks, auto-size, and the
inline-run APIs (`inlineText(...)`, `inlineLink(...)`, and friends).

`RichText` owns inline-run composition with builder methods such as `plain`,
`bold`, `italic`, `underline`, `strikethrough`, `color`, `accent`, `size`,
`highlight`, `code`, `chip`, `link`, `linkTo`, `append`, `image`, `svgIcon`,
`emoji`, inline shapes, `sparkline`, and `checkbox`.

The clickable area differs by where the link lives: a paragraph-level link makes
the whole paragraph clickable, while an inline link makes only one run
clickable. Anchors create internal navigation targets; bookmarks materialize PDF
outline entries and are not visible text.

## Decision tree
Read top to bottom and stop at the first branch that matches.

```text
I need to add text.
|
+-- Is it one block in a single style?
|   -> YES: addParagraph("...").
|
+-- Does the whole paragraph need options (style, align, anchor, link)?
|   -> YES: addParagraph(p -> p.text(...).textStyle(...).align(...)).
|
+-- Does one line mix styles or inline objects (bold, code, chip, link)?
|   -> YES: addRich(rich -> rich.plain(...).bold(...).code(...)).
|
+-- Will the same styled phrase appear in more than one place?
|   -> YES: build a RichText value once and append(...) it.
|
+-- Does the text need to be a link target or PDF outline entry?
|   -> YES: anchor(...) / inlineLink(...) / bookmark(...).
|           For full navigation, see the navigation capability page.
|
+-- Do I need columns, overlap, or exact placement?
    -> That is layout, not text. See the layout choice tree.
```

## Minimal example
The three core text surfaces in one page flow: a plain paragraph, a configured
paragraph, and a mixed-style rich line. No layout primitives, no engine
internals.

<!-- snippet-smoke: id=round27-text-paragraph-and-rich mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentTextStyle;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("text.pdf")).create()) {
    document.pageFlow(page -> page
            .addParagraph("A plain one-style paragraph of body text.")
            .addParagraph(p -> p
                    .text("Release status")
                    .textStyle(DocumentTextStyle.DEFAULT.withSize(16)))
            .addRich(rich -> rich
                    .plain("Status: ")
                    .bold("Pending")
                    .plain(" - last review on ")
                    .accent("Mar 14", DocumentColor.rgb(40, 90, 180))));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/01-text-and-rich-content.md` (marker
`capability-text-rich-minimal`),
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`,
`src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`, and
`src/main/java/com/demcha/compose/document/dsl/RichText.java`.

Compile-smoke marker: `round27-text-paragraph-and-rich`, `mode=method`, added in
Round 27.

## Reusable rich text example
When a styled phrase appears in more than one place, build a `RichText` value
once and `append(...)` it into a larger line.

<!-- snippet-smoke: id=round27-text-reusable-richtext mode=members since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RichText;

import java.nio.file.Path;

void buildReleaseNote(Path output) throws Exception {
    RichText version = RichText.text("GraphCompose ").bold("v1.8");

    try (DocumentSession document = GraphCompose.document(output).create()) {
        document.pageFlow(page -> page
                .addRich(rich -> rich
                        .plain("Built with ")
                        .append(version)
                        .plain(" - see the changelog."))
                .addRich(rich -> rich
                        .plain("Thanks for trying ")
                        .append(version)
                        .plain(".")));
        document.buildPdf();
    }
}
```

Source marker: verified against
`05-capabilities/01-text-and-rich-content.md` (practical example),
`src/main/java/com/demcha/compose/document/dsl/RichText.java`, and
`examples/src/main/java/com/demcha/examples/features/text/RichTextShowcaseExample.java`.

Compile-smoke marker: `round27-text-reusable-richtext`, `mode=members`, added in
Round 27.

## Navigation: anchors and inline links
Text can also be a navigation target. An `anchor(...)` marks an internal target;
an inline link makes only one run clickable.

<!-- snippet-smoke: id=round27-text-anchor-and-inline-link mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.node.DocumentLinkOptions;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("links.pdf")).create()) {
    document.pageFlow(page -> page
            .addParagraph(p -> p
                    .text("Release note")
                    .anchor("release-note"))
            .addParagraph(p -> p
                    .inlineText("Full details in the ")
                    .inlineLink("online docs",
                            new DocumentLinkOptions("https://demcha.io/graphcompose"))
                    .inlineText(".")));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/01-text-and-rich-content.md` (practical example),
`src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`, and
`src/main/java/com/demcha/compose/document/node/DocumentLinkOptions.java`.

Compile-smoke marker: `round27-text-anchor-and-inline-link`, `mode=method`,
added in Round 27.

Bookmarks (PDF outline entries), external/internal link targets, page
references, and a Table of Contents are deeper navigation features. They are
documented in `06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`
(internal anchors are compile-proven there; TOC/page-reference APIs are
post-`v1.8.0` and carry release wording).

## DOCX and PPTX note
These snippets target the canonical fixed-layout PDF path, which is the primary
verified path for text. Semantic DOCX export maps paragraphs and basic inline
runs but does not guarantee the same fidelity for every chip, badge, icon, or
inline shape. Before promising any text feature in DOCX/PPTX, check
`11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "How does Flow place these paragraphs?" | `04-core-concepts/02-page-flow-mental-model.md` |
| "How do paragraphs and rich text become nodes?" | `04-core-concepts/03-dsl-builders-and-semantic-nodes.md` |
| "How do I style text and share a theme?" | `04-core-concepts/05-styles-themes-and-template-themes.md` |
| "How do I add lists or tables?" | `05-capabilities/02-lists-and-tables.md` |
| "How do I add links, bookmarks, or a TOC?" | `06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md` |

## Common mistakes
- Using several paragraphs to simulate one mixed-style sentence. Use rich inline
  runs.
- Styling every span separately when a paragraph-level `DocumentTextStyle` would
  cover the whole block.
- Putting layout concerns into text APIs. Text APIs choose inline content, not
  page placement.
- Forgetting that a paragraph link and an inline link have different clickable
  areas.
- Treating a bookmark as visible text. A bookmark is PDF-outline navigation
  metadata.
- Reaching for `ParagraphNode` before the DSL builder path.

## Related pages
- `12-docs-extraction/01-getting-started-developer-guide.md`
- `12-docs-extraction/02-choose-authoring-path.md`
- `05-capabilities/01-text-and-rich-content.md`
- `04-core-concepts/02-page-flow-mental-model.md`
- `04-core-concepts/03-dsl-builders-and-semantic-nodes.md`
- `04-core-concepts/05-styles-themes-and-template-themes.md`
- `06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/RichText.java`
- `src/main/java/com/demcha/compose/document/node/DocumentLinkOptions.java`
- `.llm-wiki/05-capabilities/01-text-and-rich-content.md`
- `.llm-wiki/04-core-concepts/03-dsl-builders-and-semantic-nodes.md`
- `.llm-wiki/06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`
- `.llm-wiki/12-docs-extraction/01-getting-started-developer-guide.md`
- `.llm-wiki/12-docs-extraction/02-choose-authoring-path.md`
- `examples/src/main/java/com/demcha/examples/features/text/RichTextShowcaseExample.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 27 adds the third documentation-extraction guide under
`12-docs-extraction/` and the first everyday-capability guide. It is built from
the Round 6 text-and-rich-content capability page and the Round 5 core-concept
pages.

The three Java snippets are new extraction snippets that reuse text shapes from
the source capability page: the plain/configured/rich paragraph surfaces (the
`capability-text-rich-minimal` shape), the reusable `RichText` value with
`append(...)`, and the `anchor(...)` / `inlineText(...)` / `inlineLink(...)`
navigation surface. They are marked separately so the private harness checks this
guide directly.

Deeper navigation (bookmarks, page references, TOC) and DOCX/PPTX fidelity are
described in prose with links rather than repeated as runnable snippets, so every
`java` fence in this guide is compile-checkable.

Round 27 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=32`, `generated=32`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
