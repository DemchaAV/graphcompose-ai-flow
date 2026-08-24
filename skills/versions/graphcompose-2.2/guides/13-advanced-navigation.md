---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/13-advanced-navigation.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Advanced: Navigation

## Status
Verified / Round 40 documentation extraction

## Learning level
Intermediate to advanced

## What this page explains
This is the thirteenth extracted developer guide from the private LLM Wiki tree
and the second advanced guide. It covers navigation metadata in and around a PDF:
external links, internal anchor links, and PDF bookmarks - plus page references
and a generated Table of Contents, which are release-sensitive and documented in
prose.

It answers:

```text
I need navigation inside or around my PDF. Should I use a link, an anchor, a
bookmark, a page reference, or a Table of Contents?
```

It turns the internal navigation capability page into a "use when" guide with a
decision tree and compile- and render-checked snippets for the stable surfaces.

## Developer question
"Click here", "jump to appendix", "show this section in the PDF outline", "print
the page number of a later section" - which API does each one, and which are
safe in the current released artifact?

## Mental model
Links are clickable behaviour; anchors are destinations; bookmarks are PDF
outline metadata; page references and the TOC resolve page numbers.

```text
external URL           -> addLink(...) / inlineLink(...) / link(DocumentLinkOptions)
jump within the doc    -> anchor("target") + linkTo("target")
PDF outline entry      -> bookmark(new DocumentBookmarkOptions("Title"))
printed page number    -> addPageReference("target")            (release-sensitive)
generated contents     -> addTableOfContents(toc -> toc.entry(...))  (release-sensitive)
```

An anchor is not visible content; it is a named location that links, page
references, and TOC entries resolve to. Anchor names should be unique per
document.

## When to use this
- An external link when the PDF should open a URI (docs, email, ticket,
  website). Use `DocumentLinkOptions` for the explicit backend-neutral option
  object; it validates the URI.
- An anchor plus `linkTo(anchor)` when one piece of content should jump to
  another piece of content in the same document.
- A bookmark when the section should appear in the PDF outline/sidebar - this is
  navigation metadata, not visible body text.
- A page reference (release-sensitive) when the text should show the resolved
  page number of another anchor: indexes, appendices, references.
- A Table of Contents (release-sensitive) when the document needs a generated
  contents block with clickable labels, leaders, and resolved page numbers.

## When not to use this
- Do not use a bookmark when you need visible text. Add a paragraph/heading and
  attach a bookmark to it.
- Do not reuse the same anchor name across sections.
- Do not expect an anchor to print anything; anchors are invisible destinations.
- Do not assume every semantic backend handles navigation the same way. The PDF
  backend is the verified fixed-layout target for links, bookmarks, and TOC.
- Do not treat the local TOC / page-reference APIs as available in `v1.8.0`. They
  are post-`v1.8.0`, `@since 1.9.0` in the current local source audit; see the
  release note below.

## How it works in GraphCompose
Most flow builders inherit navigation helpers from `AbstractFlowBuilder`;
paragraphs, images, shapes, tables, and rich inline runs also expose link /
anchor / bookmark APIs where that makes sense.

`DocumentLinkTarget` separates external URI links from internal anchor links.
`DocumentLinkOptions` validates external URIs; internal links point to a named
`anchor(...)`. `DocumentBookmarkOptions` stores a PDF outline title (root-level by
default). `DocumentSession.pageIndex()` resolves anchors after layout, and the
page-reference DSL uses that resolved index to print page numbers during render.
`TocBuilder` builds one row per entry (clickable label, optional leader,
page-reference cell), with `DocumentLeader.DOTS` / `DASHES` / `NONE`.

## Decision tree
```text
I need navigation.
|
+-- Open an external URL on click?     -> addLink(...) / inlineLink(text, DocumentLinkOptions)
+-- Jump to another spot in the doc?   -> anchor("x") on the target, linkTo("x") on the source
+-- Show in the PDF outline/sidebar?   -> attach bookmark(new DocumentBookmarkOptions("Title"))
+-- Print a later section's page no.?  -> addPageReference("x")          (release-sensitive)
+-- A generated contents page?         -> addTableOfContents(...)        (release-sensitive)
```

## Internal link example
An internal jump: the source paragraph `linkTo` an anchor placed on a later
section. A page break puts the appendix on its own page.

<!-- snippet-smoke: id=round40-nav-internal-link mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("navigation.pdf")).create()) {
    document.pageFlow(page -> page
            .addParagraph(p -> p
                    .text("Jump to the appendix")
                    .linkTo("appendix"))
            .addPageBreak(pageBreak -> {})
            .addSection(section -> section
                    .anchor("appendix")
                    .addParagraph("Appendix")));

    document.buildPdf();
}
```

Source marker: verified against
`06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md` (marker
`advanced-navigation-internal-link-minimal`),
`src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
(`linkTo`), and
`src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
(`anchor`).

Compile-smoke marker: `round40-nav-internal-link`, `mode=method`, added in
Round 40.

## External link and bookmark example
An external inline link makes one run clickable; a bookmark adds a PDF outline
entry without changing the visible text.

<!-- snippet-smoke: id=round40-nav-link-bookmark mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.node.DocumentBookmarkOptions;
import com.demcha.compose.document.node.DocumentLinkOptions;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("nav-bookmark.pdf")).create()) {
    document.pageFlow(page -> page
            .addParagraph(p -> p
                    .text("Introduction")
                    .bookmark(new DocumentBookmarkOptions("Introduction")))
            .addParagraph(p -> p
                    .inlineText("See the ")
                    .inlineLink("GraphCompose docs",
                            new DocumentLinkOptions("https://demcha.io/graphcompose"))
                    .inlineText(" for details.")));

    document.buildPdf();
}
```

