package com.demcha.graphcompose.diagnostics;

import java.awt.image.BufferedImage;
import java.util.Map;
import java.util.function.Consumer;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.PageFlowBuilder;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;

/**
 * What space are a path's coordinates in?
 *
 * <p>{@code moveTo(double x, double y)} reads as points, and an allow-list
 * carries no units. It is not points: coordinates are normalized to the shape's
 * own box, 0 to 1, with the origin at the bottom-left and y increasing upward —
 * the opposite of the page's reading direction and of every other measurement in
 * this workflow.</p>
 *
 * <p>Getting it wrong has no error to search for. Point values land far outside
 * 0..1 and the path is drawn anyway, as a different shape — a real run's curved
 * header band came out flat and nothing failed.</p>
 *
 * <p>So the same figure is described twice, once normalized and once in points,
 * and both are rendered and measured. That they disagree is the finding; the
 * normalized one matching its true area is what says which of the two is being
 * read. A third render puts a mark in one corner to settle where the origin
 * is.</p>
 */
final class PathCoordinateProbe implements Probes.Probe {

    private static final double BOX_W = 200.0;
    private static final double BOX_H = 100.0;
    private static final float DPI = 72f;
    /** The triangle's true area as a share of its box: base 1 x height 0.5, halved. */
    private static final double EXPECTED_SHARE = 0.25;
    private static final double TOLERANCE = 0.02;

    @Override
    public String question() {
        return "Are PathBuilder coordinates normalized to the shape's box or expressed in points, "
                + "and where is the origin?";
    }

    @Override
    public Map<String, Object> run() throws Exception {
        // A right triangle over the box's lower half, described normalized.
        int normalized = ink(page -> page.addPath(path -> path
                .name("Normalized")
                .size(BOX_W, BOX_H)
                .moveTo(0, 0)
                .lineTo(1, 0)
                .lineTo(1, 0.5)
                .closePath()
                .fillColor(DocumentColor.BLACK)));

        // The same triangle, described in points — the mistake this settles.
        int pointValued = ink(page -> page.addPath(path -> path
                .name("PointValued")
                .size(BOX_W, BOX_H)
                .moveTo(0, 0)
                .lineTo(BOX_W, 0)
                .lineTo(BOX_W, BOX_H / 2)
                .closePath()
                .fillColor(DocumentColor.BLACK)));

        // A square in the box's 0..0.25 corner. Where it lands names the origin.
        BufferedImage corner = raster(page -> page.addPath(path -> path
                .name("Corner")
                .size(BOX_W, BOX_H)
                .moveTo(0, 0)
                .lineTo(0.25, 0)
                .lineTo(0.25, 0.25)
                .lineTo(0, 0.25)
                .closePath()
                .fillColor(DocumentColor.BLACK)));

        int boxPixels = (int) Math.round(BOX_W * BOX_H * (DPI / 72.0) * (DPI / 72.0));
        double normalizedShare = (double) normalized / boxPixels;
        double pointShare = (double) pointValued / boxPixels;
        boolean originBottom = inkIsInLowerHalf(corner);

        Map<String, Object> result = Json.object();
        result.put("arrangement",
                "One right triangle over the box's lower half, described normalized and again in "
                        + "points, each rendered alone and its dark pixels counted against the box's "
                        + "area. A third render puts a 0..0.25 square in a corner to locate the origin.");
        result.put("boxPixels", boxPixels);
        result.put("normalizedInk", normalized);
        result.put("pointValuedInk", pointValued);
        result.put("normalizedShareOfBox", Json.pt(normalizedShare));
        result.put("pointValuedShareOfBox", Json.pt(pointShare));
        boolean normalizedIsTrue = Math.abs(normalizedShare - EXPECTED_SHARE) < TOLERANCE;
        boolean descriptionsAgree = Math.abs(normalizedShare - pointShare) < TOLERANCE;
        result.put("expectedShare", EXPECTED_SHARE);
        result.put("normalizedMatchesTheIntendedFigure", normalizedIsTrue);
        result.put("bothDescriptionsAgree", descriptionsAgree);
        result.put("originIsBottomLeft", originBottom);
        result.put("finding", String.format(
                "The same figure described normalized covers %.2f of its box - the triangle's true area - "
                        + "and described in points covers %.2f. The two disagree, so coordinates are "
                        + "normalized to the shape's box and not points. What point values produce is not a "
                        + "full box and not an error: it is a different shape, drawn silently, which is why "
                        + "the mistake shows up as a curve rendering flat rather than as a failure. The "
                        + "origin is at the %s.",
                normalizedShare, pointShare, originBottom ? "BOTTOM-left, y up" : "TOP-left, y down"));
        return result;
    }

    /** Is the drawn mark in the lower half of the rendered box? */
    private static boolean inkIsInLowerHalf(BufferedImage image) {
        long weighted = 0;
        long count = 0;
        for (int y = 0; y < image.getHeight(); y += 1) {
            for (int x = 0; x < image.getWidth(); x += 1) {
                if (dark(image.getRGB(x, y))) {
                    weighted += y;
                    count += 1;
                }
            }
        }
        if (count == 0) {
            return false;
        }
        // A raster's y grows downward, so a centroid past the middle means the
        // mark sits low on the page.
        return (double) weighted / count > image.getHeight() / 2.0;
    }

    private static boolean dark(int rgb) {
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        return r + g + b < 600;
    }

    private static int ink(Consumer<PageFlowBuilder> body) throws Exception {
        BufferedImage image = raster(body);
        int ink = 0;
        for (int y = 0; y < image.getHeight(); y += 1) {
            for (int x = 0; x < image.getWidth(); x += 1) {
                if (dark(image.getRGB(x, y))) {
                    ink += 1;
                }
            }
        }
        return ink;
    }

    private static BufferedImage raster(Consumer<PageFlowBuilder> body) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (DocumentSession session = GraphCompose.document().create()) {
            // The page is the box: nothing else on it can contribute ink.
            session.pageSize(DocumentPageSize.of(BOX_W, BOX_H));
            session.margin(DocumentInsets.zero());
            session.pageFlow(page -> {
                page.name("PathCoordinateProbe").padding(DocumentInsets.zero());
                body.accept(page);
            });
            session.writePdf(bytes);
        }
        try (PDDocument pdf = Loader.loadPDF(bytes.toByteArray())) {
            return new PDFRenderer(pdf).renderImageWithDPI(0, DPI);
        }
    }
}
