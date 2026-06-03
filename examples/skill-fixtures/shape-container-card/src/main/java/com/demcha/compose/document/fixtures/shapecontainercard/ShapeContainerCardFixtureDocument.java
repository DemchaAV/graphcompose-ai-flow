// Renderable adapter for the shape-container-card skill fixture (see
// RowBasicFixtureDocument for why this exists). Compose logic mirrors
// ShapeContainerCardFixtureTest.
package com.demcha.compose.document.fixtures.shapecontainercard;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.theme.BusinessTheme;

public final class ShapeContainerCardFixtureDocument {

    public void compose(DocumentSession document) {
        BusinessTheme theme = BusinessTheme.modern();
        document.pageFlow(page -> page
                .name("ShapeContainerCardFixture")
                .spacing(8)
                .addSection("RoundedCard", section -> renderRoundedCard(section, theme)));
    }

    private static void renderRoundedCard(SectionBuilder section, BusinessTheme theme) {
        section.addContainer(container -> container
                .name("RoundedCardContainer")
                .roundedRect(360, 96, 6.0)
                .fillColor(theme.palette().surfaceMuted())
                .layer(
                        new SectionBuilder()
                                .name("CardContent")
                                .spacing(2)
                                .addParagraph(p -> p.text("Payment confirmation").textStyle(theme.text().h3()))
                                .addParagraph(p -> p
                                        .text("Thank you. Your payment has been received and applied.")
                                        .textStyle(theme.text().body()))
                                .build()));
    }
}
