---
skillId: graphcompose-flow-width-and-sizing
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# Flow width — a block that keeps its own size

By default a block in the flow is as wide as the column it sits in. That
is right for body text and wrong for a pill, a card, a signature rule or
a tinted panel that the reference shows ending well before the margin.

2.4 makes that width a property of the node.

```bash
node scripts/api-query.mjs --version 2.4 --task layout.block-that-must-not-stretch
```

## The call

`AbstractFlowBuilder.fixedWidth(double points)` is declared on the flow
builder and returns the builder, so it chains like any other property:

```java
section.addSection(card -> card
    .fixedWidth(180)
    .fillColor(theme.panel())
    .cornerRadius(6)
    .padding(DocumentInsets.of(10))
    .addParagraph("Certified"));
```

Underneath it is `DocumentFlowWidth`, a record with two forms:

| Call | Meaning |
|---|---|
| `DocumentFlowWidth.natural()` | the default — take the column's width |
| `DocumentFlowWidth.of(double points)` | this many points, whatever the column is |
| `isFixed()` | which of the two a node has |
| `resolve(double availableWidth)` | the width it works out to, given the column |
| `points()` | the fixed value |

`DocumentNode.flowWidth()`, `SectionNode.flowWidth()` and
`ContainerNode.flowWidth()` all report it back, so a test or a layout
snapshot can assert the width without measuring pixels.

## Why this rather than the alternatives

A width can be faked three ways, and each fails differently:

- **Padding on the parent.** Moves the content's edges but not the
  node's. The `fillColor(...)` still spans the full column — which is
  usually the bug being chased, not the fix.
- **A row with a fixed column and a spacer.** Correct, and the right
  answer when the block genuinely is a column of a grid. As a way to
  narrow one block it adds a row whose only child is that block, and
  puts the width in the column spec where the next reader will not look
  for it.
- **A width computed from the page.** Right once, then wrong at the
  first margin change, and wrong immediately if the block is reused in a
  narrower column.

`fixedWidth(...)` travels with the node. Move the block into a sidebar
and it is still 180pt.

## When *not* to fix the width

If the block should track its column — a body paragraph, a table, a
full-bleed band — leave it `natural()`. A fixed width on something that
should stretch is the mirror-image bug, and it shows up as a stripe of
background missing down one side at a different page size.

If the block should be as wide as *its own content* rather than a number
you measured, that is not this call either: `fixedWidth(...)` takes
points, not "shrink to fit".

## What to check in the render

- The block's right edge lands where the reference puts it, at the page
  size the reference was measured at. If it is right at one width and
  wrong at another, a computed width crept in somewhere.
- The background ends with the content. A background running to the
  margin under a narrowed block means the width went on the child rather
  than on the node that paints.
- `flowWidth()` in a layout snapshot reports `isFixed()` where you set
  it and `natural()` everywhere else. A fixed width nobody intended is
  easier to see there than in the render.
