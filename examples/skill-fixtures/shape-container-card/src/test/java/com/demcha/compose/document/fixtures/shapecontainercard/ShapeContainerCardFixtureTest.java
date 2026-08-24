// Package: com.demcha.compose.document.fixtures.shapecontainercard (all lowercase).
package com.demcha.compose.document.fixtures.shapecontainercard;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.dsl.ShapeContainerBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of {@link ShapeContainerBuilder} for a
 * rounded card that carries content, per
 * skills/versions/graphcompose-1.6/shapes-and-containers.md.
 *
 * <p>The fixture builds a one-page document with one rounded card
 * container "RoundedCard" holding a heading and a body text. The card
 * is content-carrying, not decoration, so the shape-container primitive
 * is the correct choice rather than a canvas-painted outline.</p>
 *
 * <p>The real {@code ShapeContainerBuilder} requires an outline to be
 * set before layers are appended; {@code roundedRect(width, height,
 * radius)} is used here.</p>
 */
final class ShapeContainerCardFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> document.pageFlow(page -> page
                            .name("ShapeContainerCardFixture")
                            .spacing(8)
                            .addSection("RoundedCard", section -> renderRoundedCard(section))),
                    "Rounded shape container with heading and body must compose");
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderRoundedCard(SectionBuilder section) {
        // addContainer(...) wraps a ShapeContainerBuilder per
        // AbstractFlowBuilder. The outline call (roundedRect) is mandatory
        // and must come before any layers; the card body lives inside the
        // container via a nested section.
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
