package com.demcha.graphcompose.preview;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * Read a rendered PDF's text back, page by page.
 *
 * <p>Everything the harness knows about a render otherwise comes from pixels,
 * and pixels cannot answer the questions a multi-page business document turns
 * on: is this page 2 of 3 or page 2 of 4, did the footer repeat, did the table
 * header come back after the break, did a line item fall off the end. Those are
 * functional properties, and a diff that scores them as a few hundred grey
 * pixels is measuring the wrong thing.</p>
 *
 * <p>Text cannot be scraped out of the raw file: GraphCompose subsets its fonts,
 * so a content stream holds glyph indices, and searching it for "Page 2 of 3"
 * finds nothing. The embedded ToUnicode maps are what turn those indices back
 * into characters, and PDFBox is what reads them — which is why this lives here,
 * in the tool that already has PDFBox, rather than in the Node layer that would
 * have to reimplement font decoding to ask the same question.</p>
 *
 * <p>Output is one JSON object: page count, and the text of each page. With
 * {@code --lines} it also carries where each line landed, which is what turns
 * "the footer is on the page" into "the last body line sits below the footer" —
 * a question about geometry that the characters alone cannot answer.</p>
 */
final class TextCommand {

    private TextCommand() {
    }

    static int run(Map<String, String> flags, PrintStream out, PrintStream err) throws Exception {
        String pdfFlag = flags.get("pdf");
        if (pdfFlag == null || pdfFlag.isBlank()) {
            err.println("text: --pdf <path> is required");
            return 2;
        }
        Path pdf = Path.of(pdfFlag);
        if (!Files.isRegularFile(pdf)) {
            err.println("text: no such file: " + pdf);
            return 2;
        }
        boolean withLines = flags.containsKey("lines");

        try (PDDocument document = Loader.loadPDF(pdf.toFile())) {
            int pageCount = document.getNumberOfPages();
            List<String> pages = new ArrayList<>(pageCount);
            List<List<PlacedLine>> placed = new ArrayList<>(pageCount);
            List<float[]> pageBoxes = new ArrayList<>(pageCount);

            for (int page = 1; page <= pageCount; page += 1) {
                LineCapturingStripper stripper = new LineCapturingStripper();
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                // Reading order matters here: a footer has to come out as the
                // footer rather than interleaved with the body it sits under.
                stripper.setSortByPosition(true);
                pages.add(stripper.getText(document));
                placed.add(stripper.lines());
                PDRectangle box = document.getPage(page - 1).getMediaBox();
                pageBoxes.add(new float[] { box.getWidth(), box.getHeight() });
            }

            StringBuilder json = new StringBuilder();
            json.append("{\n  \"pdf\": ").append(quote(pdf.toString()));
            json.append(",\n  \"pageCount\": ").append(pageCount);
            json.append(",\n  \"pages\": [");
            for (int i = 0; i < pages.size(); i += 1) {
                json.append(i == 0 ? "\n    " : ",\n    ").append(quote(pages.get(i)));
            }
            json.append(pages.isEmpty() ? "" : "\n  ").append("]");

            if (withLines) {
                appendLines(json, placed);
                appendPageBoxes(json, pageBoxes);
            }

            json.append("\n}");
            out.println(json);
            return 0;
        }
    }

    /**
     * Where each line landed, in points with y measured from the page top —
     * which is how a reader describes a page, and not how PDF stores it.
     */
    private static void appendLines(StringBuilder json, List<List<PlacedLine>> placed) {
        json.append(",\n  \"lines\": [");
        for (int i = 0; i < placed.size(); i += 1) {
            json.append(i == 0 ? "\n    [" : ",\n    [");
            List<PlacedLine> lines = placed.get(i);
            for (int j = 0; j < lines.size(); j += 1) {
                PlacedLine line = lines.get(j);
                json.append(j == 0 ? "\n      " : ",\n      ");
                json.append("{\"text\": ").append(quote(line.text()));
                json.append(", \"x\": ").append(round(line.x()));
                json.append(", \"top\": ").append(round(line.top()));
                json.append(", \"width\": ").append(round(line.width()));
                json.append(", \"height\": ").append(round(line.height()));
                json.append("}");
            }
            json.append(lines.isEmpty() ? "]" : "\n    ]");
        }
        json.append(placed.isEmpty() ? "" : "\n  ").append("]");
    }

    private static void appendPageBoxes(StringBuilder json, List<float[]> pageBoxes) {
        json.append(",\n  \"pageBoxes\": [");
        for (int i = 0; i < pageBoxes.size(); i += 1) {
            float[] box = pageBoxes.get(i);
            json.append(i == 0 ? "\n    " : ",\n    ");
            json.append("{\"width\": ").append(round(box[0]))
                    .append(", \"height\": ").append(round(box[1])).append("}");
        }
        json.append(pageBoxes.isEmpty() ? "" : "\n  ").append("]");
    }

    private static String round(double value) {
        return String.format(Locale.ROOT, "%.2f", value);
    }

    /** One extracted line and the box it occupies, in points from the page top. */
    private record PlacedLine(String text, double x, double top, double width, double height) {
    }

    /**
     * A stripper that also keeps where each line landed.
     *
     * <p>PDFBox hands {@code writeString} the positions it has just decided on,
     * which is the one place the geometry and the characters are together.
     * Collecting them costs one override and answers what the text alone cannot:
     * whether a body line has slid under the footer.</p>
     */
    private static final class LineCapturingStripper extends PDFTextStripper {

        private final List<PlacedLine> captured = new ArrayList<>();

        LineCapturingStripper() throws IOException {
        }

        List<PlacedLine> lines() {
            return captured;
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) throws IOException {
            super.writeString(text, positions);
            if (text.isBlank() || positions.isEmpty()) {
                return;
            }
            double left = Double.MAX_VALUE;
            double right = -Double.MAX_VALUE;
            double top = Double.MAX_VALUE;
            double bottom = -Double.MAX_VALUE;
            for (TextPosition position : positions) {
                // getY() is the baseline measured from the page top; getHeight()
                // is the glyph height above it.
                left = Math.min(left, position.getX());
                right = Math.max(right, position.getX() + position.getWidth());
                top = Math.min(top, position.getY() - position.getHeight());
                bottom = Math.max(bottom, position.getY());
            }
            captured.add(new PlacedLine(text.strip(), left, top, right - left, bottom - top));
        }
    }

    /** Minimal JSON string escaping; this tool ships no JSON library on purpose. */
    private static String quote(String value) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i += 1) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
