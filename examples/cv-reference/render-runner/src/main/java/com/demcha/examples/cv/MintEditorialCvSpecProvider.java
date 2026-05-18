package com.demcha.examples.cv;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Spec provider invoked by {@code tools/preview-renderer} via
 * {@code --spec-provider}.
 *
 * <p>The preview-renderer locates a class with a public static {@code create()}
 * method that returns the spec. We read {@code cv-data.json} from the active
 * revision folder so each revision carries its own content snapshot — the
 * provider therefore relies on the {@code graphcompose.revision.dir} JVM
 * property set by {@code scripts/render-cv-reference.mjs}.</p>
 */
public final class MintEditorialCvSpecProvider {

    private static final String REVISION_DIR_PROPERTY = "graphcompose.revision.dir";
    private static final String DATA_FILE = "cv-data.json";

    private MintEditorialCvSpecProvider() {
    }

    /**
     * Static factory recognised by the preview-renderer's
     * {@code --spec-provider} flag.
     *
     * @return a fully-populated {@link MintEditorialCvSpec}
     * @throws IllegalStateException when the revision directory or the
     *         {@code cv-data.json} file cannot be located
     * @throws RuntimeException when the JSON fails to parse — surfaced
     *         verbatim so the agent chain catches it at render time
     */
    public static MintEditorialCvSpec create() {
        String revisionProperty = System.getProperty(REVISION_DIR_PROPERTY);
        if (revisionProperty == null || revisionProperty.isBlank()) {
            throw new IllegalStateException(
                    "Cannot resolve cv-data.json: JVM property -D" + REVISION_DIR_PROPERTY
                            + " was not set. Run via scripts/render-cv-reference.mjs which "
                            + "passes the per-revision directory automatically.");
        }
        Path dataFile = Path.of(revisionProperty).resolve(DATA_FILE);
        if (!Files.isRegularFile(dataFile)) {
            throw new IllegalStateException(
                    "cv-data.json not found in revision folder: " + dataFile.toAbsolutePath()
                            + ". The Template Coder agent must ship this file alongside the "
                            + "generated template.");
        }
        try {
            ObjectMapper mapper = new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            return mapper.readValue(dataFile.toFile(), MintEditorialCvSpec.class);
        } catch (IOException cause) {
            throw new RuntimeException(
                    "Failed to read or parse cv-data.json at " + dataFile.toAbsolutePath()
                            + ": " + cause.getMessage(),
                    cause);
        }
    }
}
