// Colours and text styles for this fixture, built from the core authoring
// surface only.
//
// The fixtures used to take these from `com.demcha.compose.document.theme.BusinessTheme`.
// GraphCompose 2.0 moved that class into the library's own `examples` module,
// which is not published, so no project depending on
// `io.github.demchaav:graph-compose` can reach it. Reproducing the values here
// keeps the renders identical to the 1.9 baselines while depending on nothing
// but `DocumentColor` and `DocumentTextStyle`, which is what a fixture proving
// "the documented calls resolve" should depend on.
//
// The values are BusinessTheme.modern() as of v2.2.0: cream surface, deep teal
// primary, gold accent, Helvetica at 13/11/10 pt.
package com.demcha.compose.document.fixtures.layerstackbadge;

import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.font.FontName;

final class FixtureTheme {

    static final DocumentColor PRIMARY = DocumentColor.rgb(20, 60, 75);
    static final DocumentColor ACCENT = DocumentColor.rgb(196, 153, 76);
    static final DocumentColor SURFACE = DocumentColor.rgb(252, 248, 240);
    static final DocumentColor SURFACE_MUTED = DocumentColor.rgb(244, 238, 228);
    static final DocumentColor RULE = DocumentColor.rgb(212, 200, 178);
    static final DocumentColor TEXT_PRIMARY = DocumentColor.rgb(34, 38, 50);
    static final DocumentColor TEXT_MUTED = DocumentColor.rgb(110, 110, 120);

    /** Section heading: 13 pt bold, primary text colour. */
    static final DocumentTextStyle H3 = style(13, DocumentTextDecoration.BOLD, TEXT_PRIMARY);

    /** Body copy: 11 pt regular. */
    static final DocumentTextStyle BODY = style(11, DocumentTextDecoration.DEFAULT, TEXT_PRIMARY);

    /** Emphasised inline label: body size, bold. */
    static final DocumentTextStyle LABEL = style(11, DocumentTextDecoration.BOLD, TEXT_PRIMARY);

    /** Secondary line under a heading: 10 pt, muted. */
    static final DocumentTextStyle CAPTION = style(10, DocumentTextDecoration.DEFAULT, TEXT_MUTED);

    private FixtureTheme() {
    }

    private static DocumentTextStyle style(double size, DocumentTextDecoration decoration, DocumentColor color) {
        return DocumentTextStyle.builder()
                .fontName(FontName.HELVETICA)
                .size(size)
                .decoration(decoration)
                .color(color)
                .build();
    }
}
