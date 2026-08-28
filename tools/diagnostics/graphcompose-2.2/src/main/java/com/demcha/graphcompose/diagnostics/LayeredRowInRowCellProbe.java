package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.style.DocumentInsets;

/**
 * A row cannot nest in a row cell, and {@code row-nesting} says the way around
 * it is a LayerStack layer. But {@code row-nesting} measures that layer in a
 * plain flow, and a two-column page never has one: every column is a row cell,
 * so the real arrangement is a LayerStack <em>inside a row cell</em> whose
 * layer holds the row. That combination is the one no probe covers, and it is
 * the one every two-column template is built out of.
 *
 * <p>The Oliver Bennett CV renders four such rows from one helper. Two lay out
 * horizontally and two stack their cells vertically, so the arrangement is
 * neither reliably broken nor reliably fine, and the difference has to be some
 * property of the individual row. This probe varies the properties that differ
 * between the working and the collapsing ones, one at a time, against a common
 * control:</p>
 *
 * <ul>
 *   <li>cell kind — two paragraphs versus two sections,</li>
 *   <li>cell count — two cells versus three,</li>
 *   <li>a bottom margin on the LayerStack, which the collapsing rows carry
 *       (17-39 pt) and the working ones do not (0-1.5 pt),</li>
 *   <li>more weights declared than cells added, which one row in that template
 *       does by mistake.</li>
 * </ul>
 *
 * <p>Each arrangement is its own document: a layout that refuses takes the
 * session with it and would hide every arrangement after it.</p>
 */
final class LayeredRowInRowCellProbe implements Probes.Probe {

    @Override
    public String question() {
        return "Inside a row cell, does a row wrapped in a LayerStack layer lay out horizontally, "
                + "and which of cell kind, cell count, LayerStack margin or a weights/cells "
                + "mismatch stops it?";
    }

