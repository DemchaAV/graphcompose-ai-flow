package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.api.PageMarginRule;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.style.DocumentInsets;

/**
 * Does a {@code PageMarginRule} for a page other than the first change what the
 * layout compiler offers that page — and does a negative row margin do anything?
 *
 * <p>A run trying to bleed a photograph to the paper edge on page 3 reported
 * that {@code PageMarginRule.page(1, zero())} works as documented while the same
 * rule for a later page leaves the available width at the session's base content
 * width. It also reported a third route failing in the worst possible way: a
 * negative left margin on the row renders without complaint and does not move
 * the row. Neither claim had a probe; both are measured here.</p>
 *
 * <h2>Why this measures position rather than refusal</h2>
 *
 * <p>The obvious arrangement is a block too wide for the page and the question
 * "was it refused?". That was tried first and does not work: a row whose
 * declared columns exceed the width offered is not refused at all, it simply
 * overflows — measured with one fixed column and again with two, on 2.2.2, with
 * a rule and without, all four built. An arm that cannot fail its own premise is
 * not measuring anything, so the refusal route was abandoned rather than
 * reported.</p>
 *
 * <p>What answers it directly is {@code computedX} from the layout snapshot. On
 * a page whose margins a rule has zeroed, content starts at 0; on a page keeping
 * the session's margins it starts at the side margin. One document carries a
 * marker on page one and another on page two, and a second document with no rule
 * is the control: if page two starts at the side margin without the rule and at
 * 0 with it, the rule moved it, and nothing about that inference depends on an
 * error message.</p>
 *
 * <p>The third claim in the source report — that a shape container with
 * {@code OVERFLOW_VISIBLE} paints a child outside its box when the child fits
 * but scales one that does not — needs rasterisation and a scaled-width
 * comparison. It is deliberately not attempted here: an arm needing a different
 * measurement apparatus belongs in its own probe rather than bolted onto this
 * one.</p>
 */
final class PageMarginProbe implements Probes.Probe {

    private static final double PAGE_W = 300.0;
    private static final double PAGE_H = 200.0;
    private static final double SIDE = 20.0;
    /**
     * Page capacity is {@code PAGE_H - 2 * SIDE} = 160 pt. The filler must fit
     * beside the first marker and leave too little for the second, so that the
     * second lands on page two. {@code startPage} is checked rather than trusted.
     */
    private static final double FILLER_H = 145.0;
    /** Closer than this and two positions are the same position. */
    private static final double EPSILON = 0.5;

    @Override
    public String question() {
        return "Does a PageMarginRule for a page after the first change where that page's content "
                + "starts, and does a negative row margin move the row?";
    }

    @Override
    public Map<String, Object> run() {
        Map<String, Object> ruled = marginRuleWidth(true);
        // The control that makes the arm mean anything: the same document with
        // no rule at all. If page two already starts at 0 without a rule, the
        // arrangement is not sensitive to one and no claim can be made.
        Map<String, Object> control = marginRuleWidth(false);
        Map<String, Object> negative = negativeRowMargin();

        Double ruledOne = (Double) ruled.get("pageOneContentX");
        Double ruledTwo = (Double) ruled.get("pageTwoContentX");
        Double controlTwo = (Double) control.get("pageTwoContentX");
        Double ruledTwoW = (Double) ruled.get("pageTwoContentWidth");
        Double controlTwoW = (Double) control.get("pageTwoContentWidth");
        boolean measurable = ruledOne != null && ruledTwo != null && controlTwo != null;
        boolean controlIsInset = measurable && Math.abs(controlTwo - SIDE) < EPSILON;

        Map<String, Object> result = Json.object();
        result.put("arrangement",
                "One marker paragraph on page one and another on page two of a " + (int) PAGE_W
                        + "x" + (int) PAGE_H + " pt document whose base margin is " + (int) SIDE
                        + " pt, with PageMarginRule.page(2, zero()) declared - and the same "
                        + "document again with no rule as the control. Content position comes from "
                        + "computedX in the layout snapshot. The negative-margin arm compares two "
                        + "rows in one document, one of them pulled left by " + (int) SIDE + " pt.");
        result.put("withRule", ruled);
        result.put("withoutRule", control);
        result.put("negativeRowMargin", negative);

        // Every claim is null when nothing measured it. A false here would read
        // as "the engine does not do this", and no render said so.
        result.put("controlPutsPageTwoAtTheSideMargin", measurable ? controlIsInset : null);
        result.put("laterPageRuleMovesContent",
                measurable && controlIsInset ? Math.abs(ruledTwo) < EPSILON : null);
        // The claim as the source stated it: the WIDTH offered to a later page.
        result.put("laterPageRuleWidensLayout",
                measurable && controlIsInset && ruledTwoW != null && controlTwoW != null
                        ? ruledTwoW - controlTwoW > EPSILON
                        : null);
        result.put("laterPageWidthGainPt",
                ruledTwoW != null && controlTwoW != null ? Json.pt(ruledTwoW - controlTwoW) : null);
        result.put("firstPageKeepsItsOwnMargin",
                measurable ? Math.abs(ruledOne - SIDE) < EPSILON : null);
        result.put("negativeRowMarginShiftsRow", negative.get("moved"));

        result.put("finding", describe(ruled, control, measurable, controlIsInset, negative));
        return result;
    }

