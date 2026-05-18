package com.demcha.graphcompose.preview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Verifies {@link ArtifactUpdater#markArtifactsPresent} against a fixture
 * that mirrors the shape of {@code examples/invoice-reference/revisions/
 * revision-001/revision.json}.
 */
class ArtifactUpdaterTest {

    @Test
    void removesArtifactsFromPendingList() throws Exception {
        Path tempDir = Files.createTempDirectory("artifact-updater-");
        try {
            Path revision = tempDir.resolve("revision-001");
            Files.createDirectories(revision);
            copyFixtureTo(revision.resolve("revision.json"));

            ArtifactUpdater.markArtifactsPresent(revision, List.of("output.pdf", "output.png"));

            String updated = Files.readString(revision.resolve("revision.json"), StandardCharsets.UTF_8);
            // pendingArtifacts must now be an empty array. Note: the strings
            // "output.pdf" / "output.png" still appear in this file as VALUES
            // under the artifacts map (artifacts.pdf, artifacts.preview); we
            // only clear them from the pending list.
            assertTrue(updated.contains("\"pendingArtifacts\": []"),
                    "pendingArtifacts should now be empty, got:\n" + updated);
            // The artifacts map must survive intact so downstream consumers
            // still know which filename maps to which logical artifact.
            assertTrue(updated.contains("\"pdf\": \"output.pdf\""),
                    "artifacts.pdf mapping should survive");
            assertTrue(updated.contains("\"preview\": \"output.png\""),
                    "artifacts.preview mapping should survive");
            // Other entries must survive intact.
            assertTrue(updated.contains("\"id\": \"revision-001\""), "id should survive");
            assertTrue(updated.contains("\"changedComponents\""), "changedComponents should survive");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void preservesUnmatchedPendingEntries() throws Exception {
        Path tempDir = Files.createTempDirectory("artifact-updater-partial-");
        try {
            Path revision = tempDir.resolve("revision-001");
            Files.createDirectories(revision);
            copyFixtureTo(revision.resolve("revision.json"));

            // Clear only output.pdf; output.png should remain in pendingArtifacts.
            ArtifactUpdater.markArtifactsPresent(revision, List.of("output.pdf"));

            String updated = Files.readString(revision.resolve("revision.json"), StandardCharsets.UTF_8);
            assertTrue(updated.contains("\"pendingArtifacts\": ["),
                    "pendingArtifacts should still be a non-empty array");
            assertTrue(updated.contains("\"output.png\""),
                    "output.png should remain in pendingArtifacts");
            assertFalse(updated.matches("(?s).*\"pendingArtifacts\": \\[[^\\]]*\"output\\.pdf\".*"),
                    "output.pdf must be gone from pendingArtifacts");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void isIdempotent() throws Exception {
        Path tempDir = Files.createTempDirectory("artifact-updater-idempotent-");
        try {
            Path revision = tempDir.resolve("revision-001");
            Files.createDirectories(revision);
            copyFixtureTo(revision.resolve("revision.json"));

            ArtifactUpdater.markArtifactsPresent(revision, List.of("output.pdf", "output.png"));
            String firstPass = Files.readString(revision.resolve("revision.json"), StandardCharsets.UTF_8);

            ArtifactUpdater.markArtifactsPresent(revision, List.of("output.pdf", "output.png"));
            String secondPass = Files.readString(revision.resolve("revision.json"), StandardCharsets.UTF_8);

            assertEquals(firstPass, secondPass, "second pass must produce identical bytes");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void writesTwoSpaceIndentation() throws Exception {
        Path tempDir = Files.createTempDirectory("artifact-updater-indent-");
        try {
            Path revision = tempDir.resolve("revision-001");
            Files.createDirectories(revision);
            copyFixtureTo(revision.resolve("revision.json"));

            ArtifactUpdater.markArtifactsPresent(revision, List.of("output.pdf"));

            String updated = Files.readString(revision.resolve("revision.json"), StandardCharsets.UTF_8);
            // Top-level keys are indented two spaces under the opening '{'.
            assertTrue(updated.contains("\n  \"id\":") || updated.contains("\r\n  \"id\":"),
                    "id key should be indented with exactly two spaces");
            // Nested entries should be indented four spaces total.
            assertTrue(updated.contains("\n    \"userRequest\":")
                            || updated.contains("\r\n    \"userRequest\":"),
                    "nested artifacts.userRequest should be indented with four spaces");
            // Confirm no four-space indented top-level keys leaked in.
            assertFalse(updated.contains("\n    \"id\":")
                            || updated.contains("\r\n    \"id\":"),
                    "id should not be over-indented");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    private static void copyFixtureTo(Path dest) throws IOException {
        try (InputStream in = ArtifactUpdaterTest.class
                .getResourceAsStream("/sample-revision.json")) {
            if (in == null) {
                throw new IOException("classpath resource /sample-revision.json missing");
            }
            Files.write(dest, in.readAllBytes());
        }
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var stream = Files.walk(root)) {
            stream.sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                            // best-effort cleanup
                        }
                    });
        }
    }
}
