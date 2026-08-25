package com.demcha.graphcompose.preview;

import java.io.PrintStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Command-line entry point for the GraphCompose AI Flow preview renderer.
 *
 * <p>Three subcommands are dispatched here:
 * <ul>
 *   <li>{@code preview} — convert a PDF page to a PNG image (functional).</li>
 *   <li>{@code render}  — invoke a generated GraphCompose template to produce a PDF
 *       when GraphCompose is present on the supplied classpath, otherwise emit
 *       the non-fatal detection message.</li>
 *   <li>{@code text}    — read a PDF's text back page by page, decoded through
 *       the embedded ToUnicode maps, so a caller can ask functional questions
 *       ("is this page 2 of 3?", "did the footer repeat?") that pixels cannot
 *       answer.</li>
 * </ul>
 *
 * <p>Argument parsing is intentionally hand-rolled: this tool keeps its
 * dependency surface minimal so it can be shaded into a single small JAR.
 */
public final class PreviewRenderer {

    private PreviewRenderer() {
        // utility entry point
    }

    public static void main(String[] args) {
        // Quiet PDFBox's noisy INFO output; we only want WARNINGs to surface.
        Logger.getLogger("org.apache.pdfbox").setLevel(Level.WARNING);

        int exit = run(args, System.out, System.err);
        if (exit != 0) {
            System.exit(exit);
        }
    }

    /**
     * Package-visible test seam: dispatches a subcommand without calling
     * {@link System#exit(int)} so tests can assert on the return code.
     */
    static int run(String[] args, PrintStream out, PrintStream err) {
        if (args == null || args.length == 0) {
            printUsage(err);
            return 2;
        }

        String subcommand = args[0];
        String[] rest = new String[args.length - 1];
        System.arraycopy(args, 1, rest, 0, rest.length);

        try {
            switch (subcommand) {
                case "preview":
                    return PreviewCommand.run(parseFlags(rest), out, err);
                case "render":
                    return RenderCommand.run(parseFlags(rest), out, err);
                case "text":
                    return TextCommand.run(parseFlags(rest), out, err);
                case "--help":
                case "-h":
                case "help":
                    printUsage(out);
                    return 0;
                default:
                    err.println("unknown subcommand: " + subcommand);
                    printUsage(err);
                    return 2;
            }
        } catch (IllegalArgumentException badArgs) {
            err.println("argument error: " + badArgs.getMessage());
            return 2;
        } catch (Exception unexpected) {
            err.println("preview-renderer failed: " + unexpected.getMessage());
            return 1;
        }
    }

    /**
     * Parses {@code --flag value} pairs into an ordered map. Repeated flags
     * are overwritten by later occurrences. Bare positional arguments are
     * not supported in this tool's flag-only CLI shape.
     */
    static Map<String, String> parseFlags(String[] tokens) {
        Map<String, String> flags = new LinkedHashMap<>();
        int i = 0;
        while (i < tokens.length) {
            String token = tokens[i];
            if (!token.startsWith("--")) {
                throw new IllegalArgumentException("expected --flag, got: " + token);
            }
            String name = token.substring(2);
            if (i + 1 >= tokens.length) {
                throw new IllegalArgumentException("missing value for --" + name);
            }
            flags.put(name, tokens[i + 1]);
            i += 2;
        }
        return flags;
    }

    private static void printUsage(PrintStream stream) {
        stream.println("usage:");
        stream.println("  preview-renderer preview --pdf <path> --out <png-path> [--dpi <int>] [--page <int>]");
        stream.println("  preview-renderer render  --revision <revision-folder> --template-class <fqcn>");
        stream.println("                           [--classpath <paths>] [--classpath-file <path>]");
        stream.println("                           [--spec-provider <fqcn>]");
        stream.println("                           [--output <pdf-path>] [--preview <png-path>]");
        stream.println("                           [--dpi <int>] [--page <int>] [--guide-lines true|false]");
        stream.println("  preview-renderer text    --pdf <path>");
        stream.println();
        stream.println("notes:");
        stream.println("  - 'preview' uses Apache PDFBox to rasterize a single page to PNG.");
        stream.println("  - 'text' prints {pageCount, pages[]} as JSON, decoded through the PDF's");
        stream.println("    ToUnicode maps: subset fonts make the raw content stream unsearchable.");
        stream.println("  - 'render' exits 0 with a skipped message when GraphCompose is not on --classpath.");
        stream.println("  - data-driven templates must provide --spec-provider <fqcn>.");
    }
}
