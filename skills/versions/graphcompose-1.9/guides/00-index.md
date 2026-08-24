---
skillId: graphcompose-engine-guides
targetLibrary: GraphCompose
targetVersion: 1.9.x
verifiedAgainst: 1.9.0
status: needs-validation
lastValidated: 2026-06-29
syncedBy: tools/api-surface/sync-engine-guides.mjs
note: "How-to-use-the-engine guides vendored from the GraphCompose LLM wiki (12-docs-extraction). Usage counterpart to the allow-list: allow-list says WHAT exists, these say HOW to use it."
---

# GraphCompose Engine Guides (how to use the engine)

This is the **how-to-use-the-engine** layer of the 1.9 skill pack. Each guide
answers one real developer question, starts from intent, and carries the
upstream compile-smoke + render-proof markers. It is the usage counterpart to
the allow-list [`00-api-surface.md`](../00-api-surface.md): the allow-list is
the closed set of WHAT exists; these guides show HOW to put those primitives
together into a working document.

The 13 guides below are vendored verbatim (with a provenance header) from the
GraphCompose private LLM wiki `12-docs-extraction/` layer. They are read
references — consult them for usage patterns, then confirm every concrete call
against the allow-list before writing it.

## Where these sit in the lookup priority

```text
skill page (semantics / when to reach for a primitive)
  -> allow-list 00-api-surface.md (does the symbol exist? exact signature?)
  -> these engine guides (how do I actually use it? working snippet)
  -> Javadoc 1.9.0 (parameter names, @since / @Beta tags)
  -> fixture / ask the user
```

## Reading order

```text
New to GraphCompose
  -> 01 getting started        (create your first document)
  -> 02 choose authoring path  (template vs Flow vs helpers vs extension)

Building content
  -> 03 text and rich content
  -> 04 lists and tables
  -> 05 images and graphics
  -> 06 layout primitives
  -> 07 output and testing

Building a known document
  -> 08 invoice / proposal
  -> 09 CV / cover letter
  -> 10 certificate / poster
  -> 11 server / preview rendering

Production polish
  -> 12 PDF chrome (metadata, watermark, header/footer)
  -> 13 navigation (links, anchors, bookmarks)
```

## The guides

| # | Guide | Answers |
| --- | --- | --- |
| 01 | [getting started](01-getting-started-developer-guide.md) | "How do I generate my first document?" |
| 02 | [choose authoring path](02-choose-authoring-path.md) | "Template, Flow, helpers, or extension?" |
| 03 | [text and rich content](03-text-and-rich-content.md) | "Which text API: paragraph, rich runs, links?" |
| 04 | [lists and tables](04-lists-and-tables.md) | "List, nested list, or data-grid table?" |
| 05 | [images and graphics](05-images-and-graphics.md) | "Image, vector shape, chart, or barcode?" |
| 06 | [layout primitives](06-layout-primitives.md) | "Flow, row, background, layer, or canvas?" |
| 07 | [output and testing](07-output-and-testing.md) | "buildPdf, writePdf, bytes, or a snapshot test?" |
| 08 | [invoice / proposal](08-recipe-invoice-and-proposal.md) | "Build an invoice or proposal from a template." |
| 09 | [CV / cover letter](09-recipe-cv-and-cover-letter.md) | "Build a CV + matching cover letter (shared identity)." |
| 10 | [certificate / poster](10-recipe-certificate-and-poster.md) | "Build a fixed visual page (canvas, bleed, shapes)." |
| 11 | [server / preview](11-recipe-server-and-preview.md) | "Render in a backend: file, stream, or bytes." |
| 12 | [PDF chrome](12-advanced-pdf-chrome.md) | "Metadata, watermark, header/footer, protection." |
| 13 | [navigation](13-advanced-navigation.md) | "External/internal links, anchors, bookmarks." |

## Version note

These guides were extracted upstream when `v1.8.0` was the latest local tag, so
the 1.9.0 additions (`addTableOfContents(...)`, `addPageReference(...)`,
`toImage(...)` / `toImages(...)`) are worded as release-sensitive `@since 1.9.0`
APIs. GraphCompose 1.9.0 has since shipped to Maven Central
(`io.github.demchaav:graph-compose:1.9.0`), so those APIs are now available —
treat the allow-list as the authority on their exact signatures. The guides
stay `status: needs-validation` until their snippets are re-smoked against
1.9.0 inside this flow's pipeline (they are compile-smoke + render-proven
upstream).

## Re-syncing from the wiki

The body guides are copied verbatim with a provenance header by the sync
script; this index is flow-owned and is not overwritten. Re-sync per release:

```bash
node tools/api-surface/sync-engine-guides.mjs \
  --src "<path to GraphCompose>/.llm-wiki/12-docs-extraction" \
  --verified 1.9.0
```

See [`tools/api-surface/README.md`](../../../../tools/api-surface/README.md).
