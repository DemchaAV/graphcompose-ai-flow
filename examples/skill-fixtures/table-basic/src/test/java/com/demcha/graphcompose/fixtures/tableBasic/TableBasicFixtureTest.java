package com.demcha.graphcompose.fixtures.tableBasic;

import com.demcha.graphcompose.BusinessTheme;
import com.demcha.graphcompose.DocumentSession;
import com.demcha.graphcompose.DocumentTemplate;
import com.demcha.graphcompose.TableBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of TableBuilder with header styling,
 * three columns, and zebra rows per
 * skills/versions/graphcompose-1.6/tables.md and
 * skills/versions/graphcompose-1.6/themes-and-colors.md.
 *
 * The fixture builds a one-page document with one table named
 * "LineItems" whose three columns share their meaning across the
 * data rows (the "shared column meaning" test from the tables skill).
 */
final class TableBasicFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        BusinessTheme theme = BusinessTheme.business();

        DocumentTemplate<Void> template = (document, spec) -> document.pageFlow(page -> page
                .name("TableBasicFixture")
                .spacing(8)
                .addTable("LineItems", table -> renderLineItems(table, theme)));

        DocumentSession document = DocumentSession.create();

        assertDoesNotThrow(() -> template.compose(document, null),
                "TableBuilder with header, zebra, and three columns must compose");

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderLineItems(TableBuilder table, BusinessTheme theme) {
        // TODO(skill-validation): confirm TableBuilder.Align enum surface in Phase 4 fixture run
        table.column("Description", 0.60f, TableBuilder.Align.LEFT);
        table.column("Qty", 0.15f, TableBuilder.Align.RIGHT);
        table.column("Amount", 0.25f, TableBuilder.Align.RIGHT);

        // TODO(skill-validation): confirm headerBackground / headerTextColor / zebra method names in Phase 4 fixture run
        table.headerBackground(theme.tableHeaderBackground());
        table.headerTextColor(theme.tableHeaderText());
        table.zebra(theme.zebraAlternate());

        table.row(row -> row.cell("Design discovery").cell("4").cell("$ 1,200.00"));
        table.row(row -> row.cell("Implementation").cell("8").cell("$ 2,400.00"));
    }
}
