package com.demcha.graphcompose.preview.fixtures;

/**
 * Static factory provider loaded by RenderCommand when --spec-provider is set.
 */
public final class SmokeSpecProvider {

    private SmokeSpecProvider() {
        // factory only
    }

    public static SmokeSpec create() {
        return new SmokeSpec("Spec-aware render");
    }
}
