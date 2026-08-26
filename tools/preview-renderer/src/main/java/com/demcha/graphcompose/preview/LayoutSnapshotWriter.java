package com.demcha.graphcompose.preview;

import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Writes the layout GraphCompose actually resolved, as JSON.
 *
 * <p>Everything else this renderer produces is pixels. A PNG says an element is
 * six points to the right of where it should be; it cannot say whether that is
 * the element's own margin, its parent's padding, or a column weight upstream of
 * both. The layout snapshot answers that, because it is the engine's own
 * measurement rather than an inference from the picture.</p>
 *
 * <p>It comes from {@code DocumentSession.layoutSnapshot()}, which GraphCompose
 * computes after layout and pagination and before any backend renders bytes.
 * Nothing here re-implements layout, and nothing here can disagree with the
 * document that was rendered — it is the same resolved graph.</p>
 *
 * <h2>Why this is reflective</h2>
 *
 * <p>The renderer loads GraphCompose from the project's own classpath, so the
 * version varies per project and the snapshot records are not on this class's
 * compile-time path. Two consequences, both deliberate:</p>
 *
 * <ul>
 *   <li>A GraphCompose without {@code layoutSnapshot()} yields
 *       {@link Optional#empty()} rather than an error. Older pinned lines still
 *       render; they simply produce no snapshot, and the caller records why.</li>
 *   <li>Serialisation is driven by {@link Class#getRecordComponents()}, not by a
 *       field list written here. When the engine adds a component — per-page
 *       fragment bounds, row weights — it appears in the output without a change
 *       to this file. A hand-written field list would silently omit it.</li>
 * </ul>
 */
final class LayoutSnapshotWriter {

    private LayoutSnapshotWriter() {
    }

    /**
     * Take the snapshot from a live, composed session.
     *
     * <p>The session must still be open: {@code layoutSnapshot()} reads session
     * state and throws once it is closed.</p>
     *
     * @param documentSession the composed session
     * @param documentSessionType its type, loaded from the project classpath
     * @return pretty-printed JSON, or empty when this GraphCompose has no
     *         snapshot API
     * @throws Exception if the call exists and fails, which is a real defect
     *         rather than a version difference
     */
    static Optional<String> capture(Object documentSession, Class<?> documentSessionType, String capturedAt)
            throws Exception {
        Method method;
        try {
            method = documentSessionType.getMethod("layoutSnapshot");
        } catch (NoSuchMethodException absent) {
            return Optional.empty();
        }
        Object snapshot = method.invoke(documentSession);
        if (snapshot == null) {
            return Optional.empty();
        }
        RecordComponent[] components = snapshot.getClass().getRecordComponents();
        if (components == null) {
            return Optional.empty();
        }

        // The top level is written here rather than by writeObject, because two
        // fields belong to the harness rather than to the engine: which render
        // produced this file, and which library measured it. A revision folder
        // holds artifacts from more than one pass, and a diff across revisions
        // has to be able to tell a layout change from a library upgrade.
        StringBuilder json = new StringBuilder(1 << 16);
        json.append("{\n");
        for (RecordComponent component : components) {
            indent(json, 1);
            writeString(component.getName(), json);
            json.append(": ");
            Object member;
            try {
                member = component.getAccessor().invoke(snapshot);
            } catch (ReflectiveOperationException unreadable) {
                member = null;
            }
            write(member, json, 1);
            json.append(",\n");
        }
        indent(json, 1);
        writeString("capturedAt", json);
        json.append(": ");
        writeString(capturedAt, json);
        json.append(",\n");
        indent(json, 1);
        writeString("graphComposeVersion", json);
        json.append(": ");
        write(versionOf(documentSessionType), json, 1);
        json.append("\n}\n");
        return Optional.of(json.toString());
    }

    /**
     * The GraphCompose version behind a rendered document, when the jar says so.
     *
     * <p>Recorded beside the snapshot so a diff across revisions can tell a
     * layout change from a library upgrade — two things that look identical in
     * the numbers and have nothing to do with each other.</p>
     */
    static String versionOf(Class<?> documentSessionType) {
        Package pkg = documentSessionType.getPackage();
        return pkg == null ? null : pkg.getImplementationVersion();
    }

    // ------------------------------------------------------------- writing ---

    private static void write(Object value, StringBuilder out, int indent) {
        switch (value) {
            case null -> out.append("null");
            case String text -> writeString(text, out);
            case Boolean flag -> out.append(flag.booleanValue());
            case Double number -> writeNumber(number.doubleValue(), out);
            case Float number -> writeNumber(number.doubleValue(), out);
            case Number number -> out.append(number);
            case List<?> list -> writeList(list, out, indent);
            case Map<?, ?> map -> writeMap(map, out, indent);
            default -> writeObject(value, out, indent);
        }
    }

    /**
     * A record, by its components, in declaration order.
     *
     * <p>Anything that is not a record is written as its string form. That is a
     * deliberate floor rather than a failure: an unexpected type in the payload
     * should show up in the JSON where a reader can see it, not abort a render
     * that had otherwise succeeded.</p>
     */
    private static void writeObject(Object value, StringBuilder out, int indent) {
        RecordComponent[] components = value.getClass().getRecordComponents();
        if (components == null) {
            writeString(String.valueOf(value), out);
            return;
        }
        out.append("{\n");
        for (int i = 0; i < components.length; i += 1) {
            indent(out, indent + 1);
            writeString(components[i].getName(), out);
            out.append(": ");
            Object member;
            try {
                member = components[i].getAccessor().invoke(value);
            } catch (ReflectiveOperationException unreadable) {
                member = null;
            }
            write(member, out, indent + 1);
            if (i < components.length - 1) out.append(',');
            out.append('\n');
        }
        indent(out, indent);
        out.append('}');
    }

    private static void writeList(List<?> list, StringBuilder out, int indent) {
        if (list.isEmpty()) {
            out.append("[]");
            return;
        }
        out.append("[\n");
        for (int i = 0; i < list.size(); i += 1) {
            indent(out, indent + 1);
            write(list.get(i), out, indent + 1);
            if (i < list.size() - 1) out.append(',');
            out.append('\n');
        }
        indent(out, indent);
        out.append(']');
    }

    private static void writeMap(Map<?, ?> map, StringBuilder out, int indent) {
        if (map.isEmpty()) {
            out.append("{}");
            return;
        }
        // Sorted, so two snapshots of the same document are byte-identical
        // whatever order the engine happened to build the map in.
        List<String> keys = map.keySet().stream().map(String::valueOf).sorted().toList();
        out.append("{\n");
        for (int i = 0; i < keys.size(); i += 1) {
            indent(out, indent + 1);
            writeString(keys.get(i), out);
            out.append(": ");
            write(map.get(keys.get(i)), out, indent + 1);
            if (i < keys.size() - 1) out.append(',');
            out.append('\n');
        }
        indent(out, indent);
        out.append('}');
    }

    /**
     * A number a diff can read.
     *
     * <p>{@code Double.toString} produces {@code 1.0E-4} for small values and
     * {@code 42.0} for whole ones. The first is not something a reader can
     * compare by eye and the second churns against an integer written by any
     * other producer, so both are flattened to plain decimal with trailing zeros
     * removed. The engine has already rounded to three places.</p>
     */
    private static void writeNumber(double value, StringBuilder out) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            out.append("null");
            return;
        }
        out.append(BigDecimal.valueOf(value).stripTrailingZeros().toPlainString());
    }

    private static void writeString(String text, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < text.length(); i += 1) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }

    private static void indent(StringBuilder out, int depth) {
        out.append("  ".repeat(depth));
    }
}
