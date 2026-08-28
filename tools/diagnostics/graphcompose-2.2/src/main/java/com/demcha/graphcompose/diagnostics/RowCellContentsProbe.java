package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableColumn;

/**
 * A row cell refuses a nested row ({@code row-cannot-nest-in-row-cell}). Every
 * two-column page still needs horizontal arrangements inside its columns — a
 * priced line-item block, a label beside its icon — so the useful question is
 * not whether a row survives there but <em>what does</em>.
 *
 * <p>Four candidates, each the smallest arrangement that settles it, each in
 * its own document so a refusal does not take the ones after it down with it:
 * a table, a shape container placing two children with anchors, the same pair
 * carried as columns of the OUTER row, and an inline shape run riding the text
 * baseline.</p>
 */
final class RowCellContentsProbe implements Probes.Probe {

    @Override
    public String question() {
        return "Inside a row cell, which horizontal arrangements still lay out horizontally — "
                + "a table, a shape container with anchored children, or flattened outer columns?";
    }

    @Override
    public Map<String, Object> run() {
        // A table's cell children are not named snapshot entities, so the
        // side-by-side test the other arms use cannot see inside one. What can
        // be measured is the table's own box: a two-column table that laid its
        // columns out at all is as wide as its cell, and a table that collapsed
        // is not. Reported separately so a table is never scored by a test that
        // structurally cannot observe it.
        Map<String, Object> table = measureTable("table-in-row-cell");

        Map<String, Object> container = attempt("shape-container-in-row-cell", page -> page
                .addRow("OuterRow", outer -> {
                    outer.weights(0.6, 0.4);
                    outer.addSection("MainColumn", cell -> cell.addContainer(c -> c
                            .name("Pair")
                            .rectangle(220, 20)
                            .position(new ParagraphBuilder().name("Left").text("LEFT").build(),
                                    0, 0, LayerAlign.CENTER_LEFT)
                            .position(new ParagraphBuilder().name("Right").text("RIGHT").build(),
                                    120, 0, LayerAlign.CENTER_LEFT)));
                    outer.addSection("Aside", cell -> cell
                            .addParagraph(p -> p.name("AsideText").text("ASIDE")));
                }));

        // The flattening: the pair is carried by the outer row's own columns, so
        // nothing is nested at all. If this is the only one that works, a
        // two-column page has to be expressed as one wide row per band.
        Map<String, Object> flattened = attempt("flattened-outer-columns", page -> page
                .addRow("OuterRow", outer -> {
                    outer.weights(0.3, 0.3, 0.4);
                    outer.addParagraph(p -> p.name("Left").text("LEFT"));
                    outer.addParagraph(p -> p.name("Right").text("RIGHT"));
                    outer.addParagraph(p -> p.name("AsideText").text("ASIDE"));
                }));

        // The icon-beside-heading case: an inline run needs no container at all,
        // so if it measures into the line inside a row cell it is the cheapest
        // answer of the four.
        Map<String, Object> inlineShape = attempt("inline-shape-in-row-cell", page -> page
                .addRow("OuterRow", outer -> {
                    outer.weights(0.6, 0.4);
                    outer.addSection("MainColumn", cell -> cell.addParagraph(p -> p
                            .name("Left")
                            .dot(10, DocumentColor.rgb(15, 112, 120))
                            .inlineText("  HEADING")));
                    outer.addSection("Aside", cell -> cell
                            .addParagraph(p -> p.name("Right").text("ASIDE")));
                }));

        Map<String, Object> result = Json.object();
        result.put("tableInRowCell", table);
        result.put("shapeContainerInRowCell", container);
        result.put("flattenedOuterColumns", flattened);
        result.put("inlineShapeInRowCell", inlineShape);

        result.put("tableBuilds", table.get("built"));
        result.put("tableFillsCell", table.get("fillsCell"));
        result.put("containerBuilds", container.get("built"));
        result.put("containerHorizontal", container.get("sideBySide"));
        result.put("flattenedHorizontal", flattened.get("sideBySide"));
        result.put("inlineShapeBuilds", inlineShape.get("built"));

        result.put("finding", describe(table, container, flattened, inlineShape));
        return result;
    }

