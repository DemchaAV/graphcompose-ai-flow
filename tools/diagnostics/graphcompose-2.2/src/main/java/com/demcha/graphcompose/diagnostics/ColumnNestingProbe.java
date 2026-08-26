package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.node.ParagraphNode;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableColumn;

/**
 * What still arranges horizontally once it is INSIDE the main column of a
 * two-column page?
 *
 * <p>{@code row-nesting} settled that a bare row is refused in a row cell and
 * that a row inside a LayerStack layer lays out horizontally — but it measured
 * the LayerStack case at page level, not inside a cell, and the difference is
 * the whole question for a sidebar CV. Every horizontal pair in such a document
 * (icon + label, skill + rating, date + entry, two side-by-side sub-columns)
 * lives one level deeper than that probe ever looked.</p>
 *
 * <p>Four arrangements, each in the main cell of the same two-column row, each
 * in its own document so a refusal does not hide the ones after it.</p>
 */
final class ColumnNestingProbe implements Probes.Probe {

    @Override
    public String question() {
        return "Inside the main column of a two-column row, which horizontal arrangements still "
                + "lay out horizontally: a bare row, a row in a LayerStack layer, a two-column "
                + "table, a timeline in a LayerStack layer?";
    }

    @Override
    public Map<String, Object> run() {
        Map<String, Object> bareRow = inMainColumn("bare-row", cell -> cell
                .addRow("InnerRow", inner -> {
                    inner.weights(0.4, 0.6);
                    inner.addParagraph(p -> p.name("Left").text("LEFT"));
                    inner.addParagraph(p -> p.name("Right").text("RIGHT"));
                }));

        Map<String, Object> layeredRow = inMainColumn("layered-row", cell -> {
            SectionBuilder layer = new SectionBuilder();
            layer.addRow("InnerRow", inner -> {
                inner.weights(0.4, 0.6);
                inner.addParagraph(p -> p.name("Left").text("LEFT"));
                inner.addParagraph(p -> p.name("Right").text("RIGHT"));
            });
            cell.addLayerStack(stack -> stack
                    .name("RowStack")
                    .layer(layer.build(), LayerAlign.TOP_LEFT, 0));
        });

        Map<String, Object> table = inMainColumn("table", cell -> cell
                .addTable(t -> {
                    t.name("InnerTable");
                    t.columns(DocumentTableColumn.auto(), DocumentTableColumn.auto());
                    t.rowCells(
                            DocumentTableCell.node(named("Left", "LEFT")),
                            DocumentTableCell.node(named("Right", "RIGHT")));
                }));

        Map<String, Object> layeredTimeline = inMainColumn("layered-timeline", cell -> {
            SectionBuilder layer = new SectionBuilder();
            layer.addTimeline(tl -> tl
                    .entry(com.demcha.compose.document.dsl.TimelineMarker.dot(6,
                                    com.demcha.compose.document.style.DocumentColor.rgb(199, 154, 75)),
                            e -> e.title("LEFT").body("RIGHT")));
            cell.addLayerStack(stack -> stack
                    .name("TimelineStack")
                    .layer(layer.build(), LayerAlign.TOP_LEFT, 0));
        });

        // Two deep: a credentials block is a layered row whose own cells hold
        // icon-and-text rows, so the escape has to survive being used twice.
        Map<String, Object> nestedTwice = inMainColumn("layered-row-twice", cell -> {
            SectionBuilder inner = new SectionBuilder();
            inner.addRow("InnerMost", r -> {
                r.weights(0.3, 0.7);
                r.addParagraph(p -> p.name("Left").text("LEFT"));
                r.addParagraph(p -> p.name("Right").text("RIGHT"));
            });

            SectionBuilder outerLayer = new SectionBuilder();
            outerLayer.addRow("OuterInner", r -> {
                r.weights(0.5, 0.5);
                r.addSection("ColumnA", a -> a.addLayerStack(stack -> stack
                        .name("InnerStack")
                        .layer(inner.build(), LayerAlign.TOP_LEFT, 0)));
                r.addSection("ColumnB", b -> b.addParagraph(p -> p.text("B")));
            });
            cell.addLayerStack(stack -> stack
                    .name("OuterStack")
                    .layer(outerLayer.build(), LayerAlign.TOP_LEFT, 0));
        });

        Map<String, Object> result = Json.object();
        result.put("bareRowInCell", bareRow);
        result.put("layeredRowTwiceNested", nestedTwice);
        result.put("layeredRowTwiceHorizontal", nestedTwice.get("sideBySide"));
        result.put("layeredRowInCell", layeredRow);
        result.put("tableInCell", table);
        result.put("layeredTimelineInCell", layeredTimeline);

        result.put("bareRowHorizontal", bareRow.get("sideBySide"));
        result.put("layeredRowHorizontal", layeredRow.get("sideBySide"));
        result.put("tableHorizontal", Boolean.TRUE.equals(table.get("measured")) ? table.get("sideBySide") : null);
        result.put("layeredTimelineBuilt", layeredTimeline.get("built"));

        result.put("finding", describe(bareRow, layeredRow, table, layeredTimeline)
                + " Two layer-stack wrappers deep, the innermost row "
                + verdict(nestedTwice) + ".");
        return result;
    }

