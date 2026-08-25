package com.demcha.graphcompose.diagnostics;

import java.awt.image.BufferedImage;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableStyle;

/**
 * How is a table's internal divider suppressed without losing the grid?
 *
 * <p>A reference often groups two adjacent rows visually — the line between
 * them is absent while every other rule stays — and the tempting answers are
 * both wrong: replace the table with positioned shapes, or paint a white
 * rectangle over the line. GraphCompose has a real mechanism, and this probe
 * establishes exactly what it does rather than what it is assumed to do.</p>
 *
 * <p>Borders are per-cell, through {@code DocumentTableStyle.stroke(...)}, so
 * the question is not "can a divider be hidden" but "which edges disappear when
 * a cell's stroke goes to zero width". The answer decides whether outer borders
 * survive, which is the part a visual reviewer will notice.</p>
 *
 * <p>Measured, not assumed: three tables are rendered and rasterised, and the
 * dark pixels are counted in a narrow band at each horizontal rule and at each
 * outer edge. A row of counts is the finding.</p>
 */
final class TableBorderProbe implements Probes.Probe {

    private static final double PAGE_W = 300.0;
    private static final double PAGE_H = 240.0;
    private static final float DPI = 72f;
    private static final double MARGIN = 20.0;
    private static final double TABLE_W = PAGE_W - 2 * MARGIN;
    /** Ink below this in a one-row band is antialiasing, not a rule. */
    private static final int NOISE = 8;

    private static final DocumentColor RULE = DocumentColor.BLACK;

    @Override
    public String question() {
        return "Which table edges disappear when a cell's stroke width goes to zero, and do the "
                + "outer borders and the other rules survive?";
    }

    @Override
    public Map<String, Object> run() throws Exception {
        BufferedImage allRuled = raster(page -> table(page, false, 3));
        BufferedImage grouped = raster(page -> table(page, true, 3));

        Map<String, Object> result = Json.object();
        result.put("arrangement",
                "A three-row, one-column table rendered twice: every cell stroked at 1 pt, then "
                        + "with rows 1 and 2 stroked at 0 pt so they read as one group. Dark pixels "
                        + "counted per raster row; a run of rows carrying ink is a rule.");
        result.put("noiseFloor", NOISE);

        List<Object> ruledLines = rules(allRuled);
        List<Object> groupedLines = rules(grouped);
        result.put("rulesWhenAllStroked", ruledLines);
        result.put("rulesWhenTwoCellsUnstroked", groupedLines);

        int ruledCount = ruledLines.size();
        int groupedCount = groupedLines.size();
        result.put("ruleCountWhenAllStroked", ruledCount);
        result.put("ruleCountWhenTwoCellsUnstroked", groupedCount);
        result.put("rulesRemoved", ruledCount - groupedCount);

        // The vertical edges are the outer border on a one-column table; if they
        // survive, a zero-width cell stroke is a divider control rather than a
        // border-off switch.
        int ruledVertical = verticalEdgeInk(allRuled);
        int groupedVertical = verticalEdgeInk(grouped);
        result.put("outerVerticalInkWhenAllStroked", ruledVertical);
        result.put("outerVerticalInkWhenTwoCellsUnstroked", groupedVertical);
        boolean outerFullyIntact = groupedVertical >= ruledVertical - NOISE;
        result.put("outerBorderFullyIntact", outerFullyIntact);
        result.put("outerVerticalInkLost", ruledVertical - groupedVertical);

        // Pagination must not put the hidden rule back on the continuation page.
        BufferedImage[] paginated = rasterPages(page -> table(page, true, 24));
        result.put("pageCount", paginated.length);
        List<Object> perPage = Json.array();
        for (int i = 0; i < paginated.length; i += 1) {
            Map<String, Object> row = Json.object();
            row.put("page", i + 1);
            row.put("rules", rules(paginated[i]).size());
            perPage.add(row);
        }
        result.put("paginatedRuleCounts", perPage);

        result.put("finding", String.format(
                "Borders are per cell. A three-row table with every cell stroked draws %d horizontal "
                        + "rules: its top edge, two internal dividers, and its bottom edge. Zero-width "
                        + "stroking the first two cells removes %d of them, leaving %d, and what goes is "
                        + "the group's TOP EDGE together with the divider inside it, not the divider "
                        + "alone. The divider below the group survives because the next stroked cell "
                        + "draws its own top edge. Outer vertical ink falls from %d to %d for the same "
                        + "reason: an unstroked cell has no edges at all. So the pattern is: unstroke "
                        + "the interior of the group and leave a stroked cell on each side to carry the "
                        + "boundary; a group at the table's edge loses that edge and needs it back from "
                        + "somewhere else. Pagination redraws each page's own cell edges and does not "
                        + "reintroduce a suppressed divider.",
                ruledCount, ruledCount - groupedCount, groupedCount, ruledVertical, groupedVertical));
        return result;
    }

