# Invoice Classic

Single-page business invoice template built on
[GraphCompose 1.6.7](https://github.com/DemchaAV/GraphCompose) — header
band, hero metadata strip, two-column bill-from / bill-to row,
line-items table (auto / 54 / 96 / 96 column weights), a dedicated
Summary section that right-aligns to the line-items Amount column,
and a contact footer. Root page-flow padding keeps content off the
page edge.

| | |
|---|---|
| Template id          | `invoice-classic` |
| Display name         | **Invoice Classic** |
| Source project       | `examples/invoice-reference` |
| Source revision      | `revision-003` (APPROVED on 2026-06-01; supersedes `revision-002` and `revision-001`) |
| GraphCompose version | `1.6.7` (Maven Central: `io.github.demchaav:graph-compose:1.6.7`) |
| Surface              | V1 classic — implements upstream `com.demcha.compose.document.templates.api.InvoiceTemplate` |
| Render class         | [`InvoiceClassicTemplate`](src/InvoiceClassicTemplate.java) |
| Spec class           | upstream `com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec` |
| Spec provider        | [`InvoiceClassicSpecProvider`](src/InvoiceClassicSpecProvider.java) — reads `invoice-data.json` |
| Sample data          | [`data/invoice-data.example.json`](data/invoice-data.example.json) |
| Theme                | Defaults to `BusinessTheme.modern()`; alternative theme via explicit-theme constructor |

> **Note on surface generation.** GraphCompose 1.6.7 carries three
> generations across the four canonical surfaces: V2 layered (`cv`,
> `coverletter`), V2 single-preset (`proposal`), and V1 classic
> (`invoice`). This bundle rides the V1 classic invoice surface and
> will track a V2 invoice stack if/when one lands upstream.

## Preview

[`preview/output.png`](preview/output.png) shows the finished render
against the upstream
[`InvoiceData` sample fixture](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.7/com/demcha/compose/document/templates/data/invoice/InvoiceData.html).
The full [`preview/output.pdf`](preview/output.pdf) carries the same
output as a vector PDF.

## What's in this bundle

```
templates/invoice-classic/
├── README.md                       ← this file
├── template.json                   ← bundle metadata (id, source revision, version, fonts, spec wiring)
├── data/
│   └── invoice-data.example.json   ← sample data — copy to invoice-data.json, edit fields
├── src/
│   ├── InvoiceClassicTemplate.java
│   └── InvoiceClassicSpecProvider.java
└── preview/
    ├── output.pdf                  ← committed render against the bundled sample data
    └── output.png                  ← page-1 raster
```

## Copy into your own project

1. Drop the two source files into your own
   `com.demcha.examples.invoice` package (or rename the package —
   search-and-replace; nothing internal pins the name):
   - [`src/InvoiceClassicTemplate.java`](src/InvoiceClassicTemplate.java)
   - [`src/InvoiceClassicSpecProvider.java`](src/InvoiceClassicSpecProvider.java)
2. Add the dependencies to your `pom.xml`:

   ```xml
   <dependency>
     <groupId>io.github.demchaav</groupId>
     <artifactId>graph-compose</artifactId>
     <version>1.6.7</version>
   </dependency>
   <dependency>
     <groupId>com.fasterxml.jackson.core</groupId>
     <artifactId>jackson-databind</artifactId>
     <version>2.17.2</version>
   </dependency>
   ```

   (`com.github.DemchaAV:GraphCompose:vX.Y.Z` via JitPack still
   resolves for pre-1.6.7 pins — see the
   [main README](../../README.md) for the fallback snippet. Jackson
   is only needed if you use the bundled provider — drive the
   template by hand and you can skip it.)

3. Copy `data/invoice-data.example.json` into your own data folder,
   rename to `invoice-data.json`, and edit the fields. The JSON
   shape mirrors the upstream
   [`InvoiceData`](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.7/com/demcha/compose/document/templates/data/invoice/InvoiceData.html)
   record verbatim — Jackson reads the record's canonical
   constructor directly.

4. Render through the bundled provider (driven by JVM property)
   or hand-build the spec:

   ```java
   // Option A — bundled provider (Jackson reads invoice-data.json)
   System.setProperty("graphcompose.revision.dir", "./data");
   InvoiceDocumentSpec spec = InvoiceClassicSpecProvider.create();

   // Option B — hand-build the spec
   InvoiceDocumentSpec spec = InvoiceDocumentSpec.builder()
           .invoice(yourInvoiceData)
           .build();

   // Render — same call either way
   try (DocumentSession session = GraphCompose.document(outputPath)
           .pageSize(DocumentPageSize.A4)
           .create()) {
       new InvoiceClassicTemplate().compose(session, spec);
       session.buildPdf();
   }
   ```

   The template implements upstream
   [`InvoiceTemplate`](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.7/com/demcha/compose/document/templates/api/InvoiceTemplate.html),
   so any `InvoiceDocumentSpec` that drives `InvoiceTemplateV2` also
   drives this preset unchanged.

5. Drive it from `tools/preview-renderer` (or any agent harness)
   via `--spec-provider`:

   ```text
   preview-renderer render \
     --revision ./data \
     --template-class com.demcha.examples.invoice.InvoiceClassicTemplate \
     --spec-provider  com.demcha.examples.invoice.InvoiceClassicSpecProvider
   ```

## Polish backlog

The bundle ships with a spec provider and JSON fixture; the next
polish a downstream user or the Template Publisher Agent could land:

- **Custom theme variant** (`InvoiceClassicTheme.navy()` / `.cream()`)
  layered on top of `BusinessTheme.modern()` so a downstream user
  swapping brand colours touches one named token instead of the whole
  `BusinessTheme.builder()` block.
- **Optional per-bundle `InvoiceClassicSpec` record** that wraps
  `InvoiceData` with bundle-specific defaults (e.g. footer note,
  payment-term boilerplate). The upstream `InvoiceDocumentSpec`
  already satisfies the canonical contract; this is convenience only.

## Source revision audit trail

- [Source revision folder](../../examples/invoice-reference/revisions/revision-003/)
  carries the full audit log: `user-request.md`, `architecture-plan.md`,
  `visual-review.md`, `revision.json` (APPROVED), and the original
  `generated-template.java`.
- Source commit: `209d5ea0bcba7e37a110b881d399d9e649426617`.

## License

Same as the rest of the repository — see [LICENSE](../../LICENSE) at
the root.