    @Override
    public Map<String, Object> run() {
        // Control: the plain-flow arrangement row-nesting already reports as
        // horizontal, repeated here so a change in the library shows up as the
        // control failing rather than as a mystery in the variants.
        Map<String, Object> plainFlowLayer = attempt(page -> {
            page.addLayerStack(stack -> stack
                    .name("Stack")
                    .layer(layerHolding(row -> {
                        row.weights(0.5, 0.5);
                        row.addParagraph(p -> p.name("Left").text("LEFT"));
                        row.addParagraph(p -> p.name("Right").text("RIGHT"));
                    }), LayerAlign.TOP_LEFT, 0));
        });

        Map<String, Object> paragraphCells = inRowCell(0.0, row -> {
            row.weights(0.5, 0.5);
            row.addParagraph(p -> p.name("Left").text("LEFT"));
            row.addParagraph(p -> p.name("Right").text("RIGHT"));
        });

        Map<String, Object> sectionCells = inRowCell(0.0, row -> {
            row.weights(0.5, 0.5);
            row.addSection("LeftCell", cell -> cell
                    .addParagraph(p -> p.name("Left").text("LEFT")));
            row.addSection("RightCell", cell -> cell
                    .addParagraph(p -> p.name("Right").text("RIGHT")));
        });

        Map<String, Object> threeCells = inRowCell(0.0, row -> {
            row.weights(0.2, 0.3, 0.5);
            row.addParagraph(p -> p.name("Left").text("LEFT"));
            row.addParagraph(p -> p.name("Middle").text("MIDDLE"));
            row.addParagraph(p -> p.name("Right").text("RIGHT"));
        });

        // The same two-paragraph row as `paragraphCells`, differing only in the
        // bottom margin on the LayerStack.
        Map<String, Object> marginOnStack = inRowCell(24.0, row -> {
            row.weights(0.5, 0.5);
            row.addParagraph(p -> p.name("Left").text("LEFT"));
            row.addParagraph(p -> p.name("Right").text("RIGHT"));
        });

        // The template does not put its LayerStack straight into the column
        // cell: the column holds a named section per document section, and the
        // stack goes in there. One extra level of section.
        Map<String, Object> nestedOneSectionDeeper = inRowCellNested(row -> {
            row.weights(0.5, 0.5);
            row.addSection("LeftCell", cell -> cell
                    .addParagraph(p -> p.name("Left").text("LEFT")));
            row.addSection("RightCell", cell -> cell
                    .addParagraph(p -> p.name("Right").text("RIGHT")));
        });

        // Same again, with the cell decorations the template puts on its cells.
        Map<String, Object> nestedWithDecoratedCells = inRowCellNested(row -> {
            row.weights(0.5, 0.5);
            row.addSection("LeftCell", cell -> {
                cell.spacing(0);
                cell.padding(2f, 0f, 0f, 0f);
                cell.addParagraph(p -> p.name("Left").text("LEFT"));
            });
            row.addSection("RightCell", cell -> {
                cell.spacing(0);
                cell.accentLeft(com.demcha.compose.document.style.DocumentColor.rgb(200, 200, 200), 0.6);
                cell.padding(0f, 0f, 0f, 10f);
                cell.addParagraph(p -> p.name("Right").text("RIGHT"));
            });
        });

        // The same two-cell row, differing from `paragraphCells` only in how much
        // text the cells hold. If weights were being applied, the widths would be
        // half the cell each and the text would wrap inside them; if they are not,
        // each cell takes its natural width and the two no longer fit side by side.
        String longText = "Mixed-use development delivering 142 homes, retail space and public "
                + "realm improvements; secured planning consent and is now on site.";
        Map<String, Object> longTextCells = inRowCell(0.0, row -> {
            row.weights(0.5, 0.5);
            row.addParagraph(p -> p.name("Left").text("LEFT"));
            row.addParagraph(p -> p.name("Right").text(longText));
        });

        Map<String, Object> moreWeightsThanCells = inRowCell(0.0, row -> {
            row.weights(0.2, 0.3, 0.5);
            row.addParagraph(p -> p.name("Left").text("LEFT"));
            row.addParagraph(p -> p.name("Right").text("RIGHT"));
        });

        Map<String, Object> result = Json.object();
        result.put("plainFlowLayer", plainFlowLayer);
        result.put("paragraphCells", paragraphCells);
        result.put("sectionCells", sectionCells);
        result.put("threeCells", threeCells);
        result.put("marginOnStack", marginOnStack);
        result.put("nestedOneSectionDeeper", nestedOneSectionDeeper);
        result.put("nestedWithDecoratedCells", nestedWithDecoratedCells);
        result.put("longTextCells", longTextCells);
        result.put("moreWeightsThanCells", moreWeightsThanCells);

        result.put("horizontalInPlainFlowLayer", plainFlowLayer.get("sideBySide"));
        result.put("horizontalWithParagraphCells", paragraphCells.get("sideBySide"));
        result.put("horizontalWithSectionCells", sectionCells.get("sideBySide"));
        result.put("horizontalWithThreeCells", threeCells.get("sideBySide"));
        result.put("horizontalWithMarginOnStack", marginOnStack.get("sideBySide"));
        result.put("horizontalOneSectionDeeper", nestedOneSectionDeeper.get("sideBySide"));
        result.put("horizontalWithDecoratedCells", nestedWithDecoratedCells.get("sideBySide"));
        result.put("horizontalWithLongTextCells", longTextCells.get("sideBySide"));
        result.put("horizontalWithMoreWeightsThanCells", moreWeightsThanCells.get("sideBySide"));

        result.put("finding", describe(plainFlowLayer, paragraphCells, sectionCells,
                threeCells, marginOnStack, nestedOneSectionDeeper, nestedWithDecoratedCells,
                longTextCells, moreWeightsThanCells));
        return result;
    }

    private static String describe(Map<String, Object> plainFlowLayer,
                                   Map<String, Object> paragraphCells,
                                   Map<String, Object> sectionCells,
                                   Map<String, Object> threeCells,
                                   Map<String, Object> marginOnStack,
                                   Map<String, Object> nestedOneSectionDeeper,
                                   Map<String, Object> nestedWithDecoratedCells,
                                   Map<String, Object> longTextCells,
                                   Map<String, Object> moreWeightsThanCells) {
        if (!horizontal(plainFlowLayer)) {
            return "inconclusive: the control — a layered row in a PLAIN flow — did not lay out "
                    + "horizontally, so this build disagrees with row-nesting and the variants "
                    + "below say nothing about a row cell in particular.";
        }
        if (!horizontal(paragraphCells)) {
            return "A layered row inside a row cell does NOT lay out horizontally even in its "
                    + "simplest form (two paragraph cells, no margin), while the same layer in a "
                    + "plain flow does. The row cell is the cause on its own; nothing further "
                    + "down the list is needed to explain a collapse.";
        }

        StringBuilder culprits = new StringBuilder();
        appendIfCollapsed(culprits, sectionCells, "section cells instead of paragraph cells");
        appendIfCollapsed(culprits, threeCells, "a third cell");
        appendIfCollapsed(culprits, marginOnStack, "a bottom margin on the LayerStack");
        appendIfCollapsed(culprits, nestedOneSectionDeeper,
                "the LayerStack sitting one section deeper than the row cell itself");
        appendIfCollapsed(culprits, nestedWithDecoratedCells,
                "cells carrying spacing/padding/accent decoration");
        appendIfCollapsed(culprits, longTextCells,
                "cell content whose NATURAL widths do not fit the row (weights not applied)");
        appendIfCollapsed(culprits, moreWeightsThanCells, "declaring more weights than cells added");

        if (culprits.isEmpty()) {
            return "A layered row lays out horizontally inside a row cell in every arrangement "
                    + "tried — paragraph cells, section cells, three cells, a 24 pt bottom margin "
                    + "on the stack, and more weights than cells. Whatever collapses such a row in "
                    + "a real template is not one of these, so look outside the row itself.";
        }
        return "A layered row lays out horizontally inside a row cell in its simplest form, but "
                + "stops doing so with " + culprits + ".";
    }

