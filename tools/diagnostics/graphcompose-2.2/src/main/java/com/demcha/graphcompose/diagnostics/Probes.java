package com.demcha.graphcompose.diagnostics;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Supplier;

/**
 * Probe registry and entry point.
 *
 * <p>A probe answers one question about how this GraphCompose line actually
 * behaves, by laying out or rendering the smallest arrangement that settles it
 * and reporting the numbers. The first acceptance run wrote four of these by
 * hand — 305 lines of Java — to establish three behaviours, and then left them
 * inside one CV project where the next run would not find them.</p>
 *
 * <p>Every probe prints a single JSON object and nothing else, so the caller
 * gets an answer rather than a transcript to read.</p>
 */
public final class Probes {

    private static final Map<String, Supplier<Probe>> REGISTRY = new TreeMap<>(Map.of(
            "anchor-alignment", AnchorAlignmentProbe::new,
            "row-nesting", RowNestingProbe::new,
            "shape-paint", ShapePaintProbe::new,
            "timeline-nesting", TimelineNestingProbe::new));

    private Probes() {
    }

    /** One question, one arrangement, one set of numbers. */
    public interface Probe {

        /** What this probe settles, in one sentence. */
        String question();

        /**
         * Measurements plus a `finding` derived from them.
         *
         * <p>The finding is computed from what was measured, never asserted:
         * a probe that hardcodes its own conclusion cannot report that the
         * library changed under it.</p>
         */
        Map<String, Object> run() throws Exception;
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || "--list".equals(args[0])) {
            Map<String, Object> listing = Json.object();
            listing.put("graphComposeVersion", version());
            List<Object> probes = Json.array();
            for (Map.Entry<String, Supplier<Probe>> entry : REGISTRY.entrySet()) {
                Map<String, Object> item = Json.object();
                item.put("name", entry.getKey());
                item.put("question", entry.getValue().get().question());
                probes.add(item);
            }
            listing.put("probes", probes);
            System.out.println(Json.write(listing));
            return;
        }

        String name = args[0];
        Supplier<Probe> factory = REGISTRY.get(name);
        if (factory == null) {
            Map<String, Object> error = Json.object();
            error.put("error", "unknown probe: " + name);
            error.put("available", List.copyOf(REGISTRY.keySet()));
            System.out.println(Json.write(error));
            System.exit(2);
            return;
        }

        Probe probe = factory.get();
        Map<String, Object> result = Json.object();
        result.put("probe", name);
        result.put("graphComposeVersion", version());
        result.put("question", probe.question());
        result.putAll(probe.run());
        System.out.println(Json.write(result));
    }

    /**
     * The version actually on the classpath, not the one the pom asked for.
     * An observation is only true of the build that produced it, so the answer
     * has to come from the jar that ran.
     */
    static String version() {
        Package pkg = com.demcha.compose.GraphCompose.class.getPackage();
        String implementation = pkg == null ? null : pkg.getImplementationVersion();
        return implementation != null ? implementation : System.getProperty("graphcompose.version", "unknown");
    }
}
