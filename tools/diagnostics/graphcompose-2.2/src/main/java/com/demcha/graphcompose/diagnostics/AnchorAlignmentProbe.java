package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.SpacerBuilder;
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
 *
 * <h2>Both axes, one run</h2>
 *
 * <p>A create run building a masthead found the same thing happening
 * horizontally — an over-wide child landing half its overflow to the right of
 * where centring would put it — and had no probe to settle it, so the finding
 * died in one project's notes. The vertical clamp has a twin, and a caller
 * asking about one almost always needs the other, so this probe answers both
 * rather than leaving the second to a probe nobody writes.</p>
 *
 * <p>The horizontal arrangement deliberately uses a fixed-size spacer rather
 * than a paragraph: its width is asserted by construction instead of falling
 * out of text metrics, so a font substitution cannot move the answer.</p>
 */
final class AnchorAlignmentProbe implements Probes.Probe {

    private static final double BAND = 6.8;
    private static final double CHILD = 13.8;
    private static final double PAGE_H = 400.0;
    private static final double OVERFLOW = (CHILD - BAND) / 2.0;

    /** The horizontal twin. Round numbers, so half the overflow is unmistakable. */
    private static final double NARROW_W = 60.0;
    private static final double WIDE_W = 140.0;
    private static final double WIDE_OVERFLOW = (WIDE_W - NARROW_W) / 2.0;
    private static final double PAGE_W = 300.0;

    @Override
    public String question() {
        return "Does a shape container centre a child larger than itself, or clamp it — "
                + "vertically for an over-tall child, horizontally for an over-wide one?";
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
        String vertical = centred
                ? "The container centres an over-tall child: both centres agree at dy = 0."
                : "The container top-clamps an over-tall child. Its centre sits " + drift
                        + " pt below the band's, so offsetting the child by " + Json.pt(-drift)
                        + " pt puts the two centres on one line.";

        String horizontal = horizontal(result);
        result.put("finding", vertical + " " + horizontal);
        return result;
    }

    /**
     * The horizontal twin: an over-wide child in a narrow container, centred.
     *
     * <p>Measured the same way and reported the same way, so the two axes can be
     * compared without translating between them. Adds its own keys to
     * {@code result} and returns the sentence describing what it found.</p>
     */
    private static String horizontal(Map<String, Object> result) {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "anchor-alignment-probe-wide.pdf");
        Map<String, double[]> measured = new java.util.LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(out).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, 120));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("AnchorAlignmentWide").spacing(20).padding(DocumentInsets.zero());
                page.addContainer(c -> c
                        .name("NarrowBand")
                        .rectangle(NARROW_W, 20)
                        // Same reason as the vertical case: without this the child is
                        // cut rather than moved, and the question is unanswerable.
                        .clipPolicy(ClipPolicy.OVERFLOW_VISIBLE)
                        .position(wideChild(), 0, 0, LayerAlign.CENTER));
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && !n.entityName().isBlank())
                    .forEach(n -> measured.put(n.entityName(), new double[]{
                            n.computedX(),
                            n.placementWidth(),
                            n.computedX() + n.placementWidth() / 2.0,
                    }));
        } catch (Exception failure) {
            result.put("horizontalError", failure.getClass().getSimpleName() + ": " + failure.getMessage());
            return "The horizontal case could not be measured: " + failure.getMessage();
        }

        result.put("horizontalArrangement", Map.of(
                "containerWidth", NARROW_W,
                "childWidth", WIDE_W,
                "overflowHalf", Json.pt(WIDE_OVERFLOW)));

        double[] band = measured.get("NarrowBand");
        double[] child = measured.get("WideChild");
        if (band == null || child == null) {
            result.put("horizontalFinding", "inconclusive: the probe's own nodes were not in the snapshot");
            return "The horizontal case was inconclusive.";
        }

        double drift = Json.pt(child[2] - band[2]);
        boolean centred = Math.abs(drift) < 0.05;
        result.put("horizontalMeasurements", Map.of(
                "containerX", Json.pt(band[0]), "containerWidth", Json.pt(band[1]),
                "containerCentreX", Json.pt(band[2]),
                "childX", Json.pt(child[0]), "childWidth", Json.pt(child[1]),
                "childCentreX", Json.pt(child[2])));
        result.put("horizontalDriftAtZeroOffset", drift);
        result.put("horizontallyClamped", !centred);
        // Reported, never asserted: whether the drift happens to equal half the
        // overflow is the interesting part, so it is computed and shown rather
        // than assumed by the sentence.
        result.put("horizontalDriftIsHalfOverflow", Math.abs(Math.abs(drift) - WIDE_OVERFLOW) < 0.05);

        String sentence = centred
                ? "Horizontally it centres an over-wide child: both centres agree at dx = 0."
                : "Horizontally it clamps too. The child's centre sits " + drift + " pt "
                        + (drift > 0 ? "right" : "left") + " of the container's"
                        + (Math.abs(Math.abs(drift) - WIDE_OVERFLOW) < 0.05
                                ? ", which is exactly half the overflow" : "")
                        + ", so offsetting by " + Json.pt(-drift) + " pt puts them on one axis.";
        result.put("horizontalFinding", sentence);
        return sentence;
    }

    /**
     * A spacer, not a shape container.
     *
     * <p>The obvious choice — {@code ShapeContainerBuilder.rectangle(w, h)} — is
     * rejected at build time with "must have at least one layer", so an empty
     * container cannot be used as a measuring stick. A spacer carries the exact
     * size it is given and needs no content, which is precisely what a probe
     * wants: a child whose width is asserted rather than measured.</p>
     */
    private static DocumentNode wideChild() {
        return new SpacerBuilder()
                .name("WideChild")
                .size(WIDE_W, 10)
                .margin(DocumentInsets.zero())
                .build();
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