    private static String describe(Map<String, Object> bare,
                                   Map<String, Object> layered,
                                   Map<String, Object> table,
                                   Map<String, Object> timeline) {
        StringBuilder out = new StringBuilder();
        out.append("In a row cell: a bare row ").append(verdict(bare)).append("; ");
        out.append("a row in a LayerStack layer ").append(verdict(layered)).append("; ");
        out.append("a two-column table ").append(verdict(table)).append("; ");
        out.append("a timeline in a LayerStack layer ")
                .append(Boolean.TRUE.equals(timeline.get("built")) ? "builds" : "fails to build")
                .append(".");
        return out.toString();
    }

    private static String verdict(Map<String, Object> attempt) {
        if (!Boolean.TRUE.equals(attempt.get("built"))) {
            return "is refused (" + attempt.get("error") + ")";
        }
        if (Boolean.TRUE.equals(attempt.get("sideBySide"))) {
            return "lays out horizontally";
        }
        // A primitive that owns its own children (a table, a timeline) does not
        // republish their names into the layout snapshot, so "not found" is an
        // absence of evidence rather than evidence of vertical stacking.
        Object children = attempt.get("children");
        boolean measured = children instanceof List<?> list && list.size() == 2;
        return measured ? "builds but stacks vertically" : "builds; child positions not observable here";
    }

    /** A named paragraph, so the layout snapshot can be asked where it landed. */
    private static ParagraphNode named(String name, String text) {
        ParagraphBuilder paragraph = new ParagraphBuilder();
        paragraph.name(name);
        paragraph.text(text);
        return paragraph.build();
    }

    /** One arrangement, dropped into the main column of a two-column page. */
    private static Map<String, Object> inMainColumn(String label, Consumer<SectionBuilder> arrangement) {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "column-nesting-" + label + ".pdf");
        Map<String, double[]> nodes = new LinkedHashMap<>();

        Consumer<PageFlowBuilder> page = flow -> flow
                .name("ColumnNestingProbe")
                .addRow("OuterRow", outer -> {
                    outer.weights(0.32, 0.68);
                    outer.addSection("Sidebar", side -> side.addParagraph(p -> p.text("SIDEBAR")));
                    outer.addSection("MainColumn", arrangement);
                });

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page);
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> "Left".equals(n.entityName()) || "Right".equals(n.entityName()))
                    .forEach(n -> nodes.put(n.entityName(),
                            new double[]{n.computedX(), n.computedY()}));
            out.put("built", true);
        } catch (RuntimeException failure) {
            out.put("built", false);
            out.put("error", failure.getMessage());
            return out;
        }

        List<Object> children = Json.array();
        for (Map.Entry<String, double[]> entry : nodes.entrySet()) {
            Map<String, Object> child = Json.object();
            child.put("node", entry.getKey());
            child.put("x", Json.pt(entry.getValue()[0]));
            child.put("y", Json.pt(entry.getValue()[1]));
            children.add(child);
        }
        out.put("children", children);

        double[] left = nodes.get("Left");
        double[] right = nodes.get("Right");
        out.put("measured", left != null && right != null);
        out.put("sideBySide", left != null && right != null
                && Math.abs(left[0] - right[0]) > 0.5
                && Math.abs(left[1] - right[1]) < 0.5);
        return out;
    }
}
