package com.demcha.examples.cv;

import java.nio.file.Files;
import java.nio.file.Path;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Smoke test for revision-003 of the CV reference template.
 *
 * <p>The test verifies that compose(...) does not throw and that every icon
 * the template references exists on disk — exercising the asset-resolver
 * hand-off documented in {@code tools/asset-resolver/README.md}.</p>
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

    @Test
    void resolvedAssetsAreOnDisk() {
        Path revisionDir = Path.of(System.getProperty("graphcompose.revision.dir", "."));
        Path iconsDir = revisionDir.resolve("assets").resolve("icons");

        for (String token : new String[] {
                "phone", "email", "location", "website",
                "twitter", "facebook", "pinterest", "linkedin",
                "expertise-badge",
        }) {
            Path icon = iconsDir.resolve(token + ".png");
            assertTrue(Files.exists(icon),
                    "asset-resolver should have downloaded " + icon);
        }
    }
}
