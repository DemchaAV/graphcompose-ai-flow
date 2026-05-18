package com.demcha.graphcompose.preview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

import com.demcha.graphcompose.preview.fixtures.SmokeTemplate;
import com.demcha.graphcompose.preview.fixtures.SpecAwareSmokeTemplate;
import com.demcha.graphcompose.preview.fixtures.SmokeSpecProvider;

/**
 * Exercises both render modes: the no-runtime fallback and the real
 * GraphCompose template execution path.
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

    @Test
    void rendersPdfPreviewAndClearsPendingArtifactsWhenGraphComposePresent() throws Exception {
        Path tempDir = Files.createTempDirectory("preview-renderer-render-runtime-");
        try {
            Path revision = createRevision(tempDir);
            Map<String, String> flags = baseRenderFlags(revision, SmokeTemplate.class.getName());

            ByteArrayOutputStream outBytes = new ByteArrayOutputStream();
            ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
            PrintStream out = new PrintStream(outBytes, true, StandardCharsets.UTF_8);
            PrintStream err = new PrintStream(errBytes, true, StandardCharsets.UTF_8);

            int exit = RenderCommand.run(flags, out, err);

            assertEquals(0, exit, "runtime render path should exit 0");
            assertTrue(errBytes.toString(StandardCharsets.UTF_8).isBlank(),
                    "stderr should stay quiet on successful render");
            assertPdfWritten(revision.resolve("output.pdf"));
            assertPngWritten(revision.resolve("output.png"));

            String revisionJson = Files.readString(revision.resolve("revision.json"), StandardCharsets.UTF_8);
            assertFalse(revisionJson.contains("\"output.pdf\""), "output.pdf should be cleared from pendingArtifacts");
            assertFalse(revisionJson.contains("\"output.png\""), "output.png should be cleared from pendingArtifacts");
            assertTrue(revisionJson.contains("\"keep.txt\""), "unrelated pending artifacts must stay pending");

            String stdout = outBytes.toString(StandardCharsets.UTF_8);
            assertTrue(stdout.contains("rendered pdf:"), "stdout should report the written PDF");
            assertTrue(stdout.contains("rendered preview:"), "stdout should report the written preview");

            String renderLog = Files.readString(revision.resolve("render.log"), StandardCharsets.UTF_8);
            assertTrue(renderLog.contains("status=rendered"), "render.log should record success");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    @Test
    void rendersDataDrivenTemplateWithSpecProvider() throws Exception {
        Path tempDir = Files.createTempDirectory("preview-renderer-render-spec-");
        try {
            Path revision = createRevision(tempDir);
            Path classpathFile = tempDir.resolve("runtime-classpath.txt");
            Files.writeString(classpathFile, testRuntimeClasspath(), StandardCharsets.UTF_8);

            Map<String, String> flags = new LinkedHashMap<>();
            flags.put("revision", revision.toString());
            flags.put("template-class", SpecAwareSmokeTemplate.class.getName());
            flags.put("classpath-file", classpathFile.toString());
            flags.put("spec-provider", SmokeSpecProvider.class.getName());

            ByteArrayOutputStream outBytes = new ByteArrayOutputStream();
            ByteArrayOutputStream errBytes = new ByteArrayOutputStream();
            PrintStream out = new PrintStream(outBytes, true, StandardCharsets.UTF_8);
            PrintStream err = new PrintStream(errBytes, true, StandardCharsets.UTF_8);

            int exit = RenderCommand.run(flags, out, err);

            assertEquals(0, exit, "spec-provider render path should exit 0");
            assertTrue(errBytes.toString(StandardCharsets.UTF_8).isBlank(),
                    "stderr should stay quiet on successful spec render");
            assertPdfWritten(revision.resolve("output.pdf"));
            assertPngWritten(revision.resolve("output.png"));

            String renderLog = Files.readString(revision.resolve("render.log"), StandardCharsets.UTF_8);
            assertTrue(renderLog.contains("specProvider=" + SmokeSpecProvider.class.getName()),
                    "render.log should record the provider class");
        } finally {
            deleteRecursively(tempDir);
        }
    }

    private static Map<String, String> baseRenderFlags(Path revision, String templateClass) {
        Map<String, String> flags = new LinkedHashMap<>();
        flags.put("revision", revision.toString());
        flags.put("template-class", templateClass);
        flags.put("classpath", testRuntimeClasspath());
        return flags;
    }

    private static Path createRevision(Path tempDir) throws IOException {
        Path revision = tempDir.resolve("revision-test");
        Files.createDirectories(revision);
        Files.writeString(
                revision.resolve("revision.json"),
                "{\n"
                        + "  \"id\": \"revision-test\",\n"
                        + "  \"pendingArtifacts\": [\"output.pdf\", \"output.png\", \"keep.txt\"]\n"
                        + "}\n",
                StandardCharsets.UTF_8);
        Files.writeString(
                revision.resolve("generated-template.java"),
                "// placeholder template body for test\n",
                StandardCharsets.UTF_8);
        return revision;
    }

    private static String testRuntimeClasspath() {
        String surefireClasspath = System.getProperty("surefire.test.class.path");
        if (surefireClasspath != null && !surefireClasspath.isBlank()) {
            return surefireClasspath;
        }
        return System.getProperty("java.class.path");
    }

    private static void assertPdfWritten(Path pdf) throws IOException {
        assertTrue(Files.isRegularFile(pdf), "PDF should exist: " + pdf);
        byte[] bytes = Files.readAllBytes(pdf);
        assertTrue(bytes.length > 5, "PDF should not be empty");
        assertEquals("%PDF-", new String(bytes, 0, 5, StandardCharsets.US_ASCII));
    }

    private static void assertPngWritten(Path png) throws IOException {
        assertTrue(Files.isRegularFile(png), "PNG should exist: " + png);
        byte[] bytes = Files.readAllBytes(png);
        assertTrue(bytes.length > 8, "PNG should not be empty");
        assertEquals((byte) 0x89, bytes[0]);
        assertEquals('P', bytes[1]);
        assertEquals('N', bytes[2]);
        assertEquals('G', bytes[3]);
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
