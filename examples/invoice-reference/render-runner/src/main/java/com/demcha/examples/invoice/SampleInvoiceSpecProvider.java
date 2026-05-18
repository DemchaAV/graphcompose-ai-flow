package com.demcha.examples.invoice;

import java.util.List;

import com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec;

/**
 * Sample data provider used by {@code preview-renderer render}.
 */
public final class SampleInvoiceSpecProvider {

    private SampleInvoiceSpecProvider() {
        // factory only
    }

    /**
     * Creates the representative invoice data used by both manual revisions.
     *
     * @return sample invoice document spec
     */
    public static InvoiceDocumentSpec create() {
        return InvoiceDocumentSpec.builder()
                .title("Invoice")
                .invoiceNumber("INV-2026-0042")
                .issueDate("2026-05-12")
                .dueDate("2026-06-11")
                .status("Pending")
                .fromParty(party -> party
                        .name("Northwind Trading Co.")
                        .addressLines(List.of(
                                "100 Market Way",
                                "Seattle, WA 98101",
                                "United States"))
                        .email("invoices@northwind.example")
                        .phone("+1 555 0143"))
                .billToParty(party -> party
                        .name("Acme Studio Ltd.")
                        .addressLines(List.of(
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
