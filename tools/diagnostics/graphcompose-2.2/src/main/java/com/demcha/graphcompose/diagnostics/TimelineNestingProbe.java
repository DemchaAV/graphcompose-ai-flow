package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.TimelineMarker;
import com.demcha.compose.document.style.DocumentColor;

/**
 * Can {@code addTimeline(...)} live inside a row cell — that is, in the main
 * column of a two-column page?
 *
 * <p>This matters more than it sounds. A CV's experience section is the
 * obvious use for a timeline, and a two-column CV puts that section in a row
 * cell. If the primitive cannot go there, the choice is between restructuring
 * the page and drawing the rail some other way, and it is worth knowing which
 * before writing the template rather than after the first render.</p>
 *
 * <p>The probe builds the same timeline twice — once at the top level, once
 * inside a row cell — and reports whether each attempt survived and where its
 * entries landed. A timeline that throws inside a row cell answers the
 * question; so does one that builds but stacks its entries wrongly.</p>
 */
final class TimelineNestingProbe implements Probes.Probe {

    @Override
    public String question() {
        return "Can addTimeline(...) be used inside a row cell, as a two-column page requires?";
    }

    @Override
    public Map<String, Object> run() {
        Map<String, Object> topLevel = attempt(false);
        Map<String, Object> inRowCell = attempt(true);

        Map<String, Object> result = Json.object();
        result.put("topLevel", topLevel);
        result.put("insideRowCell", inRowCell);

        boolean topOk = Boolean.TRUE.equals(topLevel.get("built"));
        boolean cellOk = Boolean.TRUE.equals(inRowCell.get("built"));
        result.put("usableInRowCell", cellOk);

        if (!topOk) {
            result.put("finding", "inconclusive: the timeline did not build even at the top level - "
                    + topLevel.get("error"));
        } else if (cellOk) {
            result.put("finding", "addTimeline works inside a row cell on this build.");
        } else {
            result.put("finding", "addTimeline cannot be used inside a row cell: "
                    + inRowCell.get("error")
                    + ". Draw the rail another way - an accent on the section holding the entries "
                    + "keeps its height derived from the entries rather than computed against today's text.");
        }
        return result;
    }

    /** Build a two-entry timeline, optionally nested in a row cell. Never throws. */
    private static Map<String, Object> attempt(boolean nested) {
        Map<String, Object> out = Json.object();
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"),
                nested ? "timeline-in-cell-probe.pdf" : "timeline-top-level-probe.pdf");
        Map<String, double[]> nodes = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page -> {
                page.name("TimelineNestingProbe").spacing(20);
                if (nested) {
                    page.addRow("OuterRow", outer -> {
                        outer.weights(0.3, 0.7);
                        outer.addSection("Sidebar", cell -> cell
                                .addParagraph(p -> p.name("SidebarText").text("SIDEBAR")));
                        outer.addSection("MainColumn", cell -> cell.addTimeline(TimelineNestingProbe::entries));
                    });
                } else {
                    page.addTimeline(TimelineNestingProbe::entries);
                }
            });

            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && n.entityName().startsWith("Entry"))
                    .forEach(n -> nodes.put(n.entityName(),
                            new double[]{n.computedX(), n.computedY()}));
            out.put("built", true);
        } catch (RuntimeException failure) {
            // A refusal is an answer, so it is reported rather than propagated.
            out.put("built", false);
            out.put("error", failure.getClass().getSimpleName() + ": " + failure.getMessage());
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
        out.put("entries", rows);

        // Entries run down a rail, so they should share an x and differ in y.
        double[] first = nodes.get("Entry1");
        double[] second = nodes.get("Entry2");
        if (first != null && second != null) {
            out.put("entriesStackVertically",
                    Math.abs(first[0] - second[0]) < 0.5 && Math.abs(first[1] - second[1]) > 0.5);
        }
        return out;
    }

    /**
     * The same two entries in both placements. Passed as a method reference to
     * whichever builder is being tested, so the two attempts differ only in
     * where the timeline is added.
     */
    private static void entries(com.demcha.compose.document.dsl.TimelineBuilder timeline) {
        TimelineMarker marker = TimelineMarker.dot(6.0, DocumentColor.rgb(0, 0, 0));
        timeline.entry(marker, entry -> entry
                .add(section -> section.addParagraph(p -> p.name("Entry1").text("FIRST"))));
        timeline.entry(marker, entry -> entry
                .add(section -> section.addParagraph(p -> p.name("Entry2").text("SECOND"))));
    }
}