    private static String describe(Map<String, Object> table,
                                   Map<String, Object> container,
                                   Map<String, Object> flattened,
                                   Map<String, Object> inlineShape) {
        return tableVerdict(table)
                + ' ' + verdict("A shape container placing two children with anchors", container)
                + ' ' + verdict("Flattened outer columns", flattened)
                + ' ' + (Boolean.TRUE.equals(inlineShape.get("built"))
                        ? "An inline shape run inside a row cell builds."
                        : "An inline shape run inside a row cell FAILS: " + inlineShape.get("error"));
    }

    private static String tableVerdict(Map<String, Object> table) {
        if (!Boolean.TRUE.equals(table.get("built"))) {
            return "A table in a row cell does not build: " + table.get("error") + '.';
        }
        return Boolean.TRUE.equals(table.get("fillsCell"))
                ? "A table in a row cell builds and spans its cell, so its columns laid out "
                        + "(its cell children are not named snapshot entities, so they cannot be "
                        + "measured individually)."
                : "A table in a row cell builds but collapsed to " + table.get("tableWidth")
                        + " pt inside a " + table.get("cellWidth") + " pt cell.";
    }

    /**
     * The table arm. Measures the table's own box against the cell that holds
     * it, because the side-by-side test cannot see a table's cell children.
     */
    private static Map<String, Object> measureTable(String label) {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "row-cell-contents-" + label + ".pdf");
        double[] box = new double[]{-1, -1};

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page -> {
                page.name("RowCellContentsProbe").spacing(20);
                page.addRow("OuterRow", outer -> {
                    outer.weights(0.6, 0.4);
                    outer.addSection("MainColumn", cell -> cell.addTable(t -> t
                            .name("Priced")
                            .columns(DocumentTableColumn.auto(), DocumentTableColumn.auto())
                            .rowCells(
                                    DocumentTableCell.text("LEFT"),
                                    DocumentTableCell.text("RIGHT"))));
                    outer.addSection("Aside", cell -> cell
                            .addParagraph(p -> p.name("AsideText").text("ASIDE")));
                });
            });
            session.layoutSnapshot().nodes().forEach(n -> {
                if ("Priced".equals(n.entityName())) box[0] = n.placementWidth();
                if ("MainColumn".equals(n.entityName())) box[1] = n.placementWidth();
            });
            out.put("built", true);
        } catch (RuntimeException failure) {
            out.put("built", false);
            out.put("error", failure.getMessage());
            return out;
        }

        out.put("tableWidth", Json.pt(box[0]));
        out.put("cellWidth", Json.pt(box[1]));
        // "Spans its cell" is the observable consequence of the columns having
        // been laid out at all; a collapsed table would be narrower.
        out.put("fillsCell", box[0] > 0 && box[1] > 0 && Math.abs(box[0] - box[1]) < 1.0);
        return out;
    }

    private static String verdict(String label, Map<String, Object> attempt) {
        if (!Boolean.TRUE.equals(attempt.get("built"))) {
            return label + " does not build: " + attempt.get("error");
        }
        return Boolean.TRUE.equals(attempt.get("sideBySide"))
                ? label + " lays out horizontally."
                : label + " builds but its two children are NOT side by side.";
    }

    /** One arrangement, one document; what happened rather than a throw. */
    private static Map<String, Object> attempt(String label, Consumer<PageFlowBuilder> arrangement) {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "row-cell-contents-" + label + ".pdf");
        Map<String, double[]> nodes = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page -> {
                page.name("RowCellContentsProbe").spacing(20);
                arrangement.accept(page);
            });
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

        List<Object> rows = Json.array();
        for (Map.Entry<String, double[]> entry : nodes.entrySet()) {
            Map<String, Object> row = Json.object();
            row.put("node", entry.getKey());
            row.put("x", Json.pt(entry.getValue()[0]));
            row.put("y", Json.pt(entry.getValue()[1]));
            rows.add(row);
        }
        out.put("children", rows);

        double[] left = nodes.get("Left");
        double[] right = nodes.get("Right");
        out.put("sideBySide", left != null && right != null
                && Math.abs(left[0] - right[0]) > 0.5
                && Math.abs(left[1] - right[1]) < 0.5);
        return out;
    }
}
