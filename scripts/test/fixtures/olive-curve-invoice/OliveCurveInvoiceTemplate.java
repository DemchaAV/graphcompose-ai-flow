package com.demcha.examples.invoice;

import java.util.List;
import java.util.Objects;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.ClipPolicy;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentCornerRadius;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.document.table.DocumentTableTextAnchor;
import com.demcha.compose.document.templates.api.InvoiceTemplate;
import com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec;
import com.demcha.compose.font.FontName;

/**
 * Published Olive Curve invoice preset.
 *
 * <p>The template renders a one-page A4 invoice with an olive page chrome,
 * editorial serif invoice title, right-flush recipient panel, zebra line-items
 * table, payment/terms block, summary box, and signature area. It implements
 * the upstream {@link InvoiceTemplate} contract and can render either a
 * canonical {@link InvoiceDocumentSpec} or the richer
 * {@link OliveCurveInvoiceSpec} used by this visual preset.</p>
 *
 * <p>Primary customization points are the color tokens near the top of this
 * class, the page geometry constants, and the JSON fixture consumed by
 * {@link OliveCurveInvoiceSpecProvider}.</p>
 */
public final class OliveCurveInvoiceTemplate implements InvoiceTemplate {

    private static final FontName HEADING_FONT = FontName.CRIMSON_TEXT;
    private static final FontName BODY_FONT = FontName.POPPINS;
    private static final FontName SIGNATURE_FONT = FontName.CRIMSON_TEXT;

    private static final DocumentColor OLIVE = DocumentColor.rgb(135, 154, 121);
    private static final DocumentColor OLIVE_DARK = DocumentColor.rgb(110, 123, 99);
    private static final DocumentColor TABLE_FILL = DocumentColor.rgb(228, 230, 222);
    private static final DocumentColor INK = DocumentColor.rgb(36, 36, 31);
    private static final DocumentColor MUTED = DocumentColor.rgb(86, 90, 81);
    private static final DocumentColor WHITE = DocumentColor.WHITE;

    private static final double FULL_PAGE_WIDTH = 595.0;
    private static final double FULL_PAGE_HEIGHT = 842.0;
    private static final double SIDE_MARGIN_RATIO = 0.103;
    private static final double BODY_SIDE = FULL_PAGE_WIDTH * SIDE_MARGIN_RATIO;
    private static final double CONTENT_WIDTH = FULL_PAGE_WIDTH - 2.0 * BODY_SIDE;

    private static final double TOP_CHROME_HEIGHT = FULL_PAGE_HEIGHT * 0.268;
    private static final double TOP_PAD = FULL_PAGE_HEIGHT * 0.064;
    private static final double TOP_CHROME_RIGHT_PAD = 0.0;
    private static final double TOP_CHROME_WIDTH =
            FULL_PAGE_WIDTH - BODY_SIDE - TOP_CHROME_RIGHT_PAD;
    private static final double HEADER_GAP = 17.0;
    private static final double BRAND_LOGO_SIZE = 18.0;
    private static final double BRAND_LOGO_GAP = 5.5;
    private static final double HEADER_ROW_USABLE_WIDTH = TOP_CHROME_WIDTH - 2.0 * BRAND_LOGO_GAP;
    private static final double HEADER_LEFT_WEIGHT = 0.58;
    private static final double HEADER_RIGHT_WEIGHT = 1.0 - HEADER_LEFT_WEIGHT;
    private static final double HEADER_RIGHT_WIDTH = HEADER_ROW_USABLE_WIDTH * HEADER_RIGHT_WEIGHT;
    private static final double BODY_TABLE_TOP_GAP = 24.0;
    private static final double HEADER_LOGO_WEIGHT = 0.045;
    private static final double HEADER_BRAND_WEIGHT = HEADER_LEFT_WEIGHT - HEADER_LOGO_WEIGHT;
    private static final double TOP_META_LABEL_WIDTH = HEADER_RIGHT_WIDTH * 0.42;
    private static final double TOP_META_VALUE_WIDTH = HEADER_RIGHT_WIDTH - TOP_META_LABEL_WIDTH;
    private static final double RECIPIENT_PANEL_RIGHT_PULL = 24.0;
    private static final double HERO_LEFT_WIDTH = CONTENT_WIDTH * 0.59;
    private static final double HERO_LEFT_WEIGHT = HERO_LEFT_WIDTH / TOP_CHROME_WIDTH;
    private static final double HERO_RIGHT_WEIGHT = 1.0 - HERO_LEFT_WEIGHT;
    private static final double RECIPIENT_PANEL_INNER_WIDTH =
            TOP_CHROME_WIDTH - HERO_LEFT_WIDTH - 49.0 - BODY_SIDE;
    private static final double RECIPIENT_INFO_LABEL_WIDTH = RECIPIENT_PANEL_INNER_WIDTH * 0.31;
    private static final double RECIPIENT_INFO_VALUE_WIDTH =
            RECIPIENT_PANEL_INNER_WIDTH - RECIPIENT_INFO_LABEL_WIDTH;

