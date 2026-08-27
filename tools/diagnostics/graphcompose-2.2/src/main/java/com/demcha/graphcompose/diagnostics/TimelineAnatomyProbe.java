package com.demcha.graphcompose.diagnostics;

import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.TimelineBuilder;
import com.demcha.compose.document.dsl.TimelineEntryBuilder;
import com.demcha.compose.document.dsl.TimelineMarker;
import com.demcha.compose.document.snapshot.LayoutNodeSnapshot;
import com.demcha.compose.document.style.DocumentColor;

/**
 * What content model does {@code addTimeline(...)} actually impose?
 *
 * <p>{@code timeline-nesting} answers whether the primitive can be used at all
 * in a two-column page. This answers the question after it: given that it
 * builds, what can the caller express through it — and what is fixed no matter
 * what the builder is asked for.</p>
 *
 * <p>It exists because the same conclusions were once reached by disassembling
 * the core jar with {@code javap}. That read was correct and it is not a
 * measurement: nothing can re-run it against a new build, so the record it
 * produced could never be re-confirmed or retired, and a record that cannot be
 * re-measured is one nobody should build on. Everything here is either a
 * differential measurement — build the same timeline twice, change one setting,
 * see whether the geometry moves — or reflection over the class this build
 * actually ships.</p>
 *
 * <p>Nothing is asserted. Each finding is derived from the numbers below it, so
 * a library that changes any of this reports the change rather than agreeing
 * with a note somebody wrote once.</p>
 */
final class TimelineAnatomyProbe implements Probes.Probe {

    /** Big enough that a marker column honouring it cannot be mistaken for noise. */
    private static final double WIDE_MARKER_COLUMN = 0.45;

    /** Negative by enough that a clamp to zero and a discard to the default differ. */
    private static final double NEGATIVE_GUTTER = -24.0;

    private static final double POSITIVE_GUTTER = 40.0;

    /**
     * Marks the end of the walk up out of an entry. Not a fixed depth: the
     * timeline's own outer section sits wherever the page put it, and hardcoding
     * a number returned that outer section for every entry — one box, twice,
     * which makes the adjacency question unanswerable while looking answered.
     */
    private static final String TIMELINE_SECTION = "SectionNode";

    @Override
    public String question() {
        return "What can a caller express through addTimeline, and what does it fix regardless: "
                + "can the marker reach the rail, is there a slot beside it for a date, and does "
                + "add(...) content share the header's column?";
    }

    @Override
    public Map<String, Object> run() {
        Map<String, Object> result = Json.object();

        Map<String, Object> baseline = layout("baseline", timeline -> { });
        Map<String, Object> negative = layout("negative-gutter", t -> t.gutter(NEGATIVE_GUTTER));
        Map<String, Object> positive = layout("positive-gutter", t -> t.gutter(POSITIVE_GUTTER));
        Map<String, Object> wideMarker =
                layout("wide-marker-column", t -> t.markerColumnWeight(WIDE_MARKER_COLUMN));

        result.put("baseline", baseline);
        result.put("negativeGutter", negative);
        result.put("positiveGutter", positive);
        result.put("wideMarkerColumn", wideMarker);

        Double base = extraX(baseline);
        Double withNegative = extraX(negative);
        Double withPositive = extraX(positive);
        Double withWideMarker = extraX(wideMarker);

        // Does the setter do anything at all? Without this, "a negative gutter
        // is ignored" and "gutter is ignored" report identically, and only one
        // of them is about negatives.
        Boolean gutterApplies = both(base, withPositive) ? moved(base, withPositive) : null;
        result.put("gutterAppliesWhenPositive", gutterApplies);

        Boolean acceptsNegative = both(base, withNegative) ? moved(base, withNegative) : null;
        result.put("gutterAcceptsNegative", acceptsNegative);

        // The rail is the entry section's left border. Content that cannot be
        // moved left of it cannot be centred on it, and a negative gutter is the
        // only lever the builder offers.
        Double railOffset = railOffset(negative);
        result.put("contentOffsetFromRailPt", railOffset);
        result.put("markerCanCentreOnRail",
                acceptsNegative == null ? null : acceptsNegative && railOffset != null && railOffset <= 0);

        // Widening the marker column moves anything that lives in the content
        // column beside it. Anything that does not move is a sibling of the row,
        // and therefore cannot line up under the header.
        Boolean extraFollows = both(base, withWideMarker) ? moved(base, withWideMarker) : null;
        result.put("extraOwnedByContentColumn", extraFollows);

        result.put("railContinuousAcrossEntries", railContinuous(baseline));

        Map<String, Object> surface = builderSurface();
        result.put("entryBuilderMethods", surface.get("entry"));
        result.put("timelineBuilderMethods", surface.get("timeline"));
        result.put("hasLeadingColumn", surface.get("hasLeadingColumn"));
        result.put("headerAcceptsNodeOrRichText", surface.get("headerAcceptsNodeOrRichText"));

        result.put("finding", finding(result));
        return result;
    }

