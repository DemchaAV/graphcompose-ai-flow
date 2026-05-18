package com.demcha.graphcompose.preview;

import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
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
import java.util.function.Supplier;

/**
 * GraphCompose template -> PDF rendering.
 *
 * <p>This subcommand supports two modes:
 * <ol>
 *   <li>If GraphCompose is absent from {@code --classpath}, print the historical
 *       "render skipped" message and exit 0.</li>
 *   <li>If GraphCompose is present, instantiate the supplied template, compose it
 *       into a canonical {@code DocumentSession}, write {@code output.pdf}, render
 *       {@code output.png}, and clear those pending artifacts from
 *       {@code revision.json}.</li>
 * </ol>
 *
 * <p>The skipped exit code remains 0 by design: an AI orchestrator can call this
 * tool before the library runtime is wired, see the skipped message, and continue
 * with downstream steps such as preview generation against a manually-produced PDF.
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
    private static final String GRAPH_COMPOSE_FQCN = "com.demcha.compose.GraphCompose";
    private static final int DEFAULT_DPI = 150;
    private static final int DEFAULT_PAGE = 0;

    private RenderCommand() {
        // command dispatch only
    }

    static int run(Map<String, String> flags, PrintStream out, PrintStream err) throws Exception {
        Path revisionFolder = Paths.get(requireFlag(flags, "revision"));
        String templateClass = requireFlag(flags, "template-class");
        String rawClasspath = resolveClasspath(flags);
        String specProviderClass = flags.get("spec-provider");
        Path outputPdf = resolveRevisionPath(revisionFolder, flags.get("output"), "output.pdf");
        Path outputPng = resolveRevisionPath(revisionFolder, flags.get("preview"), "output.png");
        int dpi = parseIntOrDefault(flags, "dpi", DEFAULT_DPI);
        int page = parseIntOrDefault(flags, "page", DEFAULT_PAGE);

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

        try (URLClassLoader classpathLoader = buildClassLoader(rawClasspath)) {
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

            return renderWithGraphCompose(
                    revisionFolder,
                    templateClass,
                    specProviderClass,
                    outputPdf,
                    outputPng,
                    dpi,
                    page,
                    classpathLoader,
                    out);
        }
    }

    private static int renderWithGraphCompose(
            Path revisionFolder,
            String templateClass,
            String specProviderClass,
            Path outputPdf,
            Path outputPng,
            int dpi,
            int page,
            URLClassLoader classpathLoader,
            PrintStream out) throws Exception {
        Class<?> documentSessionType = Class.forName(DOCUMENT_SESSION_FQCN, true, classpathLoader);
        Object template = instantiateTemplate(templateClass, classpathLoader);
        boolean hasSpecProvider = specProviderClass != null && !specProviderClass.isBlank();
        Object spec = hasSpecProvider ? createSpec(specProviderClass, classpathLoader) : null;
        if (hasSpecProvider && spec == null) {
            throw new IllegalArgumentException("--spec-provider returned null: " + specProviderClass);
        }
        Method composeMethod = findComposeMethod(template.getClass(), documentSessionType, spec, specProviderClass);

        createParentDirectory(outputPdf);
        createParentDirectory(outputPng);

        Object documentSession = createDocumentSession(classpathLoader, outputPdf);
        try {
            invoke(composeMethod, template, composeArguments(documentSession, spec, composeMethod));
            invoke(documentSessionType.getMethod("buildPdf"), documentSession);
        } finally {
            if (documentSession instanceof AutoCloseable closeable) {
                closeable.close();
            }
        }

        if (!Files.isRegularFile(outputPdf)) {
            throw new IllegalStateException("GraphCompose did not write expected PDF: " + outputPdf);
        }
        PreviewCommand.runRender(outputPdf, outputPng, dpi, page);

        ArtifactUpdater.markArtifactsPresent(
                revisionFolder,
                List.of(outputPdf.getFileName().toString(), outputPng.getFileName().toString()));

        out.println("rendered pdf: " + outputPdf.toAbsolutePath());
        out.println("rendered preview: " + outputPng.toAbsolutePath());
        writeRenderLog(revisionFolder, List.of(
                "graphcompose runtime detected",
                "templateClass=" + templateClass,
                "specProvider=" + (specProviderClass == null ? "" : specProviderClass),
                "outputPdf=" + outputPdf.toAbsolutePath(),
                "outputPng=" + outputPng.toAbsolutePath(),
                "dpi=" + dpi,
                "page=" + page,
                "status=rendered"));
        return 0;
    }

    private static Object instantiateTemplate(String templateClass, ClassLoader loader) throws Exception {
        Class<?> templateType = Class.forName(templateClass, true, loader);
        Constructor<?> constructor = templateType.getDeclaredConstructor();
        if (!constructor.canAccess(null)) {
            constructor.setAccessible(true);
        }
        return constructor.newInstance();
    }

    private static Object createDocumentSession(ClassLoader loader, Path outputPdf) throws Exception {
        Class<?> graphComposeType = Class.forName(GRAPH_COMPOSE_FQCN, true, loader);
        Object builder = invoke(graphComposeType.getMethod("document", Path.class), null, outputPdf);
        return invoke(builder.getClass().getMethod("create"), builder);
    }

    private static Method findComposeMethod(
            Class<?> templateType,
            Class<?> documentSessionType,
            Object spec,
            String specProviderClass) {
        List<Method> oneArgumentMethods = new ArrayList<>();
        List<Method> twoArgumentMethods = new ArrayList<>();
        for (Method method : templateType.getMethods()) {
            if (!"compose".equals(method.getName())) {
                continue;
            }
            Class<?>[] parameterTypes = method.getParameterTypes();
            if ((parameterTypes.length == 1 || parameterTypes.length == 2)
                    && parameterTypes[0].isAssignableFrom(documentSessionType)) {
                if (parameterTypes.length == 1) {
                    oneArgumentMethods.add(method);
                } else {
                    twoArgumentMethods.add(method);
                }
            }
        }

        if (spec != null) {
            for (Method method : twoArgumentMethods) {
                if (method.getParameterTypes()[1].isAssignableFrom(spec.getClass())) {
                    return method;
                }
            }
            throw new IllegalArgumentException("--spec-provider " + specProviderClass
                    + " returned " + spec.getClass().getName()
                    + ", but " + templateType.getName()
                    + " has no compatible compose(DocumentSession, Spec) method");
        }

        if (!oneArgumentMethods.isEmpty()) {
            return oneArgumentMethods.get(0);
        }
        if (!twoArgumentMethods.isEmpty()) {
            throw new IllegalArgumentException("template compose method requires a spec; pass --spec-provider <fqcn>");
        }
        throw new IllegalArgumentException("template class must expose public compose(DocumentSession)"
                + " or compose(DocumentSession, Spec): " + templateType.getName());
    }

    private static Object createSpec(String specProviderClass, ClassLoader loader) throws Exception {
        Class<?> providerType = Class.forName(specProviderClass, true, loader);
        Method staticFactory = findFactoryMethod(providerType, true);
        if (staticFactory != null) {
            return invoke(staticFactory, null);
        }

        Constructor<?> constructor = providerType.getDeclaredConstructor();
        if (!constructor.canAccess(null)) {
            constructor.setAccessible(true);
        }
        Object provider = constructor.newInstance();
        if (provider instanceof Supplier<?> supplier) {
            return supplier.get();
        }

        Method instanceFactory = findFactoryMethod(providerType, false);
        if (instanceFactory != null) {
            return invoke(instanceFactory, provider);
        }
        throw new IllegalArgumentException("--spec-provider must expose static create()/spec(),"
                + " instance create()/spec(), or implement Supplier: " + specProviderClass);
    }

    private static Method findFactoryMethod(Class<?> providerType, boolean staticMethod) {
        for (String name : List.of("create", "spec")) {
            for (Method method : providerType.getMethods()) {
                if (name.equals(method.getName())
                        && method.getParameterCount() == 0
                        && Modifier.isStatic(method.getModifiers()) == staticMethod) {
                    return method;
                }
            }
        }
        return null;
    }

    private static Object[] composeArguments(Object documentSession, Object spec, Method composeMethod) {
        if (composeMethod.getParameterCount() == 1) {
            return new Object[] { documentSession };
        }
        return new Object[] { documentSession, spec };
    }

    private static Object invoke(Method method, Object target, Object... args) throws Exception {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof Exception exception) {
                throw exception;
            }
            if (cause instanceof Error error) {
                throw error;
            }
            throw new RuntimeException(cause);
        }
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

    private static String resolveClasspath(Map<String, String> flags) throws Exception {
        String rawClasspath = flags.getOrDefault("classpath", "");
        String classpathFile = flags.get("classpath-file");
        if (classpathFile == null || classpathFile.isBlank()) {
            return rawClasspath;
        }
        String fromFile = Files.readString(Paths.get(classpathFile), StandardCharsets.UTF_8).trim();
        if (rawClasspath == null || rawClasspath.isBlank()) {
            return fromFile;
        }
        if (fromFile.isBlank()) {
            return rawClasspath;
        }
        return rawClasspath + System.getProperty("path.separator") + fromFile;
    }

    private static Path resolveRevisionPath(Path revisionFolder, String rawValue, String fallbackName) {
        if (rawValue == null || rawValue.isBlank()) {
            return revisionFolder.resolve(fallbackName);
        }
        Path path = Paths.get(rawValue);
        return path.isAbsolute() ? path : revisionFolder.resolve(path);
    }

    private static void createParentDirectory(Path path) throws Exception {
        Path parent = path.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
    }

    private static int parseIntOrDefault(Map<String, String> flags, String name, int fallback) {
        String value = flags.get(name);
        if (value == null || value.isEmpty()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("--" + name + " must be an integer, got: " + value);
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