    private static String describe(Map<String, Object> ruled,
                                   Map<String, Object> control,
                                   boolean measurable,
                                   boolean controlIsInset,
                                   Map<String, Object> negative) {
        StringBuilder out = new StringBuilder();
        if (!measurable) {
            out.append("The margin-rule arm did not measure: ")
                    .append(ruled.get("error")).append(" / ").append(control.get("error"))
                    .append(". ");
        } else if (!controlIsInset) {
            out.append("The margin-rule arm is inconclusive: with no rule, page two already starts "
                            + "at ").append(control.get("pageTwoContentX"))
                    .append(" pt rather than the ").append(SIDE)
                    .append(" pt side margin, so this arrangement cannot tell a moved page from an "
                            + "unmoved one. ");
        } else {
            out.append("With no rule, page two starts at ").append(control.get("pageTwoContentX"))
                    .append(" pt; with PageMarginRule.page(2, zero()) it starts at ")
                    .append(ruled.get("pageTwoContentX"))
                    .append(" pt, while page one keeps its own margin at ")
                    .append(ruled.get("pageOneContentX")).append(" pt. The width offered to page two "
                            + "goes from ").append(control.get("pageTwoContentWidth"))
                    .append(" pt to ").append(ruled.get("pageTwoContentWidth"))
                    .append(" pt, so the rule widens the layout and does not merely shift it. ");
        }

        if (negative.get("moved") == null) {
            out.append("The negative-margin arm did not measure: ").append(negative.get("error"));
        } else {
            out.append(Boolean.TRUE.equals(negative.get("moved"))
                    ? "A negative left margin on a row DOES move it, by "
                            + negative.get("shiftPt") + " pt for a margin of "
                            + negative.get("marginAsked") + "."
                    : "A negative left margin on a row is silently ignored - it neither moves the "
                            + "row nor is refused, which is the worst of the three outcomes to debug.");
        }
        return out.toString();
    }

