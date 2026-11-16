---
skillId: graphcompose-timeline-and-rails
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# Timelines and rails

A dated history — roles in a CV, milestones in a proposal, a project
log — is a primitive on this line, not a shape to assemble. The
temptation is to build it as one row per entry, with a date column, a
small circle and a hand-placed vertical line. That row-per-entry
construction is the thing to avoid: `AbstractFlowBuilder.addTimeline`
already aligns everything those rows would have to align by hand, and it
survives the text rewrapping.

```bash
node scripts/api-query.mjs --version 2.4 --task timeline.dated-history
node scripts/api-query.mjs --version 2.4 --task timeline.continuous-rail
```

## The entry point

```java
section.addTimeline(timeline -> timeline
    .spacing(14)
    .entry(TimelineMarker.dot(7, theme.accent()), entry -> entry
        .title("Senior Engineer")
        .meta("2021 — present")
        .content(body -> body.addParagraph("What the role covered."))));
```

`addTimeline(Consumer<TimelineBuilder>)` is declared on the flow builder,
so it is available anywhere a section, a column or the page flow accepts
content.

## The three decisions

### 1. Where the dates live

`TimelineEntryBuilder.leading(Consumer<SectionBuilder>)` puts content
before the marker — dates, a year, a logo. On its own, each entry's
leading block is as wide as its own content, so the dates do not line
up. `TimelineBuilder.leadingColumn(DocumentRowColumn)` gives that
column one spec for the whole timeline:

```java
timeline.leadingColumn(DocumentRowColumn.fixed(64)).leadingGap(10)
```

Use `DocumentRowColumn.fixed(...)` when a rail of dates must line up
exactly, `DocumentRowColumn.auto()` when the widest date should set the
column. `leadingGap(double)` is the space between that column and the
marker.

Without `leadingColumn(...)`, put the date in `content(...)` instead and
accept that it flows with the text — a legitimate design, but a
different one.

### 2. Whether there is an axis, and how far it runs

Two forms, and they are not interchangeable:

| Form | Call | What it can express |
|---|---|---|
| Per-gap connector | `connector(DocumentColor color, double width)` | a segment between each pair of markers, with clear space above the first and below the last |
| One rail | `rail(Consumer<TimelineRailBuilder>)` | a single axis for the whole timeline, with its own start and end |

The rail's ends are declared, not measured:

```java
timeline.rail(rail -> rail
    .stroke(DocumentStroke.of(theme.rule(), 1.5))
    .from(TimelineRailEnd.ENTRY_BOUND)
    .to(TimelineRailEnd.MARKER));
```

`TimelineRailEnd` has exactly two values — `ENTRY_BOUND` and `MARKER` —
so a rail either reaches the bound of the first or last entry, or stops
at its marker. If the reference shows the line running past the top
marker to the edge of the block, that is `ENTRY_BOUND`; if it starts at
the first dot, that is `MARKER`. `axisWidth(double)` sets the width of
the axis column itself.

### 3. Whether the marker sits on the axis

`markerOnRail()` places the marker on the rail rather than in its own
column beside it. This is the call that decides whether the dots read as
threaded onto the line or as a separate column of bullets — look at the
reference before choosing, because both are common and they are not
subtle once rendered.

`markerGap(double)` and `markerColumnWeight(double)` tune the space
around it.

## Markers

Five factories, all on `TimelineMarker`:

| Call | For |
|---|---|
| `dot(double size, DocumentColor color)` | a filled dot |
| `circle(double size, DocumentColor fill, DocumentStroke stroke)` | a ring, or a filled circle with a border |
| `square(double size, DocumentColor fill)` | a square node |
| `numbered(int number, double size, DocumentColor fill, DocumentColor textColor)` | a numbered step |
| `custom(double width, double height, Consumer<SectionBuilder> recipe)` | anything else — an icon, a logo, a chip |

`custom(...)` takes a section recipe, so a marker can be a whole small
composition. Give it the size the reference measures; the recipe draws
inside it.

Per entry, either pass the marker positionally —
`entry(TimelineMarker marker, Consumer<TimelineEntryBuilder> content)` —
or set it inside the entry with
`TimelineEntryBuilder.marker(TimelineMarker)`. Use the second when only
some entries have a distinct marker.

## Type in a timeline

`titleStyle`, `metaStyle` and `bodyStyle` on the builder set the styles
once for every entry; `TimelineEntryBuilder.title(String, DocumentTextStyle)`,
`meta(String, DocumentTextStyle)` and `titleStyle(...)` override one
entry. Set the shared styles on the builder — an override per entry is a
smell unless the reference really does treat one entry differently.

## Pagination

Two calls, and they answer different questions:

- `keepEntriesTogether()` — no single entry splits across a page break.
- `keepTogether()` — the whole timeline moves to the next page rather
  than splitting at all.

`keepEntriesTogether()` is almost always what a CV wants. `keepTogether()`
on a long history will push a mostly-empty page, so use it only for a
short block that reads as one object.

## What to check in the render

- The leading column's left edge is identical on every entry. If it
  drifts, `leadingColumn(...)` is missing.
- The rail's top and bottom match the reference — this is
  `from(...)`/`to(...)`, not a spacing problem, and adjusting `spacing`
  to chase it will move every entry instead.
- Markers are centred on the axis if and only if the reference shows
  them threaded on it: that is `markerOnRail()`.
- An entry that breaks across pages means `keepEntriesTogether()` was
  not set.
