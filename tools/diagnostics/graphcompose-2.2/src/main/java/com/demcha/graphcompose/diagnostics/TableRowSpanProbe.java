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
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.ShapeContainerBuilder;
import com.demcha.compose.document.dsl.SpacerBuilder;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.document.table.DocumentTableTextAnchor;

/**
 * Where does a {@code rowSpan} cell put its content — the top of the span, or
 * the foot of it?
 *
 * <p>A run building a badge-beside-text card reported that a cell spanning two
 * rows seats its content at the bottom of the span whatever vertical anchor it
 * is given, and that it cost three iteration passes to diagnose because
 * bottom-aligned and centred look alike until the span's two rows differ in
 * height. That report named three placements for the anchor — the table's
 * {@code defaultCellStyle}, the spanning row's {@code rowStyle}, and the cell's
 * own {@code withStyle} — and said none of them moved it.</p>
 *
 * <h2>Why this is measured differentially</h2>
 *
 * <p>Cell content does not appear in {@code layoutSnapshot()} by name, so the
 * badge's position has to come from ink. An absolute y would then have to be
 * compared against some reference whose own position is equally unverified.</p>
 *
 * <p>So nothing absolute is compared. The same table is rendered twice,
 * differing only in the height of the SECOND row's body — one line, then six.
 * Growing the second row grows the span. If the spanning cell is anchored to
 * the top, its badge does not move; if it is seated at the foot, the badge
 * moves down by what the span gained. The drift between the two renders is the
 * finding, and it needs no reference point at all.</p>
 *
 * <p>The badge is a filled rectangle in a colour nothing else on the page uses,
 * so finding it is a scan for red rather than an attempt to identify glyphs.
 * Its margin is explicitly zero because a shape container with a bottom margin
 * paints above its box — {@code shape-container-margin-paints-high} — which
 * would be indistinguishable from an anchoring result.</p>
 *
 * <p>Each placement is also rendered with {@code TOP_LEFT} and with
 * {@code BOTTOM_LEFT}. If those two put the badge in the same place, the anchor
 * is not merely losing to the span — it is being ignored, which is a different
 * defect and a different fix.</p>
 *
 * <h2>What this probe does not separate</h2>
 *
 * <p>It measures a composed node, and only that. {@code textAnchor} is the TEXT
 * anchor: the PDF handler applies it in {@code resolveTextLines}, which reads
 * {@code cell.lines()}, and a composed node never passes through that code at
 * all. So "the anchor is discarded" has two readings — a spanning cell that
 * ignores the anchor for everything, or a control that was only ever about text
 * being asked to place a node — and they need different fixes.</p>
 *
 * <p>Measuring both kinds would tell them apart. That is not what this probe
 * does; the engine source answered the question directly, and a second arm
 * built to re-answer it would be measurement for its own sake. The distinction
 * is recorded here because it is what made the root cause findable, and because
 * a later reader looking at these numbers should know which of the two they
 * are numbers about.</p>
 */
final class TableRowSpanProbe implements Probes.Probe {

    private static final double PAGE_W = 320.0;
    private static final double PAGE_H = 300.0;
    private static final float DPI = 72f;

    private static final double BADGE_W = 40.0;
    private static final double BADGE_H = 24.0;
    private static final DocumentColor BADGE = DocumentColor.rgb(220, 30, 30);
    /**
     * One line of body in the short render, six in the tall one — as explicit
     * lines rather than one long string. A fixed column refuses a value whose
     * natural width exceeds it ("Fixed column 1 width 190.0 is smaller than
     * required natural width 1049.74") rather than wrapping it, so a long
     * sentence is a refused render, not a tall one.
     */
    private static final String[] SHORT_BODY = {"BODY"};
    private static final String[] TALL_BODY = {"BODY", "BODY", "BODY", "BODY", "BODY", "BODY"};

    /** A drift this small is rounding, not a move. */
    private static final double TOLERANCE = 2.0;

    /** Where the anchor is declared. The report the probe exists to settle named all three. */
    private enum Placement {
        DEFAULT_CELL_STYLE("defaultCellStyle"),
        ROW_STYLE("rowStyle"),
        CELL_WITH_STYLE("cellWithStyle");

        private final String label;

        Placement(String label) {
            this.label = label;
        }
    }

    @Override
    public String question() {
        return "Does a rowSpan cell seat its content at the top of the span when asked to, "
                + "and does it make any difference which of the three styles carries the anchor?";
    }

