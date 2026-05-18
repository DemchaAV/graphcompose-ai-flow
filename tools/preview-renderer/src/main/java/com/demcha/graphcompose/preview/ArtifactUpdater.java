package com.demcha.graphcompose.preview;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Patches {@code revision.json} to mark newly-present artifacts as no longer
 * pending. Pure JSON manipulation with a tiny hand-rolled tokeniser; no
 * third-party JSON dependency is needed for the small files we touch.
 *
 * <p>Output is pretty-printed with two-space indentation. Re-running with the
 * same arguments produces byte-identical output (idempotent).
 */
public final class ArtifactUpdater {

    private static final String NL = System.lineSeparator();

    private ArtifactUpdater() {
        // utility
    }

    /**
     * Removes the supplied artifact filenames from the {@code pendingArtifacts}
     * array in {@code <revisionFolder>/revision.json}, then writes the file
     * back with two-space indentation. Idempotent.
     */
    public static void markArtifactsPresent(Path revisionFolder, List<String> artifactFilenames)
            throws IOException {
        if (revisionFolder == null) {
            throw new IllegalArgumentException("revisionFolder is required");
        }
        if (artifactFilenames == null) {
            artifactFilenames = List.of();
        }

        Path jsonPath = revisionFolder.resolve("revision.json");
        if (!Files.isRegularFile(jsonPath)) {
            throw new IOException("revision.json not found at " + jsonPath);
        }

        String source = Files.readString(jsonPath, StandardCharsets.UTF_8);
        Object parsed = new JsonReader(source).readValue();
        if (!(parsed instanceof Map)) {
            throw new IOException("revision.json root must be an object");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> root = (Map<String, Object>) parsed;
        Object pending = root.get("pendingArtifacts");
        if (pending instanceof List<?> list) {
            List<Object> filtered = new ArrayList<>();
            for (Object item : list) {
                if (!(item instanceof String) || !artifactFilenames.contains(item)) {
                    filtered.add(item);
                }
            }
            root.put("pendingArtifacts", filtered);
        }

        String rendered = JsonWriter.toPrettyJson(root) + NL;
        Files.writeString(
                jsonPath,
                rendered,
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING);
    }

    // ===== minimal JSON reader =====

    /**
     * Tiny recursive-descent JSON parser. Handles objects, arrays, strings,
     * numbers (kept as {@code String} so we round-trip without precision loss
     * or unwanted type coercion), booleans, and null.
     */
    static final class JsonReader {
        private final String src;
        private int pos;

        JsonReader(String src) {
            this.src = src;
            this.pos = 0;
        }

        Object readValue() {
            skipWhitespace();
            if (pos >= src.length()) {
                throw new IllegalStateException("unexpected end of JSON");
            }
            char c = src.charAt(pos);
            if (c == '{') {
                return readObject();
            }
            if (c == '[') {
                return readArray();
            }
            if (c == '"') {
                return readString();
            }
            if (c == 't' || c == 'f') {
                return readBoolean();
            }
            if (c == 'n') {
                return readNull();
            }
            return readNumber();
        }

        private Map<String, Object> readObject() {
            expect('{');
            Map<String, Object> map = new LinkedHashMap<>();
            skipWhitespace();
            if (peek() == '}') {
                pos++;
                return map;
            }
            while (true) {
                skipWhitespace();
                String key = readString();
                skipWhitespace();
                expect(':');
                Object value = readValue();
                map.put(key, value);
                skipWhitespace();
                char next = src.charAt(pos++);
                if (next == ',') {
                    continue;
                }
                if (next == '}') {
                    return map;
                }
                throw new IllegalStateException("expected ',' or '}' at " + (pos - 1));
            }
        }

        private List<Object> readArray() {
            expect('[');
            List<Object> list = new ArrayList<>();
            skipWhitespace();
            if (peek() == ']') {
                pos++;
                return list;
            }
            while (true) {
                Object value = readValue();
                list.add(value);
                skipWhitespace();
                char next = src.charAt(pos++);
                if (next == ',') {
                    continue;
                }
                if (next == ']') {
                    return list;
                }
                throw new IllegalStateException("expected ',' or ']' at " + (pos - 1));
            }
        }

        private String readString() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (pos < src.length()) {
                char c = src.charAt(pos++);
                if (c == '"') {
                    return sb.toString();
                }
                if (c == '\\') {
                    if (pos >= src.length()) {
                        throw new IllegalStateException("dangling escape in string");
                    }
                    char esc = src.charAt(pos++);
                    switch (esc) {
                        case '"':  sb.append('"');  break;
                        case '\\': sb.append('\\'); break;
                        case '/':  sb.append('/');  break;
                        case 'b':  sb.append('\b'); break;
                        case 'f':  sb.append('\f'); break;
                        case 'n':  sb.append('\n'); break;
                        case 'r':  sb.append('\r'); break;
                        case 't':  sb.append('\t'); break;
                        case 'u':
                            if (pos + 4 > src.length()) {
                                throw new IllegalStateException("bad \\u escape");
                            }
                            sb.append((char) Integer.parseInt(src.substring(pos, pos + 4), 16));
                            pos += 4;
                            break;
                        default:
                            throw new IllegalStateException("unknown escape \\" + esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            throw new IllegalStateException("unterminated string");
        }

        private Boolean readBoolean() {
            if (src.startsWith("true", pos)) {
                pos += 4;
                return Boolean.TRUE;
            }
            if (src.startsWith("false", pos)) {
                pos += 5;
                return Boolean.FALSE;
            }
            throw new IllegalStateException("expected boolean at " + pos);
        }

        private Object readNull() {
            if (src.startsWith("null", pos)) {
                pos += 4;
                return JsonNull.INSTANCE;
            }
            throw new IllegalStateException("expected null at " + pos);
        }

        /**
         * Reads a JSON number and returns it as a {@link RawNumber} so the
         * writer can emit it verbatim (no precision loss, no integer/double
         * ambiguity).
         */
        private RawNumber readNumber() {
            int start = pos;
            if (peek() == '-') {
                pos++;
            }
            while (pos < src.length()) {
                char c = src.charAt(pos);
                boolean digit = (c >= '0' && c <= '9');
                boolean part = c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-';
                if (!digit && !part) {
                    break;
                }
                pos++;
            }
            return new RawNumber(src.substring(start, pos));
        }

        private void skipWhitespace() {
            while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
                pos++;
            }
        }

        private char peek() {
            return pos < src.length() ? src.charAt(pos) : '\0';
        }

        private void expect(char c) {
            if (pos >= src.length() || src.charAt(pos) != c) {
                throw new IllegalStateException("expected '" + c + "' at " + pos);
            }
            pos++;
        }
    }

    /** Sentinel for explicit JSON null, so we can distinguish from "missing". */
    enum JsonNull { INSTANCE }

    /** Wraps a numeric literal so {@link JsonWriter} can emit it verbatim. */
    static final class RawNumber {
        final String literal;
        RawNumber(String literal) { this.literal = literal; }
    }

    // ===== minimal JSON writer =====

    /**
     * Pretty-prints with two-space indentation. Keys are emitted in the order
     * provided by the input map (we read into {@link LinkedHashMap} so order
     * is preserved through the round-trip).
     */
    static final class JsonWriter {
        private static final String INDENT = "  ";

        private JsonWriter() {
            // utility
        }

        static String toPrettyJson(Object value) {
            StringBuilder sb = new StringBuilder();
            write(sb, value, 0);
            return sb.toString();
        }

        private static void write(StringBuilder sb, Object value, int depth) {
            if (value == null || value == JsonNull.INSTANCE) {
                sb.append("null");
                return;
            }
            if (value instanceof String s) {
                writeString(sb, s);
                return;
            }
            if (value instanceof Boolean b) {
                sb.append(b ? "true" : "false");
                return;
            }
            if (value instanceof RawNumber n) {
                sb.append(n.literal);
                return;
            }
            if (value instanceof Number n) {
                sb.append(n.toString());
                return;
            }
            if (value instanceof Map<?, ?> map) {
                writeObject(sb, map, depth);
                return;
            }
            if (value instanceof List<?> list) {
                writeArray(sb, list, depth);
                return;
            }
            throw new IllegalArgumentException("unsupported value type: " + value.getClass());
        }

        private static void writeObject(StringBuilder sb, Map<?, ?> map, int depth) {
            if (map.isEmpty()) {
                sb.append("{}");
                return;
            }
            sb.append('{').append(NL);
            int i = 0;
            int last = map.size() - 1;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                indent(sb, depth + 1);
                writeString(sb, String.valueOf(entry.getKey()));
                sb.append(": ");
                write(sb, entry.getValue(), depth + 1);
                if (i < last) {
                    sb.append(',');
                }
                sb.append(NL);
                i++;
            }
            indent(sb, depth);
            sb.append('}');
        }

        private static void writeArray(StringBuilder sb, List<?> list, int depth) {
            if (list.isEmpty()) {
                sb.append("[]");
                return;
            }
            sb.append('[').append(NL);
            int i = 0;
            int last = list.size() - 1;
            for (Object item : list) {
                indent(sb, depth + 1);
                write(sb, item, depth + 1);
                if (i < last) {
                    sb.append(',');
                }
                sb.append(NL);
                i++;
            }
            indent(sb, depth);
            sb.append(']');
        }

        private static void writeString(StringBuilder sb, String s) {
            sb.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"':  sb.append("\\\""); break;
                    case '\\': sb.append("\\\\"); break;
                    case '\b': sb.append("\\b");  break;
                    case '\f': sb.append("\\f");  break;
                    case '\n': sb.append("\\n");  break;
                    case '\r': sb.append("\\r");  break;
                    case '\t': sb.append("\\t");  break;
                    default:
                        if (c < 0x20) {
                            sb.append(String.format("\\u%04x", (int) c));
                        } else {
                            sb.append(c);
                        }
                }
            }
            sb.append('"');
        }

        private static void indent(StringBuilder sb, int depth) {
            for (int i = 0; i < depth; i++) {
                sb.append(INDENT);
            }
        }
    }
}
