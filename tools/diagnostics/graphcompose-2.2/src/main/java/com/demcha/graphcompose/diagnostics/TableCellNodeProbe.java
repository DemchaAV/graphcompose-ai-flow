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
 * once with leaf text and once with none, and rendered in every placement.
 * Subtracting gives the leaf's own ink in plain flow and in a cell, and their
 * ratio is the finding — full, partial, or gone.</p>
 *
 * <p>There are two cell placements, not one, and the difference between them is
 * the whole point of the second. The original arm puts the table at page level.
 * That is the arrangement 2.2.1's fix was measured against, and it is not where
 * a sidebar page puts a table: there the table sits in a cell of a two-column
 * row. A run on 2.2.1-SNAPSHOT reported a composite drawing its box and none of
 * its children in exactly that placement while this probe reported the opposite,
 * because this probe was not measuring it. The nested arm closes that gap, and
 * reports into {@code nested*} keys of its own so the page-level keys keep the
 * meaning the retired observation recorded against them.</p>
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
                + "with DocumentTableCell.node(...), and which lose some or all of it — with the "
                + "table at page level, and with the same table nested in a row cell?";
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
        // The depth axis, which every other entry here misses. Each arrangement
        // above wraps ONE LEAF: a section holding a paragraph, a row holding a
        // paragraph. A run reported a cell losing a section whose own children
        // were composite — a row and a table — and pointed out that this probe's
        // clean result actively misleads, because "SectionNode draws in full"
        // was measured on a section one level shallower than the one that
        // failed. So: a section holding a row holding the leaf, and a section
        // holding both a row and a table.
        kinds.put("SectionNode(Row(leaf))", withLeaf -> {
            RowBuilder inner = new RowBuilder();
            inner.name("DeepRow");
            inner.weights(1.0);
            inner.addParagraph(p -> p.name("DeepRowLeaf").text(withLeaf ? LEAF : ""));
            SectionBuilder section = new SectionBuilder();
            section.name("DeepSection");
            section.add(inner.build());
            return section.build();
        });
        kinds.put("SectionNode(Row+Table)", withLeaf -> {
            RowBuilder inner = new RowBuilder();
            inner.name("DeepRow2");
            inner.weights(1.0);
            inner.addParagraph(p -> p.name("DeepRowLeaf2").text(withLeaf ? LEAF : ""));
            SectionBuilder section = new SectionBuilder();
            section.name("DeepSection2");
            section.add(inner.build());
            section.add(new TableBuilder()
                    .name("DeepNestedTable")
                    .autoColumns(1)
                    .row(withLeaf ? LEAF : "")
                    .build());
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
        // The nested placement is scored into its own lists so the page-level
        // keys keep the exact meaning the retired observation recorded against.
        List<String> nestedIntact = new java.util.ArrayList<>();
        List<String> nestedPartial = new java.util.ArrayList<>();
        List<String> nestedLost = new java.util.ArrayList<>();
        List<String> nestedInconclusive = new java.util.ArrayList<>();
        // The depth arrangements report into lists of their own, for the same
        // reason the nested placement does: `contentLost` and its siblings are
        // keys an existing record was written against, and a probe that learns
        // to measure MORE must not make that read as the library changing. The
        // first draft of these arms put them in the flat lists and flipped a
        // filed verdict from `held` to `changed` on a build where nothing had
        // moved at all.
        java.util.Set<String> deepKinds = java.util.Set.of(
                "SectionNode(Row(leaf))", "SectionNode(Row+Table)");
        List<String> deepIntact = new java.util.ArrayList<>();
        List<String> deepPartial = new java.util.ArrayList<>();
        List<String> deepLost = new java.util.ArrayList<>();

        for (Map.Entry<String, Arrangement> entry : kinds.entrySet()) {
            String kind = entry.getKey();
            Arrangement build = entry.getValue();
            Map<String, Object> row = Json.object();
            row.put("nodeKind", kind);

            Integer flowWith = ink(row, "flowWith", () -> render(page -> page.add(build.apply(true))));
            Integer flowWithout = ink(row, "flowWithout", () -> render(page -> page.add(build.apply(false))));
            Integer cellWith = ink(row, "cellWith", () -> render(page -> cell(page, build.apply(true))));
            Integer cellWithout = ink(row, "cellWithout", () -> render(page -> cell(page, build.apply(false))));
            Integer nestedWith = ink(row, "nestedWith", () -> render(page -> nestedCell(page, build.apply(true))));
            Integer nestedWithout = ink(row, "nestedWithout", () -> render(page -> nestedCell(page, build.apply(false))));

            if (flowWith == null || flowWithout == null || cellWith == null || cellWithout == null) {
                row.put("verdict", "inconclusive: an arrangement was refused");
                inconclusive.add(kind);
                row.put("nestedVerdict", "inconclusive: the page-level arrangement was refused first");
                nestedInconclusive.add(kind);
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
                boolean deep = deepKinds.contains(kind);
                if (leafInCell <= NOISE) {
                    row.put("verdict", "content lost: the cell reserves space and draws no child content");
                    (deep ? deepLost : lost).add(kind);
                } else if (share < FULL) {
                    row.put("verdict", "content only partly drawn in the cell");
                    (deep ? deepPartial : partial).add(kind);
                } else {
                    row.put("verdict", "content drawn in full");
                    (deep ? deepIntact : intact).add(kind);
                }
            }

            // The same leaf, one level deeper. Scored against its ink in plain
            // flow, exactly as the page-level arm is, so the two verdicts are
            // comparable and a difference between them is the finding.
            if (nestedWith == null || nestedWithout == null) {
                row.put("nestedVerdict", "inconclusive: the nested arrangement was refused");
                nestedInconclusive.add(kind);
            } else if (leafInFlow <= NOISE) {
                row.put("nestedVerdict", "inconclusive: the leaf draws nothing even in plain flow");
                nestedInconclusive.add(kind);
            } else {
                int leafInNested = nestedWith - nestedWithout;
                row.put("leafInkInNestedCell", leafInNested);
                double nestedShare = (double) leafInNested / leafInFlow;
                row.put("shareOfLeafDrawnInNestedCell", Json.pt(nestedShare));
                if (leafInNested <= NOISE) {
                    row.put("nestedVerdict",
                            "content lost: the nested cell reserves space and draws no child content");
                    nestedLost.add(kind);
                } else if (nestedShare < FULL) {
                    row.put("nestedVerdict", "content only partly drawn in the nested cell");
                    nestedPartial.add(kind);
                } else {
                    row.put("nestedVerdict", "content drawn in full");
                    nestedIntact.add(kind);
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
        result.put("nestedArrangement",
                "The same one-cell table placed in the wide column of a two-column row, which is "
                        + "where a sidebar page puts it. Measured against the same plain-flow "
                        + "baseline, so a kind that is intact at page level and lost here has the "
                        + "nesting as its only difference.");
        result.put("nestedContentDrawnInFull", nestedIntact);
        result.put("nestedContentPartiallyDrawn", nestedPartial);
        result.put("nestedContentLost", nestedLost);
        result.put("nestedInconclusive", nestedInconclusive);
        result.put("deepArrangement",
                "A section whose OWN children are composite - a row, and a row plus a "
                + "table - rather than the single leaf every other arrangement here "
                + "wraps. Reported separately so the flat lists keep the meaning the "
                + "records written against them have.");
        result.put("deepContentDrawnInFull", deepIntact);
        result.put("deepContentPartiallyDrawn", deepPartial);
        result.put("deepContentLost", deepLost);

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
        finding.append(" Nested in a row cell: ");
        if (nestedLost.isEmpty() && nestedPartial.isEmpty()) {
            finding.append("every kind measured drew in full there too, so the placement makes no "
                    + "difference on this build.");
        } else {
            if (!nestedLost.isEmpty()) {
                finding.append("content is lost entirely for ")
                        .append(String.join(", ", nestedLost)).append(". ");
            }
            if (!nestedPartial.isEmpty()) {
                finding.append("content is only partly drawn for ")
                        .append(String.join(", ", nestedPartial)).append(". ");
            }
            finding.append("Drawn in full: ").append(String.join(", ", nestedIntact)).append(".");
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

    /**
     * The same one-cell table, one level deeper: in a cell of a two-column row,
     * which is the ordinary shape of a sidebar page and the placement a run
     * reported losing content in after 2.2.1 fixed the page-level case.
     *
     * <p>The main column is deliberately wide. A 160 pt fixed-size child in a
     * narrow cell would be refused or shrunk for want of room, and either would
     * be scored as lost content — a fault of the arrangement, not of the engine.
     * The aside carries real text so the section is unambiguously valid; it is
     * identical in the with-leaf and without-leaf renders, so it subtracts out.</p>
     */
    private static void nestedCell(PageFlowBuilder page, DocumentNode content) {
        page.addRow("OuterRow", outer -> {
            outer.weights(0.85, 0.15);
            outer.addSection("MainColumn", column -> column.addTable(table -> table
                    .name("ProbeTable")
                    .autoColumns(1)
                    .rowCells(DocumentTableCell.node(content))));
            outer.addSection("Aside", column -> column
                    .addParagraph(p -> p.name("ProbeAside").text("ASIDE")));
        });
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
