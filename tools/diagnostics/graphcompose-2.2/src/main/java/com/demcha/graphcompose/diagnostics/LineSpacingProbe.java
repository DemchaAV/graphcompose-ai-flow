package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.font.FontName;

/**
 * What does {@code lineSpacing} actually add, and to what?
 *
 * <p>A create run tuning vertical rhythm assumed the familiar CSS model — that
 * {@code lineSpacing} is a <em>multiple</em> of the type size, so 1.2 means
 * "120% of 10 pt". Its measurements did not fit: the numbers behaved like an
 * additive term in points, and a one-line paragraph did not move at all when
 * the value changed. Both conclusions came from counting pixels in a render,
 * which is the expensive way to learn arithmetic, and neither could be promoted
 * to versioned knowledge because no probe existed to confirm them.</p>
 *
 * <h2>How this settles it</h2>
 *
 * <p>Height is measured for the same two paragraphs — one that wraps, one that
 * cannot — across a range of {@code lineSpacing} values, and the probe reports
 * the slope of height against spacing for each.</p>
 *
 * <ul>
 *   <li>A slope near zero for the single-line paragraph means the value is not
 *       applied per line: there is no gap to add when there is no second line.</li>
 *   <li>A non-zero slope for the wrapped paragraph gives what each unit of
 *       {@code lineSpacing} is worth in points. If the value were a multiple of
 *       the type size, doubling the size would double that slope — so the
 *       wrapped paragraph is measured at two type sizes and both slopes are
 *       reported.</li>
 * </ul>
 *
 * <p>Nothing here asserts a model. The slopes are computed from what was
 * measured and the finding is derived from the slopes, so a library that
 * changes this behaviour makes the probe say something different rather than
 * repeating what someone once believed.</p>
 */
final class LineSpacingProbe implements Probes.Probe {

    /** Narrow enough that WRAPPING wraps and SINGLE does not. */
    private static final double PAGE_W = 200.0;
    private static final double PAGE_H = 900.0;

    private static final double SIZE_A = 10.0;
    private static final double SIZE_B = 20.0;

    /** Spread wide enough that a per-point effect is unmistakable against rounding. */
    private static final double[] SPACINGS = {0.0, 2.0, 6.0, 12.0};

    private static final String WRAPPING =
            "The quick brown fox jumps over the lazy dog while the rain keeps falling on the roof.";
    private static final String SINGLE = "One";

    @Override
    public String question() {
        return "Is lineSpacing a multiple of the type size or an additive term in points, "
                + "and does a single-line paragraph honour it?";
    }

