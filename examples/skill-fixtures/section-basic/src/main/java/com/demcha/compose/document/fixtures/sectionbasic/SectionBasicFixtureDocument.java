// Renderable adapter for the section-basic skill fixture (see RowBasicFixtureDocument
// for why this exists). Compose logic mirrors SectionBasicFixtureTest.
package com.demcha.compose.document.fixtures.sectionbasic;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.style.DocumentInsets;

public final class SectionBasicFixtureDocument {

    public void compose(DocumentSession document) {
        
        document.pageFlow(page -> page
                .name("SectionBasicFixture")
                .spacing(8)
                .addSection("Callout", section -> renderCallout(section)));
    }

    private static void renderCallout(SectionBuilder section) {
        section.softPanel(FixtureTheme.SURFACE_MUTED, 6.0, 8.0)
                .addParagraph(p -> p
                        .text("Payment is due within 30 days of the invoice date.")
                        .textStyle(FixtureTheme.BODY)
                        .margin(DocumentInsets.zero()));
    }
}
