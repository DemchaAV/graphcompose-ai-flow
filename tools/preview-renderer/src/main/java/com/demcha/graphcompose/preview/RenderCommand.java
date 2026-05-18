package com.demcha.graphcompose.preview;

import java.io.PrintStream;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * GraphCompose template -> PDF rendering.
 *
 * <p>This subcommand is intentionally a skeleton-with-detection. Today it:
 * <ol>
 *   <li>Validates the revision folder.</li>
 *   <li>Loads a {@link URLClassLoader} from the supplied {@code --classpath}.</li>
 *   <li>Attempts to resolve {@code com.demcha.compose.document.api.DocumentSession}
 *       — the canonical FQCN of the real GraphCompose 1.6 session class.</li>
 *   <li>If GraphCompose is absent, prints the skeleton message and exits 0.</li>
 *   <li>If GraphCompose is present, leaves a TODO at the wiring point.</li>
 * </ol>
 *
 * <p>The "skipped" exit code is 0 by design: an AI orchestrator can call this
 * tool today, see the skipped message, and continue with downstream steps
 * (e.g. preview generation against a manually-produced PDF). Once
 * GraphCompose 1.6 ships to a reachable Maven repo, the TODO in
 * {@link #renderWithGraphCompose} becomes the actual rendering call.
 */
final class RenderCommand {

    static final String SKELETON_MESSAGE_LINE_1 =
            "graphcompose runtime not detected on classpath; render skipped.";
    static final String SKELETON_MESSAGE_LINE_2 =
            "supply --classpath pointing at graphcompose-<version>.jar to enable rendering.";

    // The real GraphCompose 1.6 session class lives at
    // com.demcha.compose.document.api.DocumentSession. The renderer's own
    // package name (com.demcha.graphcompose.preview) is independent — it
    // is this tool's namespace, not the library's.
    private static final String DOCUMENT_SESSION_FQCN = "com.demcha.compose.document.api.DocumentSession";

    private RenderCommand() {
        // command dispatch only
    }

    static int run(Map<String, String> flags, PrintStream out, PrintStream err) throws Exception {
        Path revisionFolder = Paths.get(requireFlag(flags, "revision"));
        String templateClass = requireFlag(flags, "template-class");
        String rawClasspath = flags.getOrDefault("classpath", "");

        if (!Files.isDirectory(revisionFolder)) {
            err.println("revision folder not found: " + revisionFolder);
            return 1;
        }
        Path revisionJson = revisionFolder.resolve("revision.json");
        if (!Files.isRegularFile(revisionJson)) {
            err.println("missing revision.json in: " + revisionFolder);
            return 1;
        }
        // The generated template file may not exist yet for greenfield revisions,
        // but we still warn so the operator notices.
        Path templateFile = revisionFolder.resolve("generated-template.java");
        if (!Files.isRegularFile(templateFile)) {
            err.println("warning: generated-template.java not found in " + revisionFolder
                    + " (rendering may fail once wired up).");
        }

        URLClassLoader classpathLoader = buildClassLoader(rawClasspath);
        boolean graphComposeDetected = classExists(classpathLoader, DOCUMENT_SESSION_FQCN);

        if (!graphComposeDetected) {
            out.println(SKELETON_MESSAGE_LINE_1);
            out.println(SKELETON_MESSAGE_LINE_2);
            writeRenderLog(revisionFolder, List.of(
                    SKELETON_MESSAGE_LINE_1,
                    SKELETON_MESSAGE_LINE_2,
                    "templateClass=" + templateClass,
                    "classpath=" + rawClasspath));
            return 0;
        }

        // GraphCompose IS on the classpath. The remainder is Phase 6 follow-up work.
        return renderWithGraphCompose(revisionFolder, templateClass, classpathLoader, out, err);
    }

    /**
     * TODO Phase 6 follow-up: once GraphCompose 1.6 is reachable on a Maven
     * repo, instantiate the template, invoke its {@code compose()} method to
     * obtain a {@code DocumentSession}, capture the PDF bytes, write them to
     * {@code revisionFolder/output.pdf}, invoke {@link PreviewCommand#runRender}
     * to write {@code output.png}, then call
     * {@link ArtifactUpdater#markArtifactsPresent} for "output.pdf" and
     * "output.png".
     */
    private static int renderWithGraphCompose(
            Path revisionFolder,
            String templateClass,
            URLClassLoader classpathLoader,
            PrintStream out,
            PrintStream err) throws Exception {
        out.println("graphcompose runtime detected; full rendering is a Phase 6 follow-up.");
        writeRenderLog(revisionFolder, List.of(
                "graphcompose runtime detected",
                "templateClass=" + templateClass,
                "rendering not implemented yet (see RenderCommand#renderWithGraphCompose TODO)"));
        return 0;
    }

    static URLClassLoader buildClassLoader(String rawClasspath) throws Exception {
        List<URL> urls = new ArrayList<>();
        if (rawClasspath != null && !rawClasspath.isEmpty()) {
            String sep = System.getProperty("path.separator");
            String[] parts = rawClasspath.split(java.util.regex.Pattern.quote(sep));
            for (String part : parts) {
                if (part.isEmpty()) {
                    continue;
                }
                Path entry = Paths.get(part);
                if (Files.exists(entry)) {
                    urls.add(entry.toUri().toURL());
                }
            }
        }
        // Parent = null so we strictly test the supplied classpath; falls back
        // to the platform loader only for JDK classes, which is what we want.
        return new URLClassLoader(urls.toArray(new URL[0]), ClassLoader.getPlatformClassLoader());
    }

    static boolean classExists(ClassLoader loader, String fqcn) {
        try {
            Class.forName(fqcn, false, loader);
            return true;
        } catch (ClassNotFoundException | NoClassDefFoundError missing) {
            return false;
        }
    }

    private static void writeRenderLog(Path revisionFolder, List<String> lines) throws Exception {
        Path log = revisionFolder.resolve("render.log");
        StringBuilder buf = new StringBuilder();
        buf.append("# render.log").append(System.lineSeparator());
        buf.append("# timestamp=").append(Instant.now().toString()).append(System.lineSeparator());
        for (String line : lines) {
            buf.append(line).append(System.lineSeparator());
        }
        Files.writeString(
                log,
                buf.toString(),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING);
    }

    private static String requireFlag(Map<String, String> flags, String name) {
        String value = flags.get(name);
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("--" + name + " is required");
        }
        return value;
    }
}