    private static final double TABLE_NO_WIDTH = CONTENT_WIDTH * 0.105;
    private static final double TABLE_DESC_WIDTH = CONTENT_WIDTH * 0.465;
    private static final double TABLE_QTY_WIDTH = CONTENT_WIDTH * 0.12;
    private static final double TABLE_PRICE_WIDTH = CONTENT_WIDTH * 0.155;
    private static final double TABLE_TOTAL_WIDTH = CONTENT_WIDTH
            - TABLE_NO_WIDTH
            - TABLE_DESC_WIDTH
            - TABLE_QTY_WIDTH
            - TABLE_PRICE_WIDTH;

    private static final double FOOTER_GAP = 34.0;
    private static final double FOOTER_LEFT_WEIGHT = 0.62;
    private static final double FOOTER_RIGHT_WEIGHT = 1.0 - FOOTER_LEFT_WEIGHT;
    private static final double FOOTER_USABLE_WIDTH = CONTENT_WIDTH - FOOTER_GAP;
    private static final double FOOTER_RIGHT_WIDTH = FOOTER_USABLE_WIDTH * FOOTER_RIGHT_WEIGHT;
    private static final double SUMMARY_WIDTH = CONTENT_WIDTH * 0.34;
    private static final double SUMMARY_LEFT = Math.max(0.0, FOOTER_RIGHT_WIDTH - SUMMARY_WIDTH);

    @Override
    public String getTemplateId() {
        return "olive-curve-invoice";
    }

    @Override
    public String getTemplateName() {
        return "Olive Curve Invoice";
    }

    @Override
    public String getDescription() {
        return "Olive and white invoice template with curved header chrome and semantic invoice sections.";
    }

    @Override
    public void compose(DocumentSession document, InvoiceDocumentSpec spec) {
        compose(document, OliveCurveInvoiceSpec.from(spec));
    }

    /**
     * Renders the full visual preset from the editable Olive Curve invoice spec.
     */
    public void compose(DocumentSession document, OliveCurveInvoiceSpec spec) {
        Objects.requireNonNull(document, "document");
        Objects.requireNonNull(spec, "spec");

        document.pageBackground(OLIVE);
        document.pageFlow(page -> page
                .name("OliveCurveInvoice")
                .padding(DocumentInsets.zero())
                .spacing(0)
                .addSection("TopChrome", section -> renderTopChrome(section, spec))
                .addSection("BodyPlate", section -> renderBodyPlate(section, spec)));
    }

    private void renderTopChrome(SectionBuilder section, OliveCurveInvoiceSpec spec) {
        section.padding(new DocumentInsets(TOP_PAD, TOP_CHROME_RIGHT_PAD, 0, BODY_SIDE))
                .spacing(HEADER_GAP)
                .addRow("HeaderMeta", row -> {
                    row.spacing(BRAND_LOGO_GAP);
                    row.weights(HEADER_LOGO_WEIGHT, HEADER_BRAND_WEIGHT, HEADER_RIGHT_WEIGHT);
                    row.addSection("CompanyLogo", this::renderCompanyLogo);
                    row.addSection("Brand", col -> renderBrand(col, spec.brand()));
                    row.addSection("InvoiceDates", col -> renderTopMeta(col, spec.meta()));
                })
                .addRow("InvoiceHero", row -> renderInvoiceHero(row, spec))
                .spacer(TOP_CHROME_WIDTH, Math.max(0.0, TOP_CHROME_HEIGHT - 174.0));
    }

    private void renderBrand(SectionBuilder section, OliveCurveInvoiceSpec.Brand brand) {
        section.spacing(1)
                .addParagraph(p -> p
                        .text(brand.name())
                        .textStyle(style(23, WHITE, HEADING_FONT, DocumentTextDecoration.BOLD))
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text(brand.tagline())
                        .textStyle(style(8.2, WHITE, BODY_FONT, DocumentTextDecoration.DEFAULT))
                        .margin(new DocumentInsets(-3, 0, 0, 0)));
    }

