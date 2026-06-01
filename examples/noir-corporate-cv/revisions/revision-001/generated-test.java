package com.demcha.examples.cv;

import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Smoke test for the first Noir Corporate CV draft.
 */
class GeneratedCvTemplateTest {

    @Test
    void composeDoesNotThrow() {
        GeneratedCvTemplate template = new GeneratedCvTemplate();

        try (DocumentSession document = GraphCompose.document(Path.of("output.pdf")).create()) {
            assertDoesNotThrow(() -> template.compose(document));
        } catch (Exception e) {
            throw new AssertionError("DocumentSession close failed", e);
        }
    }
}
