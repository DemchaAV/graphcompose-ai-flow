# Invoice Classic

Single-page business invoice template built on
[GraphCompose 1.6.6](https://github.com/DemchaAV/GraphCompose) — header
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
| GraphCompose version | `1.6.6` (Maven Central: `io.github.demchaav:graph-compose:1.6.6`) |
| Surface              | V1 classic — implements upstream `com.demcha.compose.document.templates.api.InvoiceTemplate` |
| Render class         | [`InvoiceClassicTemplate`](src/InvoiceClassicTemplate.java) |
| Theme                | Defaults to `BusinessTheme.modern()`; alternative theme via explicit-theme constructor |

> **Note on V1 vs V2.** GraphCompose 1.6.6 ships V2 layered
> architecture for `cv` and `coverletter` only. `invoice` and
> `proposal` remain on the V1 classic surface upstream — this bundle
> rides that surface and will track the V2 invoice stack when it lands
> upstream.

## Preview

[`preview/output.png`](preview/output.png) shows the finished render
against the upstream
[`InvoiceData` sample fixture](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.6/com/demcha/compose/document/templates/data/invoice/InvoiceData.html).
The full [`preview/output.pdf`](preview/output.pdf) carries the same
output as a vector PDF.

## What's in this bundle

```
templates/invoice-classic/
├── README.md                 ← this file
├── template.json             ← bundle metadata (id, source revision, version, fonts)
├── src/
│   └── InvoiceClassicTemplate.java
└── preview/
    ├── output.pdf            ← committed render against sample InvoiceDocumentSpec
    └── output.png            ← page-1 raster
```

## Copy into your own project

1. Drop [`src/InvoiceClassicTemplate.java`](src/InvoiceClassicTemplate.java)
   into your own `com.demcha.examples.invoice` package (or rename the
   package — search-and-replace; nothing internal pins the name).
2. Add the dependency to your `pom.xml`:

   ```xml
   <dependency>
     <groupId>io.github.demchaav</groupId>
     <artifactId>graph-compose</artifactId>
     <version>1.6.6</version>
   </dependency>
   ```

   (`com.github.DemchaAV:GraphCompose:vX.Y.Z` via JitPack still
   resolves for pre-1.6.6 pins — see the
   [main README](../../README.md) for the fallback snippet.)

3. Build your own `InvoiceDocumentSpec` and render:

   ```java
   try (DocumentSession session = GraphCompose.document(outputPath)
           .pageSize(DocumentPageSize.A4)
           .create()) {
       InvoiceDocumentSpec spec = InvoiceDocumentSpec.builder()
               .invoice(yourInvoiceData)
               .build();
       new InvoiceClassicTemplate().compose(session, spec);
       session.buildPdf();
   }
   ```

   The template implements upstream
   [`InvoiceTemplate`](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.6/com/demcha/compose/document/templates/api/InvoiceTemplate.html),
   so any `InvoiceDocumentSpec` that drives `InvoiceTemplateV2` also
   drives this preset unchanged.

## Polish backlog

The bundle is a faithful copy of `revision-003`'s
`generated-template.java`. Two next-step polishes a downstream user
or the Template Publisher Agent could land:

- **Extract a per-bundle `InvoiceClassicSpec` and provider** so the
  preview-renderer can drive this template through the standard
  `--spec-provider <fqcn>` mechanism without building an
  `InvoiceDocumentSpec` by hand. The upstream
  `com.demcha.compose.document.templates.data.invoice.*` records are
  reusable as-is; the wrapper is just convenience.
- **Custom theme variant** (`InvoiceClassicTheme.navy()` / `.cream()`)
  layered on top of `BusinessTheme.modern()` so a downstream user
  swapping brand colours touches one named token instead of the whole
  `BusinessTheme.builder()` block.

## Source revision audit trail

- [Source revision folder](../../examples/invoice-reference/revisions/revision-003/)
  carries the full audit log: `user-request.md`, `architecture-plan.md`,
  `visual-review.md`, `revision.json` (APPROVED), and the original
  `generated-template.java`.
- Source commit: `209d5ea0bcba7e37a110b881d399d9e649426617`.

## License

Same as the rest of the repository — see [LICENSE](../../LICENSE) at
the root.
