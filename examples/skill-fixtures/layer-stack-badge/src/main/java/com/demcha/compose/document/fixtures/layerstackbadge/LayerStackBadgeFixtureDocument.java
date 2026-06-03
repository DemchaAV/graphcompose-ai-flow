// Renderable adapter for the layer-stack-badge skill fixture (see
// RowBasicFixtureDocument for why this exists). Compose logic mirrors
// LayerStackBadgeFixtureTest.
package com.demcha.compose.document.fixtures.layerstackbadge;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.LayerStackBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.node.SectionNode;
import com.demcha.compose.document.theme.BusinessTheme;

public final class LayerStackBadgeFixtureDocument {

    public void compose(DocumentSession document) {
        BusinessTheme theme = BusinessTheme.modern();
        document.pageFlow(page -> page
                .name("LayerStackBadgeFixture")
                .spacing(8)
                .addSection("CardWithBadge", section -> renderCardWithBadge(section, theme)));
    }

    private static void renderCardWithBadge(SectionBuilder section, BusinessTheme theme) {
        section.addLayerStack(stack -> renderStack(stack, theme));
    }

    private static void renderStack(LayerStackBuilder stack, BusinessTheme theme) {
        stack.name("CardWithBadgeStack");

        SectionNode cardBody = new SectionBuilder()
                .name("CardBody")
                .softPanel(theme.palette().surfaceMuted(), 6.0, 12.0)
                .spacing(2)
                .addParagraph(p -> p.text("Invoice 2026-0001").textStyle(theme.text().h3()))
                .addParagraph(p -> p.text("Issued 2026-05-18").textStyle(theme.text().caption()))
                .build();

        SectionNode newBadge = new SectionBuilder()
                .name("NewBadge")
                .softPanel(theme.palette().accent(), 8.0, 4.0)
                .addParagraph(p -> p.text("NEW").textStyle(theme.text().label()))
                .build();

        stack.layer(cardBody, LayerAlign.TOP_LEFT);
        stack.layer(newBadge, LayerAlign.TOP_RIGHT);
    }
}
