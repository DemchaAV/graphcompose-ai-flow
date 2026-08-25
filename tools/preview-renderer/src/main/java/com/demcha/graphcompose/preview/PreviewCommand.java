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
        // How many pages from `page`, in this one JVM. Every caller that wanted
        // more than one used to launch a JVM per page.
        int pages = Math.max(1, parseIntOrDefault(flags, "pages", 1));

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

        int written = runRenderPages(pdfPath, outPath, dpi, page, pages);
        out.println(outPath.toAbsolutePath());
        for (int offset = 1; offset < written; offset += 1) {
            out.println(siblingForPage(outPath, page + offset + 1).toAbsolutePath());
        }
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

    /**
     * Rasterise `count` pages from `pageIndex`, loading the PDF once.
     *
     * The harness used to ask for continuation pages one JVM at a time: a
     * separate `java -jar preview --page N` per page, per pass, and again for
     * the debug render. Measured at 1.7s each against 0.22s of bare JVM
     * startup, so a twelve-page document paid twenty-two launches — about
     * thirty-seven seconds — on every single loop pass, to rasterise pages the
     * process that had just built the PDF was holding open anyway.
     *
     * Page `pageIndex` goes to `firstOut`; the rest land beside it as
     * `<stem>-page-<n>.png`, which is the naming the renderer already used.
     * A count that runs past the end of the document stops there rather than
     * failing: `render.pages` is a declaration about the document, and a render
     * that came out shorter is a fact for the caller to report, not a crash.
     *
     * @return how many pages were actually written
     */
    static int runRenderPages(Path pdfPath, Path firstOut, int dpi, int pageIndex, int count)
            throws Exception {
        try (PDDocument document = Loader.loadPDF(pdfPath.toFile())) {
            int pageCount = document.getNumberOfPages();
            if (pageIndex < 0 || pageIndex >= pageCount) {
                throw new IllegalArgumentException(
                        "page index " + pageIndex + " out of range; pdf has " + pageCount + " page(s)");
            }
            PDFRenderer renderer = new PDFRenderer(document);
            int written = 0;
            for (int offset = 0; offset < count && pageIndex + offset < pageCount; offset += 1) {
                Path target = offset == 0 ? firstOut : siblingForPage(firstOut, pageIndex + offset + 1);
                BufferedImage image = renderer.renderImageWithDPI(pageIndex + offset, dpi, ImageType.RGB);
                if (!ImageIO.write(image, "png", target.toFile())) {
                    throw new IllegalStateException("ImageIO could not write PNG to " + target);
                }
                written += 1;
            }
            return written;
        }
    }

    /** `output.png` + page 2 -> `output-page-2.png`, beside the original. */
    static Path siblingForPage(Path firstOut, int humanPage) {
        String name = firstOut.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String stem = dot < 0 ? name : name.substring(0, dot);
        String extension = dot < 0 ? "" : name.substring(dot);
        Path parent = firstOut.getParent();
        String sibling = stem + "-page-" + humanPage + extension;
        return parent == null ? Paths.get(sibling) : parent.resolve(sibling);
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
