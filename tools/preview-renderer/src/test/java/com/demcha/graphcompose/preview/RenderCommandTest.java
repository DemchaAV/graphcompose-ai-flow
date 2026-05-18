package com.demcha.graphcompose.preview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * Exercises {@link RenderCommand} with an empty {@code --classpath}, which
 * guarantees GraphCompose is not detected and the skeleton-message path runs.
 */
class RenderCommandTest {

    @Test
    void printsSkeletonMessageAndExitsZeroWhenGraphComposeAbsent() throws Exception {
        Path tempDir = Files.createTempDirectory("preview-renderer-render-");
        try {
            Path revision = tempDir.resolve("revision-test");
            Files.createDirectories(revision);
            Files.writeString(
                    revision.resolve("revision.json"),
                    "{\n  \"id\": \"revision-test\",\n  \"pendingArtifacts\": []\n}\n",
                    StandardCharsets.UTF_8);
            Files.writeString(
                    revision.resolve("generated-template.java"),
                    "// placeholder template body for test\n",
                    StandardCharsets.UTF_8);

            Map<String, String> flags = new LinkedHashMap<>();
            flags.put("revision", revision.toString());
            flags.put("template-class", "com.example.Whatever");
            flags.put("classpath", "");

            ByteArrayOutputStream outBytes = new ByteArrayOutputStream();
            ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
            PrintStream out = new PrintStream(outBytes, true, StandardCharsets.UTF_8);
            PrintStream err = new PrintStream(errBytes, true, StandardCharsets.UTF_8);

            int exit = RenderCommand.run(flags, out, err);

            assertEquals(0, exit, "skeleton path must exit 0");
            String stdout = outBytes.toString(StandardCharsets.UTF_8);
            assertTrue(stdout.contains(RenderCommand.SKELETON_MESSAGE_LINE_1),
                    "expected skeleton line 1 in stdout, got: " + stdout);
            assertTrue(stdout.contains(RenderCommand.SKELETON_MESSAGE_LINE_2),
                    "expected skeleton line 2 in stdout, got: " + stdout);

            Path renderLog = revision.resolve("render.log");
            assertTrue(Files.isRegularFile(renderLog), "render.log should be written");
            String logBody = Files.readString(renderLog, StandardCharsets.UTF_8);
            assertTrue(logBody.contains(RenderCommand.SKELETON_MESSAGE_LINE_1),
                    "render.log should record the skeleton message");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void failsCleanlyWhenRevisionFolderMissing() throws Exception {
        Path tempDir = Files.createTempDirectory("preview-renderer-render-missing-");
        try {
            Map<String, String> flags = new LinkedHashMap<>();
            flags.put("revision", tempDir.resolve("does-not-exist").toString());
            flags.put("template-class", "com.example.X");
            flags.put("classpath", "");

            ByteArrayOutputStream outBytes = new ByteArrayOutputStream();
            ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
            PrintStream out = new PrintStream(outBytes, true, StandardCharsets.UTF_8);
            PrintStream err = new PrintStream(errBytes, true, StandardCharsets.UTF_8);

            int exit = RenderCommand.run(flags, out, err);
            assertEquals(1, exit, "missing revision folder should exit non-zero");
            assertTrue(errBytes.toString(StandardCharsets.UTF_8).contains("revision folder not found"));
        } finally {
            deleteRecursively(tempDir);
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
