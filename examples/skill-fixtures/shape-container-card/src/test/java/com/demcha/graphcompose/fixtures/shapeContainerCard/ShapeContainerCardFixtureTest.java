package com.demcha.graphcompose.fixtures.shapeContainerCard;

import com.demcha.graphcompose.BusinessTheme;
import com.demcha.graphcompose.DocumentSession;
import com.demcha.graphcompose.DocumentTemplate;
import com.demcha.graphcompose.SectionBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of a rounded shape container that
 * carries content per
 * skills/versions/graphcompose-1.6/shapes-and-containers.md.
 *
 * The fixture builds a one-page document with one rounded card
 * container "RoundedCard" holding a heading and a body text. The
 * card is content-carrying, not decoration, so the shape-container
 * primitive is the correct choice rather than a canvas-painted
 * outline.
 */
final class ShapeContainerCardFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        BusinessTheme theme = BusinessTheme.business();

        DocumentTemplate<Void> template = (document, spec) -> document.pageFlow(page -> page
                .name("ShapeContainerCardFixture")
                .spacing(8)
                .addSection("RoundedCard", section -> renderRoundedCard(section, theme)));

        DocumentSession document = DocumentSession.create();

        assertDoesNotThrow(() -> template.compose(document, null),
                "Rounded shape container with heading and body must compose");

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderRoundedCard(SectionBuilder section, BusinessTheme theme) {
        section.background(theme.panelBackground());
        section.padding(8);
        // TODO(skill-validation): confirm SectionBuilder.cornerRadius(int) shape-container surface in Phase 4 fixture run
        section.cornerRadius(6);
        section.addSection("CardContent", body -> {
            body.text("Payment confirmation");
            body.text("Thank you. Your payment has been received and applied.");
        });
    }
}