    @Override
    public Map<String, Object> run() throws Exception {
        List<Object> placements = Json.array();
        boolean everyPlacementHoldsTop = true;
        boolean anyPlacementRespondsToTheAnchor = false;
        // A placement that could not be measured is its own bucket. Folding it
        // into "does not hold" is how a refused render becomes a confident
        // claim about the engine, which is the failure this whole probe layer
        // exists to prevent.
        List<String> inconclusive = new java.util.ArrayList<>();
        Double growth = null;

        for (Placement placement : Placement.values()) {
            Map<String, Object> row = Json.object();
            row.put("placement", placement.label);

            Map<String, Object> top = measurePair(placement, DocumentTableTextAnchor.TOP_LEFT);
            Map<String, Object> bottom = measurePair(placement, DocumentTableTextAnchor.BOTTOM_LEFT);
            row.put("topLeft", top);
            row.put("bottomLeft", bottom);

            Double topDrift = (Double) top.get("driftWhenSpanGrows");
            Double topTall = (Double) top.get("badgeTopWithTallBody");
            Double bottomTall = (Double) bottom.get("badgeTopWithTallBody");

            if (topDrift == null || topTall == null || bottomTall == null) {
                row.put("verdict", "inconclusive: the badge was not found in one of the renders");
                inconclusive.add(placement.label);
                placements.add(row);
                continue;
            }

            boolean holdsTop = Math.abs(topDrift) <= TOLERANCE;
            // Does asking for the other anchor change anything at all? If TOP_LEFT
            // and BOTTOM_LEFT land the badge in the same place, the value is being
            // discarded rather than losing to the span.
            boolean respondsToAnchor = Math.abs(topTall - bottomTall) > TOLERANCE;

            row.put("topLeftHoldsTheTopOfTheSpan", holdsTop);
            row.put("anchorChangesWhereTheBadgeSits", respondsToAnchor);
            row.put("verdict", holdsTop
                    ? "TOP_LEFT seats the content at the top of the span"
                    : "TOP_LEFT does not hold: the content moved " + Json.pt(topDrift)
                            + " pt down when the span grew");

            everyPlacementHoldsTop &= holdsTop;
            anyPlacementRespondsToTheAnchor |= respondsToAnchor;
            if (growth == null) growth = (Double) top.get("spanGrowth");
            placements.add(row);
        }

        Map<String, Object> result = Json.object();
        result.put("arrangement",
                "A two-column, two-row table. The first row's first cell holds a " + (int) BADGE_W
                        + "x" + (int) BADGE_H + " pt filled rectangle with rowSpan(2); the second "
                        + "row holds a body paragraph. Rendered twice per anchor placement, with a "
                        + "one-line body and with a six-line one, and the badge located by colour "
                        + "at " + (int) DPI + " dpi. Growing the second row grows the span: a "
                        + "top-anchored badge does not move, a foot-seated one moves by what the "
                        + "span gained.");
        result.put("tolerancePt", TOLERANCE);
        result.put("spanGrowthPt", growth);
        result.put("placements", placements);
        result.put("inconclusive", inconclusive);

        boolean settled = inconclusive.isEmpty();
        // Every reported boolean is null when nothing measured it. A `false`
        // here would be read as "the engine does not do this", and no render
        // said so.
        result.put("topAnchorHonoured", settled ? everyPlacementHoldsTop : null);
        result.put("anchorChangesWhereTheBadgeSits", settled ? anyPlacementRespondsToTheAnchor : null);
        result.put("contentSeatedAtFootOfSpan", settled ? !everyPlacementHoldsTop : null);

        if (!settled) {
            result.put("finding",
                    "Nothing was settled: " + String.join(", ", inconclusive) + " could not be "
                            + "measured, so no claim is made about where a rowSpan cell seats its "
                            + "content. Read the per-placement refusals before changing anything.");
        } else {
            result.put("finding", everyPlacementHoldsTop
                    ? "A rowSpan cell seats its content at the top of the span when asked to, at every "
                            + "one of the three places the anchor can be declared."
                    : "A rowSpan cell does not hold the top of its span: growing the span moved the "
                            + "content down with it"
                            + (anyPlacementRespondsToTheAnchor
                                    ? ", though the anchor does change where it sits."
                                    : ", and TOP_LEFT and BOTTOM_LEFT put it in the same place, so the "
                                            + "anchor is being discarded rather than overridden."));
        }
        return result;
    }