    private void renderCompanyLogo(SectionBuilder section) {
        section.addContainer(container -> container
                .name("CompanyLogoMark")
                .circle(BRAND_LOGO_SIZE)
                .clipPolicy(ClipPolicy.CLIP_PATH)
                .fillColor(WHITE)
                .margin(new DocumentInsets(2.5, 0, 0, 0))
                .center(new ParagraphBuilder()
                        .name("CompanyLogoInitial")
                        .text("B")
                        .textStyle(style(8.8, OLIVE_DARK, BODY_FONT, DocumentTextDecoration.BOLD))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero())
                        .build()));
    }

    private void renderTopMeta(SectionBuilder section, OliveCurveInvoiceSpec.InvoiceMeta meta) {
        section.addTable(table -> renderTopMetaTable(table, meta));
    }

    private void renderTopMetaTable(TableBuilder table, OliveCurveInvoiceSpec.InvoiceMeta meta) {
        DocumentTableStyle labelStyle = tableStyle(OLIVE, headerMetaLabel(),
                DocumentTableTextAnchor.CENTER_RIGHT, 1.25, 2.0);
        DocumentTableStyle valueStyle = tableStyle(OLIVE, headerMetaValue(),
                DocumentTableTextAnchor.CENTER_LEFT, 1.25, 2.0);

        table.name("InvoiceMetaTable")
                .columns(
                        DocumentTableColumn.fixed(TOP_META_LABEL_WIDTH),
                        DocumentTableColumn.fixed(TOP_META_VALUE_WIDTH))
                .defaultCellStyle(valueStyle)
                .padding(DocumentInsets.zero())
                .margin(DocumentInsets.zero())
                .rowCells(cell("Invoice Date :", labelStyle), cell(meta.invoiceDate(), valueStyle))
                .rowCells(cell("Issue Date :", labelStyle), cell(meta.issueDate(), valueStyle))
                .rowCells(cell("Account No :", labelStyle), cell(meta.accountNo(), valueStyle));
    }

    private void renderInvoiceHero(RowBuilder row, OliveCurveInvoiceSpec spec) {
        row.spacing(0);
        row.weights(HERO_LEFT_WEIGHT, HERO_RIGHT_WEIGHT);
        row.addSection("InvoiceTitle", left -> left
                .spacing(5)
                .addParagraph(p -> p
                        .text("INVOICE")
                        .textStyle(style(50, WHITE, HEADING_FONT, DocumentTextDecoration.BOLD))
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text("INVOICE NO : " + spec.meta().invoiceNo())
                        .textStyle(style(7.4, WHITE, BODY_FONT, DocumentTextDecoration.BOLD))
                        .margin(DocumentInsets.zero())));
        row.addSection("RecipientPanel", right -> renderRecipientPanel(right, spec.recipient()));
    }

    private void renderRecipientPanel(SectionBuilder section, OliveCurveInvoiceSpec.Party recipient) {
        section.fillColor(WHITE)
                .cornerRadius(DocumentCornerRadius.left(48.5))
                .padding(new DocumentInsets(23, BODY_SIDE, 19, 49))
                .margin(new DocumentInsets(0, -RECIPIENT_PANEL_RIGHT_PULL, 0, 0))
                .spacing(2)
                .addTable(table -> renderRecipientInfoTable(table, recipient))
                .spacer(RECIPIENT_PANEL_INNER_WIDTH, 0.1);
    }

    private void renderRecipientInfoTable(TableBuilder table, OliveCurveInvoiceSpec.Party recipient) {
        DocumentTableStyle labelStyle = tableStyle(WHITE, panelInfoLabel(),
                DocumentTableTextAnchor.CENTER_RIGHT, 1.0, 2.0);
        DocumentTableStyle valueStyle = tableStyle(WHITE, panelInfoValue(),
                DocumentTableTextAnchor.CENTER_LEFT, 1.0, 2.0);

        table.name("RecipientInfoTable")
                .columns(
                        DocumentTableColumn.fixed(RECIPIENT_INFO_LABEL_WIDTH),
                        DocumentTableColumn.fixed(RECIPIENT_INFO_VALUE_WIDTH))
                .defaultCellStyle(valueStyle)
                .padding(DocumentInsets.zero())
                .margin(DocumentInsets.zero())
                .rowCells(cell("Invoice To :", labelStyle), cell(recipient.number(), valueStyle))
                .rowCells(cell("Address :", labelStyle), cell(String.join(", ", recipient.addressLines()), valueStyle))
                .rowCells(cell("Email :", labelStyle), cell(recipient.email(), valueStyle))
                .rowCells(cell("Phone :", labelStyle), cell(recipient.phone(), valueStyle));
    }

    private void renderBodyPlate(SectionBuilder section, OliveCurveInvoiceSpec spec) {
        section.fillColor(WHITE)
                .cornerRadius(DocumentCornerRadius.of(0.0, 0.0, 54.0, 0.0))
                .padding(new DocumentInsets(BODY_TABLE_TOP_GAP, BODY_SIDE, 31, BODY_SIDE))
                .spacing(18)
                .addTable(table -> renderItems(table, spec.items()))
                .addLine(line -> line
                        .horizontal(CONTENT_WIDTH)
                        .thickness(0.7)
                        .color(OLIVE_DARK)
                        .margin(new DocumentInsets(1, 0, 4, 0)))
                .addRow("Footer", row -> renderFooter(row, spec))
                .addSection("Support", support -> renderSupport(support, spec.support()));
    }

    private void renderItems(TableBuilder table, List<OliveCurveInvoiceSpec.LineItem> items) {
        DocumentTableStyle header = tableStyle(TABLE_FILL, label(), DocumentTableTextAnchor.CENTER, 8, 8);
        DocumentTableStyle headerLeft = tableStyle(TABLE_FILL, label(), DocumentTableTextAnchor.CENTER_LEFT, 8, 8);
        table.name("LineItems")
                .columns(
                        DocumentTableColumn.fixed(TABLE_NO_WIDTH),
                        DocumentTableColumn.fixed(TABLE_DESC_WIDTH),
                        DocumentTableColumn.fixed(TABLE_QTY_WIDTH),
                        DocumentTableColumn.fixed(TABLE_PRICE_WIDTH),
                        DocumentTableColumn.fixed(TABLE_TOTAL_WIDTH))
                .defaultCellStyle(tableStyle(WHITE, body(), DocumentTableTextAnchor.CENTER_LEFT, 8, 8))
                .padding(DocumentInsets.zero())
                .margin(DocumentInsets.zero())
                .headerCells(
                        cell("NO", header),
                        cell("ITEM DESCRIPTION", headerLeft),
                        cell("QTY", header),
                        cell("PRICE", header),
                        cell("TOTAL", header))
                .repeatHeader();

        for (int i = 0; i < items.size(); i++) {
            OliveCurveInvoiceSpec.LineItem item = items.get(i);
            DocumentColor fill = (i == 1 || i == 3) ? TABLE_FILL : WHITE;
            DocumentTableStyle left = tableStyle(fill, body(), DocumentTableTextAnchor.TOP_LEFT, 10, 10);
            DocumentTableStyle center = tableStyle(fill, body(), DocumentTableTextAnchor.CENTER, 10, 10);
            table.rowCells(
                    cell((i + 1) + ".", center),
                    itemCell(item, left),
                    cell(item.quantity(), center),
                    cell(item.price(), center),
                    cell(item.total(), center));
        }
    }

    private void renderFooter(RowBuilder row, OliveCurveInvoiceSpec spec) {
        row.spacing(FOOTER_GAP);
        row.weights(FOOTER_LEFT_WEIGHT, FOOTER_RIGHT_WEIGHT);
        row.addSection("PaymentAndTerms", left -> renderPaymentAndTerms(left, spec.payment(), spec.terms()));
        row.addSection("SummaryAndSignature", right -> renderSummaryAndSignature(right, spec.summary(), spec.signature()));
    }

    private void renderPaymentAndTerms(SectionBuilder section,
                                       OliveCurveInvoiceSpec.Payment payment,
                                       OliveCurveInvoiceSpec.Terms terms) {
        section.spacing(24)
                .addSection("PaymentInfo", paymentSection -> {
                    paymentSection.spacing(4)
                            .addParagraph(p -> p
                                    .text("PAYMENT INFO")
                                    .textStyle(label())
                                    .margin(DocumentInsets.zero()));
                    for (String line : payment.lines()) {
                        paymentSection.addParagraph(p -> p
                                .text(line)
                                .textStyle(small())
                                .margin(DocumentInsets.zero()));
                    }
                })
                .addSection("Terms", termsSection -> termsSection
                        .spacing(6)
                        .addParagraph(p -> p
                                .text(terms.title())
                                .textStyle(label())
                                .margin(DocumentInsets.zero()))
                        .addParagraph(p -> p
                                .text(terms.body())
                                .textStyle(small())
                                .lineSpacing(1.18)
                                .margin(DocumentInsets.zero())));
    }

    private void renderSummaryAndSignature(SectionBuilder section,
                                           OliveCurveInvoiceSpec.Summary summary,
                                           OliveCurveInvoiceSpec.Signature signature) {
        section.spacing(28)
                .addTable(table -> renderSummary(table, summary))
                .addSection("Signature", signatureSection -> signatureSection
                        .spacing(4)
                        .addParagraph(p -> p
                                .text(signature.scriptName())
                                .textStyle(style(24, INK, SIGNATURE_FONT, DocumentTextDecoration.ITALIC))
                                .align(TextAlign.CENTER)
                                .margin(DocumentInsets.zero()))
                        .addLine(line -> line
                                .horizontal(SUMMARY_WIDTH * 0.74)
                                .thickness(0.6)
                                .color(OLIVE_DARK)
                                .margin(new DocumentInsets(0, 0, 6, SUMMARY_WIDTH * 0.13)))
                        .addParagraph(p -> p
                                .text(signature.printedName())
                                .textStyle(style(7.3, INK, BODY_FONT, DocumentTextDecoration.DEFAULT))
                                .align(TextAlign.CENTER)
                                .margin(DocumentInsets.zero())));
    }

    private void renderSummary(TableBuilder table, OliveCurveInvoiceSpec.Summary summary) {
        DocumentTableStyle plain = tableStyle(WHITE, small(), DocumentTableTextAnchor.CENTER_RIGHT, 3, 3);
        DocumentTableStyle total = tableStyle(TABLE_FILL, label(), DocumentTableTextAnchor.CENTER_RIGHT, 7, 7);
        table.name("Summary")
                .columns(
                        DocumentTableColumn.fixed(SUMMARY_WIDTH * 0.52),
                        DocumentTableColumn.fixed(SUMMARY_WIDTH * 0.48))
                .defaultCellStyle(plain)
                .margin(new DocumentInsets(0, 0, 0, SUMMARY_LEFT))
                .rowCells(cell("Sub Total", plain), cell(summary.subtotal(), plain))
                .rowCells(cell("Tax", plain), cell(summary.tax(), plain))
                .rowCells(
                        cell(summary.totalLabel(), total),
                        cell(summary.total(), total));
    }

    private void renderSupport(SectionBuilder section, OliveCurveInvoiceSpec.Support support) {
        section.addParagraph(p -> p
                .inlineText(support.label(), label(), null)
                .inlineText("   " + support.body(), small(), null)
                .margin(DocumentInsets.zero()));
    }

    private static DocumentTableCell itemCell(OliveCurveInvoiceSpec.LineItem item, DocumentTableStyle style) {
        List<String> lines = new java.util.ArrayList<>();
        lines.add(item.name());
        lines.addAll(wrapWords(item.description(), 46));
        return new DocumentTableCell(lines, style, 1, 1, null);
    }

    private static DocumentTableCell cell(String text, DocumentTableStyle style) {
        return DocumentTableCell.text(text).withStyle(style);
    }

    private static DocumentTableStyle tableStyle(DocumentColor fill,
                                                 DocumentTextStyle textStyle,
                                                 DocumentTableTextAnchor anchor,
                                                 double verticalPadding,
                                                 double horizontalPadding) {
        return DocumentTableStyle.builder()
                .fillColor(fill)
                .stroke(DocumentStroke.of(WHITE, 0.0))
                .padding(new DocumentInsets(
                        verticalPadding,
                        horizontalPadding,
                        verticalPadding,
                        horizontalPadding))
                .textStyle(textStyle)
                .textAnchor(anchor)
                .lineSpacing(1.15)
                .build();
    }

    private static DocumentTextStyle headerMetaLabel() {
        return style(7.25, WHITE, BODY_FONT, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle headerMetaValue() {
        return style(7.2, WHITE, BODY_FONT, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle panelInfoLabel() {
        return style(6.95, INK, BODY_FONT, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle panelInfoValue() {
        return style(6.95, MUTED, BODY_FONT, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle label() {
        return style(7.4, INK, BODY_FONT, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle body() {
        return style(7.1, INK, BODY_FONT, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle small() {
        return style(6.85, MUTED, BODY_FONT, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle style(double size,
                                           DocumentColor color,
                                           FontName font,
                                           DocumentTextDecoration decoration) {
        return DocumentTextStyle.builder()
                .fontName(font)
                .size(size)
                .color(color)
                .decoration(decoration)
                .build();
    }

    private static List<String> wrapWords(String text, int maxChars) {
        if (text == null || text.isBlank()) {
            return List.of("");
        }
        List<String> lines = new java.util.ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : text.split("\\s+")) {
            if (current.length() > 0 && current.length() + 1 + word.length() > maxChars) {
                lines.add(current.toString());
                current.setLength(0);
            }
            if (current.length() > 0) {
                current.append(' ');
            }
            current.append(word);
        }
        if (current.length() > 0) {
            lines.add(current.toString());
        }
        return lines;
    }
}
