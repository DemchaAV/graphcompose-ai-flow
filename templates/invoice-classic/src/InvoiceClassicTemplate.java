package com.demcha.examples.invoice;

import java.util.List;
import java.util.Objects;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.document.templates.api.InvoiceTemplate;
import com.demcha.compose.document.templates.data.invoice.InvoiceData;
import com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec;
import com.demcha.compose.document.templates.data.invoice.InvoiceLineItem;
import com.demcha.compose.document.templates.data.invoice.InvoiceParty;
import com.demcha.compose.document.templates.data.invoice.InvoiceSummaryRow;
import com.demcha.compose.document.theme.BusinessTheme;

/**
 * Invoice Classic — a published GraphCompose invoice template.
 *
 * <p>Where it came from is recorded in {@code template.json}
 * ({@code sourceProject}, {@code sourceRevision}, {@code sourceCommit}),
 * which is the one place that belongs: it is metadata a rendering service
 * can log, not something this class should know about.</p>
 *
 * <p>Single-page invoice layout: header band, hero metadata strip
 * (invoice / issued / due / status), bill-from + bill-to two-column
 * party row, line-items table (auto / 54 / 96 / 96 column proportions),
 * dedicated Summary section after the table that right-aligns to the
 * Amount column above (subtotal, tax, TOTAL), and a contact footer.
 * Root page-flow padding keeps content off the page edge.</p>
 *
 * <p>Targets the canonical GraphCompose 1.6 surface
 * ({@code io.github.demchaav:graph-compose:1.6.6}, package
 * {@code com.demcha.compose.document.*}). Implements the canonical
 * {@link InvoiceTemplate} contract — the same {@link InvoiceDocumentSpec}
 * fixture used by upstream {@code InvoiceTemplateV2} renders here
 * unchanged, so downstream consumers can swap presets without changing
 * their data layer.</p>
 *
 * <p>Theme defaults to {@link BusinessTheme#modern()}; the
 * {@linkplain #InvoiceClassicTemplate(BusinessTheme) explicit-theme
 * constructor} lets callers swap palette, text scale, and table
 * preset wholesale.</p>
 *
 * @since 2026-06-01
 */
public final class InvoiceClassicTemplate implements InvoiceTemplate {

    private static final double TABLE_PADDING = 7.0;
    private static final double PAGE_SPACING = 16.0;
    private static final double PAGE_MARGIN = 24.0;
    private static final double HERO_PADDING = 14.0;
    private static final double HERO_CORNER_RADIUS = 10.0;

    private final BusinessTheme theme;

    /**
     * Creates the example template against {@link BusinessTheme#modern()}.
     */
    public InvoiceClassicTemplate() {
        this(BusinessTheme.modern());
    }

    /**
     * Creates the example template with an explicit theme.
     *
     * @param theme palette + text scale + table preset that drives every
     *              visual choice in the composition
     */
    public InvoiceClassicTemplate(BusinessTheme theme) {
        this.theme = Objects.requireNonNull(theme, "theme");
    }

    @Override
    public String getTemplateId() {
        return "invoice-classic";
    }

    @Override
    public String getTemplateName() {
        return "Invoice Classic";
    }

    @Override
    public String getDescription() {
        return "Single-page invoice: header band, metadata strip, bill-from and "
                + "bill-to columns, line-items table and a right-aligned summary.";
    }