Source marker: verified against
`06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`,
`src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
(`inlineLink`, `bookmark`),
`src/main/java/com/demcha/compose/document/node/DocumentLinkOptions.java`, and
`src/main/java/com/demcha/compose/document/node/DocumentBookmarkOptions.java`
(`DocumentBookmarkOptions(String)`).

Compile-smoke marker: `round40-nav-link-bookmark`, `mode=method`, added in
Round 40.

## Page references and Table of Contents (release-sensitive)
Page references (`addPageReference("anchor")`) print the resolved page number of
an anchor, and a Table of Contents
(`addTableOfContents(toc -> toc.title("Contents").leader(DocumentLeader.DOTS).entry("Overview", "overview"))`)
generates a contents block with clickable labels, leaders, and resolved page
numbers.

These are NOT shown as runnable `since=current` snippets here. In the current
local source audit `addPageReference(...)`, `addTableOfContents(...)`,
`TocBuilder`, `DocumentLeader`, and the session image/page helpers are
post-`v1.8.0`, `@since 1.9.0` APIs that are not in the latest local `v1.8.0` tag.
Check a real `v1.9.0` release before presenting them as stable published-artifact
APIs. The full source-verified TOC/page-reference example is in
`06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`; release
status is tracked in `11-gap-backlog/05-release-sensitive-api-status.md`.

## DOCX note
The PDF backend is the verified target for clickable links, bookmarks, and TOC.
Do not assume DOCX export reproduces the same navigation; see
`11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "How do I style the link text itself?" | `12-docs-extraction/03-text-and-rich-content.md` |
| "Is the TOC/page-reference API in my artifact?" | `11-gap-backlog/05-release-sensitive-api-status.md` |
| "How do I add a watermark/header/footer?" | `12-docs-extraction/12-advanced-pdf-chrome.md` |
| "How do I render and visually verify?" | `12-docs-extraction/07-output-and-testing.md` |

## Common mistakes
- Creating visible headings but forgetting anchors, then wondering why internal
  links or page references do not resolve.
- Expecting an anchor to print anything. Anchors are invisible destinations.
- Using bookmarks as body text. Bookmarks are PDF outline metadata.
- Reusing the same anchor name across several sections.
- Treating the local TOC/page-reference APIs as available in `v1.8.0`.

## Related pages
- `12-docs-extraction/03-text-and-rich-content.md`
- `12-docs-extraction/12-advanced-pdf-chrome.md`
- `06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`
- `05-capabilities/01-text-and-rich-content.md`
- `11-gap-backlog/05-release-sensitive-api-status.md`
- `11-gap-backlog/01-docx-pptx-support-matrix.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ParagraphBuilder.java`
- `src/main/java/com/demcha/compose/document/node/DocumentLinkOptions.java`
- `src/main/java/com/demcha/compose/document/node/DocumentLinkTarget.java`
- `src/main/java/com/demcha/compose/document/node/DocumentBookmarkOptions.java`
- `src/main/java/com/demcha/compose/document/dsl/TocBuilder.java`
- `.llm-wiki/06-advanced-capabilities/01-navigation-links-bookmarks-and-toc.md`
- `.llm-wiki/11-gap-backlog/05-release-sensitive-api-status.md`
- `.llm-wiki/12-docs-extraction/12-advanced-pdf-chrome.md`
- `target/llm-wiki-render-proof/render-proof-report.txt`

## Verification notes
Round 40 adds the thirteenth documentation-extraction guide under
`12-docs-extraction/` and the second advanced guide. It is built from the Round 7
navigation capability page and the Round 16 release-status audit.

The internal-link snippet reuses the source shape already compile-smoke proven in
Round 21 (`advanced-navigation-internal-link-minimal`). The external-link/bookmark
snippet uses `inlineLink(...)` (proven in the text guide) plus the single-argument
`DocumentBookmarkOptions(String)` and `ParagraphBuilder.bookmark(...)`, both
re-checked against source before marking. Page references and the Table of
Contents are kept in prose with the `@since 1.9.0` release caveat rather than as
runnable `since=current` snippets.

The two new markers were verified with the snippet generation step and compiled
and rendered through the render-proof harness (it compiles the generated snippets
against a snapshot of `target/classes`, so it is unaffected by the unrelated
`cv/v2/presets/Panel.java` compile error that blocks the full Maven `-Compile`
gate). The internal-link document rendered as a two-page PDF with the jump link on
page one; see `10-review/05-render-proof-register.md`.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
