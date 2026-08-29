package com.demcha.graphcompose.diagnostics;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.SpacerBuilder;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.style.ClipPolicy;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.font.FontName;

/**
 * Does {@code padding(...)} on a shape container inset an anchored child?
 *
 * <p>The question a template asks every time a reference shows text inside a
 * card: the copy must not sit against the border, and there are two ways to
 * keep it off. One is padding on the container — the property the layout rules
 * say owns "the children inside their owner". The other is
 * {@code position(child, dx, dy, align)}, an anchor plus a number.</p>
 *
 * <p>The corpus reaches for the second: across seventeen generated templates,
 * anchored children are placed with {@code position(...)} more than twice as
 * often as with a bare anchor, and two templates write
 * {@code padding(DocumentInsets.zero())} on the container and then reintroduce
 * the same inset as a per-child offset constant. Nothing in the shapes skill
 * mentions padding, so an agent that needs a 12 pt gutter has only the offset
 * to reach for — and a computed offset is what the authoring rules exist to
 * keep out of a template.</p>
 *
 * <p>Whether that is a bad habit or the only thing that works is a question
 * about the engine, and it has never been measured. This measures it: the same
 * child, at the same anchor, in three identical containers that differ only in
 * their padding. If padding reaches an anchored child, the child's offset from
 * its container's origin is the padding; if it does not, the offset stays at
 * zero however much padding is asked for.</p>
 *
 * <p>The child is a spacer rather than a paragraph for the reason
 * {@code AnchorAlignmentProbe} gives: its size is asserted by construction, so
 * a font substitution cannot move the answer.</p>
 */
final class ShapePaddingProbe implements Probes.Probe {

    private static final double BOX_W = 200.0;
    private static final double BOX_H = 40.0;
    private static final double CHILD_W = 60.0;
    private static final double CHILD_H = 10.0;
    /** Deliberately taller than BOX_H, to ask whether the box follows its content. */
    private static final double TALL_H = 80.0;

    private static final double UNIFORM = 12.0;
    /** Left-heavy, so the two axes cannot be confused for one another. */
    private static final DocumentInsets ASYMMETRIC = new DocumentInsets(6.0, 0.0, 0.0, 24.0);

    /** One string for both copy cases, so the two are comparable line for line. */
    private static final String COPY =
            "A card holds copy whose height nobody knows in advance, which is the whole reason "
                    + "the container has to size itself to what it is given rather than to a "
                    + "number typed once against a reference screenshot.";

    private static final double PAGE_W = 300.0;
    private static final double PAGE_H = 260.0;

    @Override
    public String question() {
        return "Does padding on a shape container inset a child placed with an anchor, "
                + "or does only position(dx, dy) move it off the border?";
    }

