package com.demcha.graphcompose.preview;

import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

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
 * <p>Output is one JSON object: page count, and the text of each page. The
 * caller decides what it means.</p>
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

        try (PDDocument document = Loader.loadPDF(pdf.toFile())) {
            int pageCount = document.getNumberOfPages();
            List<String> pages = new ArrayList<>(pageCount);

            for (int page = 1; page <= pageCount; page += 1) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                // Reading order matters here: a footer has to come out as the
                // footer rather than interleaved with the body it sits under.
                stripper.setSortByPosition(true);
                pages.add(stripper.getText(document));
            }

            StringBuilder json = new StringBuilder();
            json.append("{\n  \"pdf\": ").append(quote(pdf.toString()));
            json.append(",\n  \"pageCount\": ").append(pageCount);
            json.append(",\n  \"pages\": [");
            for (int i = 0; i < pages.size(); i += 1) {
                json.append(i == 0 ? "\n    " : ",\n    ").append(quote(pages.get(i)));
            }
            json.append(pages.isEmpty() ? "" : "\n  ").append("]\n}");
            out.println(json);
            return 0;
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
