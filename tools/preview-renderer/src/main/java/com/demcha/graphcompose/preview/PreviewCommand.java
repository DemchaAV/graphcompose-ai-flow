package com.demcha.graphcompose.preview;

import java.awt.image.BufferedImage;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

/**
 * PDF -> PNG conversion using Apache PDFBox 3.x.
 *
 * <p>Inputs are passed as parsed flags from {@link PreviewRenderer}:
 * {@code --pdf}, {@code --out}, optional {@code --dpi} (default 150),
 * optional {@code --page} (default 0, first page).
 */
final class PreviewCommand {

    private static final int DEFAULT_DPI = 150;
    private static final int DEFAULT_PAGE = 0;

    private PreviewCommand() {
        // command dispatch only
    }

    static int run(Map<String, String> flags, PrintStream out, PrintStream err) throws Exception {
        Path pdfPath = requirePath(flags, "pdf");
        Path outPath = requirePathRaw(flags, "out");
        int dpi = parseIntOrDefault(flags, "dpi", DEFAULT_DPI);
        int page = parseIntOrDefault(flags, "page", DEFAULT_PAGE);

        if (!Files.isRegularFile(pdfPath)) {
            err.println("pdf not found or not a regular file: " + pdfPath);
            return 1;
        }
        if (!Files.isReadable(pdfPath)) {
            err.println("pdf is not readable: " + pdfPath);
            return 1;
        }

        Path parent = outPath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        runRender(pdfPath, outPath, dpi, page);
        out.println(outPath.toAbsolutePath());
        return 0;
    }

    /**
     * Visible to tests: render a single page to a PNG, no flag-parsing involved.
     */
    static void runRender(Path pdfPath, Path outPath, int dpi, int pageIndex) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdfPath.toFile())) {
            int pageCount = document.getNumberOfPages();
            if (pageIndex < 0 || pageIndex >= pageCount) {
                throw new IllegalArgumentException(
                        "page index " + pageIndex + " out of range; pdf has " + pageCount + " page(s)");
            }
            PDFRenderer renderer = new PDFRenderer(document);
            BufferedImage image = renderer.renderImageWithDPI(pageIndex, dpi, ImageType.RGB);
            boolean wrote = ImageIO.write(image, "png", outPath.toFile());
            if (!wrote) {
                throw new IllegalStateException("ImageIO could not write PNG to " + outPath);
            }
        }
    }

    private static Path requirePath(Map<String, String> flags, String name) {
        return Paths.get(requireFlag(flags, name));
    }

    private static Path requirePathRaw(Map<String, String> flags, String name) {
        return Paths.get(requireFlag(flags, name));
    }

    private static String requireFlag(Map<String, String> flags, String name) {
        String value = flags.get(name);
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("--" + name + " is required");
        }
        return value;
    }

    private static int parseIntOrDefault(Map<String, String> flags, String name, int fallback) {
        String value = flags.get(name);
        if (value == null || value.isEmpty()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("--" + name + " must be an integer, got: " + value);
        }
    }
}
