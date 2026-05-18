package com.demcha.graphcompose.preview.fixtures;

import com.demcha.compose.document.api.DocumentSession;

/**
 * Minimal template loaded through RenderCommand's isolated URLClassLoader.
 */
public final class SmokeTemplate {

    public void compose(DocumentSession document) {
        document.pageFlow(page -> page
                .name("SmokeTemplate")
                .spacing(8)
                .addSection("Body", section -> section
                        .addParagraph("Rendered by preview-renderer")));
    }
}
