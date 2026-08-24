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
import com.demcha.compose.document.node.LayerAlign;

/**
 * Which horizontal arrangements actually lay out horizontally, and where?
 *
 * <p>A two-column page is a row, so anything in the main column lives in a row
 * cell. Whether a row survives there is the difference between "this primitive
 * is wrong for the job" and "the page structure is wrong", and it is worth
 * knowing before the template is written.</p>
 *
 * <p>Each arrangement gets its own document, because a layout that refuses
 * takes the whole session with it and would otherwise hide the results of the
 * arrangements after it. A refusal is an answer and is reported as one —
 * GraphCompose's own message usually names the way around it.</p>
 */
final class RowNestingProbe implements Probes.Probe {

    @Override
    public String question() {
        return "Does a row lay out horizontally in a plain flow, inside a LayerStack layer, "
                + "and inside another row's cell?";
    }

    @Override
    public Map<String, Object> run() {
        Map<String, Object> plain = attempt("plain-flow", page -> page
                .addRow("PlainRow", row -> {
                    row.spacing(4);
                    row.weights(0.5, 0.5);
                    row.addParagraph(p -> p.name("Left").text("LEFT"));
                    row.addParagraph(p -> p.name("Right").text("RIGHT"));
                }));

        Map<String, Object> inLayer = attempt("layer-stack", page -> {
            SectionBuilder layer = new SectionBuilder();
            layer.name("InLayer");
            layer.addRow("LayerRow", row -> {
                row.spacing(4);
                row.weights(0.5, 0.5);
                row.addParagraph(p -> p.name("Left").text("LEFT"));
                row.addParagraph(p -> p.name("Right").text("RIGHT"));
            });
            page.addLayerStack(stack -> stack
                    .name("Stack")
                    .layer(layer.build(), LayerAlign.TOP_LEFT, 0));
        });

        Map<String, Object> inCell = attempt("row-cell", page -> page
                .addRow("OuterRow", outer -> {
                    outer.weights(0.3, 0.7);
                    outer.addSection("Sidebar", cell -> cell
                            .addParagraph(p -> p.name("SidebarText").text("SIDEBAR")));
                    outer.addSection("MainColumn", cell -> cell.addRow("InnerRow", inner -> {
                        inner.spacing(4);
                        inner.weights(0.5, 0.5);
                        inner.addParagraph(p -> p.name("Left").text("LEFT"));
                        inner.addParagraph(p -> p.name("Right").text("RIGHT"));
                    }));
                }));

        Map<String, Object> result = Json.object();
        result.put("plainFlow", plain);
        result.put("insideLayerStack", inLayer);
        result.put("insideRowCell", inCell);

        // Unambiguous top-level answers. `sideBySide` appears once per
        // arrangement, so an observation recording it by name alone could not
        // say which arrangement it meant.
        result.put("horizontalInPlainFlow", plain.get("sideBySide"));
        result.put("horizontalInLayerStack", inLayer.get("sideBySide"));
        result.put("horizontalInRowCell", inCell.get("sideBySide"));
        result.put("builtInRowCell", inCell.get("built"));

        result.put("finding", describe(plain, inLayer, inCell));
        return result;
    }

    private static String describe(Map<String, Object> plain,
                                   Map<String, Object> inLayer,
                                   Map<String, Object> inCell) {
        if (!Boolean.TRUE.equals(plain.get("sideBySide"))) {
            return "inconclusive: even a plain row did not lay out horizontally, so the probe's "
                    + "own arrangement is wrong for this build.";
        }
        if (Boolean.TRUE.equals(inCell.get("sideBySide"))) {
            return "A row nests inside a row cell on this build and still lays out horizontally.";
        }

        String refusal = inCell.get("error") == null
                ? "it built but its children did not end up side by side"
                : String.valueOf(inCell.get("error"));
        String layerVerdict = Boolean.TRUE.equals(inLayer.get("sideBySide"))
                ? "A row inside a LayerStack layer does lay out horizontally, which is the way around it."
                : Boolean.TRUE.equals(inLayer.get("built"))
                        ? "A row inside a LayerStack layer builds but does NOT lay out horizontally, so that "
                                + "route does not help either."
                        : "A row inside a LayerStack layer also fails.";

        return "A row cannot be nested in a row cell: " + refusal + " " + layerVerdict;
    }

    /**
     * One arrangement, one document. Returns what happened rather than throwing:
     * whether it built, where the two children landed, and whether they ended up
     * side by side.
     */
    private static Map<String, Object> attempt(String label, Consumer<PageFlowBuilder> arrangement) {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "row-nesting-" + label + ".pdf");
        Map<String, double[]> nodes = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page -> {
                page.name("RowNestingProbe").spacing(20);
                arrangement.accept(page);
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> "Left".equals(n.entityName()) || "Right".equals(n.entityName()))
                    .forEach(n -> nodes.put(n.entityName(),
                            new double[]{n.computedX(), n.computedY()}));
            out.put("built", true);
        } catch (RuntimeException failure) {
            out.put("built", false);
            // The library's own message is the most useful thing here: it tends
            // to name the supported alternative.
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

        // Side by side means differing in x and sharing a y.
        double[] left = nodes.get("Left");
        double[] right = nodes.get("Right");
        out.put("sideBySide", left != null && right != null
                && Math.abs(left[0] - right[0]) > 0.5
                && Math.abs(left[1] - right[1]) < 0.5);
        return out;
    }
}