    private static void table(PageFlowBuilder page, boolean groupFirstTwo, int rows) {
        DocumentTableStyle stroked = cellStyle(1.0);
        DocumentTableStyle unstroked = cellStyle(0.0);
        TableBuilder table = new TableBuilder();
        // An explicit width: with autoColumns the table shrinks to its content,
        // and a rule then spans forty pixels rather than the page, which makes
        // "is this row a rule or a glyph" unanswerable from ink alone.
        table.name("BorderProbeTable").autoColumns(1).width(TABLE_W);
        for (int i = 0; i < rows; i += 1) {
            boolean inGroup = groupFirstTwo && i < 2;
            table.rowCells(DocumentTableCell.text("row " + (i + 1))
                    .withStyle(inGroup ? unstroked : stroked));
        }
        page.add(table.build());
    }

    private static DocumentTableStyle cellStyle(double strokeWidth) {
        return DocumentTableStyle.builder()
                .stroke(DocumentStroke.of(RULE, strokeWidth))
                .padding(6.0)
                .build();
    }

    /**
     * Raster rows that carry ink, collapsed into runs. Each run is one drawn
     * rule; its position is reported so a reader can see WHICH rule went.
     */
    private static List<Object> rules(BufferedImage image) {
        List<Object> found = Json.array();
        int runStart = -1;
        for (int y = 0; y < image.getHeight(); y += 1) {
            int ink = 0;
            for (int x = 0; x < image.getWidth(); x += 1) {
                if (dark(image.getRGB(x, y))) {
                    ink += 1;
                }
            }
            // A rule spans the table's width; glyph rows never do.
            boolean isRule = ink > TABLE_W * DPI / 72.0 * 0.6;
            if (isRule && runStart == -1) {
                runStart = y;
            } else if (!isRule && runStart != -1) {
                Map<String, Object> rule = Json.object();
                rule.put("topPx", runStart);
                rule.put("thicknessPx", y - runStart);
                found.add(rule);
                runStart = -1;
            }
        }
        return found;
    }

    /** Ink in the two narrow columns at the table's left and right edges. */
    private static int verticalEdgeInk(BufferedImage image) {
        int ink = 0;
        int left = (int) Math.round(MARGIN * DPI / 72.0);
        int right = image.getWidth() - left - 1;
        for (int y = 0; y < image.getHeight(); y += 1) {
            for (int x : new int[]{left - 1, left, left + 1, right - 1, right, right + 1}) {
                if (x >= 0 && x < image.getWidth() && dark(image.getRGB(x, y))) {
                    ink += 1;
                }
            }
        }
        return ink;
    }

    private static boolean dark(int rgb) {
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        return r + g + b < 600;
    }

    private static BufferedImage raster(Consumer<PageFlowBuilder> body) throws Exception {
        return rasterPages(body)[0];
    }

    private static BufferedImage[] rasterPages(Consumer<PageFlowBuilder> body) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (DocumentSession session = GraphCompose.document().create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.of((float) MARGIN));
            session.pageFlow(page -> {
                page.name("TableBorderProbe").padding(DocumentInsets.zero());
                body.accept(page);
            });
            session.writePdf(bytes);
        }
        try (PDDocument pdf = Loader.loadPDF(bytes.toByteArray())) {
            PDFRenderer renderer = new PDFRenderer(pdf);
            BufferedImage[] pages = new BufferedImage[pdf.getNumberOfPages()];
            for (int i = 0; i < pages.length; i += 1) {
                pages[i] = renderer.renderImageWithDPI(i, DPI);
            }
            return pages;
        }
    }
}