    @Override
    public void compose(DocumentSession document, InvoiceDocumentSpec spec) {
        Objects.requireNonNull(document, "document");
        Objects.requireNonNull(spec, "spec");

        InvoiceData data = spec.invoice();
        DocumentColor surface = theme.palette().surface();
        DocumentColor surfaceMuted = theme.palette().surfaceMuted();
        DocumentColor accent = theme.palette().accent();
        DocumentColor rule = theme.palette().rule();

        DocumentTableStyle bordered = DocumentTableStyle.builder()
                .stroke(DocumentStroke.of(rule, 0.6))
                .padding(DocumentInsets.of(TABLE_PADDING))
                .build();
        DocumentTableStyle headerStyle = DocumentTableStyle.builder()
                .fillColor(theme.palette().primary())
                .stroke(DocumentStroke.of(rule, 0.6))
                .padding(DocumentInsets.of(TABLE_PADDING + 1))
                .textStyle(theme.text().label())
                .build();
        DocumentTableStyle totalStyle = DocumentTableStyle.builder()
                .fillColor(surfaceMuted)
                .stroke(DocumentStroke.of(rule, 0.6))
                .padding(DocumentInsets.of(TABLE_PADDING + 1))
                .textStyle(theme.text().label())
                .build();

        document.pageFlow(page -> page
                .name("Invoice")
                .spacing(PAGE_SPACING)
                .padding(DocumentInsets.of(PAGE_MARGIN))
                .addRow("Header", row -> renderHeader(row, data))
                .addSection("Hero", section -> renderHero(section, data, surfaceMuted, accent))
                .addRow("Parties", row -> renderParties(row, data))
                .addTable(table -> renderLineItems(table, data, bordered, headerStyle, surfaceMuted, surface))
                .addSection("Summary", section -> renderSummaryBlock(section, data, bordered, totalStyle))
                .addSection("Footer", section -> renderFooter(section, data, accent)));
    }

    private void renderHeader(RowBuilder row, InvoiceData data) {
        row.spacing(18);
        row.weights(1, 1);
        // Left column: company name + first address line, themed.
        row.addSection("HeaderLeft", section -> section
                .spacing(2)
                .addParagraph(p -> p
                        .text(data.fromParty().name())
                        .textStyle(theme.text().h2())
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text(firstAddressLine(data.fromParty()))
                        .textStyle(theme.text().caption())
                        .margin(DocumentInsets.zero())));
        // Right column: INVOICE title + invoice number + issue date.
        row.addSection("HeaderRight", section -> section
                .spacing(2)
                .addParagraph(p -> p
                        .text("INVOICE")
                        .textStyle(theme.text().h1())
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text(safe(data.invoiceNumber()))
                        .textStyle(theme.text().caption())
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text("Issued " + safe(data.issueDate()))
                        .textStyle(theme.text().caption())
                        .margin(DocumentInsets.zero())));
    }

    private void renderHero(SectionBuilder section,
                            InvoiceData data,
                            DocumentColor surfaceMuted,
                            DocumentColor accent) {
        // Soft panel with a thin accent strip on the left edge — this is
        // the canonical "hero" preset used by InvoiceTemplateV2. The real
        // SectionBuilder exposes softPanel() and accentLeft() from
        // AbstractFlowBuilder; both are used here.
        section.softPanel(surfaceMuted, HERO_CORNER_RADIUS, HERO_PADDING)
                .accentLeft(accent, 4)
                .spacing(6)
                .addParagraph(p -> p
                        .text("TOTAL DUE")
                        .textStyle(theme.text().label())
                        .margin(DocumentInsets.zero()))
                .addRich(rich -> rich
                        .plain("Invoice ").bold(safe(data.invoiceNumber()))
                        .plain("    Issued ").bold(safe(data.issueDate()))
                        .plain("    Due ").bold(safe(data.dueDate()))
                        .plain("    Status ").accent(statusOrDash(data.status()), accent));
    }

    private void renderParties(RowBuilder row, InvoiceData data) {
        row.spacing(18);
        row.weights(1, 1);
        row.addSection("BillTo", section -> renderContactBlock(section, data.billToParty(), "BILL TO"));
        row.addSection("From", section -> renderContactBlock(section, data.fromParty(), "FROM"));
    }

    private void renderLineItems(TableBuilder table,
                                 InvoiceData data,
                                 DocumentTableStyle bordered,
                                 DocumentTableStyle headerStyle,
                                 DocumentColor zebraOdd,
                                 DocumentColor zebraEven) {
        // The line-items table holds ONLY the data rows. The totals live in the
        // dedicated "Summary" section composed after this table in the page
        // flow, so that its columns can right-align to the Amount column above
        // without the table's own row model getting in the way.
        table.name("LineItems")
                .columns(
                        DocumentTableColumn.auto(),
                        DocumentTableColumn.fixed(54),
                        DocumentTableColumn.fixed(96),
                        DocumentTableColumn.fixed(96))
                .defaultCellStyle(bordered)
                .headerRow("Description", "Qty", "Unit", "Amount")
                .headerStyle(headerStyle)
                .repeatHeader()
                .zebra(zebraOdd, zebraEven);
        for (InvoiceLineItem item : data.lineItems()) {
            table.row(
                    item.description(),
                    item.quantity(),
                    item.unitPrice(),
                    item.amount());
        }
    }