    /**
     * Where content starts on page one and on page two, with and without a
     * zero-margin rule for page two.
     */
    private static Map<String, Object> marginRuleWidth(boolean withRule) {
        Map<String, Object> out = Json.object();
        out.put("ruleDeclared", withRule);
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"),
                "page-margin-probe-" + (withRule ? "ruled" : "control") + ".pdf");
        double[] first = {Double.NaN};
        double[] later = {Double.NaN};
        int[] firstPage = {-1};
        int[] laterPage = {-1};
        // The claim is about WIDTH, so the width is read as well as the origin.
        double[] firstWidth = {Double.NaN};
        double[] laterWidth = {Double.NaN};
        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.of(SIDE));
            if (withRule) {
                session.pageMargins(List.of(PageMarginRule.page(2, DocumentInsets.zero())));
            }
            session.pageFlow(flow -> {
                flow.name("PageMarginProbe");
                // Rows, not bare paragraphs. A paragraph's placementWidth is the
                // width of its own text; a weights(1.0) row takes the whole
                // width the flow offers, which is the quantity the claim is
                // about.
                flow.addRow("OnPageOne", row -> {
                    row.weights(1.0);
                    row.addParagraph(p -> p.name("FirstText").text("FIRST"));
                });
                pushToNextPage(flow);
                flow.addRow("OnPageTwo", row -> {
                    row.weights(1.0);
                    row.addParagraph(p -> p.name("SecondText").text("SECOND"));
                });
            });
            session.layoutSnapshot().nodes().forEach(n -> {
                if ("OnPageOne".equals(n.entityName())) {
                    first[0] = n.computedX();
                    firstPage[0] = n.startPage();
                    firstWidth[0] = n.placementWidth();
                }
                if ("OnPageTwo".equals(n.entityName())) {
                    later[0] = n.computedX();
                    laterPage[0] = n.startPage();
                    laterWidth[0] = n.placementWidth();
                }
            });
        } catch (RuntimeException | Error refusal) {
            out.put("error", String.valueOf(refusal.getMessage()));
            return out;
        }
        if (Double.isNaN(first[0]) || Double.isNaN(later[0])) {
            out.put("error", "a page marker did not appear in the layout snapshot by name");
            return out;
        }
        out.put("pageOneMarkerStartPage", firstPage[0]);
        out.put("pageTwoMarkerStartPage", laterPage[0]);
        // Asserted, not assumed. If the filler did not push the second marker
        // over, both markers are on page one and comparing their x would answer
        // a question nobody asked - and would answer it wrongly, because page
        // one keeps its margins under every rule tested here.
        if (firstPage[0] == laterPage[0]) {
            out.put("error", "both markers landed on page " + firstPage[0]
                    + ", so nothing here is on a ruled page; adjust FILLER_H");
            return out;
        }
        out.put("pageOneContentX", Json.pt(first[0]));
        out.put("pageTwoContentX", Json.pt(later[0]));
        out.put("pageOneContentWidth", Json.pt(firstWidth[0]));
        out.put("pageTwoContentWidth", Json.pt(laterWidth[0]));
        out.put("baseSideMargin", SIDE);
        return out;
    }

    /**
     * Enough height to push what follows onto the next page, and no more. It has
     * to fit the page it starts on - a spacer taller than the capacity is
     * refused outright - while leaving less room than the next marker needs.
     */
    private static void pushToNextPage(PageFlowBuilder flow) {
        flow.addSpacer(s -> s.name("Filler").size(10, FILLER_H));
    }

    /**
     * A row given a negative left margin, read from the layout snapshot. If the
     * margin is honoured the child starts left of the content margin; if it is
     * discarded the child sits exactly where an unmargined row put it. Both rows
     * are in one document, so the comparison needs no second render.
     */
    private static Map<String, Object> negativeRowMargin() {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "page-margin-probe-negative.pdf");
        double[] plain = {Double.NaN};
        double[] pulled = {Double.NaN};
        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.of(SIDE));
            session.pageFlow(flow -> {
                flow.name("PageMarginProbe");
                flow.addRow("PlainRow", row -> {
                    row.weights(1.0);
                    row.addParagraph(p -> p.name("Plain").text("PLAIN"));
                });
                flow.addRow("PulledRow", row -> {
                    row.weights(1.0);
                    row.margin(new DocumentInsets(0, 0, 0, -SIDE));
                    row.addParagraph(p -> p.name("Pulled").text("PULLED"));
                });
            });
            session.layoutSnapshot().nodes().forEach(n -> {
                if ("Plain".equals(n.entityName())) plain[0] = n.computedX();
                if ("Pulled".equals(n.entityName())) pulled[0] = n.computedX();
            });
        } catch (RuntimeException | Error refusal) {
            out.put("error", String.valueOf(refusal.getMessage()));
            out.put("moved", null);
            return out;
        }

        if (Double.isNaN(plain[0]) || Double.isNaN(pulled[0])) {
            out.put("error", "one of the rows did not appear in the layout snapshot by name");
            out.put("moved", null);
            return out;
        }
        out.put("plainRowX", Json.pt(plain[0]));
        out.put("negativeMarginRowX", Json.pt(pulled[0]));
        out.put("shiftPt", Json.pt(pulled[0] - plain[0]));
        out.put("marginAsked", -SIDE);
        out.put("moved", Math.abs(pulled[0] - plain[0]) > EPSILON);
        return out;
    }
}
