---
skillId: graphcompose-2-4-whats-new
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# What 2.4 added, and what it replaced

Read this before writing against a borrowed 2.2 page. It is the list of
places where the older prose is behind the line, and the list of things
2.4 can do that nothing in the 2.2 pack mentions.

Every symbol below was confirmed against this pack's allow-list. Confirm
any you are about to call the same way — a name in prose is a pointer,
the surface is the authority:

```bash
node scripts/api-query.mjs --version 2.4 --exists TimelineBuilder.rail
```

## The five additions that change how a page is built

| What | The call | Page |
|---|---|---|
| A timeline with a continuous axis, its own leading column and markers on the rail | `TimelineBuilder.rail(...)`, `.leadingColumn(...)`, `.markerOnRail()` | [`timeline-and-rails.md`](timeline-and-rails.md) |
| Page furniture that is built from the page it is drawn on, and can skip pages | `DocumentPageZone.header/footer(...)`, `PageContext` | [`page-zones-and-chrome.md`](page-zones-and-chrome.md) |
| A node that keeps its own width inside a wider column | `AbstractFlowBuilder.fixedWidth(double)`, `DocumentFlowWidth` | [`flow-width-and-sizing.md`](flow-width-and-sizing.md) |
| Tracking as a property of a text style | `DocumentTextStyle.withLetterSpacing(...)`, `DocumentLetterSpacing` | [`typography-2-4.md`](typography-2-4.md) |
| Hanging indents, marker gaps, rich list runs and an inline chip | `ListBuilder.hangingIndent(...)`, `ParagraphBuilder.inlineStyledChip(...)` | [`lists-and-inline-2-4.md`](lists-and-inline-2-4.md) |

## Where the 2.2 pages are behind

The 2.2 pack is linked from the loading map because most of it is still
true. These are the exceptions. Read the 2.2 page for the shape, and
this line for the part it cannot know.

- **`typography.md`** predates letter spacing entirely. Where it says a
  spaced look has to be faked, 2.4 has
  `DocumentTextStyle.withLetterSpacing(DocumentLetterSpacing)`.
- **`layout-primitives.md`** sizes every block to its column. 2.4 adds
  `fixedWidth(double)` on the flow builder, reported back by
  `DocumentNode.flowWidth()`, `SectionNode.flowWidth()` and
  `ContainerNode.flowWidth()`.
- **`pagination.md`** knows headers and footers as fixed strings. On
  this line `SessionChromeApi.zone(DocumentPageZone)` takes a
  `Function<PageContext, DocumentNode>`, so the furniture can read the
  page number, the total, and whether it is the first page.
- **Anything describing a dated history as rows to build by hand.**
  `AbstractFlowBuilder.addTimeline(Consumer<TimelineBuilder>)` is the
  primitive, and on 2.4 it carries the rail, the leading column and
  `keepEntriesTogether()`. A hand-built row per entry is the
  construction to avoid, because `addTimeline` already aligns what the
  rows would have to align by hand.
- **Header and footer styling.** `DocumentHeaderFooter` gained
  `getFontName()`/`isReserveSpace()`, with `fontName(...)` and
  `reserveSpace(...)` on its builder — the 2.2 page has neither.

## Four exceptions the 2.2 troubleshooting page cannot name

All four are in `com.demcha.compose.document.exceptions`:

| Exception | What it means |
|---|---|
| `AtomicNodeTooLargeException` | a node that cannot be split is taller than the page. Its factory, `forNode(String path, double outerHeight, double pageHeight)`, carries the node path and both heights — read them rather than guessing which block it was |
| `DocumentRenderingException` | rendering failed with a cause; it is the wrapper, so the `cause` is the thing to read |
| `MissingBackendException` | the document asked for an output the classpath has no renderer for |
| `UnsupportedNodeCapabilityException` | a node asked a backend for something that backend cannot do — the same document may render on another |

When a render fails, the exception type is the first fact. Getting it
into the report costs nothing and removes a round of guessing.

## What did not change

Tables, themes and colours, shapes and containers, layer stacks and
overlays, backgrounds and panels, spacing and alignment, the mapping
from a reference to primitives, visual regression and revision
discipline. The 2.2 pages for those are linked from the loading map and
are current for this line — 2.4 added no symbol that touches them.
