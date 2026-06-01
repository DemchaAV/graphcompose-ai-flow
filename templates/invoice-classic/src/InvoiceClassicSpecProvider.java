package com.demcha.examples.invoice;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.demcha.compose.document.templates.data.invoice.InvoiceData;
import com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Spec provider invoked by {@code tools/preview-renderer} via
 * {@code --spec-provider}, or by any downstream caller that wants the
 * Invoice Classic bundle to drive itself from a JSON fixture instead
 * of a hand-built {@link InvoiceDocumentSpec}.
 *
 * <p>The provider reads {@code invoice-data.json} from a directory
 * the caller designates through the {@code graphcompose.revision.dir}
 * JVM property (the same convention {@code MintEditorialCvSpecProvider}
 * uses upstream, so a single render harness drives every bundle the
 * same way). When you copy this bundle into your own project, point
 * the property at the folder that owns your {@code invoice-data.json}:
 *
 * <pre>{@code
 * java -Dgraphcompose.revision.dir=./data \
 *      -jar your-app.jar
 * }</pre>
 *
 * <p>The JSON shape mirrors the canonical
 * {@link InvoiceData} record verbatim (Jackson reads the record's
 * canonical constructor directly):
 *
 * <pre>{@code
 * {
 *   "title":         "Invoice",
 *   "invoiceNumber": "INV-2026-0042",
 *   "issueDate":     "2026-05-12",
 *   "dueDate":       "2026-06-11",
 *   "reference":     "",
 *   "status":        "Pending",
 *   "fromParty":     { "name": "...", "addressLines": [...], "email": "...", ... },
 *   "billToParty":   { "name": "...", "addressLines": [...], ... },
 *   "lineItems":     [ { "description": "...", "quantity": "1", ... }, ... ],
 *   "summaryRows":   [ { "label": "Subtotal", "value": "...", "emphasized": false }, ... ],
 *   "notes":         [ "..." ],
 *   "paymentTerms":  [ "..." ],
 *   "footerNote":    "..."
 * }
 * }</pre>
 *
 * <p>See {@code data/invoice-data.example.json} alongside this class
 * for a fully-populated worked example that matches the bundle's
 * {@code preview/output.pdf} render.
 *
 * @since 2026-06-01
 */
public final class InvoiceClassicSpecProvider {

    private static final String REVISION_DIR_PROPERTY = "graphcompose.revision.dir";
    private static final String DATA_FILE = "invoice-data.json";

    private InvoiceClassicSpecProvider() {
    }

    /**
     * Static factory recognised by the preview-renderer's
     * {@code --spec-provider} flag.
     *
     * @return a fully-populated {@link InvoiceDocumentSpec} that the
     *         {@link InvoiceClassicTemplate} renders without any
     *         additional wiring
     * @throws IllegalStateException when the revision directory or the
     *         {@code invoice-data.json} file cannot be located
     * @throws RuntimeException when the JSON fails to parse — surfaced
     *         verbatim so the agent chain catches it at render time
     */
    public static InvoiceDocumentSpec create() {
        String revisionProperty = System.getProperty(REVISION_DIR_PROPERTY);
        if (revisionProperty == null || revisionProperty.isBlank()) {
            throw new IllegalStateException(
                    "Cannot resolve invoice-data.json: JVM property -D" + REVISION_DIR_PROPERTY
                            + " was not set. Point it at the directory that owns your "
                            + "invoice-data.json — typically the same folder you copied "
                            + "data/invoice-data.example.json into.");
        }
        Path dataFile = Path.of(revisionProperty).resolve(DATA_FILE);
        if (!Files.isRegularFile(dataFile)) {
            throw new IllegalStateException(
                    "invoice-data.json not found in data folder: " + dataFile.toAbsolutePath()
                            + ". Copy data/invoice-data.example.json from the bundle, rename "
                            + "it to invoice-data.json, edit the fields, and re-run.");
        }
        try {
            ObjectMapper mapper = new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            InvoiceData data = mapper.readValue(dataFile.toFile(), InvoiceData.class);
            return InvoiceDocumentSpec.from(data);
        } catch (IOException cause) {
            throw new RuntimeException(
                    "Failed to read or parse invoice-data.json at " + dataFile.toAbsolutePath()
                            + ": " + cause.getMessage(),
                    cause);
        }
    }
}
