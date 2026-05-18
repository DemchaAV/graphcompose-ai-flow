package com.demcha.graphcompose.fixtures.rowBasic;

import com.demcha.graphcompose.DocumentSession;
import com.demcha.graphcompose.DocumentTemplate;
import com.demcha.graphcompose.RowBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of RowBuilder per
 * skills/versions/graphcompose-1.6/layout-primitives.md.
 *
 * The fixture builds a one-page document with one row named
 * "TwoColumn" whose two named child sections (LabelCol on the left,
 * ValueCol on the right) are the canonical row-of-sections pattern
 * from the skill pack.
 */
final class RowBasicFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        DocumentTemplate<Void> template = (document, spec) -> document.pageFlow(page -> page
                .name("RowBasicFixture")
                .spacing(8)
                .addRow("TwoColumn", row -> renderTwoColumnRow(row)));

        // TODO(skill-validation): confirm DocumentSession.create() factory in Phase 4 fixture run
        DocumentSession document = DocumentSession.create();

        assertDoesNotThrow(() -> template.compose(document, null),
                "RowBuilder with two child sections must compose without throwing");

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderTwoColumnRow(RowBuilder row) {
        row.addSection("LabelCol", section -> section.text("INVOICE NO"));
        row.addSection("ValueCol", section -> section.text("INV-2026-0001"));
    }
}
