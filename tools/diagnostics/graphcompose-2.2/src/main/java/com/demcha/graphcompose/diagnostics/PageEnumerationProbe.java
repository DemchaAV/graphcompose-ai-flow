package com.demcha.graphcompose.diagnostics;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentPageSize;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.output.DocumentHeaderFooter;
import com.demcha.compose.document.output.DocumentHeaderFooterZone;
import com.demcha.compose.document.style.DocumentInsets;

/**
 * Does a flowing document actually paginate correctly?
 *
 * <p>A one-page render proves nothing about an invoice. The questions that
 * decide whether a business document is usable are all about the pages after the
 * first: does "Page 1 of 1" become "Page 1 of 3", does the count increment, is
 * the total right, does the footer come back, does the table header repeat, and
 * did any row fall off the end. None of them is visible in a pixel diff of page
 * one, and several are invisible in a pixel diff of any single page.</p>
 *
 * <p>This is the fixture for that. The same table is rendered twice — with a
 * short list that fits, and with a long one that cannot — and both renders are
 * read back through PDFBox's text stripper, which decodes the subset fonts
 * GraphCompose embeds. Then every property above is checked against what was
 * put in.</p>
 *
 * <p>It doubles as the proof that the chrome API works as the pack describes:
 * {@code DocumentHeaderFooter.builder().zone(FOOTER).centerText("Page {page} of
 * {pages}")} and {@code TableBuilder.repeatHeader()}.</p>
 */
final class PageEnumerationProbe implements Probes.Probe {

    private static final double PAGE_W = 300.0;
    private static final double PAGE_H = 220.0;
    private static final String HEADER_LABEL = "Description";
    private static final String FOOTER_FORMAT = "Page {page} of {pages}";
    private static final Pattern PAGE_OF = Pattern.compile("Page\\s+(\\d+)\\s+of\\s+(\\d+)");

    private static final int FITTING_ROWS = 3;
    private static final int OVERFLOWING_ROWS = 40;

    @Override
    public String question() {
        return "Does a flowing table paginate with a correct \"Page N of M\" footer, a repeated "
                + "table header, and every row still present?";
    }

    @Override
    public Map<String, Object> run() throws Exception {
        Map<String, Object> fits = measure(FITTING_ROWS);
        Map<String, Object> overflows = measure(OVERFLOWING_ROWS);

        Map<String, Object> result = Json.object();
        result.put("arrangement",
                "One table with a repeated header and a footer carrying \"" + FOOTER_FORMAT
                        + "\", rendered with " + FITTING_ROWS + " rows and with " + OVERFLOWING_ROWS
                        + ", then read back through PDFBox's text stripper.");
        result.put("fittingData", fits);
        result.put("overflowingData", overflows);

        boolean singlePage = ((Number) fits.get("pageCount")).intValue() == 1;
        boolean paginated = ((Number) overflows.get("pageCount")).intValue() > 1;
        boolean enumerationCorrect =
                Boolean.TRUE.equals(fits.get("enumerationCorrect"))
                        && Boolean.TRUE.equals(overflows.get("enumerationCorrect"));
        boolean headerRepeats = Boolean.TRUE.equals(overflows.get("headerOnEveryPage"));
        boolean footerRepeats = Boolean.TRUE.equals(overflows.get("footerOnEveryPage"));
        boolean rowsIntact = Boolean.TRUE.equals(overflows.get("allRowsPresent"));

        result.put("singlePageStaysSinglePage", singlePage);
        result.put("overflowPaginates", paginated);
        result.put("enumerationCorrect", enumerationCorrect);
        result.put("headerRepeats", headerRepeats);
        result.put("footerRepeats", footerRepeats);
        result.put("rowsSurvivePagination", rowsIntact);

        List<String> broken = new ArrayList<>();
        if (!singlePage) {
            broken.add("data that fits still produced more than one page");
        }
        if (!paginated) {
            broken.add("data that cannot fit did not paginate");
        }
        if (!enumerationCorrect) {
            broken.add("the page numbers or the total were wrong");
        }
        if (!headerRepeats) {
            broken.add("the table header did not repeat on every page");
        }
        if (!footerRepeats) {
            broken.add("the footer did not appear on every page");
        }
        if (!rowsIntact) {
            broken.add("rows went missing across the page break");
        }

        result.put("finding", broken.isEmpty()
                ? "Pagination is intact: " + FITTING_ROWS + " rows stay on one page reading \"Page 1 of 1\", "
                        + OVERFLOWING_ROWS + " rows produce " + overflows.get("pageCount")
                        + " pages numbered through, with the header and footer on every page and every row present."
                : "Pagination is not intact: " + String.join("; ", broken) + ".");
        return result;
    }

