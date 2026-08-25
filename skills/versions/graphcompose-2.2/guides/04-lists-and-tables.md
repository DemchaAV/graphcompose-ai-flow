---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/04-lists-and-tables.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Lists And Tables

## Status
Verified / Round 28 documentation extraction

## Learning level
Beginner to intermediate

## What this page explains
This is the fourth extracted developer guide from the private LLM Wiki tree and
the second everyday-capability guide (after text and rich content).

It answers a common structuring question:

```text
I have bullets, nested steps, rows of values, or an invoice-like grid.
Do I use a list, a table, a row layout, or just paragraphs?
```

It turns the internal lists-and-tables capability page into a beginner-friendly
guide with when-to-use, when-not, why, a decision tree, and compile-checked
snippets for the verifiable list and table surfaces.

## Developer question
I need a vertical sequence of points, a hierarchical checklist, or aligned
records across columns. Which API is the right one, and when is a table the
wrong tool?

## Mental model
Choose by the structure of the information, not by how it looks at first glance.

```text
1. addList("A", "B", "C")                <- short sequence of statements
2. addList(list -> list.dash()...)       <- sequence + marker/spacing control
3. ListBuilder.addItem(label, child->..) <- hierarchical / nested bullets
4. addTable(table -> table.columns(...)) <- records aligned across columns
5. DocumentTableCell.text(...).colSpan() <- spanning or composed cells
```

A list is a vertical sequence of related points. A table is data that must align
across columns and rows. Both live in page flow and are authored from the public
DSL. Side-by-side flowing prose that is not a grid is a layout concern - use a
row, not a table.

## When to use this
- Lists for feature bullets, requirements, notes, step groups, skills, compact
  checklists, and nested outlines.
- Tables for invoices, pricing grids, comparison matrices, reports, schedules,
  statistical summaries, and any content where column alignment matters.
- `repeatHeader()` when a table can cross a page boundary and readers need the
  header repeated on each page.
- `colSpan` / `rowSpan` / composed cells when a cell needs richer structure than
  plain text.

## When not to use this
Do not use a table to create two columns of unrelated prose. Use `addRow` with
sections for side-by-side flowing content (a layout decision, not a data one).

Do not use a list when values must line up across rows. Use a table, or a row
with explicit columns.

Do not type marker characters into every list item. `ListBuilder` has marker
APIs (`bullet()`, `dash()`, `marker(...)`, `markerFor(...)`) and normalizes
common author-typed markers by default.

Do not expect every table feature to map one-to-one into semantic DOCX export.
The fixed-layout PDF path is the primary table-fidelity path.

## How it works in GraphCompose
`AbstractFlowBuilder` exposes `addList(...)` and `addTable(...)` to page flow,
modules, sections, rows, and similar flow containers.

`ListBuilder` stores list items plus marker and spacing controls: flat
replacement with `items(...)`, incremental `addItem(...)`, nested
`addItem(label, child -> ...)`, marker choice (`bullet()`, `dash()`,
`noMarker()`, `marker(...)`), per-depth markers with `markerFor(depth, marker)`,
and text/spacing/padding options.

`TableBuilder` stores columns, rows, width, cell/header style, row/column
overrides, zebra styling, repeated headers, total rows, links, anchors,
bookmarks, padding, and margin. `DocumentTableColumn.auto()` and `fixed(points)`
describe column sizing. `DocumentTableCell` is the richer cell value: plain text
(`text(...)`), span metadata (`colSpan(...)`, `rowSpan(...)`), style overrides,
and composed node cells (`node(...)`).

## Decision tree
Read top to bottom and stop at the first branch that matches.

```text
I have structured content.
|
+-- Is it a vertical sequence of related points?
|   -> YES: addList(...). Nest with addItem(label, child -> ...).
|
+-- Do the values have to line up across columns?
|   -> YES: addTable(...) with columns(...) and headerRow(...).
|
+-- Can the table cross a page boundary?
|   -> YES: add repeatHeader() so the header repeats per page.
|
+-- Does one cell need to span or hold richer content?
|   -> YES: DocumentTableCell.text(...).colSpan(...) / .node(...).
|           Pick the cell form from the CELL CONTENT table below - it is
|           narrower than the signature suggests.
|
+-- Do two adjacent rows read as one visual group in the reference?
|   -> That is a border question, not a structure question. Keep the rows and
|      unstroke the group's interior. See "Grouping rows" below.
|
+-- Is it just two blocks of prose side by side (not a grid)?
    -> That is layout. Use addRow with sections. See the layout choice tree.
```

## Cell content: pick the narrowest form that fits

`DocumentTableCell.node(...)` takes any `DocumentNode`, so the signature reads
as though any arrangement works in a cell. It does not. Choose by what the cell
holds:

