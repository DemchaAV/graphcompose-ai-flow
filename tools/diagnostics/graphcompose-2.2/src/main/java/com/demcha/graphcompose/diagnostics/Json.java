package com.demcha.graphcompose.diagnostics;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A very small JSON writer, so a probe's answer is machine-readable without the
 * diagnostics project taking a dependency the library itself does not need.
 *
 * <p>Probes print one object on stdout and nothing else. That is the whole
 * contract with {@code scripts/probe.mjs}: prose belongs in the Javadoc and in
 * the observation file, not in the output an agent has to parse.</p>
 */
public final class Json {

    private Json() {
    }

    /** An ordered map, because a probe's output reads top to bottom. */
    public static Map<String, Object> object() {
        return new LinkedHashMap<>();
    }

    public static List<Object> array() {
        return new ArrayList<>();
    }

    /** Round to two decimals — probes measure points, not atoms. */
    public static double pt(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    public static String write(Object value) {
        StringBuilder out = new StringBuilder();
        render(value, out, 0);
        return out.toString();
    }

    private static void render(Object value, StringBuilder out, int depth) {
        String pad = "  ".repeat(depth + 1);
        String closePad = "  ".repeat(depth);

        if (value == null) {
            out.append("null");
        } else if (value instanceof Map<?, ?> map) {
            if (map.isEmpty()) {
                out.append("{}");
                return;
            }
            out.append("{\n");
            int i = 0;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                out.append(pad).append(quote(String.valueOf(entry.getKey()))).append(": ");
                render(entry.getValue(), out, depth + 1);
                if (++i < map.size()) {
                    out.append(',');
                }
                out.append('\n');
            }
            out.append(closePad).append('}');
        } else if (value instanceof List<?> list) {
            if (list.isEmpty()) {
                out.append("[]");
                return;
            }
            out.append("[\n");
            for (int i = 0; i < list.size(); i++) {
                out.append(pad);
                render(list.get(i), out, depth + 1);
                if (i < list.size() - 1) {
                    out.append(',');
                }
                out.append('\n');
            }
            out.append(closePad).append(']');
        } else if (value instanceof Number || value instanceof Boolean) {
            out.append(value);
        } else {
            out.append(quote(String.valueOf(value)));
        }
    }

    private static String quote(String raw) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }
}