    private void renderSummaryBlock(SectionBuilder section,
                                    InvoiceData data,
                                    DocumentTableStyle bordered,
                                    DocumentTableStyle totalStyle) {
        // Mirror the LineItems column proportions so the Subtotal / Tax /
        // TOTAL rows sit visually under the Amount column above. The real
        // TableBuilder supports the same auto + fixed-point columns; using
        // an identical column spec is the shortest path to a shared grid.
        section.addTable(summary -> {
            summary.name("SummaryTable")
                    .columns(
                            DocumentTableColumn.auto(),
                            DocumentTableColumn.fixed(54),
                            DocumentTableColumn.fixed(96),
                            DocumentTableColumn.fixed(96))
                    .defaultCellStyle(bordered);
            List<InvoiceSummaryRow> summaries = data.summaryRows();
            for (int i = 0; i < summaries.size(); i++) {
                InvoiceSummaryRow row = summaries.get(i);
                if (i == summaries.size() - 1) {
                    summary.totalRow(totalStyle, "", "", row.label(), row.value());
                } else {
                    summary.row("", "", row.label(), row.value());
                }
            }
        });
    }

    private void renderFooter(SectionBuilder section, InvoiceData data, DocumentColor accent) {
        // Two-column footer: notes on the left, payment terms on the right.
        // Mirrors the canonical InvoiceTemplateV2 "InvoiceFooterRow" shape
        // using real accentLeft + addList from AbstractFlowBuilder.
        section.spacing(8)
                .addRow("FooterRow", row -> row
                        .spacing(18)
                        .weights(1, 1)
                        .addSection("InvoiceNotes", col -> col
                                .accentLeft(accent, 3)
                                .padding(0, 0, 0, 8)
                                .spacing(3)
                                .addParagraph(p -> p
                                        .text("Notes")
                                        .textStyle(theme.text().label())
                                        .margin(DocumentInsets.zero()))
                                .addList(list -> list.items(data.notes())))
                        .addSection("InvoicePaymentTerms", col -> col
                                .accentLeft(accent, 3)
                                .padding(0, 0, 0, 8)
                                .spacing(3)
                                .addParagraph(p -> p
                                        .text("Payment terms")
                                        .textStyle(theme.text().label())
                                        .margin(DocumentInsets.zero()))
                                .addList(list -> list.items(data.paymentTerms()))));
        if (!data.footerNote().isBlank()) {
            section.addParagraph(p -> p
                    .text(data.footerNote())
                    .textStyle(theme.text().caption())
                    .margin(new DocumentInsets(14, 0, 0, 0)));
        }
    }

    private void renderContactBlock(SectionBuilder section, InvoiceParty party, String label) {
        section.spacing(2)
                .addParagraph(p -> p
                        .text(label)
                        .textStyle(theme.text().label())
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text(party.name())
                        .textStyle(theme.text().label())
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text(joinAddress(party))
                        .textStyle(theme.text().body())
                        .lineSpacing(1.3)
                        .margin(DocumentInsets.zero()));
    }

    private static String firstAddressLine(InvoiceParty party) {
        for (String line : party.addressLines()) {
            if (line != null && !line.isBlank()) {
                return line;
            }
        }
        return "";
    }

    private static String joinAddress(InvoiceParty party) {
        StringBuilder builder = new StringBuilder();
        for (String line : party.addressLines()) {
            if (line == null || line.isBlank()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(line);
        }
        if (!party.email().isBlank()) {
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(party.email());
        }
        if (!party.phone().isBlank()) {
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(party.phone());
        }
        return builder.toString();
    }

    private static String statusOrDash(String status) {
        return (status == null || status.isBlank()) ? "—" : status;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
