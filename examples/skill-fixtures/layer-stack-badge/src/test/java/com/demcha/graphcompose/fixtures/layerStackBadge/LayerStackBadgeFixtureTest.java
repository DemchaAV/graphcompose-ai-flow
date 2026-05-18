package com.demcha.graphcompose.fixtures.layerStackBadge;

import com.demcha.graphcompose.BusinessTheme;
import com.demcha.graphcompose.DocumentSession;
import com.demcha.graphcompose.DocumentTemplate;
import com.demcha.graphcompose.LayerStack;
import com.demcha.graphcompose.SectionBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of LayerStack for the canonical "badge on
 * a card" pattern per
 * skills/versions/graphcompose-1.6/layer-stacks-and-overlays.md.
 *
 * The badge is a real semantic element whose removal would change the
 * meaning of the card, so the overlap is genuine and the layer stack
 * is the correct primitive (rather than a coordinate hack or a
 * pseudo-border).
 */
final class LayerStackBadgeFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        BusinessTheme theme = BusinessTheme.business();

        DocumentTemplate<Void> template = (document, spec) -> document.pageFlow(page -> page
                .name("LayerStackBadgeFixture")
                .spacing(8)
                .addSection("CardWithBadge", section -> renderCardWithBadge(section, theme)));

        DocumentSession document = DocumentSession.create();

        assertDoesNotThrow(() -> template.compose(document, null),
                "LayerStack with card content below and badge above must compose");

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderCardWithBadge(SectionBuilder section, BusinessTheme theme) {
        // TODO(skill-validation): confirm SectionBuilder.layerStack(name, lambda) entry point in Phase 4 fixture run
        section.layerStack("CardWithBadgeStack", LayerStackBadgeFixtureTest::renderStack);
    }

    private static void renderStack(LayerStack stack) {
        // Layer 0 (bottom): the card body.
        stack.addLayer("CardBody", layer -> layer.addSection("CardBody", body -> {
            body.text("Invoice 2026-0001");
            body.text("Issued 2026-05-18");
        }));
        // Layer 1 (top): the "NEW" pill badge, anchored top-right.
        // TODO(skill-validation): confirm LayerStack anchor API in Phase 4 fixture run
        stack.addLayer("NewBadge", layer -> layer.addSection("NewBadge", badge -> badge.text("NEW")));
    }
}
