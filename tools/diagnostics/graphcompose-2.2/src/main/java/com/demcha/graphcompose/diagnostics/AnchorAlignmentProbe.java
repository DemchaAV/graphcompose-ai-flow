package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.style.ClipPolicy;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.font.FontName;

/**
 * Where does {@code position(child, dx, dy, CENTER_LEFT)} put a child TALLER
 * than its shape container?
 *
 * <p>Shrinking a band to a marker's height fixed one thing and moved the text
 * inside it by roughly half the height the band lost — which is what you would
 * see if an over-tall child stopped being centred. Layout numbers settle it:
 * the same child is placed in the same band at three vertical offsets, and the
 * probe reports where each one lands.</p>
 *
 * <p>If the child is centred, its centre matches the band's at {@code dy = 0}.
 * If it is clamped to the top, the two centres differ by exactly half the
 * overflow, and the offset that reconciles them is that same half.</p>
 */
final class AnchorAlignmentProbe implements Probes.Probe {

    private static final double BAND = 6.8;
    private static final double CHILD = 13.8;
    private static final double PAGE_H = 400.0;
    private static final double OVERFLOW = (CHILD - BAND) / 2.0;

    @Override
    public String question() {
        return "Does a shape container centre a child taller than itself, or clamp it to the top?";
    }

    @Override
    public Map<String, Object> run() {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "anchor-alignment-probe.pdf");
        Map<String, double[]> measured = new java.util.LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(out).create()) {
            session.pageSize(DocumentPageSize.of(300, PAGE_H));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("AnchorAlignmentProbe").spacing(40).padding(DocumentInsets.zero());
                band(page, "dy0", 0.0);
                band(page, "dyMinus", -OVERFLOW);
                band(page, "dyPlus", OVERFLOW);
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && !n.entityName().isBlank())
                    .forEach(n -> measured.put(n.entityName(), new double[]{
                            // The snapshot's y grows downward from the page top; these
                            // are reported top-down so they read like the page.
                            PAGE_H - n.computedY() - n.placementHeight(),
                            n.placementHeight(),
                            PAGE_H - n.computedY() - n.placementHeight() / 2.0,
                    }));
        }

        Map<String, Object> result = Json.object();
        result.put("arrangement", Map.of(
                "bandHeight", BAND,
                "childHeight", CHILD,
                "overflowHalf", Json.pt(OVERFLOW)));

        List<Object> rows = Json.array();
        for (Map.Entry<String, double[]> entry : measured.entrySet()) {
            Map<String, Object> row = Json.object();
            row.put("node", entry.getKey());
            row.put("top", Json.pt(entry.getValue()[0]));
            row.put("height", Json.pt(entry.getValue()[1]));
            row.put("centre", Json.pt(entry.getValue()[2]));
            rows.add(row);
        }
        result.put("measurements", rows);

        double[] band = measured.get("Band_dy0");
        double[] child = measured.get("Child_dy0");
        if (band == null || child == null) {
            result.put("finding", "inconclusive: the probe's own nodes were not in the snapshot");
            return result;
        }

        double drift = Json.pt(child[2] - band[2]);
        boolean centred = Math.abs(drift) < 0.05;
        result.put("centreDriftAtZeroOffset", drift);
        result.put("topClamped", !centred);
        result.put("finding", centred
                ? "The container centres an over-tall child: both centres agree at dy = 0."
                : "The container top-clamps an over-tall child. Its centre sits " + drift
                        + " pt below the band's, so offsetting the child by " + Json.pt(-drift)
                        + " pt puts the two centres on one line.");
        return result;
    }

    private static void band(PageFlowBuilder page, String name, double dy) {
        page.addContainer(c -> c
                .name("Band_" + name)
                .rectangle(200, BAND)
                // Without OVERFLOW_VISIBLE the child is cut rather than moved, and
                // the question becomes unanswerable.
                .clipPolicy(ClipPolicy.OVERFLOW_VISIBLE)
                .position(child(name), 20, dy, LayerAlign.CENTER_LEFT));
    }

    private static DocumentNode child(String name) {
        return new ParagraphBuilder()
                .name("Child_" + name)
                .text("TITLE")
                .textStyle(DocumentTextStyle.builder().fontName(FontName.LATO).size(11.5).build())
                .lineSpacing(1.2)
                .margin(DocumentInsets.zero())
                .build();
    }
}