| The cell holds | Use | Not |
|---|---|---|
| one logical value | `DocumentTableCell.text("Support package")` | — |
| several lines that are one value | `DocumentTableCell.lines("Support package", "12 months, 24/7")` | `text("a
b")` — a newline inside `text(...)` is not the multiline route |
| a value that needs styling or inline runs | `DocumentTableCell.node(paragraphNode)` | a Section wrapping a paragraph |
| structure inside the cell | a nested `TableNode` | a Row, LayerStack, ShapeContainer or CanvasLayer |

The last row is not a style preference. On GraphCompose 2.2.0, a `RowNode`,
`ShapeContainerNode` or `CanvasLayerNode` in a cell reserves the cell's height
and draws **none** of its child content, and a `SectionNode` or `LayerStackNode`
draws only part of it — measured at 0.4 of the ink the same child draws in plain
page flow. Nothing is thrown and nothing is logged; the table is structurally
correct and the content is quietly missing or truncated. It is invisible to the
layout tree too, because cell content does not appear in `layoutSnapshot()`.

That is a defect in this version rather than a design limit, recorded with its
measurements and its reproduction as the observation
`table-cell-loses-composite-content`. Re-run it before assuming it still holds
on a later line:

```bash
node scripts/observations.mjs show table-cell-loses-composite-content
node scripts/probe.mjs table-cell-node --version 2.2 --json
```

## Grouping rows without losing the table

When a reference shows two adjacent rows with no line between them, the
temptation is to stop using a table — position the content with shapes, or paint
a white rectangle over the rule. Both throw away the row semantics, and the
rectangle does not survive pagination: it stays on page one while the rule moves.

Borders in GraphCompose are per cell, from each cell's own
`DocumentTableStyle.stroke(...)`. There is no table-level grid and no per-edge
control, so a group is expressed by unstroking its interior:

```java
DocumentTableStyle ruled = DocumentTableStyle.builder()
        .stroke(DocumentStroke.of(DocumentColor.GRAY, 0.5))
        .padding(6.0)
        .build();
DocumentTableStyle grouped = DocumentTableStyle.builder()
        .stroke(DocumentStroke.of(DocumentColor.GRAY, 0.0))   // no edges at all
        .padding(6.0)
        .build();
```

The consequence to plan for: a zero-width stroke removes **every** edge of the
cells it is applied to, not the shared divider alone. In a measured three-row
table, unstroking the first two cells removed the table's top edge along with
the divider between them; the rule below the group survived only because the
next cell still drew its own top edge. So leave a stroked cell on each side of
the group to carry its boundary, and if the group sits at the table's own edge,
restore that edge deliberately — a stroked header or total row, or a container
drawn around the table.

Recorded as `table-borders-are-per-cell`, with the rule positions it was
measured from.

## Minimal list example
The smallest useful list: a simple bullet group in page flow.