    private static String finding(Map<String, Object> r) {
        List<String> parts = new ArrayList<>();
        if (Boolean.FALSE.equals(r.get("gutterAcceptsNegative"))) {
            parts.add(Boolean.TRUE.equals(r.get("gutterAppliesWhenPositive"))
                    ? "a negative gutter is discarded while a positive one applies, so the marker "
                      + "column cannot be pulled onto the rail"
                    : "gutter does not move the content at all on this build");
        } else if (Boolean.TRUE.equals(r.get("gutterAcceptsNegative"))) {
            parts.add("a negative gutter moves the content, so the marker column can be pulled "
                    + "toward the rail");
        }
        if (Boolean.FALSE.equals(r.get("hasLeadingColumn"))) {
            parts.add("the entry builder offers no slot on the far side of the rail, so a dated "
                    + "timeline has nowhere to put the date");
        }
        if (Boolean.FALSE.equals(r.get("headerAcceptsNodeOrRichText"))) {
            parts.add("title and meta take Strings only, so a one-line header in two colours "
                    + "cannot be expressed");
        }
        if (Boolean.FALSE.equals(r.get("extraOwnedByContentColumn"))) {
            parts.add("add(...) content does not move with the marker column, so it starts at the "
                    + "gutter rather than under the header");
        } else if (Boolean.TRUE.equals(r.get("extraOwnedByContentColumn"))) {
            parts.add("add(...) content moves with the marker column, so it lines up under the header");
        }
        if (Boolean.TRUE.equals(r.get("railContinuousAcrossEntries"))) {
            parts.add("consecutive entry boxes touch, so the inter-entry gap is inside the border "
                    + "and the rails meet as one line");
        }
        return parts.isEmpty() ? "nothing could be measured on this build" : String.join("; ", parts) + ".";
    }

    // ----------------------------------------------------------------- layout ---

    /**
     * Build one two-entry timeline and report where its parts landed.
     *
     * <p>Only the paragraph this probe adds through {@code add(...)} carries a
     * name: everything else in an entry is built by the library and named by it,
     * so the measurements that matter are differential — the same named node,
     * across builds that differ in one setting.</p>
     */
    private static Map<String, Object> layout(String label, Consumer<TimelineBuilder> configure) {
        Map<String, Object> out = Json.object();
        out.put("label", label);
        Path pdf = Path.of(System.getProperty("java.io.tmpdir"), "timeline-anatomy-" + label + ".pdf");

        List<LayoutNodeSnapshot> nodes;
        try (DocumentSession session = GraphCompose.document(pdf).create()) {
            session.pageFlow(page -> {
                page.name("TimelineAnatomyProbe").spacing(20);
                page.addTimeline(timeline -> {
                    configure.accept(timeline);
                    timeline.entry(marker(), entry -> describe(entry, 1));
                    timeline.entry(marker(), entry -> describe(entry, 2));
                });
            });
            nodes = new ArrayList<>(session.layoutSnapshot().nodes());
            out.put("built", true);
        } catch (RuntimeException failure) {
            out.put("built", false);
            out.put("error", failure.getClass().getSimpleName() + ": " + failure.getMessage());
            return out;
        }

        List<Object> named = Json.array();
        for (LayoutNodeSnapshot node : nodes) {
            if (node.entityName() == null || !node.entityName().startsWith("Extra")) continue;
            Map<String, Object> row = Json.object();
            row.put("node", node.entityName());
            row.put("x", Json.pt(node.placementX()));
            row.put("y", Json.pt(node.placementY()));
            named.add(row);
        }
        out.put("extras", named);

        // The entry boxes: sections one level under the timeline's own section,
        // in document order. Their adjacency is what says whether the rail is
        // drawn as one line or as one segment per entry with a gap between.
        List<Object> boxes = Json.array();
        for (Map<String, Object> box : entryBoxes(nodes)) {
            boxes.add(box);
        }
        out.put("entryBoxes", boxes);

        // The tree the numbers came from, so a reader can check the derivation
        // rather than trust it. Sections only: the paragraphs inside an entry
        // triple the list and answer nothing this probe asks.
        List<Object> tree = Json.array();
        for (LayoutNodeSnapshot node : nodes) {
            if (!"SectionNode".equals(node.entityKind())) continue;
            Map<String, Object> row = Json.object();
            row.put("path", node.path());
            row.put("depth", node.depth());
            row.put("name", node.entityName());
            row.put("y", Json.pt(node.placementY()));
            row.put("height", Json.pt(node.placementHeight()));
            tree.add(row);
        }
        out.put("sections", tree);
        return out;
    }

