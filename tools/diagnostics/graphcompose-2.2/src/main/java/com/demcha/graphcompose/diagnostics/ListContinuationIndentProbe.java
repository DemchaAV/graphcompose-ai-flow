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
 * What does {@code ListBuilder.continuationIndent} indent, and by how much?
 *
 * <p>Every CV run so far has built its bullet lists correctly — {@code addList},
 * {@code bullet()}, {@code itemSpacing}, {@code padding} — and left the wrapped
 * second line of a long item starting under the marker instead of under the
 * first word. The knob for that is on the same builder and was used by none of
 * them, because it is named by no contract and no route: it appears only in the
 * generated API surface, among twenty-four methods, as
 * {@code ListBuilder continuationIndent(String continuationIndent)}.</p>
 *
 * <p>A {@code String} where a width was expected is exactly the kind of
 * signature that gets guessed at. Before any contract can tell an author to set
 * it, what it does has to be measured.</p>
 *
 * <h2>How this settles it</h2>
 *
 * <p>One item, long enough to wrap several times, is laid out at a fixed narrow
 * width for a range of indent strings of increasing width — from the empty
 * string to a long one. Only the list height is read, and the reasoning runs
 * through the line count:</p>
 *
 * <ul>
 *   <li>Height flat across every string means the value does not reach the
 *       layout at all, and no author should be told to set it.</li>
 *   <li>Height rising with the width of the string means continuation lines are
 *       laid out in a narrower column — the same text needs more of them — which
 *       is a hanging indent measured by that string's own width.</li>
 *   <li>Height rising with the string's <em>character count</em> but not its
 *       width would mean something else again, so a wide short string
 *       ({@code "MM"}) and a narrow long one ({@code "iiiiii"}) are both
 *       measured and reported side by side.</li>
 * </ul>
 *
 * <p>A single-line item is measured at every value as the control: an indent
 * applied from the second line cannot move an item that has no second line, and
 * a height that moves there would mean the value indents the first line too.</p>
 *
 * <p>Nothing here asserts a model. The finding is derived from the measured
 * heights, so a library that changes this behaviour makes the probe say
 * something different rather than repeating what someone once believed.</p>
 */
final class ListContinuationIndentProbe implements Probes.Probe {

    /** Narrow enough that LONG wraps several times and SHORT cannot wrap at all. */
    private static final double PAGE_W = 200.0;
    private static final double PAGE_H = 1400.0;
    private static final double SIZE = 10.0;

    /**
     * Indent strings, in the order the finding reads them. The first is the
     * control; the last two carry the same width question from both sides —
     * two wide characters against six narrow ones.
     */
    private static final String[] INDENTS = {"", "  ", "MMMM", "MM", "iiiiii"};

    private static final String LONG =
            "Lead the planning and execution of forty corporate events each year, from the first "
                    + "brief through to the closing report, across three cities and two continents.";
    private static final String SHORT = "One";

    @Override
    public String question() {
        return "Does ListBuilder.continuationIndent indent a list item's wrapped lines, "
                + "and is the indent the width of the string or its character count?";
    }

