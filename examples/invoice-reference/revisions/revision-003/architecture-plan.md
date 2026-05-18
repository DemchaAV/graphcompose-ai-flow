# Architecture Plan

## Revision Goal

`revision-003` fixes the visible page-edge defect in `revision-002`: the
rendered invoice content began at the top-left edge of the page.

## Design

Add a single page spacing token:

```java
private static final double PAGE_MARGIN = 24.0;
```

Apply it once on the root page flow:

```java
document.pageFlow(page -> page
        .name("Invoice")
        .spacing(PAGE_SPACING)
        .padding(DocumentInsets.of(PAGE_MARGIN))
        ...
);
```

## Rationale

The margin belongs to the page grid, not to individual regions. Applying
padding at the root keeps all top-level regions aligned and avoids
per-component offset hacks.

The margin is `24 pt` rather than the earlier illustrative `18 mm`
snapshot value because the current sample hero line is long. At `24 pt`
the document gains visible white space on the top and left edges while
the hero metadata still fits on one line.

## Component Impact

Only the page-level flow changes. The semantic regions inherited from
`revision-002` are preserved:

- Header
- Hero
- Parties
- LineItems
- Summary
- Footer