    /** Render one row count and read back everything the pages claim. */
    private static Map<String, Object> measure(int rows) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        List<String> rowLabels = new ArrayList<>();
        for (int i = 1; i <= rows; i += 1) {
            rowLabels.add("Line item " + i);
        }

        try (DocumentSession session = GraphCompose.document().create()) {
            session.pageSize(DocumentPageSize.of(PAGE_W, PAGE_H));
            session.margin(DocumentInsets.of(18));
            session.footer(DocumentHeaderFooter.builder()
                    .zone(DocumentHeaderFooterZone.FOOTER)
                    .height(20f)
                    .centerText(FOOTER_FORMAT)
                    .fontSize(8f)
                    .build());
            session.pageFlow(page -> {
                page.name("PageEnumerationProbe").padding(DocumentInsets.zero());
                TableBuilder table = new TableBuilder();
                table.name("Items").autoColumns(2).repeatHeader().header(HEADER_LABEL, "Amount");
                for (int i = 0; i < rowLabels.size(); i += 1) {
                    table.row(rowLabels.get(i), "$" + (i + 1) + "0.00");
                }
                page.add(table.build());
            });
            session.writePdf(bytes);
        }

        Map<String, Object> measured = Json.object();
        try (PDDocument pdf = Loader.loadPDF(bytes.toByteArray())) {
            int pageCount = pdf.getNumberOfPages();
            List<String> pageText = new ArrayList<>();
            for (int page = 1; page <= pageCount; page += 1) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                stripper.setSortByPosition(true);
                pageText.add(stripper.getText(pdf));
            }

            measured.put("rows", rows);
            measured.put("pageCount", pageCount);

            // "Page N of M": N must be this page, M must be the real total.
            List<Object> enumeration = Json.array();
            boolean enumerationCorrect = true;
            boolean footerEverywhere = true;
            for (int i = 0; i < pageText.size(); i += 1) {
                Matcher matcher = PAGE_OF.matcher(pageText.get(i));
                Map<String, Object> row = Json.object();
                row.put("page", i + 1);
                if (matcher.find()) {
                    int current = Integer.parseInt(matcher.group(1));
                    int total = Integer.parseInt(matcher.group(2));
                    row.put("reads", "Page " + current + " of " + total);
                    boolean ok = current == i + 1 && total == pageCount;
                    row.put("correct", ok);
                    enumerationCorrect &= ok;
                } else {
                    row.put("reads", null);
                    row.put("correct", false);
                    enumerationCorrect = false;
                    footerEverywhere = false;
                }
                enumeration.add(row);
            }
            measured.put("enumeration", enumeration);
            measured.put("enumerationCorrect", enumerationCorrect);
            measured.put("footerOnEveryPage", footerEverywhere);

            boolean headerEverywhere = pageText.stream().allMatch(text -> text.contains(HEADER_LABEL));
            measured.put("headerOnEveryPage", headerEverywhere);

            String whole = String.join("\n", pageText);
            List<String> missing = rowLabels.stream().filter(label -> !whole.contains(label)).toList();
            measured.put("missingRows", missing);
            measured.put("allRowsPresent", missing.isEmpty());
        }
        return measured;
    }
}
