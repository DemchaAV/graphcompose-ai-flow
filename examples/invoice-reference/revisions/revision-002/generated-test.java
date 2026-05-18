package com.demcha.examples.invoice;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.demcha.graphcompose.BusinessTheme;
import com.demcha.graphcompose.DocumentSession;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smoke test for the revision-002 InvoiceTemplate.
 *
 * Scope today (Phase 3, documentation example):
 *   - build a representative InvoiceSpec
 *   - construct the template against the documented BusinessTheme
 *     factory
 *   - invoke compose(...) on a DocumentSession and assert that the
 *     call does not throw
 *
 * Deferred checks, enabled when the Phase 6 renderer ships:
 *   - PDF byte-size sanity (output.pdf exists and is not empty)
 *   - preview-image diff against reference/reference.png with a
 *     tolerance budget documented in visual-review.md
 *   - layout-snapshot regression against the committed
 *     layout-snapshot.json
 *   - pagination expectation test for a synthetic 50-line invoice
 *   - unit assertions on InvoiceSpec totals (subtotal + tax = total
 *     within rounding tolerance; sum of line-item amounts =
 *     subtotal)
 *
 * These deferred checks live here intentionally so that the test
 * file evolves in lock-step with the template; when the renderer
 * pipeline lands, this file is the place to turn the comments
 * above into real assertions.
 *
 * TODO(visual-review): the revision-002 patch moves the three
 * summary rows out of table.footer(...) and into a dedicated
 * Summary section. The layout snapshot is therefore expected to
 * change for the LineItems and Summary regions, and the visual
 * regression baseline must be refreshed once the Phase 6 renderer
 * ships. Until then this test only enforces the compose-does-not-
 * throw smoke contract; the structural change is exercised by the
 * committed layout-snapshot.json and the visual review.
 */
class InvoiceTemplateTest {

    @Test
    void composeDoesNotThrowForSampleSpec() {
        BusinessTheme theme = BusinessTheme.defaults();
        InvoiceTemplate template = new InvoiceTemplate(theme);
        InvoiceSpec spec = sampleSpec();
        DocumentSession document = DocumentSession.create();

        assertDoesNotThrow(() -> template.compose(document, spec));
    }

    private static InvoiceSpec sampleSpec() {
        Party recipient = new Party(
                "Acme Studio Ltd.",
                List.of("221B Baker Street", "Marylebone, London"),
                "United Kingdom",
                "billing@acme.example",
                null);
        Party company = new Party(
                "Northwind Trading Co.",
                List.of("100 Market Way", "Seattle, WA 98101"),
                "United States",
                "invoices@northwind.example",
                null);
        List<LineItem> lines = List.of(
                new LineItem("Strategy workshop (full day)", "1", "$ 1,800.00", "$ 1,800.00"),
                new LineItem("Brand audit report", "1", "$    900.00", "$    900.00"),
                new LineItem("UI prototype, two screens", "2", "$    600.00", "$ 1,200.00"),
                new LineItem("Print-ready handoff", "1", "$    420.00", "$    420.00"),
                new LineItem("Quarterly retainer (May 2026)", "1", "$    500.00", "$    500.00"));
        return new InvoiceSpec(
                "INV-2026-0042",
                "2026-05-12",
                "2026-06-11",
                "$ 4,820.00",
                "$ 4,463.00",
                "Tax (8%)",
                "$   357.00",
                "$ 4,820.00",
                company,
                recipient,
                lines,
                "Please settle within 30 days of the issue date. Wire transfers preferred.",
                "IBAN: GB29 NWBK 6016 1331 9268 19",
                "SWIFT: NWBKGB2L",
                "invoices@northwind.example | +1 555 0143");
    }
}
