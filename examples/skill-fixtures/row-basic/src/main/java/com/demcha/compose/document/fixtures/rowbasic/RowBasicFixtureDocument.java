// Renderable adapter for the row-basic skill fixture.
//
// The fixture's compose logic (the two-column row from
// skills/versions/graphcompose-1.6/layout-primitives.md) lives here as a
// no-arg class with a `compose(DocumentSession)` method so the shared
// tools/preview-renderer `render` subcommand can drive it to a real PDF/PNG
// baseline. preview-renderer creates the DocumentSession (bound to the output
// path) and calls compose(...); this class only describes the document.
//
// RowBasicFixtureTest exercises the SAME compose, so the smoke test and the
// rendered baseline cannot drift apart.
package com.demcha.compose.document.fixtures.rowbasic;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RowBuilder;

public final class RowBasicFixtureDocument {

    /** Compose the row-basic fixture document into the supplied session. */
    public void compose(DocumentSession document) {
        document.pageFlow(page -> page
                .name("RowBasicFixture")
                .spacing(8)
                .addRow("TwoColumn", RowBasicFixtureDocument::renderTwoColumnRow));
    }

    private static void renderTwoColumnRow(RowBuilder row) {
        row.spacing(8)
                .weights(1, 1)
                .addSection("LabelCol", section -> section.addParagraph("INVOICE NO"))
                .addSection("ValueCol", section -> section.addParagraph("INV-2026-0001"));
    }
}