<!-- snippet-smoke: id=round28-list-minimal mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("list.pdf")).create()) {
    document.pageFlow(page -> page
            .addList(
                    "Crisp vector output",
                    "Deterministic layout",
                    "Snapshot tests"));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/02-lists-and-tables.md` (marker `capability-list-minimal`),
`docs/recipes/lists.md`, and
`src/main/java/com/demcha/compose/document/dsl/ListBuilder.java`.

Compile-smoke marker: `round28-list-minimal`, `mode=method`, added in Round 28.

## Nested list example
When a list is a hierarchy, use the configured builder: pick a marker, set item
spacing, and nest children with `addItem(label, child -> ...)`.

<!-- snippet-smoke: id=round28-list-nested mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.node.ListMarker;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("checklist.pdf")).create()) {
    document.pageFlow(page -> page
            .addList(list -> list
                    .name("Delivery checklist")
                    .dash()
                    .itemSpacing(2)
                    .markerFor(1, ListMarker.custom("*"))
                    .addItem("Prepare", child -> child
                            .addItem("Collect requirements")
                            .addItem("Confirm output format"))
                    .addItem("Render")
                    .addItem("Verify")));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/02-lists-and-tables.md` (practical example),
`src/main/java/com/demcha/compose/document/dsl/ListBuilder.java`,
`src/main/java/com/demcha/compose/document/node/ListMarker.java`, and
`examples/src/main/java/com/demcha/examples/features/lists/NestedListExample.java`.

Compile-smoke marker: `round28-list-nested`, `mode=method`, added in Round 28.

## Table example
A data grid with three columns, a repeated header, zebra rows, a spanning cell,
and a total row.

<!-- snippet-smoke: id=round28-table-minimal mode=method since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableColumn;

import java.nio.file.Path;

try (DocumentSession document = GraphCompose.document(Path.of("table.pdf")).create()) {
    document.pageFlow(page -> page
            .addTable(table -> table
                    .columns(
                            DocumentTableColumn.auto(),
                            DocumentTableColumn.auto(),
                            DocumentTableColumn.auto())
                    .headerRow("Item", "Qty", "Amount")
                    .repeatHeader()
                    .zebra(DocumentColor.rgb(248, 250, 252), DocumentColor.WHITE)
                    .row("Implementation", "1", "$2,400")
                    .rowCells(
                            DocumentTableCell.text("Support package").colSpan(2),
                            DocumentTableCell.text("$600"))
                    .totalRow("Total", "", "$3,000")));

    document.buildPdf();
}
```

Source marker: verified against
`05-capabilities/02-lists-and-tables.md` (practical example),
`src/main/java/com/demcha/compose/document/dsl/TableBuilder.java`,
`src/main/java/com/demcha/compose/document/table/DocumentTableCell.java`,
`src/main/java/com/demcha/compose/document/table/DocumentTableColumn.java`, and
`examples/src/main/java/com/demcha/examples/features/tables/TableAdvancedExample.java`.

Compile-smoke marker: `round28-table-minimal`, `mode=method`, added in Round 28.

## DOCX and PPTX note
These snippets target the canonical fixed-layout PDF path, the primary verified
path for lists and tables. Semantic DOCX export maps lists and basic tables but
does not guarantee identical fidelity for every span, zebra, or composed-cell
feature. Before promising any list/table feature in DOCX/PPTX, check
`11-gap-backlog/01-docx-pptx-support-matrix.md`.

## What to read next
| Next question | Read |
| --- | --- |
| "How do lists/tables paginate and split?" | `04-core-concepts/04-layout-and-pagination.md` |
| "When is a row better than a table?" | `05-capabilities/04-layout-primitives.md` |
| "How do I style text inside cells?" | `12-docs-extraction/03-text-and-rich-content.md` |
| "How do I add images or charts?" | `05-capabilities/03-images-and-graphics.md` |
| "Which authoring path am I even on?" | `12-docs-extraction/02-choose-authoring-path.md` |

## Common mistakes
- Using paragraphs with manual prefixes instead of `addList(...)`.
- Using tables for general page layout rather than data grids.
- Forgetting that `RowBuilder.weights(...)` and `RowBuilder.columns(...)` are
  layout primitives, not table data APIs.
- Adding `repeatHeader()` only after discovering a long table split across pages.
- Mixing span cells without keeping the effective column count aligned.
- Using composed table cells before a plain text table would solve the problem.

## Related pages
- `12-docs-extraction/01-getting-started-developer-guide.md`
- `12-docs-extraction/02-choose-authoring-path.md`
- `12-docs-extraction/03-text-and-rich-content.md`
- `05-capabilities/02-lists-and-tables.md`
- `04-core-concepts/04-layout-and-pagination.md`
- `05-capabilities/04-layout-primitives.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/dsl/AbstractFlowBuilder.java`
- `src/main/java/com/demcha/compose/document/dsl/ListBuilder.java`
- `src/main/java/com/demcha/compose/document/node/ListMarker.java`
- `src/main/java/com/demcha/compose/document/dsl/TableBuilder.java`
- `src/main/java/com/demcha/compose/document/table/DocumentTableCell.java`
- `src/main/java/com/demcha/compose/document/table/DocumentTableColumn.java`
- `.llm-wiki/05-capabilities/02-lists-and-tables.md`
- `.llm-wiki/12-docs-extraction/03-text-and-rich-content.md`
- `examples/src/main/java/com/demcha/examples/features/lists/NestedListExample.java`
- `examples/src/main/java/com/demcha/examples/features/tables/TableAdvancedExample.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 28 adds the fourth documentation-extraction guide under
`12-docs-extraction/` and the second everyday-capability guide. It is built from
the Round 6 lists-and-tables capability page and the Round 5 core-concept pages.

The three Java snippets reuse list and table shapes from the source capability
page: the minimal `addList(...)` bullet group (the `capability-list-minimal`
shape), the nested `ListBuilder` with `markerFor(...)` / `ListMarker.custom(...)`,
and the `TableBuilder` grid with `repeatHeader()`, `zebra(...)`,
`rowCells(...)` / `colSpan(...)`, and `totalRow(...)`. The table and nested-list
shapes were source-verified on the capability page; Round 28 promotes them to
compile-smoke-proven. The exact table/cell/column/list signatures were
re-checked against `TableBuilder.java`, `DocumentTableCell.java`,
`DocumentTableColumn.java`, `ListBuilder.java`, and `ListMarker.java` before
marking.

DOCX/PPTX fidelity is described in prose with a link rather than repeated as a
runnable snippet, so every `java` fence in this guide is compile-checkable.

Round 28 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=35`, `generated=35`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
