package com.demcha.graphcompose.preview.fixtures;

import com.demcha.compose.document.api.DocumentSession;

/**
 * Data-driven template used to verify compose(DocumentSession, Spec).
 */
public final class SpecAwareSmokeTemplate {

    public void compose(DocumentSession document, SmokeSpec spec) {
        document.pageFlow(page -> page
                .name("SpecAwareSmokeTemplate")
                .spacing(8)
                .addSection("Body", section -> section
                        .addParagraph(spec.title())));
    }
}