    /**
     * One anchor placement, rendered with a short body and a tall one.
     *
     * @return the two badge positions, what the span gained between them, and the drift
     */
    private static Map<String, Object> measurePair(Placement placement, DocumentTableTextAnchor anchor) {
        Map<String, Object> out = Json.object();
        out.put("anchor", anchor.name());

        Double shortTop = badgeTop(placement, anchor, SHORT_BODY, out, "short");
        Double tallTop = badgeTop(placement, anchor, TALL_BODY, out, "tall");
        Double shortInk = (Double) out.remove("shortTableBottom");
        Double tallInk = (Double) out.remove("tallTableBottom");

        out.put("badgeTopWithShortBody", shortTop);
        out.put("badgeTopWithTallBody", tallTop);
        if (shortInk != null && tallInk != null) {
            out.put("spanGrowth", Json.pt(tallInk - shortInk));
        }
        if (shortTop != null && tallTop != null) {
            out.put("driftWhenSpanGrows", Json.pt(tallTop - shortTop));
        }
        return out;
    }

    /**
     * Render one arrangement and report the topmost row carrying badge colour.
     * The bottom of the table's own ink goes into {@code out} as well, because
     * the difference between the two renders is what the span gained.
     */
    private static Double badgeTop(Placement placement,
                                   DocumentTableTextAnchor anchor,
                                   String[] body,
                                   Map<String, Object> out,
                                   String key) {
        try {
            BufferedImage image = render(page -> table(page, placement, anchor, body));
            Double top = null;
            double lastInk = -1;
            for (int y = 0; y < image.getHeight(); y += 1) {
                for (int x = 0; x < image.getWidth(); x += 1) {
                    int rgb = image.getRGB(x, y);
                    int r = (rgb >> 16) & 0xff;
                    int g = (rgb >> 8) & 0xff;
                    int b = rgb & 0xff;
                    if (r > 150 && g < 100 && b < 100) {
                        if (top == null) top = (double) y;
                    }
                    if (r + g + b < 720) lastInk = y;
                }
            }
            out.put(key + "TableBottom", lastInk);
            return top;
        } catch (Exception | Error refusal) {
            out.put(key + "Refused", String.valueOf(refusal.getMessage()));
            return null;
        }
    }

    private static void table(PageFlowBuilder page,
                             Placement placement,
                             DocumentTableTextAnchor anchor,
                             String[] body) {
        DocumentTableStyle anchored = DocumentTableStyle.builder().textAnchor(anchor).build();

        DocumentTableCell badgeCell = DocumentTableCell.node(badge()).rowSpan(2);
        if (placement == Placement.CELL_WITH_STYLE) {
            badgeCell = badgeCell.withStyle(anchored);
        }
        final DocumentTableCell cell = badgeCell;

        page.addTable(table -> {
            TableBuilder t = table
                    .name("RowSpanProbeTable")
                    .columns(DocumentTableColumn.fixed(BADGE_W + 16), DocumentTableColumn.fixed(190))
                    .rowCells(cell, DocumentTableCell.text("TITLE"))
                    .rowCells(DocumentTableCell.lines(body));
            if (placement == Placement.DEFAULT_CELL_STYLE) {
                t.defaultCellStyle(anchored);
            } else if (placement == Placement.ROW_STYLE) {
                t.rowStyle(0, anchored);
            }
        });
    }

    /**
     * A filled rectangle in a colour nothing else draws. The margin is zero on
     * purpose: a shape container with a bottom margin paints above its box, and
     * that would be indistinguishable from an anchoring result.
     */
    private static DocumentNode badge() {
        return new ShapeContainerBuilder()
                .name("Badge")
                .rectangle(BADGE_W, BADGE_H)
                .fillColor(BADGE)
                .margin(DocumentInsets.zero())
                .layer(new SpacerBuilder().name("BadgeCore").size(1, 1).build(), LayerAlign.TOP_LEFT, 0)
                .build();
    }

    private static DocumentNode paragraph(String text) {
        ParagraphBuilder p = new ParagraphBuilder();
        p.name("ProbeParagraph");
        p.text(text);
        return p.build();
    }

    private static BufferedImage render(Consumer<PageFlowBuilder> body) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (DocumentSession session = GraphCompose.document().create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.of(10));
            session.pageFlow(page -> {
                page.name("TableRowSpanProbe").padding(DocumentInsets.zero());
                body.accept(page);
            });
            session.writePdf(bytes);
        }
        try (PDDocument pdf = Loader.loadPDF(bytes.toByteArray())) {
            return new PDFRenderer(pdf).renderImageWithDPI(0, DPI);
        }
    }
}
