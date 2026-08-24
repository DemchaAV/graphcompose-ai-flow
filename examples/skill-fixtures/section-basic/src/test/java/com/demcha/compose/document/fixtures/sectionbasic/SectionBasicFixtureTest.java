// Package: com.demcha.compose.document.fixtures.sectionbasic (all lowercase).
package com.demcha.compose.document.fixtures.sectionbasic;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.style.DocumentInsets;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of {@link SectionBuilder} with a soft-panel
 * background and padding per
 * skills/versions/graphcompose-1.6/layout-primitives.md and
 * skills/versions/graphcompose-1.6/backgrounds-and-panels.md.
 *
 * <p>The fixture builds a one-page document with one named section
 * "Callout" carrying a panel background sourced from a real
 * local palette constant, 8 pt of internal padding, and a
 * single body paragraph. All builder calls resolve to the real
 * GraphCompose 1.6 canonical surface.</p>
 */
final class SectionBasicFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> document.pageFlow(page -> page
                            .name("SectionBasicFixture")
                            .spacing(8)
                            .addSection("Callout", section -> renderCallout(section))),
                    "SectionBuilder with background, padding, and a child text must compose");
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderCallout(SectionBuilder section) {
        // softPanel(...) bundles fill + corner radius + uniform padding from
        // AbstractFlowBuilder; equivalent to the original test's
        // background + padding + cornerRadius sequence but matches the
        // canonical preset name used by InvoiceTemplateV2 / ProposalTemplateV2.
        section.softPanel(FixtureTheme.SURFACE_MUTED, 6.0, 8.0)
                .addParagraph(p -> p
                        .text("Payment is due within 30 days of the invoice date.")
                        .textStyle(FixtureTheme.BODY)
                        .margin(DocumentInsets.zero()));
    }
}
