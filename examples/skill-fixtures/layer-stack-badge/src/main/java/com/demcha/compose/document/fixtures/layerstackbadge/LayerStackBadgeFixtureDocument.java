// Renderable adapter for the layer-stack-badge skill fixture (see
// RowBasicFixtureDocument for why this exists). Compose logic mirrors
// LayerStackBadgeFixtureTest.
package com.demcha.compose.document.fixtures.layerstackbadge;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.LayerStackBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.node.SectionNode;

public final class LayerStackBadgeFixtureDocument {

    public void compose(DocumentSession document) {
        
        document.pageFlow(page -> page
                .name("LayerStackBadgeFixture")
                .spacing(8)
                .addSection("CardWithBadge", section -> renderCardWithBadge(section)));
    }

    private static void renderCardWithBadge(SectionBuilder section) {
        section.addLayerStack(stack -> renderStack(stack));
    }

    private static void renderStack(LayerStackBuilder stack) {
        stack.name("CardWithBadgeStack");

        SectionNode cardBody = new SectionBuilder()
                .name("CardBody")
                .softPanel(FixtureTheme.SURFACE_MUTED, 6.0, 12.0)
                .spacing(2)
                .addParagraph(p -> p.text("Invoice 2026-0001").textStyle(FixtureTheme.H3))
                .addParagraph(p -> p.text("Issued 2026-05-18").textStyle(FixtureTheme.CAPTION))
                .build();

        SectionNode newBadge = new SectionBuilder()
                .name("NewBadge")
                .softPanel(FixtureTheme.ACCENT, 8.0, 4.0)
                .addParagraph(p -> p.text("NEW").textStyle(FixtureTheme.LABEL))
                .build();

        stack.layer(cardBody, LayerAlign.TOP_LEFT);
        stack.layer(newBadge, LayerAlign.TOP_RIGHT);
    }
}
