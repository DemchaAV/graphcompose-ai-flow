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
 * Generates a real one-page PDF with PDFBox and then converts it to a PNG via
 * {@link PreviewCommand#runRender}. Asserts the output exists, has plausible
 * size, and starts with the PNG magic header.
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
