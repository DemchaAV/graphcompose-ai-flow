// Package: com.demcha.compose.document.fixtures.tablebasic (all lowercase).
package com.demcha.compose.document.fixtures.tablebasic;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.document.theme.BusinessTheme;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of {@link TableBuilder} with header styling,
 * three columns, and zebra rows per
 * skills/versions/graphcompose-1.6/tables.md and
 * skills/versions/graphcompose-1.6/themes-and-colors.md.
 *
 * <p>The fixture builds a one-page document with one table named
 * "LineItems" whose three columns share their meaning across the data
 * rows. The real {@link DocumentTableColumn} supports {@code auto()} and
 * {@code fixed(double)}; this fixture uses one auto column and two
 * fixed-width numeric columns, mirroring {@code InvoiceTemplateV2}.</p>
 */
final class TableBasicFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        BusinessTheme theme = BusinessTheme.modern();

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> document.pageFlow(page -> page
                            .name("TableBasicFixture")
                            .spacing(8)
                            .addTable(table -> renderLineItems(table, theme))),
                    "TableBuilder with header, zebra, and three columns must compose");
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderLineItems(TableBuilder table, BusinessTheme theme) {
        DocumentTableStyle bordered = DocumentTableStyle.builder()
                .stroke(DocumentStroke.of(theme.palette().rule(), 0.6))
                .padding(DocumentInsets.of(7.0))
                .build();
        DocumentTableStyle headerStyle = DocumentTableStyle.builder()
                .fillColor(theme.palette().primary())
                .stroke(DocumentStroke.of(theme.palette().rule(), 0.6))
                .padding(DocumentInsets.of(8.0))
                .textStyle(theme.text().label())
                .build();

        table.name("LineItems")
                .columns(
                        DocumentTableColumn.auto(),
                        DocumentTableColumn.fixed(54),
                        DocumentTableColumn.fixed(96))
                .defaultCellStyle(bordered)
                .headerRow("Description", "Qty", "Amount")
                .headerStyle(headerStyle)
                // Real TableBuilder.zebra(odd, even) takes two DocumentColor
                // fills — the original test's theme.zebraAlternate() is the
                // surfaceMuted token in the real palette.
                .zebra(theme.palette().surfaceMuted(), theme.palette().surface())
                .row("Design discovery", "4", "$ 1,200.00")
                .row("Implementation", "8", "$ 2,400.00");
    }
}
