package com.demcha.examples.cv;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smoke test for the sixth Noir Corporate CV draft.
 */
class GeneratedCvTemplateTest {

    @Test
    void composeDoesNotThrowWithRevisionSpec() {
        System.setProperty("graphcompose.revision.dir",
                Path.of("examples", "noir-corporate-cv", "revisions", "revision-006")
                        .toAbsolutePath()
                        .toString());
        GeneratedCvTemplate template = new GeneratedCvTemplate();
        NoirCorporateCvSpec spec = NoirCorporateCvSpecProvider.create();

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> template.compose(document, spec));
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }
    }
}