    @Override
    public Map<String, Object> run() {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "line-spacing-probe.pdf");
        Map<String, Double> heights = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(out).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("LineSpacingProbe").spacing(6).padding(DocumentInsets.zero());
                for (double spacing : SPACINGS) {
                    paragraph(page, "WrapA_" + key(spacing), WRAPPING, SIZE_A, spacing);
                    paragraph(page, "WrapB_" + key(spacing), WRAPPING, SIZE_B, spacing);
                    paragraph(page, "SingleA_" + key(spacing), SINGLE, SIZE_A, spacing);
                    // The size-B single line is not decoration: it is the only way to
                    // learn how many lines the size-B paragraph wrapped to, which the
                    // slope has to be divided by before the two sizes are comparable.
                    paragraph(page, "SingleB_" + key(spacing), SINGLE, SIZE_B, spacing);
                }
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && !n.entityName().isBlank())
                    .forEach(n -> heights.put(n.entityName(), n.placementHeight()));
        }

        Map<String, Object> result = Json.object();
        result.put("arrangement", Map.of(
                "pageWidth", PAGE_W,
                "sizes", List.of(SIZE_A, SIZE_B),
                "spacings", List.of(0.0, 2.0, 6.0, 12.0),
                "wrappingText", WRAPPING,
                "singleLineText", SINGLE));

        List<Object> rows = Json.array();
        for (double spacing : SPACINGS) {
            Map<String, Object> row = Json.object();
            row.put("lineSpacing", spacing);
            row.put("wrappedAtSize" + (int) SIZE_A, height(heights, "WrapA_" + key(spacing)));
            row.put("wrappedAtSize" + (int) SIZE_B, height(heights, "WrapB_" + key(spacing)));
            row.put("singleLineAtSize" + (int) SIZE_A, height(heights, "SingleA_" + key(spacing)));
            row.put("singleLineAtSize" + (int) SIZE_B, height(heights, "SingleB_" + key(spacing)));
            rows.add(row);
        }
        result.put("measurements", rows);

        Double wrapSlopeA = slope(heights, "WrapA_");
        Double wrapSlopeB = slope(heights, "WrapB_");
        Double singleSlope = slope(heights, "SingleA_");
        Double lineHeightA = heights.get("SingleA_" + key(0.0));
        Double lineHeightB = heights.get("SingleB_" + key(0.0));
        Double wrapAtZeroA = heights.get("WrapA_" + key(0.0));
        Double wrapAtZeroB = heights.get("WrapB_" + key(0.0));
        if (wrapSlopeA == null || wrapSlopeB == null || singleSlope == null
                || lineHeightA == null || lineHeightB == null
                || wrapAtZeroA == null || wrapAtZeroB == null) {
            result.put("finding", "inconclusive: the probe's own paragraphs were not all in the snapshot");
            return result;
        }

        // The correction that makes the two sizes comparable at all. A larger type
        // wraps the same text into more lines, so its paragraph has more gaps for
        // lineSpacing to land in — and a raw slope comparison reads that extra line
        // count as the value scaling with the type. At zero spacing a paragraph is
        // exactly its lines stacked, so the single-line height divides out to the
        // count, and the slope per *gap* is the quantity that means anything.
        long linesA = Math.round(wrapAtZeroA / lineHeightA);
        long linesB = Math.round(wrapAtZeroB / lineHeightB);
        result.put("wrappedLineCount", Map.of(
                "atSize" + (int) SIZE_A, linesA,
                "atSize" + (int) SIZE_B, linesB));
        result.put("lineHeightAtZeroSpacing", Map.of(
                "atSize" + (int) SIZE_A, Json.pt(lineHeightA),
                "atSize" + (int) SIZE_B, Json.pt(lineHeightB)));
        result.put("wrappedHeightPerUnitOfLineSpacing", Map.of(
                "atSize" + (int) SIZE_A, wrapSlopeA,
                "atSize" + (int) SIZE_B, wrapSlopeB));
        result.put("singleLineHeightPerUnitOfLineSpacing", singleSlope);

        if (linesA < 2 || linesB < 2) {
            result.put("finding", "inconclusive: the wrapping text did not wrap at both sizes, so there "
                    + "were no gaps to measure. Narrow the page or lengthen the text.");
            return result;
        }

        double perGapA = Json.pt(wrapSlopeA / (linesA - 1));
        double perGapB = Json.pt(wrapSlopeB / (linesB - 1));
        result.put("pointsPerGapPerUnitOfLineSpacing", Map.of(
                "atSize" + (int) SIZE_A, perGapA,
                "atSize" + (int) SIZE_B, perGapB));

        boolean singleIgnores = Math.abs(singleSlope) < 0.01;
        // If lineSpacing were a multiple of the type size, doubling the size would
        // double what one unit of it is worth *per gap*. The same per-gap value at
        // both sizes means the term is in points and independent of the type.
        boolean sizeIndependent = perGapA != 0.0
                && Math.abs(perGapB - perGapA) / Math.abs(perGapA) < 0.05;
        result.put("singleLineIgnoresLineSpacing", singleIgnores);
        result.put("additiveInPoints", sizeIndependent);

        StringBuilder finding = new StringBuilder();
        finding.append(sizeIndependent
                ? "lineSpacing is an additive term in points, not a multiple of the type size: one unit of "
                        + "it adds " + perGapA + " pt per gap at size " + (int) SIZE_A + " and " + perGapB
                        + " pt per gap at size " + (int) SIZE_B + ". The raw paragraph slopes differ ("
                        + wrapSlopeA + " vs " + wrapSlopeB + ") only because the same text wraps to "
                        + linesA + " lines at one size and " + linesB + " at the other."
                : "lineSpacing scales with the type size: one unit adds " + perGapA + " pt per gap at size "
                        + (int) SIZE_A + " but " + perGapB + " pt per gap at size " + (int) SIZE_B + ".");
        finding.append(singleIgnores
                ? " A single-line paragraph ignores it entirely (slope " + singleSlope
                        + "), so the value is spent between lines rather than on each one — set it and a "
                        + "one-line heading does not move."
                : " A single-line paragraph does honour it (slope " + singleSlope + ").");
        result.put("finding", finding.toString());
        return result;
    }

    private static void paragraph(
            com.demcha.compose.document.dsl.PageFlowBuilder page,
            String name, String text, double size, double spacing) {
        page.addParagraph(p -> p
                .name(name)
                .text(text)
                .textStyle(DocumentTextStyle.builder().fontName(FontName.LATO).size(size).build())
                .lineSpacing(spacing)
                .margin(DocumentInsets.zero()));
    }

    /** `2.0` -> `2p0`, so a name survives being a JSON key and a node id. */
    private static String key(double spacing) {
        return String.valueOf(spacing).replace('.', 'p');
    }

    private static Object height(Map<String, Double> heights, String name) {
        Double value = heights.get(name);
        return value == null ? null : Json.pt(value);
    }

    /**
     * Least-squares slope of height against lineSpacing for one family of
     * paragraphs. Null when any measurement is missing — a slope fitted through
     * a gap would be a number with no evidence under it.
     */
    private static Double slope(Map<String, Double> heights, String prefix) {
        double sumX = 0.0;
        double sumY = 0.0;
        double sumXY = 0.0;
        double sumXX = 0.0;
        int n = 0;
        for (double spacing : SPACINGS) {
            Double y = heights.get(prefix + key(spacing));
            if (y == null) return null;
            sumX += spacing;
            sumY += y;
            sumXY += spacing * y;
            sumXX += spacing * spacing;
            n += 1;
        }
        double denominator = n * sumXX - sumX * sumX;
        if (denominator == 0.0) return null;
        return Json.pt((n * sumXY - sumX * sumY) / denominator);
    }
}
