package com.demcha.graphcompose.preview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

/**
 * Generates a real PDF with PDFBox and converts it to PNGs.
 *
 * {@link PreviewCommand#runRenderPages} is the path every render takes — both
 * the `preview` subcommand and the in-process rasterisation `render` does after
 * building the PDF — so it is what these assert. {@code runRender} is kept and
 * still covered because it is the single-page shape callers may want.
 */
class PreviewCommandTest {

    @Test
    void rendersFirstPageToPng() throws Exception {
        Path tempDir = Files.createTempDirectory("preview-renderer-test-");
        try {
            Path pdf = tempDir.resolve("sample.pdf");
            createOnePagePdf(pdf, "preview-renderer smoke test page");

            Path png = tempDir.resolve("sample.png");
            PreviewCommand.runRender(pdf, png, 150, 0);

            assertTrue(Files.isRegularFile(png), "PNG file should be written");
            long size = Files.size(png);
            assertTrue(size >= 200, "PNG should have non-trivial size, was " + size + " bytes");
            assertPngMagic(png);
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void rendersEveryRequestedPageBesideTheFirst() throws Exception {
        // The naming is the contract: page 1 keeps the name it was given and the
        // rest land beside it as `<stem>-page-N.png`, which is what page-pairs
        // looks for when it pairs a render against a reference.
        Path tempDir = Files.createTempDirectory("preview-renderer-pages-");
        try {
            Path pdf = tempDir.resolve("sample.pdf");
            createPdf(pdf, 3);

            Path png = tempDir.resolve("output.png");
            int written = PreviewCommand.runRenderPages(pdf, png, 72, 0, 3);

            assertEquals(3, written, "every requested page should have been written");
            assertTrue(Files.isRegularFile(png), "page 1 should keep the name it was given");
            assertTrue(Files.isRegularFile(tempDir.resolve("output-page-2.png")), "page 2 is misnamed");
            assertTrue(Files.isRegularFile(tempDir.resolve("output-page-3.png")), "page 3 is misnamed");
            assertPngMagic(tempDir.resolve("output-page-3.png"));
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void stopsAtTheEndOfTheDocumentRatherThanFailing() throws Exception {
        // `render.pages` is a declaration about the document. A render that came
        // out shorter is a fact for the caller to report — page-pairs reports it
        // as missingFromRender — not a crash inside the rasteriser.
        Path tempDir = Files.createTempDirectory("preview-renderer-short-");
        try {
            Path pdf = tempDir.resolve("sample.pdf");
            createPdf(pdf, 2);

            Path png = tempDir.resolve("output.png");
            int written = PreviewCommand.runRenderPages(pdf, png, 72, 0, 9);

            assertEquals(2, written, "it should stop at the end of the document");
            assertTrue(Files.notExists(tempDir.resolve("output-page-3.png")), "a page was invented");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void namesContinuationPagesBesideWhateverTheFirstWasCalled() {
        assertEquals(
                Path.of("out", "output-debug-page-2.png"),
                PreviewCommand.siblingForPage(Path.of("out", "output-debug.png"), 2),
                "the debug pass must not collide with the clean pass");
        assertEquals(
                Path.of("out", "output-overflow-page-5.png"),
                PreviewCommand.siblingForPage(Path.of("out", "output-overflow.png"), 5));
    }

    /** A PDF with `pages` pages, each carrying enough ink to rasterise. */
    private static void createPdf(Path pdfPath, int pages) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (int page = 1; page <= pages; page += 1) {
                PDPage pdPage = new PDPage();
                document.addPage(pdPage);
                try (PDPageContentStream content = new PDPageContentStream(document, pdPage)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 24);
                    content.newLineAtOffset(72, 700);
                    content.showText("page " + page);
                    content.endText();
                }
            }
            document.save(pdfPath.toFile());
        }
    }

    private static void createOnePagePdf(Path pdfPath, String text) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14f);
                content.newLineAtOffset(72f, 720f);
                content.showText(text);
                content.endText();
            }
            document.save(pdfPath.toFile());
        }
    }

    private static void assertPngMagic(Path pngPath) throws IOException {
        byte[] header = Files.readAllBytes(pngPath);
        assertTrue(header.length >= 8, "PNG file is too short for a magic header");
        assertEquals((byte) 0x89, header[0]);
        assertEquals((byte) 'P',  header[1]);
        assertEquals((byte) 'N',  header[2]);
        assertEquals((byte) 'G',  header[3]);
        assertEquals((byte) 0x0D, header[4]);
        assertEquals((byte) 0x0A, header[5]);
        assertEquals((byte) 0x1A, header[6]);
        assertEquals((byte) 0x0A, header[7]);
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var stream = Files.walk(root)) {
            stream.sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                            // best-effort cleanup
                        }
                    });
        }
    }
}
