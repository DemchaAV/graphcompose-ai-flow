package com.demcha.graphcompose.diagnostics;

import java.awt.image.BufferedImage;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Function;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.CanvasLayerBuilder;
import com.demcha.compose.document.dsl.LayerStackBuilder;
import com.demcha.compose.document.dsl.ListBuilder;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.dsl.ShapeContainerBuilder;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.table.DocumentTableCell;

/**
 * Does a node's child content survive being put in a table cell?
 *
 * <p>{@code DocumentTableCell.node(...)} accepts any {@code DocumentNode}, so
 * the signature promises every kind works. The failure this probe exists to
 * settle is the one that cannot be seen in a structure dump: a composite that
 * reserves the cell's height and then draws none, or only part, of its
 * children.</p>
 *
 * <p>The measurement has to be ink. Cell content does not appear in
 * {@code layoutSnapshot()} by name at all — the table lays cells out through a
 * path the snapshot does not descend into — so "is it in the tree" answers
 * nothing here.</p>
 *
 * <p>Counting the ink of a whole arrangement is not enough either, because a
 * composite draws chrome of its own: a shape container's rectangle would score
 * as "content" while its child text was missing. So each kind is built twice,
 * once with leaf text and once with none, and rendered in both placements.
 * Subtracting gives the leaf's own ink in plain flow and in a cell, and their
 * ratio is the finding — full, partial, or gone.</p>
 */
final class TableCellNodeProbe implements Probes.Probe {

    private static final double PAGE_W = 300.0;
    private static final double PAGE_H = 200.0;
    private static final float DPI = 72f;
    private static final String LEAF = "LEAF LEAF LEAF";
    /** Below this, a difference is antialiasing rather than a glyph. */
    private static final int NOISE = 12;
    /** The leaf counts as fully drawn above this share of its plain-flow ink. */
    private static final double FULL = 0.75;

    /** Builds a node that either carries the leaf text or does not. */
    private interface Arrangement extends Function<Boolean, DocumentNode> {
    }

    @Override
    public String question() {
        return "Which DocumentNode kinds draw their child content when placed in a table cell "
                + "with DocumentTableCell.node(...), and which lose some or all of it?";
    }