    @Override
    public Map<String, Object> run() {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "list-continuation-indent-probe.pdf");
        Map<String, Double> heights = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(out).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("ListContinuationIndentProbe").spacing(6).padding(DocumentInsets.zero());
                for (String indent : INDENTS) {
                    list(page, "Long_" + key(indent), LONG, indent);
                    list(page, "Short_" + key(indent), SHORT, indent);
                }
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && !n.entityName().isBlank())
                    .forEach(n -> heights.put(n.entityName(), n.placementHeight()));
        }

        Map<String, Object> result = Json.object();
        result.put("arrangement", Map.of(
                "pageWidth", PAGE_W,
                "size", SIZE,
                "indents", List.of(INDENTS),
                "wrappingItem", LONG,
                "singleLineItem", SHORT));

        List<Object> rows = Json.array();
        for (String indent : INDENTS) {
            Map<String, Object> row = Json.object();
            row.put("continuationIndent", indent);
            row.put("characters", indent.length());
            row.put("wrappedItemHeight", height(heights, "Long_" + key(indent)));
            row.put("singleLineItemHeight", height(heights, "Short_" + key(indent)));
            rows.add(row);
        }
        result.put("measurements", rows);

        Double baseLong = heights.get("Long_" + key(""));
        Double baseShort = heights.get("Short_" + key(""));
        Double wideLong = heights.get("Long_" + key("MMMM"));
        Double twoWide = heights.get("Long_" + key("MM"));
        Double sixNarrow = heights.get("Long_" + key("iiiiii"));
        if (baseLong == null || baseShort == null || wideLong == null || twoWide == null || sixNarrow == null) {
            result.put("finding", "inconclusive: the probe's own lists were not all in the snapshot");
            return result;
        }

        // One line of the wrapped item at the control value: the unit every
        // height difference below is counted in.
        double lineHeight = baseShort;
        long baseLines = Math.round(baseLong / lineHeight);
        long wideLines = Math.round(wideLong / lineHeight);
        result.put("lineHeight", Json.pt(lineHeight));
        result.put("wrappedLineCount", Map.of(
                "atEmptyIndent", baseLines,
                "atMMMM", wideLines));

        boolean reachesLayout = Math.abs(wideLong - baseLong) > 0.01;
        boolean firstLineMoves = false;
        for (String indent : INDENTS) {
            Double single = heights.get("Short_" + key(indent));
            if (single != null && Math.abs(single - baseShort) > 0.01) firstLineMoves = true;
        }
        result.put("reachesLayout", reachesLayout);
        result.put("singleLineItemUnaffected", !firstLineMoves);

        if (!reachesLayout) {
            result.put("finding", "continuationIndent does not reach the layout: a list item wrapped to "
                    + baseLines + " lines at every value from \"\" to \"MMMM\", so setting it changes "
                    + "nothing an author can see. Do not route authors to it.");
            return result;
        }

        // Two wide characters against six narrow ones. If the indent were counted
        // in characters the six would indent further; if it is the string's own
        // rendered width, the two M's are the wider of the pair.
        boolean byWidth = twoWide >= sixNarrow;
        result.put("byRenderedWidth", byWidth);
        result.put("byCharacterCount", !byWidth);

        StringBuilder finding = new StringBuilder();
        finding.append("continuationIndent lays a list item's wrapped lines out in a narrower column: the same "
                + "item took ").append(baseLines).append(" lines at \"\" and ").append(wideLines)
                .append(" at \"MMMM\". ");
        finding.append(byWidth
                ? "The indent is the RENDERED WIDTH of the string, not its length — \"MM\" ("
                        + Json.pt(twoWide) + " pt) indents at least as far as \"iiiiii\" ("
                        + Json.pt(sixNarrow) + " pt) despite being a third as long. Pass the marker and "
                        + "the gap after it, and the wrapped line starts under the item's first word."
                : "The indent follows the CHARACTER COUNT rather than the width: \"iiiiii\" ("
                        + Json.pt(sixNarrow) + " pt) indents further than \"MM\" (" + Json.pt(twoWide)
                        + " pt).");
        finding.append(firstLineMoves
                ? " It moves a single-line item too, so it is not a hanging indent."
                : " A single-line item is unchanged at every value, which is what makes it a hanging "
                        + "indent rather than a margin.");
        result.put("finding", finding.toString());
        return result;
    }

    private static void list(
            com.demcha.compose.document.dsl.PageFlowBuilder page,
            String name, String item, String indent) {
        page.addList(l -> {
            l.name(name)
                    .bullet()
                    .textStyle(DocumentTextStyle.builder().fontName(FontName.LATO).size(SIZE).build())
                    .itemSpacing(0)
                    .margin(DocumentInsets.zero())
                    .padding(DocumentInsets.zero())
                    .items(item);
            // The control is "no indent stated", not "the empty string": an author
            // who never calls this is the case the measurement is compared against.
            if (!indent.isEmpty()) l.continuationIndent(indent);
        });
    }

    /** `"MM"` -> `MM`, `""` -> `none`, so a name survives being a JSON key and a node id. */
    private static String key(String indent) {
        return indent.isEmpty() ? "none" : indent.replace(" ", "sp");
    }

    private static Object height(Map<String, Double> heights, String name) {
        Double value = heights.get(name);
        return value == null ? null : Json.pt(value);
    }
}
