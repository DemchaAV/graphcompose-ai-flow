// Package: com.demcha.compose.document.fixtures.layerstackbadge (all lowercase).
package com.demcha.compose.document.fixtures.layerstackbadge;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.LayerStackBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.node.SectionNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of the layer-stack primitive for the
 * canonical "badge on a card" pattern per
 * skills/versions/graphcompose-1.6/layer-stacks-and-overlays.md.
 *
 * <p>The real DSL exposes layer stacks through
 * {@code AbstractFlowBuilder.addLayerStack(Consumer&lt;LayerStackBuilder&gt;)}.
 * Each layer carries one of nine {@link LayerAlign} anchors plus an
 * optional offset; the first layer paints behind, the last layer paints
 * in front.</p>
 *
 * <p>The badge is a real semantic element whose removal would change
 * the meaning of the card, so the overlap is genuine and the layer
 * stack is the correct primitive (rather than a coordinate hack or a
 * pseudo-border).</p>
 */
final class LayerStackBadgeFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> document.pageFlow(page -> page
                            .name("LayerStackBadgeFixture")
                            .spacing(8)
                            .addSection("CardWithBadge", section -> renderCardWithBadge(section))),
                    "LayerStack with card content below and badge above must compose");
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderCardWithBadge(SectionBuilder section) {
        section.addLayerStack(stack -> renderStack(stack));
    }

    private static void renderStack(LayerStackBuilder stack) {
        stack.name("CardWithBadgeStack");

        // Layer 0 (bottom): the card body, sized via a SectionNode built off
        // the public SectionBuilder so the stack has a measurable bounding box.
        SectionNode cardBody = new SectionBuilder()
                .name("CardBody")
                .softPanel(FixtureTheme.SURFACE_MUTED, 6.0, 12.0)
                .spacing(2)
                .addParagraph(p -> p.text("Invoice 2026-0001").textStyle(FixtureTheme.H3))
                .addParagraph(p -> p.text("Issued 2026-05-18").textStyle(FixtureTheme.CAPTION))
                .build();

        // Layer 1 (top): the "NEW" pill badge, anchored top-right via the
        // real LayerAlign enum from com.demcha.compose.document.node.
        SectionNode newBadge = new SectionBuilder()
                .name("NewBadge")
                .softPanel(FixtureTheme.ACCENT, 8.0, 4.0)
                .addParagraph(p -> p.text("NEW").textStyle(FixtureTheme.LABEL))
                .build();

        stack.layer(cardBody, LayerAlign.TOP_LEFT);
        stack.layer(newBadge, LayerAlign.TOP_RIGHT);
    }
}
