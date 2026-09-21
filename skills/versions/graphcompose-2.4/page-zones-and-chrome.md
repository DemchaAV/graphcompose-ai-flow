---
skillId: graphcompose-page-zones-and-chrome
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# Page zones and chrome

Chrome is what repeats outside the flow: running headers, footers, page
numbers, a rule above the folio. 2.4 adds a second form of it —
`DocumentPageZone` — whose content is built *from* the page it is drawn
on, and which can decline to appear on some pages at all.

```bash
node scripts/api-query.mjs --version 2.4 --task chrome.per-page-furniture
```

## Which of the two forms

| | `DocumentHeaderFooter` | `DocumentPageZone` |
|---|---|---|
| Content | fixed strings: left, center, right | `Function<PageContext, DocumentNode>` |
| Varies per page | no | yes, and can skip pages entirely |
| Set with | `session.header(...)` / `session.footer(...)` | `session.chrome().zone(...)` |
| Use when | the same line on every page | the cover differs, or the text names the page |

Reach for `DocumentHeaderFooter` first. It is the smaller concept, and
2.4 improved it: the builder gained `fontName(...)` and
`reserveSpace(...)`, read back as `getFontName()` and
`isReserveSpace()`. If the furniture is one unchanging line, that is the
whole job.

Reach for `DocumentPageZone` the moment the answer depends on the page.

## Building a zone

Two factories take the height and the content directly:

```java
DocumentPageZone folio = DocumentPageZone.footer(28, page -> page.pageNumber(theme.folioStyle()));
session.chrome().zone(folio);
```

`DocumentPageZone.header(double height, Function<PageContext, DocumentNode> content)`
and `.footer(...)` are the same call for the two ends of the page.

For anything beyond height and content, go through the builder:

```java
DocumentPageZone zone = DocumentPageZone.builder()
    .zone(DocumentHeaderFooterZone.FOOTER)
    .height(28)
    .reserveSpace(true)
    .padding(DocumentInsets.symmetric(0, 36))
    .appliesTo(page -> !page.isFirst())
    .content(page -> page.pageNumber(theme.folioStyle()))
    .build();
```

`DocumentHeaderFooterZone` has two values, `HEADER` and `FOOTER`.

## `appliesTo` is the whole point

`appliesTo(Predicate<PageContext>)` decides which pages get the zone.
`!page.isFirst()` is the common case — a cover with no folio. The
predicate is asked per page, so it can use anything `PageContext`
answers:

| Call | Answers |
|---|---|
| `isFirst()` / `isLast()` | position in the document |
| `number()` / `total()` | the page number and the count |
| `isPaginated()` | whether this render has a page count at all |

Without `appliesTo(...)`, the zone is drawn on every page — which is
the same as a header or footer, and then the simpler form was the right
one.

## Page numbers as nodes

`PageContext` hands back nodes rather than strings. `pageNumber()` and
`pageTotal()` each come in two forms — bare, or taking a
`DocumentTextStyle` — and each returns a `DocumentNode`, so either can
be placed wherever the zone's content function builds its node.

Under them, `PageFieldNode` carries a `PageFieldKind` — `NUMBER` or
`TOTAL` — which is what lets the value be resolved after pagination
rather than at build time. That is why a hand-assembled string of the
page number cannot work: the total is not known when the content is
written.

## `reserveSpace` — the one that moves the layout

`reserveSpace(boolean)` decides whether the zone takes its height out of
the flow or is drawn over it.

- `true` — content stops above the zone. Use it for a real running
  footer; text will never collide with it.
- `false` — the zone floats over the page. Use it for a watermark-like
  band or a rule that is meant to sit behind content.

If content is disappearing under a footer, this flag is the first thing
to check — not the page margins.

## Reading back what a document has

`DocumentOutputOptions.zones()` returns the zones on a built document,
alongside `headersAndFooters()`. `DocumentPageZone.appliesTo(PageContext)`
answers, for one page, whether that zone applies. Between them a test
can assert the cover has no folio without rendering and looking.

## What to check in the render

- Page one differs from page two exactly where the reference says it
  does. If every page is identical, `appliesTo(...)` is missing.
- The last line of body text clears the footer. If it does not,
  `reserveSpace(true)` is missing.
- "Page 1 of 3" shows a real total. A total that reads as a literal
  means the string was assembled by hand instead of through
  `pageTotal()`.
