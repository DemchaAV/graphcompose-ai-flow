package com.demcha.graphcompose.diagnostics;

import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.imageio.ImageIO;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;

/**
 * Is a shape container's own fill painted where its layout box says it is, and
 * does a bottom margin move it?
 *
 * <p>This is the one probe that has to render. A layout snapshot cannot settle
 * it, because the failure mode is precisely that the layout is right and the
 * painting is not — the acceptance run saw a fill sitting above its box by an
 * amount that matched the container's bottom margin exactly.</p>
 *
 * <p>Two identical circles, one with a bottom margin and one without. Each is
 * measured twice: where the snapshot puts its box, and where its colour first
 * appears in the raster. A container whose paint matches its box has a drift
 * of zero.</p>
 */
final class ShapePaintProbe implements Probes.Probe {

    private static final double PAGE_W = 200.0;
    private static final double PAGE_H = 300.0;
    private static final double PAD_TOP = 30.0;
    private static final double DIAMETER = 60.0;
    private static final double BOTTOM_MARGIN = 22.0;
    private static final int DPI = 150;

    @Override
    public String question() {
        return "Does a shape container paint its own fill at its layout box, and does a "
                + "bottom margin displace the paint?";
    }

    @Override
    public Map<String, Object> run() throws Exception {
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "shape-paint-probe.pdf");
        Path png = Path.of(System.getProperty("java.io.tmpdir"), "shape-paint-probe.png");
        Map<String, Double> boxTop = new LinkedHashMap<>();
        double redPaintTop;
        double bluePaintTop;

        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> page
                    .name("ShapePaintProbe")
                    .spacing(0)
                    .padding(new DocumentInsets(PAD_TOP, 0, 0, 0))
                    .addContainer(c -> c
                            .name("WithBottomMargin")
                            .circle(DIAMETER)
                            .fillColor(DocumentColor.rgb(255, 0, 0))
                            .margin(new DocumentInsets(0, 0, BOTTOM_MARGIN, 0))
                            .center(dot()))
                    .addContainer(c -> c
                            .name("NoMargin")
                            .circle(DIAMETER)
                            .fillColor(DocumentColor.rgb(0, 0, 255))
                            .center(dot())));

            session.layoutSnapshot().nodes().stream()
                    .filter(n -> "WithBottomMargin".equals(n.entityName()) || "NoMargin".equals(n.entityName()))
                    .forEach(n -> boxTop.put(n.entityName(),
                            PAGE_H - n.computedY() - n.placementHeight()));

            BufferedImage image = session.toImage(0, DPI);
            ImageIO.write(image, "png", png.toFile());
            double pxPerPt = image.getHeight() / PAGE_H;
            redPaintTop = firstRow(image, 200, 80, 80) / pxPerPt;
            bluePaintTop = firstRow(image, 80, 80, 200) / pxPerPt;
        }

        Map<String, Object> result = Json.object();
        result.put("arrangement", Map.of(
                "diameter", DIAMETER,
                "bottomMarginOnFirst", BOTTOM_MARGIN,
                "dpi", DPI));

        List<Object> rows = Json.array();
        rows.add(row("WithBottomMargin", boxTop.get("WithBottomMargin"), redPaintTop));
        rows.add(row("NoMargin", boxTop.get("NoMargin"), bluePaintTop));
        result.put("measurements", rows);
        result.put("previewPng", png.toAbsolutePath().toString());

        Double withBox = boxTop.get("WithBottomMargin");
        Double withoutBox = boxTop.get("NoMargin");
        if (withBox == null || withoutBox == null || redPaintTop < 0 || bluePaintTop < 0) {
            result.put("finding", "inconclusive: a container was missing from the snapshot or the raster");
            return result;
        }

        double marginedDrift = Json.pt(redPaintTop - withBox);
        double plainDrift = Json.pt(bluePaintTop - withoutBox);
        result.put("paintDriftWithMargin", marginedDrift);
        result.put("paintDriftWithoutMargin", plainDrift);

        boolean marginMoves = Math.abs(marginedDrift) > 1.0 && Math.abs(plainDrift) <= 1.0;
        result.put("marginDisplacesPaint", marginMoves);
        result.put("finding", marginMoves
                ? "A bottom margin displaces the fill by " + marginedDrift + " pt while the "
                        + "unmargined container paints at its box. Keep margins off shape containers "
                        + "and put the gap on the enclosing section."
                : Math.abs(marginedDrift) <= 1.0 && Math.abs(plainDrift) <= 1.0
                        ? "Both containers paint at their layout box: fill placement is sound on this build."
                        : "Both containers drift (" + marginedDrift + " pt and " + plainDrift
                                + " pt), so the cause is not the margin.");
        return result;
    }

    private static Map<String, Object> row(String name, Double box, double paint) {
        Map<String, Object> out = Json.object();
        out.put("node", name);
        out.put("boxTop", box == null ? null : Json.pt(box));
        out.put("paintTop", paint < 0 ? null : Json.pt(paint));
        return out;
    }

    /** A shape container must carry at least one layer, so give it an empty one. */
    private static DocumentNode dot() {
        return new ParagraphBuilder().text(" ").margin(DocumentInsets.zero()).build();
    }

    /** First raster row holding a pixel near the given colour, or -1. */
    private static int firstRow(BufferedImage image, int r, int g, int b) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int pr = (rgb >> 16) & 0xFF;
                int pg = (rgb >> 8) & 0xFF;
                int pb = rgb & 0xFF;
                if (Math.abs(pr - r) < 60 && Math.abs(pg - g) < 60 && Math.abs(pb - b) < 60) {
                    return y;
                }
            }
        }
        return -1;
    }
}