    @Override
    public Map<String, Object> run() throws Exception {
        Map<String, Arrangement> kinds = new LinkedHashMap<>();

        kinds.put("ParagraphNode", withLeaf -> paragraph(withLeaf ? LEAF : ""));
        kinds.put("ListNode", withLeaf -> {
            ListBuilder list = new ListBuilder();
            list.name("ProbeList");
            list.addItem(withLeaf ? LEAF : "");
            return list.build();
        });
        kinds.put("TableNode", withLeaf -> new TableBuilder()
                .name("ProbeNestedTable")
                .autoColumns(1)
                .row(withLeaf ? LEAF : "")
                .build());
        kinds.put("SectionNode", withLeaf -> {
            SectionBuilder section = new SectionBuilder();
            section.name("ProbeSection");
            section.addParagraph(p -> p.name("SectionLeaf").text(withLeaf ? LEAF : ""));
            return section.build();
        });
        kinds.put("RowNode", withLeaf -> {
            RowBuilder row = new RowBuilder();
            row.name("ProbeRow");
            row.weights(1.0);
            row.addParagraph(p -> p.name("RowLeaf").text(withLeaf ? LEAF : ""));
            return row.build();
        });
        kinds.put("LayerStackNode", withLeaf -> {
            LayerStackBuilder stack = new LayerStackBuilder();
            stack.name("ProbeStack");
            stack.layer(paragraph(withLeaf ? LEAF : ""), LayerAlign.TOP_LEFT, 0);
            return stack.build();
        });
        kinds.put("ShapeContainerNode", withLeaf -> {
            ShapeContainerBuilder container = new ShapeContainerBuilder();
            container.name("ProbeContainer");
            container.rectangle(160, 30);
            container.layer(paragraph(withLeaf ? LEAF : ""), LayerAlign.CENTER, 0);
            return container.build();
        });
        kinds.put("CanvasLayerNode", withLeaf -> {
            CanvasLayerBuilder canvas = new CanvasLayerBuilder(160, 40);
            canvas.name("ProbeCanvas");
            canvas.position(paragraph(withLeaf ? LEAF : ""), 0, 0);
            return canvas.build();
        });

        List<Object> rows = Json.array();
        List<String> intact = new java.util.ArrayList<>();
        List<String> partial = new java.util.ArrayList<>();
        List<String> lost = new java.util.ArrayList<>();
        List<String> inconclusive = new java.util.ArrayList<>();

        for (Map.Entry<String, Arrangement> entry : kinds.entrySet()) {
            String kind = entry.getKey();
            Arrangement build = entry.getValue();
            Map<String, Object> row = Json.object();
            row.put("nodeKind", kind);

            Integer flowWith = ink(row, "flowWith", () -> render(page -> page.add(build.apply(true))));
            Integer flowWithout = ink(row, "flowWithout", () -> render(page -> page.add(build.apply(false))));
            Integer cellWith = ink(row, "cellWith", () -> render(page -> cell(page, build.apply(true))));
            Integer cellWithout = ink(row, "cellWithout", () -> render(page -> cell(page, build.apply(false))));

            if (flowWith == null || flowWithout == null || cellWith == null || cellWithout == null) {
                row.put("verdict", "inconclusive: an arrangement was refused");
                inconclusive.add(kind);
                rows.add(row);
                continue;
            }

            int leafInFlow = flowWith - flowWithout;
            int leafInCell = cellWith - cellWithout;
            row.put("leafInkInFlow", leafInFlow);
            row.put("leafInkInCell", leafInCell);

            if (leafInFlow <= NOISE) {
                row.put("verdict", "inconclusive: the leaf draws nothing even in plain flow");
                inconclusive.add(kind);
            } else {
                double share = (double) leafInCell / leafInFlow;
                row.put("shareOfLeafDrawnInCell", Json.pt(share));
                if (leafInCell <= NOISE) {
                    row.put("verdict", "content lost: the cell reserves space and draws no child content");
                    lost.add(kind);
                } else if (share < FULL) {
                    row.put("verdict", "content only partly drawn in the cell");
                    partial.add(kind);
                } else {
                    row.put("verdict", "content drawn in full");
                    intact.add(kind);
                }
            }
            rows.add(row);
        }

        Map<String, Object> result = Json.object();
        result.put("arrangement",
                "Per node kind, four renders: the node with and without leaf text, each in plain "
                        + "page flow and in a one-cell table, rasterised at " + (int) DPI
                        + " dpi with dark pixels counted. Subtracting the without-leaf render removes "
                        + "the node's own chrome, leaving the leaf's ink alone.");
        result.put("noiseFloor", NOISE);
        result.put("fullThreshold", FULL);
        result.put("measurements", rows);
        result.put("contentDrawnInFull", intact);
        result.put("contentPartiallyDrawn", partial);
        result.put("contentLost", lost);
        result.put("inconclusive", inconclusive);

        StringBuilder finding = new StringBuilder();
        if (lost.isEmpty() && partial.isEmpty()) {
            finding.append("Every node kind measured drew its child content in full inside a table cell.");
        } else {
            if (!lost.isEmpty()) {
                finding.append("Child content is lost entirely in a cell for: ")
                        .append(String.join(", ", lost)).append(". ");
            }
            if (!partial.isEmpty()) {
                finding.append("Child content is only partly drawn in a cell for: ")
                        .append(String.join(", ", partial)).append(". ");
            }
            finding.append("Drawn in full: ").append(String.join(", ", intact)).append(".");
        }
        result.put("finding", finding.toString());
        return result;
    }

    private static void cell(PageFlowBuilder page, DocumentNode content) {
        page.addTable(table -> table
                .name("ProbeTable")
                .autoColumns(1)
                .rowCells(DocumentTableCell.node(content)));
    }

    private static Integer ink(Map<String, Object> row, String key, InkMeasurement measurement) {
        try {
            int value = measurement.measure();
            row.put(key + "Ink", value);
            return value;
        } catch (Exception | Error refusal) {
            // A refusal is a different answer from an empty render, and saying so
            // is what stops the next run looking in the wrong place.
            row.put(key + "Refused", String.valueOf(refusal.getMessage()));
            return null;
        }
    }

    private interface InkMeasurement {
        int measure() throws Exception;
    }

    private static DocumentNode paragraph(String text) {
        ParagraphBuilder p = new ParagraphBuilder();
        p.name("ProbeParagraph");
        p.text(text);
        return p.build();
    }

    /** Render one arrangement in memory and count the pixels that are not page white. */
    private static int render(Consumer<PageFlowBuilder> body) throws Exception {
        // writePdf(OutputStream) keeps the whole measurement in memory: no temp
        // file to create, collide on, or leave behind when a probe throws.
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (DocumentSession session = GraphCompose.document().create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.of(10));
            session.pageFlow(page -> {
                page.name("TableCellNodeProbe").padding(DocumentInsets.zero());
                body.accept(page);
            });
            session.writePdf(bytes);
        }
        try (PDDocument pdf = Loader.loadPDF(bytes.toByteArray())) {
            BufferedImage image = new PDFRenderer(pdf).renderImageWithDPI(0, DPI);
            int ink = 0;
            for (int y = 0; y < image.getHeight(); y += 1) {
                for (int x = 0; x < image.getWidth(); x += 1) {
                    int rgb = image.getRGB(x, y);
                    int r = (rgb >> 16) & 0xff;
                    int g = (rgb >> 8) & 0xff;
                    int b = rgb & 0xff;
                    if (r + g + b < 720) {
                        ink += 1;
                    }
                }
            }
            return ink;
        }
    }
}