    /**
     * Two entries, each with a header, a body and one named paragraph of its own.
     *
     * <p>The named paragraph is the measuring stick: it is the only part of an
     * entry whose position this probe can follow across builds.</p>
     */
    private static void describe(TimelineEntryBuilder entry, int index) {
        entry.title("Entry " + index)
                .meta("2020 - 2021")
                .body("What the entry says.")
                .add(section -> section.addParagraph(p -> p
                        .name("Extra" + index)
                        .text("EXTRA " + index)));
    }

    private static TimelineMarker marker() {
        return TimelineMarker.dot(6.0, DocumentColor.rgb(0, 0, 0));
    }

    /** The x of the first entry's named paragraph, or null when it did not build. */
    private static Double extraX(Map<String, Object> attempt) {
        Object extras = attempt.get("extras");
        if (!(extras instanceof List<?> list)) return null;
        for (Object row : list) {
            if (row instanceof Map<?, ?> map && "Extra1".equals(map.get("node"))) {
                Object x = map.get("x");
                if (x instanceof Number number) return number.doubleValue();
            }
        }
        return null;
    }

    /**
     * How far the first entry's content sits from its own left edge — the rail.
     *
     * <p>Measured on the negative-gutter build, because that is the arrangement
     * asking to be pulled onto the rail. Zero or less would mean the content can
     * reach it.</p>
     */
    private static Double railOffset(Map<String, Object> attempt) {
        Double contentX = extraX(attempt);
        if (contentX == null) return null;
        Object boxes = attempt.get("entryBoxes");
        if (!(boxes instanceof List<?> list) || list.isEmpty()) return null;
        if (!(list.get(0) instanceof Map<?, ?> first)) return null;
        Object x = first.get("x");
        if (!(x instanceof Number number)) return null;
        return round(contentX - number.doubleValue());
    }

    /**
     * Do consecutive entry boxes touch?
     *
     * <p>If they do, the inter-entry gap is padding inside the box, the accent
     * border runs the full height of each, and two consecutive rails meet as one
     * unbroken line. If they do not, the rail is drawn once per entry with a gap
     * between — a different picture, and the reason this is worth measuring
     * rather than assuming.</p>
     */
    private static Boolean railContinuous(Map<String, Object> attempt) {
        Object boxes = attempt.get("entryBoxes");
        if (!(boxes instanceof List<?> list) || list.size() < 2) return null;
        if (!(list.get(0) instanceof Map<?, ?> first) || !(list.get(1) instanceof Map<?, ?> second)) {
            return null;
        }
        Double firstY = number(first.get("y"));
        Double secondY = number(second.get("y"));
        Double secondH = number(second.get("height"));
        if (firstY == null || secondY == null || secondH == null) return null;
        // Placement y is the box's bottom edge in PDF space, where y grows
        // upward, so the upper box's bottom meets the lower box's top when the
        // two touch and there is no gap between the rails they draw.
        return Math.abs(firstY - (secondY + secondH)) < 0.5;
    }

