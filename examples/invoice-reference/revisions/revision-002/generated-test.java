package com.demcha.examples.invoice;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec;
import com.demcha.compose.document.theme.BusinessTheme;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smoke test for the revision-002 {@link GeneratedInvoiceTemplate}.
 *
 * <p>Scope today (Phase 3, documentation example):</p>
 * <ul>
 *   <li>Build a representative {@link InvoiceDocumentSpec} via the
 *       canonical builder.</li>
 *   <li>Construct the template against a real {@link BusinessTheme}
 *       factory ({@link BusinessTheme#modern()}).</li>
 *   <li>Open a real {@link DocumentSession} through
 *       {@link GraphCompose#document(Path)} and invoke
 *       {@code compose(...)}, asserting the call does not throw.</li>
 * </ul>
 *
 * <p>Deferred checks, enabled by the next validation-runner pass:</p>
 * <ul>
 *   <li>preview-image diff against {@code reference/reference.png}.</li>
 *   <li>layout-snapshot regression against {@code layout-snapshot.json}.</li>
 *   <li>pagination expectation test for a synthetic 50-line invoice.</li>
 *   <li>unit assertions on totals (subtotal + tax = total within rounding
 *       tolerance; sum of line-item amounts = subtotal).</li>
 * </ul>
 *
 * <p>The revision-002 patch lifts the three summary rows out of
 * the line-items table and into a dedicated {@code Summary} section. The
 * layout snapshot is therefore expected to change for the LineItems and
 * Summary regions, and the visual regression baseline must be refreshed
 * once a real reference image is available. Until then this test only
 * enforces the compose-does-not-throw smoke contract; the structural
 * change is exercised by the committed {@code layout-snapshot.json},
 * {@code output.png}, and the visual review.</p>
 */
class GeneratedInvoiceTemplateTest {

    @Test
    void composeDoesNotThrowForSampleSpec() {
        BusinessTheme theme = BusinessTheme.modern();
        GeneratedInvoiceTemplate template = new GeneratedInvoiceTemplate(theme);
        InvoiceDocumentSpec spec = sampleSpec();

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> template.compose(document, spec));
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }
    }

    private static InvoiceDocumentSpec sampleSpec() {
        return InvoiceDocumentSpec.builder()
                .title("Invoice")
                .invoiceNumber("INV-2026-0042")
                .issueDate("2026-05-12")
                .dueDate("2026-06-11")
                .status("Pending")
                .fromParty(party -> party
                        .name("Northwind Trading Co.")
                        .addressLines(java.util.List.of(
                                "100 Market Way",
                                "Seattle, WA 98101",
                                "United States"))
                        .email("invoices@northwind.example")
                        .phone("+1 555 0143"))
                .billToParty(party -> party
                        .name("Acme Studio Ltd.")
                        .addressLines(java.util.List.of(
                                "221B Baker Street",
                                "Marylebone, London",
                                "United Kingdom"))
                        .email("billing@acme.example"))
                .lineItem("Strategy workshop (full day)", "", "1", "$ 1,800.00", "$ 1,800.00")
                .lineItem("Brand audit report", "", "1", "$    900.00", "$    900.00")
                .lineItem("UI prototype, two screens", "", "2", "$    600.00", "$ 1,200.00")
                .lineItem("Print-ready handoff", "", "1", "$    420.00", "$    420.00")
                .lineItem("Quarterly retainer (May 2026)", "", "1", "$    500.00", "$    500.00")
                .summaryRow("Subtotal", "$ 4,463.00")
                .summaryRow("Tax (8%)", "$   357.00")
                .totalRow("TOTAL", "$ 4,820.00")
                .note("Please settle within 30 days of the issue date.")
                .note("Wire transfers preferred.")
                .paymentTerm("IBAN: GB29 NWBK 6016 1331 9268 19")
                .paymentTerm("SWIFT: NWBKGB2L")
                .footerNote("invoices@northwind.example | +1 555 0143")
                .build();
    }
}