    @Override
    public Map<String, Object> run() {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "shape-padding-probe.pdf");
        Map<String, double[]> measured = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(out).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("ShapePaddingProbe").spacing(20).padding(DocumentInsets.zero());
                bare(page);
                uniform(page);
                asymmetric(page);
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && !n.entityName().isBlank())
                    .forEach(n -> measured.put(n.entityName(), new double[]{
                            n.computedX(),
                            // Top-down. The snapshot's y grows upward from the page
                            // foot, so a top-anchored child reads as a large y and
                            // subtracting is what makes "inset from the top" mean it.
                            PAGE_H - n.computedY() - n.placementHeight(),
                            n.placementWidth(),
                            n.placementHeight(),
                    }));
        }

        Map<String, Object> result = Json.object();
        // The insets are reported from the object itself rather than from the
        // literals above: a record's accessors are the only statement of which
        // number is which side that cannot drift from the constructor.
        result.put("arrangement", Map.of(
                "containerWidth", BOX_W,
                "containerHeight", BOX_H,
                "childWidth", CHILD_W,
                "childHeight", CHILD_H,
                "uniformPadding", UNIFORM,
                "asymmetricPadding", Map.of(
                        "top", Json.pt(ASYMMETRIC.top()),
                        "right", Json.pt(ASYMMETRIC.right()),
                        "bottom", Json.pt(ASYMMETRIC.bottom()),
                        "left", Json.pt(ASYMMETRIC.left()))));

        List<Object> rows = Json.array();
        for (String name : List.of("Bare", "Uniform", "Asymmetric")) {
            double[] box = measured.get("Box_" + name);
            double[] child = measured.get("Child_" + name);
            if (box == null || child == null) continue;
            Map<String, Object> row = Json.object();
            row.put("case", name);
            row.put("containerX", Json.pt(box[0]));
            row.put("containerWidth", Json.pt(box[2]));
            row.put("containerHeight", Json.pt(box[3]));
            row.put("childInsetLeft", Json.pt(child[0] - box[0]));
            row.put("childInsetTop", Json.pt(child[1] - box[1]));
            rows.add(row);
        }
        result.put("measurements", rows);

        double[] bareBox = measured.get("Box_Bare");
        double[] bareChild = measured.get("Child_Bare");
        double[] padBox = measured.get("Box_Uniform");
        double[] padChild = measured.get("Child_Uniform");
        double[] asymBox = measured.get("Box_Asymmetric");
        double[] asymChild = measured.get("Child_Asymmetric");
        if (bareBox == null || bareChild == null || padBox == null || padChild == null
                || asymBox == null || asymChild == null) {
            result.put("finding", "inconclusive: the probe's own nodes were not in the snapshot");
            return result;
        }

        double bareInset = Json.pt(bareChild[0] - bareBox[0]);
        double padInset = Json.pt(padChild[0] - padBox[0]);
        double asymInset = Json.pt(asymChild[0] - asymBox[0]);
        double asymTop = Json.pt(asymChild[1] - asymBox[1]);
        boolean reaches = Math.abs(padInset - bareInset - UNIFORM) < 0.05;

        double widthGrowth = Json.pt(padBox[2] - bareBox[2]);
        double heightGrowth = Json.pt(padBox[3] - bareBox[3]);
        boolean grows = Math.abs(widthGrowth) > 0.05 || Math.abs(heightGrowth) > 0.05;
        // Outside the declared rectangle, or carved out of it? The difference is
        // the whole reason a template that adds padding to match a reference can
        // fail the visual diff it was trying to pass.
        boolean growsByTheFullPadding =
                Math.abs(widthGrowth - 2 * UNIFORM) < 0.05 && Math.abs(heightGrowth - 2 * UNIFORM) < 0.05;

        result.put("paddingReachesAnchoredChild", reaches);
        result.put("paddingGrowsTheContainerBox", grows);
        result.put("paddingIsAddedOutsideTheDeclaredRectangle", growsByTheFullPadding);
        result.put("declaredWidth", BOX_W);
        result.put("paddedWidth", Json.pt(padBox[2]));
        result.put("paddedHeight", Json.pt(padBox[3]));
        result.put("bareInsetLeft", bareInset);
        result.put("paddedInsetLeft", padInset);
        result.put("asymmetricInsetLeft", asymInset);
        result.put("asymmetricInsetTop", asymTop);

        String sizing = sizing(result);

        result.put("finding", (reaches
                ? "padding(" + UNIFORM + ") moves an anchor-placed child in by " + (padInset - bareInset)
                        + " pt, and the asymmetric case insets by " + asymInset + " pt on the left and "
                        + asymTop + " pt on the top — so the gutter inside a shape belongs on the "
                        + "container as padding, not on each child as a position offset. But the box "
                        + (growsByTheFullPadding
                                ? "grows by the full padding: rectangle(" + BOX_W + ", " + BOX_H
                                        + ") with padding(" + UNIFORM + ") lays out as " + Json.pt(padBox[2])
                                        + " x " + Json.pt(padBox[3])
                                        + ". The padding is added outside the rectangle you declared, so a "
                                        + "shape sized to a reference must be declared smaller by the padding "
                                        + "it is given."
                                : grows
                                        ? "changes size by " + widthGrowth + " x " + heightGrowth + " pt."
                                        : "keeps the size it was declared with.")
                : "padding does not reach a child placed with an anchor: the child sits " + padInset
                        + " pt from the container's origin with padding(" + UNIFORM + ") and " + bareInset
                        + " pt without it. Keeping copy off a shape's border needs "
                        + "position(child, dx, dy, align), and that offset is the engine's answer, "
                        + "not a shortcut.") + " " + sizing);
        return result;
    }

    /**
     * Does the container size itself to its content, or to the rectangle it was
     * declared with?
     *
     * <p>The first half of this probe measures a child SMALLER than its
     * container, where "padding grows the box" and "padding is carved out of the
     * box" are the only two answers. That is not how a card is written. A card
     * holds a paragraph whose height nobody knows in advance, and the layout a
     * template wants is the one where the text wraps inside the padding and the
     * card grows to hold it — sizing driven by content, with
     * {@code rectangle(w, h)} as a minimum rather than a promise.</p>
     *
     * <p>Two known observations say a container does NOT grow for a child larger
     * than itself: it clamps an over-tall child to the top and an over-wide one
     * to the left, and with {@code OVERFLOW_VISIBLE} the child spills. Both were
     * measured through {@code position(...)} on a container with no padding, so
     * neither settles this. Here the same over-sized child goes in three ways —
     * bare, padded, and as a real paragraph — and the container's laid-out size
     * is compared against both the rectangle it declared and the content it
     * holds.</p>
     *
     * <p>The paragraph case also answers the question underneath the question:
     * what width does text wrap at? If the container establishes a content box,
     * the paragraph is laid out at the declared width minus the horizontal
     * padding, and that is what makes the layout right rather than merely
     * un-clipped.</p>
     */
    private static String sizing(Map<String, Object> result) {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "shape-padding-probe-sizing.pdf");
        Map<String, double[]> measured = new LinkedHashMap<>();

        try (DocumentSession session = GraphCompose.document(out).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, 700));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("ShapePaddingSizing").spacing(20).padding(DocumentInsets.zero());
                // No clipPolicy: the question is what the box measures, and the
                // corpus's OVERFLOW_VISIBLE is about what survives painting.
                page.addContainer(c -> c
                        .name("Box_TallBare")
                        .rectangle(BOX_W, BOX_H)
                        .topLeft(tall("TallBare")));
                page.addContainer(c -> c
                        .name("Box_TallPadded")
                        .rectangle(BOX_W, BOX_H)
                        .padding(UNIFORM)
                        .topLeft(tall("TallPadded")));
                page.addContainer(c -> c
                        .name("Box_TextPadded")
                        .rectangle(BOX_W, BOX_H)
                        .padding(UNIFORM)
                        .topLeft(copy("TextPadded")));

                // The other primitive for "a rectangle with copy in it", and the
                // one backgrounds-and-panels sends a rectangular card to: a
                // section carrying its own fill. Its surface is bounded by what
                // it laid out, so this is where content-driven sizing is meant
                // to live, and the contrast with the fixed shape above is the
                // answer a template author actually needs.
                page.addSection("Box_Section", s -> s
                        .fillColor(DocumentColor.rgb(230, 230, 235))
                        // Insets, not a double: padding(double) is a
                        // ShapeContainerBuilder convenience, and a flow builder
                        // takes DocumentInsets or four floats.
                        .padding(DocumentInsets.of(UNIFORM))
                        .addParagraph(p -> p
                                .name("Child_Section")
                                .text(COPY)
                                .textStyle(DocumentTextStyle.builder()
                                        .fontName(FontName.LATO).size(9.0).build())
                                .lineSpacing(1.2)
                                .margin(DocumentInsets.zero())));

                // Rounded, filled and padded in one call, on the flow builder
                // rather than on a shape. If this sizes to its content, then
                // "the corners are rounded" is not a reason to leave the flow
                // for a fixed box, and the routing advice that says it is is
                // wrong.
                page.addSection("Box_SoftPanel", s -> s
                        .softPanel(DocumentColor.rgb(230, 230, 235), 8.0, UNIFORM)
                        .addParagraph(p -> p
                                .name("Child_SoftPanel")
                                .text(COPY)
                                .textStyle(DocumentTextStyle.builder()
                                        .fontName(FontName.LATO).size(9.0).build())
                                .lineSpacing(1.2)
                                .margin(DocumentInsets.zero())));
            });
            session.layoutSnapshot().nodes().stream()
                    .filter(n -> n.entityName() != null && !n.entityName().isBlank())
                    .forEach(n -> measured.put(n.entityName(), new double[]{
                            n.computedX(), n.placementWidth(), n.placementHeight(),
                    }));
        } catch (Exception failure) {
            result.put("sizingError", failure.getClass().getSimpleName() + ": " + failure.getMessage());
            return "The content-sizing case could not be measured: " + failure.getMessage();
        }

        List<Object> rows = Json.array();
        for (String name : List.of("TallBare", "TallPadded", "TextPadded", "Section", "SoftPanel")) {
            double[] box = measured.get("Box_" + name);
            double[] child = measured.get("Child_" + name);
            if (box == null || child == null) continue;
            Map<String, Object> row = Json.object();
            row.put("case", name);
            row.put("declared", BOX_W + " x " + BOX_H);
            row.put("containerWidth", Json.pt(box[1]));
            row.put("containerHeight", Json.pt(box[2]));
            row.put("childWidth", Json.pt(child[1]));
            row.put("childHeight", Json.pt(child[2]));
            rows.add(row);
        }
        result.put("contentSizing", rows);

        double[] tallBox = measured.get("Box_TallPadded");
        double[] tallChild = measured.get("Child_TallPadded");
        double[] textBox = measured.get("Box_TextPadded");
        double[] textChild = measured.get("Child_TextPadded");
        if (tallBox == null || tallChild == null || textBox == null || textChild == null) {
            result.put("contentSizingFinding", "inconclusive: the sizing nodes were not in the snapshot");
            return "The content-sizing case was inconclusive.";
        }

        boolean growsForOverTallChild = Math.abs(tallBox[2] - (tallChild[2] + 2 * UNIFORM)) < 0.05;
        boolean textGrowsTheBox = textBox[2] > BOX_H + 2 * UNIFORM + 0.05;
        boolean textWrapsInsideThePadding = Math.abs(textChild[1] - (BOX_W - 2 * UNIFORM)) < 0.5;

        result.put("containerGrowsToFitAnOverTallChild", growsForOverTallChild);
        result.put("aParagraphGrowsTheContainer", textGrowsTheBox);
        result.put("aParagraphWrapsAtTheContentWidth", textWrapsInsideThePadding);
        result.put("paragraphWidth", Json.pt(textChild[1]));
        result.put("contentWidth", Json.pt(BOX_W - 2 * UNIFORM));

        double[] sectionBox = measured.get("Box_Section");
        double[] sectionChild = measured.get("Child_Section");
        if (sectionBox != null && sectionChild != null) {
            // The comparison the caller came for: does the OTHER rectangle grow?
            result.put("sectionHeight", Json.pt(sectionBox[2]));
            result.put("sectionCopyHeight", Json.pt(sectionChild[2]));
            result.put("sectionCopyWidth", Json.pt(sectionChild[1]));
            result.put("sectionHeightIsCopyPlusPadding",
                    Math.abs(sectionBox[2] - (sectionChild[2] + 2 * UNIFORM)) < 0.5);
            // Against the section's own width, not the page's: a section takes
            // the width the page margins leave it, and the relation being asked
            // about is child = container - padding, whatever the container got.
            result.put("sectionWidth", Json.pt(sectionBox[1]));
            result.put("sectionCopyWrapsInsideThePadding",
                    Math.abs(sectionChild[1] - (sectionBox[1] - 2 * UNIFORM)) < 0.5);
        }

        double[] panelBox = measured.get("Box_SoftPanel");
        double[] panelChild = measured.get("Child_SoftPanel");
        if (panelBox != null && panelChild != null) {
            result.put("softPanelHeight", Json.pt(panelBox[2]));
            result.put("softPanelCopyHeight", Json.pt(panelChild[2]));
            result.put("softPanelHeightIsCopyPlusPadding",
                    Math.abs(panelBox[2] - (panelChild[2] + 2 * UNIFORM)) < 0.5);
            result.put("softPanelCopyWrapsInsideThePadding",
                    Math.abs(panelChild[1] - (panelBox[1] - 2 * UNIFORM)) < 0.5);
        }

        String sentence = growsForOverTallChild || textGrowsTheBox
                ? "The container sizes itself to its content: rectangle(" + BOX_W + ", " + BOX_H
                        + ") holding a " + Json.pt(tallChild[2]) + " pt child with padding(" + UNIFORM
                        + ") lays out " + Json.pt(tallBox[2]) + " pt tall, and a paragraph makes it "
                        + Json.pt(textBox[2]) + " pt. The declared rectangle is a minimum, not a promise, "
                        + "so padding is what gives the content its box"
                        + (textWrapsInsideThePadding
                                ? " — the paragraph wraps at " + Json.pt(textChild[1])
                                        + " pt, the declared width less the horizontal padding."
                                : ", though the paragraph is " + Json.pt(textChild[1])
                                        + " pt wide against a content width of " + Json.pt(BOX_W - 2 * UNIFORM)
                                        + " pt.")
                : "The container does not grow for content larger than itself: rectangle(" + BOX_W + ", "
                        + BOX_H + ") holding a " + Json.pt(tallChild[2]) + " pt child stays "
                        + Json.pt(tallBox[2]) + " pt tall, and the paragraph case measures "
                        + Json.pt(textBox[2]) + " pt. A shape must be declared big enough for what it holds.";
        result.put("contentSizingFinding", sentence);
        return sentence;
    }

    private static void bare(PageFlowBuilder page) {
        page.addContainer(c -> c
                .name("Box_Bare")
                .rectangle(BOX_W, BOX_H)
                .clipPolicy(ClipPolicy.OVERFLOW_VISIBLE)
                .topLeft(child("Bare")));
    }

    private static void uniform(PageFlowBuilder page) {
        page.addContainer(c -> c
                .name("Box_Uniform")
                .rectangle(BOX_W, BOX_H)
                .clipPolicy(ClipPolicy.OVERFLOW_VISIBLE)
                .padding(UNIFORM)
                .topLeft(child("Uniform")));
    }

    private static void asymmetric(PageFlowBuilder page) {
        page.addContainer(c -> c
                .name("Box_Asymmetric")
                .rectangle(BOX_W, BOX_H)
                .clipPolicy(ClipPolicy.OVERFLOW_VISIBLE)
                .padding(ASYMMETRIC)
                .topLeft(child("Asymmetric")));
    }

    /** A child whose size is asserted rather than measured. */
    private static DocumentNode child(String name) {
        return new SpacerBuilder()
                .name("Child_" + name)
                .size(CHILD_W, CHILD_H)
                .margin(DocumentInsets.zero())
                .build();
    }

    /** Taller than the box it goes in, by a round number. */
    private static DocumentNode tall(String name) {
        return new SpacerBuilder()
                .name("Child_" + name)
                .size(CHILD_W, TALL_H)
                .margin(DocumentInsets.zero())
                .build();
    }

    /**
     * Real copy, long enough to wrap several times.
     *
     * <p>The spacer answers "does the box grow"; only a paragraph answers "at
     * what width does the text wrap", which is the half that decides whether a
     * card's layout is right or merely uncut.</p>
     */
    private static DocumentNode copy(String name) {
        return new ParagraphBuilder()
                .name("Child_" + name)
                .text(COPY)
                .textStyle(DocumentTextStyle.builder().fontName(FontName.LATO).size(9.0).build())
                .lineSpacing(1.2)
                .margin(DocumentInsets.zero())
                .build();
    }
}