    /** The entry sections: the shallowest sections that hold a named Extra paragraph. */
    private static List<Map<String, Object>> entryBoxes(List<LayoutNodeSnapshot> nodes) {
        Map<String, LayoutNodeSnapshot> byPath = new LinkedHashMap<>();
        for (LayoutNodeSnapshot node : nodes) byPath.put(node.path(), node);

        List<Map<String, Object>> out = new ArrayList<>();
        for (LayoutNodeSnapshot node : nodes) {
            if (node.entityName() == null || !node.entityName().startsWith("Extra")) continue;
            LayoutNodeSnapshot entry = shallowestAncestorUnderTimeline(node, byPath);
            if (entry == null) continue;
            Map<String, Object> box = Json.object();
            box.put("path", entry.path());
            box.put("kind", entry.entityKind());
            box.put("x", Json.pt(entry.placementX()));
            box.put("y", Json.pt(entry.placementY()));
            box.put("width", Json.pt(entry.placementWidth()));
            box.put("height", Json.pt(entry.placementHeight()));
            out.add(box);
        }
        return out;
    }

    /**
     * Walk up from a named paragraph to the entry's own box: the child of the
     * timeline's outer section that contains it.
     *
     * <p>Derived rather than assumed. The outer section is the outermost one
     * this paragraph sits inside, whatever depth the page happens to put it at,
     * and the entry box is the ancestor directly beneath it.</p>
     */
    private static LayoutNodeSnapshot shallowestAncestorUnderTimeline(
            LayoutNodeSnapshot from, Map<String, LayoutNodeSnapshot> byPath) {
        List<LayoutNodeSnapshot> ancestors = new ArrayList<>();
        LayoutNodeSnapshot current = byPath.get(from.parentPath());
        while (current != null) {
            if (TIMELINE_SECTION.equals(current.entityKind())) ancestors.add(current);
            current = byPath.get(current.parentPath());
        }
        // Collected innermost-first, so the last is the timeline's own section
        // and the one before it is the entry's box.
        return ancestors.size() >= 2 ? ancestors.get(ancestors.size() - 2) : null;
    }

    // ------------------------------------------------------------- reflection ---

    /**
     * What the builders on THIS build accept.
     *
     * <p>Reflection rather than the pack's allow-list: the allow-list is
     * generated from one jar and this probe may be run against another, which is
     * the entire point of being able to re-run it.</p>
     */
    private static Map<String, Object> builderSurface() {
        Map<String, Object> out = Json.object();
        List<Object> entryMethods = Json.array();
        boolean leading = false;
        boolean richHeader = false;

        for (Method method : TimelineEntryBuilder.class.getDeclaredMethods()) {
            if (!java.lang.reflect.Modifier.isPublic(method.getModifiers())) continue;
            entryMethods.add(signature(method));
            String name = method.getName().toLowerCase(java.util.Locale.ROOT);
            if (name.contains("lead") || name.contains("date") || name.contains("aside")) leading = true;
            if (name.equals("title") || name.equals("meta")) {
                for (Class<?> parameter : method.getParameterTypes()) {
                    if (parameter != String.class && !parameter.getSimpleName().contains("TextStyle")) {
                        richHeader = true;
                    }
                }
            }
        }

        List<Object> timelineMethods = Json.array();
        for (Method method : TimelineBuilder.class.getDeclaredMethods()) {
            if (!java.lang.reflect.Modifier.isPublic(method.getModifiers())) continue;
            timelineMethods.add(signature(method));
            String name = method.getName().toLowerCase(java.util.Locale.ROOT);
            if (name.contains("lead") || name.contains("date") || name.contains("aside")) leading = true;
        }

        out.put("entry", entryMethods);
        out.put("timeline", timelineMethods);
        out.put("hasLeadingColumn", leading);
        out.put("headerAcceptsNodeOrRichText", richHeader);
        return out;
    }

    private static String signature(Method method) {
        StringBuilder text = new StringBuilder(method.getReturnType().getSimpleName())
                .append(' ')
                .append(method.getName())
                .append('(');
        Class<?>[] parameters = method.getParameterTypes();
        for (int i = 0; i < parameters.length; i += 1) {
            if (i > 0) text.append(", ");
            text.append(parameters[i].getSimpleName());
        }
        return text.append(')').toString();
    }

    // ------------------------------------------------------------------ maths ---

    private static boolean both(Double left, Double right) {
        return left != null && right != null;
    }

    /** A move worth reporting: half a point, the same floor the other probes use. */
    private static boolean moved(Double left, Double right) {
        return Math.abs(left - right) >= 0.5;
    }

    private static Double number(Object value) {
        return value instanceof Number n ? n.doubleValue() : null;
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
