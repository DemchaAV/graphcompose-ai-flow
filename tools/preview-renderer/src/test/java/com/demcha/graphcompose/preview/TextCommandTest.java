package com.demcha.graphcompose.preview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

/**
 * Reading a document's text back is what lets the harness ask functional
 * questions about a multi-page render — is this page 2 of 3, did the footer
 * repeat, did a row survive the break. None of those can be answered from
 * pixels, and none can be answered by searching the raw file either, because
 * subset fonts leave glyph indices in the content stream.
 */
class TextCommandTest {

    @Test
    void readsEachPageSeparately() throws Exception {
        Path tempDir = Files.createTempDirectory("text-command-test-");
        try {
            Path pdf = tempDir.resolve("two-pages.pdf");
            createPdf(pdf, "Page 1 of 2", "Page 2 of 2");

            String json = run(Map.of("pdf", pdf.toString()), 0);

            assertTrue(json.contains("\"pageCount\": 2"), json);
            // Each page's own text, in order: a caller checking that page three
            // reads "3 of 3" needs them apart, not concatenated.
            int first = json.indexOf("Page 1 of 2");
            int second = json.indexOf("Page 2 of 2");
            assertTrue(first > 0, "page 1's text is missing: " + json);
            assertTrue(second > first, "page 2's text is missing or out of order: " + json);
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void escapesTextSoTheOutputStaysParseable() throws Exception {
        Path tempDir = Files.createTempDirectory("text-command-escape-");
        try {
            Path pdf = tempDir.resolve("quoted.pdf");
            createPdf(pdf, "He said \"page one\"");

            String json = run(Map.of("pdf", pdf.toString()), 0);

            // A document quoting itself must not end the JSON string it is in.
            assertTrue(json.contains("\\\"page one\\\""), json);
            // Newlines between lines arrive escaped rather than breaking the value.
            assertTrue(json.contains("\\r") || json.contains("\\n"), json);
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void missingArgumentsAreUsageErrorsRatherThanCrashes() throws Exception {
        assertEquals(2, exitCode(Map.of()));
        assertEquals(2, exitCode(Map.of("pdf", "no-such-file.pdf")));
    }

    private static String run(Map<String, String> flags, int expectedExit) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ByteArrayOutputStream err = new ByteArrayOutputStream();
        int exit = TextCommand.run(
                flags,
                new PrintStream(out, true, StandardCharsets.UTF_8),
                new PrintStream(err, true, StandardCharsets.UTF_8));
        assertEquals(expectedExit, exit, err.toString(StandardCharsets.UTF_8));
        return out.toString(StandardCharsets.UTF_8);
    }

    private static int exitCode(Map<String, String> flags) throws Exception {
        ByteArrayOutputStream sink = new ByteArrayOutputStream();
        return TextCommand.run(
                flags,
                new PrintStream(sink, true, StandardCharsets.UTF_8),
                new PrintStream(sink, true, StandardCharsets.UTF_8));
    }

    private static void createPdf(Path target, String... pageTexts) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (String text : pageTexts) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(72, 700);
                    content.showText(text);
                    content.endText();
                }
            }
            document.save(target.toFile());
        }
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var paths = Files.walk(root)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // best effort
                }
            });
        }
    }
}
