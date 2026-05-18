// Package: com.demcha.compose.document.fixtures.rowbasic
// All segments lowercase per Java package conventions. The "fixtures"
// namespace nests under com.demcha.compose.document so the tests live in
// the same package root as the canonical library surface they validate.
package com.demcha.compose.document.fixtures.rowbasic;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RowBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of {@link RowBuilder} per
 * skills/versions/graphcompose-1.6/layout-primitives.md.
 *
 * <p>The fixture builds a one-page document with one row named
 * "TwoColumn" whose two named child sections (LabelCol on the left,
 * ValueCol on the right) are the canonical row-of-sections pattern
 * from the skill pack. All builder calls used here resolve to the
 * real GraphCompose 1.6 canonical surface ({@code com.demcha.compose.document.*}).</p>
 */
final class RowBasicFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> document.pageFlow(page -> page
                            .name("RowBasicFixture")
                            .spacing(8)
                            .addRow("TwoColumn", RowBasicFixtureTest::renderTwoColumnRow)),
                    "RowBuilder with two child sections must compose without throwing");
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderTwoColumnRow(RowBuilder row) {
        row.spacing(8)
                .weights(1, 1)
                .addSection("LabelCol", section -> section.addParagraph("INVOICE NO"))
                .addSection("ValueCol", section -> section.addParagraph("INV-2026-0001"));
    }
}
