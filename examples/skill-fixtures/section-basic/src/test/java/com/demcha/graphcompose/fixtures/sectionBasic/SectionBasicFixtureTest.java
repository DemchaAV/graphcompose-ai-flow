package com.demcha.graphcompose.fixtures.sectionBasic;

import com.demcha.graphcompose.BusinessTheme;
import com.demcha.graphcompose.DocumentSession;
import com.demcha.graphcompose.DocumentTemplate;
import com.demcha.graphcompose.SectionBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smallest possible exercise of SectionBuilder with a soft panel
 * background and padding per
 * skills/versions/graphcompose-1.6/layout-primitives.md and
 * skills/versions/graphcompose-1.6/backgrounds-and-panels.md.
 *
 * The fixture builds a one-page document with one named section
 * "Callout" carrying a panel background sourced from a BusinessTheme
 * token, 8 mm of internal padding, and a single body text element.
 */
final class SectionBasicFixtureTest {

    @Test
    void produces_expected_layout_snapshot() {
        // TODO(skill-validation): confirm BusinessTheme.business() default-factory in Phase 4 fixture run
        BusinessTheme theme = BusinessTheme.business();

        DocumentTemplate<Void> template = (document, spec) -> document.pageFlow(page -> page
                .name("SectionBasicFixture")
                .spacing(8)
                .addSection("Callout", section -> renderCallout(section, theme)));

        // TODO(skill-validation): confirm DocumentSession.create() factory in Phase 4 fixture run
        DocumentSession document = DocumentSession.create();

        assertDoesNotThrow(() -> template.compose(document, null),
                "SectionBuilder with background, padding, and a child text must compose");

        // Deferred checks (wired by Phase 6 renderer + Phase 7 visual-diff):
        //   - layout-snapshot equality against expected-output/layout-snapshot.json
        //   - PDF byte sanity on expected-output/output.pdf
        //   - preview-image visual diff against expected-output/output.png
    }

    private static void renderCallout(SectionBuilder section, BusinessTheme theme) {
        section.background(theme.panelBackground());
        section.padding(8);
        section.text("Payment is due within 30 days of the invoice date.");
    }
}
