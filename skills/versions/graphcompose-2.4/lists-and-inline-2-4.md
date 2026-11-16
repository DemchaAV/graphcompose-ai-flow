---
skillId: graphcompose-lists-and-inline-2-4
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# Lists and inline content on 2.4

Two additions this line makes, both of which a 2.2 page would tell you
to fake: list items whose wrapped lines hang under the text, and a
styled chip inside a sentence.

```bash
node scripts/api-query.mjs --version 2.4 --task list.hanging-indent
node scripts/api-query.mjs --version 2.4 --task text.chip-inside-a-sentence
```

## Hanging indents

When a bulleted item wraps, its second line either returns to the
marker's column or hangs under the text. References almost always show
the second; without the call it is the first.

```java
section.addList(list -> list
    .bullet()
    .hangingIndent(true)
    .markerGap(8)
    .items("First point that is long enough to wrap onto a second line",
           "Second point"));
```

| Call | What it does |
|---|---|
| `ListBuilder.hangingIndent(boolean)` | wrapped lines align under the text |
| `ListBuilder.markerGap(double)` | the distance between marker and text |
| `ListNode.hangingIndent()`, `ListNode.markerGap()` | read both back off the built node |

Padding is the fake to avoid here: it insets the first line too, which
moves the marker rather than the wrap, and then the marker no longer
lines up with the other lists on the page.

## Rich markers and rich items

A list item is normally a string. When it needs mixed styling — a bold
lead-in, a coloured token — it becomes runs:

| Call | For |
|---|---|
| `ListItem.ofRuns(List<InlineRun>)` | an item built from styled runs |
| `ListItem.ofRuns(String label, List<InlineRun> runs)` | the same, carrying a plain label as well |
| `ListMarker.ofRuns(List<InlineRun>)` | a marker that is itself styled |
| `ListItem.isRich()`, `ListMarker.isRich()` | which form a given one is in |

`ListBuilder.addItem(Consumer<RichText> content)` is the builder-side
route into the same thing, and `markerFor(int depth, ListMarker)` sets a
different marker per nesting depth.

Keep the list a list. Rebuilding it as a row per item to get a styled
marker gives up nesting, depth markers and the list's own wrapping —
reach for `ListMarker.ofRuns(...)` or an icon bullet first, and only
drop to rows when the marker is genuinely a separate graphic with its
own column.

## A chip inside a sentence

`ParagraphBuilder.inlineStyledChip(String text, DocumentTextStyle textStyle, DocumentColor bg)`
puts a token with its own background inside the text run:

```java
section.addParagraph(p -> p
    .inlineText("Status: ")
    .inlineStyledChip("APPROVED", theme.chipText(), theme.chipBackground()));
```

`inlineChip(String, DocumentColor fg, DocumentColor bg)` is the older
form and still there; the difference is the second argument. A bare
foreground colour cannot carry the family, size or weight the chip needs,
so a chip that must match a type role takes the style —
`inlineStyledChip(...)` — and a chip that is only a tinted word can stay
on `inlineChip(...)`.

Because it is a run, it wraps with the sentence and keeps its
background. A chip built as a shape container beside the paragraph is a
sibling block: it sits above or below the text, never inside it. Use the
container form only when the chip is standalone — a badge on its own
line, or one of a row of chips.

`InlineRun.plainText(List<InlineRun>)` flattens a run list back to text,
and `InlineRun.textRuns(List<InlineRun>)` gives the styled runs. Both
are how a check reads back what a paragraph actually says, rather than
what it was meant to say.

## What to check in the render

- A wrapped bullet's second line starts under the text, not under the
  bullet. If it starts under the bullet, `hangingIndent(true)` is
  missing.
- Markers line up down the page across separate lists. Different
  `markerGap` values between two lists in the same document is almost
  always unintended.
- A chip sits on the same line as the words around it. On its own line,
  it was built as a container rather than as a run.
