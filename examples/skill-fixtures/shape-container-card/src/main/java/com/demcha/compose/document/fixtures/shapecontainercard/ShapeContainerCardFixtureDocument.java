// Renderable adapter for the shape-container-card skill fixture (see
// RowBasicFixtureDocument for why this exists). Compose logic mirrors
// ShapeContainerCardFixtureTest.
package com.demcha.compose.document.fixtures.shapecontainercard;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.SectionBuilder;

public final class ShapeContainerCardFixtureDocument {

    public void compose(DocumentSession document) {
        
        document.pageFlow(page -> page
                .name("ShapeContainerCardFixture")
                .spacing(8)
                .addSection("RoundedCard", section -> renderRoundedCard(section)));
    }

    private static void renderRoundedCard(SectionBuilder section) {
        section.addContainer(container -> container
                .name("RoundedCardContainer")
                .roundedRect(360, 96, 6.0)
                .fillColor(FixtureTheme.SURFACE_MUTED)
                .layer(
                        new SectionBuilder()
                                .name("CardContent")
                                .spacing(2)
                                .addParagraph(p -> p.text("Payment confirmation").textStyle(FixtureTheme.H3))
                                .addParagraph(p -> p
                                        .text("Thank you. Your payment has been received and applied.")
                                        .textStyle(FixtureTheme.BODY))
                                .build()));
    }
}
