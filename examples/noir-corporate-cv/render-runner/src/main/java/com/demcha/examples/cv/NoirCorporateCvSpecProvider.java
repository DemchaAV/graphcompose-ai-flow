package com.demcha.examples.cv;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Spec provider invoked by {@code tools/preview-renderer} via
 * {@code --spec-provider}.
 */
public final class NoirCorporateCvSpecProvider {

    private static final String REVISION_DIR_PROPERTY = "graphcompose.revision.dir";
    private static final String DATA_FILE = "cv-data.json";

    private NoirCorporateCvSpecProvider() {
    }

    /**
     * Static factory recognised by the preview renderer.
     */
    public static NoirCorporateCvSpec create() {
        String revisionProperty = System.getProperty(REVISION_DIR_PROPERTY);
        if (revisionProperty == null || revisionProperty.isBlank()) {
            throw new IllegalStateException(
                    "Cannot resolve cv-data.json: JVM property -D" + REVISION_DIR_PROPERTY
                            + " was not set.");
        }
        Path dataFile = Path.of(revisionProperty).resolve(DATA_FILE);
        if (!Files.isRegularFile(dataFile)) {
            throw new IllegalStateException(
                    "cv-data.json not found in revision folder: "
                            + dataFile.toAbsolutePath());
        }
        try {
            ObjectMapper mapper = new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            return mapper.readValue(dataFile.toFile(), NoirCorporateCvSpec.class);
        } catch (IOException cause) {
            throw new RuntimeException(
                    "Failed to read or parse cv-data.json at "
                            + dataFile.toAbsolutePath() + ": " + cause.getMessage(),
                    cause);
        }
    }
}