    private static void appendIfCollapsed(StringBuilder out, Map<String, Object> attempt, String label) {
        if (horizontal(attempt)) {
            return;
        }
        if (!out.isEmpty()) {
            out.append("; and with ");
        }
        out.append(label);
        if (!Boolean.TRUE.equals(attempt.get("built"))) {
            out.append(" (which does not even build: ").append(attempt.get("error")).append(")");
        }
    }

    private static boolean horizontal(Map<String, Object> attempt) {
        return Boolean.TRUE.equals(attempt.get("sideBySide"));
    }

    /** A section holding one row, which is what a LayerStack layer takes. */
    private static com.demcha.compose.document.node.DocumentNode layerHolding(
            Consumer<com.demcha.compose.document.dsl.RowBuilder> spec) {
        SectionBuilder layer = new SectionBuilder();
        layer.name("Layer");
        layer.spacing(0);
        layer.addRow("LayerRow", spec);
        return layer.build();
    }

    /**
     * The arrangement every two-column template actually builds: an outer row
     * whose main column is a section, and inside that section a LayerStack
     * whose single layer holds the inner row.
     */
    private static Map<String, Object> inRowCell(double stackMarginBottom,
                                                 Consumer<com.demcha.compose.document.dsl.RowBuilder> spec) {
        return attempt(page -> page.addRow("OuterRow", outer -> {
            outer.weights(0.3, 0.7);
            outer.addSection("Sidebar", cell -> cell
                    .addParagraph(p -> p.name("SidebarText").text("SIDEBAR")));
            outer.addSection("MainColumn", cell -> cell.addLayerStack(stack -> stack
                    .name("Stack")
                    .margin(new DocumentInsets(0, 0, stackMarginBottom, 0))
                    .layer(layerHolding(spec), LayerAlign.TOP_LEFT, 0)));
        }));
    }

    /**
     * The column cell holds a section, and the LayerStack goes inside THAT —
     * which is what a template with named document sections per region builds,
     * and one level deeper than {@link #inRowCell}.
     */
    private static Map<String, Object> inRowCellNested(
            Consumer<com.demcha.compose.document.dsl.RowBuilder> spec) {
        return attempt(page -> page.addRow("OuterRow", outer -> {
            outer.weights(0.3, 0.7);
            outer.addSection("Sidebar", cell -> cell
                    .addParagraph(p -> p.name("SidebarText").text("SIDEBAR")));
            outer.addSection("MainColumn", cell -> {
                cell.spacing(0);
                cell.addSection("Block", block -> {
                    block.spacing(0);
                    block.addLayerStack(stack -> stack
                            .name("Stack")
                            .layer(layerHolding(spec), LayerAlign.TOP_LEFT, 0));
                });
            });
        }));
    }

    /**
     * One arrangement, one document. Reports where the named children landed
     * rather than throwing, so a refusal is an answer like any other.
     */
    private static Map<String, Object> attempt(Consumer<com.demcha.compose.document.dsl.PageFlowBuilder> arrangement) {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"),
                "layered-row-in-row-cell-" + System.nanoTime() + ".pdf");
        Map<String, double[]> nodes = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page -> {
                page.name("LayeredRowProbe").spacing(20);
                arrangement.accept(page);
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> "Left".equals(n.entityName())
                            || "Middle".equals(n.entityName())
                            || "Right".equals(n.entityName()))
                    .forEach(n -> nodes.put(n.entityName(),
                            new double[]{n.computedX(), n.computedY(), n.placementWidth()}));
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
            row.put("width", Json.pt(entry.getValue()[2]));
            rows.add(row);
        }
        out.put("children", rows);

        // Side by side means the cells sit at DIFFERENT x. It deliberately does
        // not require a shared y: computedY is the box's bottom in PDF
        // coordinates, so two cells of different height share a top and differ
        // here by exactly that difference, and a cell with top padding differs
        // by the padding. An earlier version of this probe required equal y and
        // reported a correctly laid-out row as collapsed for both reasons.
        double[] left = nodes.get("Left");
        double[] right = nodes.get("Right");
        out.put("sideBySide", left != null && right != null
                && Math.abs(left[0] - right[0]) > 0.5);
        return out;
    }
}
