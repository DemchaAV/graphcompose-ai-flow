---
vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/08-recipe-invoice-and-proposal.md"
verifiedAgainst: "1.9.0"
syncedBy: "tools/api-surface/sync-engine-guides.mjs"
note: "Verified how-to guide vendored from the GraphCompose LLM wiki (compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."
---

# Recipe: Invoice And Proposal

## Status
Verified / Round 32 documentation extraction

## Learning level
Intermediate

## What this page explains
This is the eighth extracted developer guide from the private LLM Wiki tree and
the first recipe guide. The earlier guides taught the capability building blocks;
this guide shows an end-to-end path for a real document family.

It answers:

```text
I need an invoice or a proposal. Do I hand-build it with Flow, or use the
built-in template - and how do I supply data, theme it, and render it?
```

It turns the internal invoice/proposal recipe into a beginner-to-intermediate
"use when" guide with the compose-first contract, when-to-use, when-not, why, and
compile-checked snippets.

## Developer question
Invoices and proposals are standard business artifacts. GraphCompose maintains
V2 templates for them. When should I use the template instead of writing the
document myself, and what exactly do I supply?

## Mental model
The template owns the document structure. Your application owns the business data
and the output destination.

```text
1. Build a data spec     -> InvoiceDocumentSpec / ProposalDocumentSpec
2. Choose a theme        -> BusinessTheme.modern()
3. Create the template   -> new InvoiceTemplateV2(theme)
4. Open a session        -> GraphCompose.document(...).create()
5. Compose               -> template.compose(document, spec)
6. Render where you want -> buildPdf() / writePdf(stream) / toPdfBytes()
```

The template composes into an already-open `DocumentSession`. It never decides
file vs stream vs bytes - the caller does.

## When to use this
- `InvoiceTemplateV2` when the document is an invoice: seller, buyer, invoice
  metadata, line items, totals, notes, payment terms.
- `ProposalTemplateV2` when the document is a proposal: sender, recipient,
  project title, sections, timeline, pricing, acceptance terms.
- `BusinessTheme` when the same invoice/proposal should be re-skinned for a brand
  without rewriting layout code.
- Streaming output (`writePdf(OutputStream)`) when the document is generated
  inside a backend endpoint.

## When not to use this
- Do not use invoice/proposal templates for a report, poster, CV, certificate,
  or arbitrary page design.
- Do not copy V1 template code for new work. New invoice/proposal work goes to
  V2.
- Do not modify template internals just to change data. Change the spec first.
- Do not call `buildPdf()` inside a reusable template. Templates compose into an
  open session; the caller chooses when and where to render.

## How it works in GraphCompose
The built-in V2 templates follow the compose-first contract:

1. Build a data spec (`InvoiceDocumentSpec` or `ProposalDocumentSpec`).
2. Choose a `BusinessTheme`, commonly `BusinessTheme.modern()`.
3. Create the template with the theme.
4. Create a canonical `DocumentSession`, usually with the theme page background.
5. Call `template.compose(document, spec)`.
6. Render with `buildPdf()`, `writePdf(...)`, or another session output method.

`InvoiceCinematicFileExample` and `ProposalCinematicFileExample` use this
pattern. The examples build the spec through `ExampleDataFactory`, but production
code usually builds the same specs from database/application data.

## Decision tree
```text
I need a business document.
|
+-- Is it billing (amounts owed, line items, due date)?
|   -> InvoiceTemplateV2 + InvoiceDocumentSpec.
|
+-- Is it sales/scope (project, timeline, pricing, acceptance)?
|   -> ProposalTemplateV2 + ProposalDocumentSpec.
|
+-- Is it neither, but close to one?
|   -> use the template, then adjust theme / add session-level PDF chrome.
|
+-- Is the structure genuinely different?
    -> build it custom with pageFlow(...). See the choose-authoring-path guide.
```

## Invoice example
Use this when the document is clearly an invoice. The spec carries the data; the
template carries the layout.

<!-- snippet-smoke: id=round32-recipe-invoice mode=method since=current -->
```java
InvoiceDocumentSpec invoice = InvoiceDocumentSpec.builder()
        .title("Invoice")
        .invoiceNumber("GC-2026-041")
        .issueDate("25 Jun 2026")
        .dueDate("25 Jul 2026")
        .reference("GraphCompose implementation")
        .status("Due")
        .fromParty(party -> party
                .name("GraphCompose Studio")
                .addressLines("10 Example Street", "London")
                .email("billing@example.com")
                .phone("+44 20 0000 0000")
                .taxId("VAT GB000000000"))
        .billToParty(party -> party
                .name("Client Ltd")
                .addressLines("22 Client Road", "Manchester")
                .email("accounts@client.example"))
        .lineItem("Document engine integration", "Implementation and support",
                "1", "4,800.00", "4,800.00")
        .summaryRow("Subtotal", "4,800.00")
        .summaryRow("VAT", "960.00")
        .totalRow("Total", "5,760.00")
        .paymentTerm("Payment due within 30 days.")
        .footerNote("Thank you for your business.")
        .build();

BusinessTheme theme = BusinessTheme.modern();
InvoiceTemplateV2 template = new InvoiceTemplateV2(theme);

try (DocumentSession document = GraphCompose.document(Path.of("invoice.pdf"))
        .pageSize(DocumentPageSize.A4)
        .pageBackground(theme.pageBackground())
        .margin(28, 28, 28, 28)
        .create()) {
    template.compose(document, invoice);
    document.buildPdf();
}
```

Source marker: verified against
`07-recipes/02-build-an-invoice-or-proposal.md` (marker
`recipe-invoice-template-minimal`),
`examples/src/main/java/com/demcha/examples/templates/invoice/InvoiceCinematicFileExample.java`,
`src/main/java/com/demcha/compose/document/templates/builtins/InvoiceTemplateV2.java`, and
`src/main/java/com/demcha/compose/document/templates/data/invoice/InvoiceDocumentSpec.java`.

Compile-smoke marker: `round32-recipe-invoice`, `mode=method`, added in
Round 32.

## Proposal example
Use the same structure when the artifact is sales or project scope, not billing.
The proposal timeline uses the three-argument
`timelineItem(phase, duration, details)` shape.

<!-- snippet-smoke: id=round32-recipe-proposal mode=method since=current -->
```java
ProposalDocumentSpec proposal = ProposalDocumentSpec.builder()
        .title("Proposal")
        .proposalNumber("PR-2026-014")
        .preparedDate("25 Jun 2026")
        .validUntil("25 Jul 2026")
        .projectTitle("Document Automation Platform")
        .executiveSummary("A proposal for building reliable PDF generation into the product workflow.")
        .sender(party -> party
                .name("GraphCompose Studio")
                .addressLines("10 Example Street", "London")
                .email("hello@example.com")
                .website("graphcompose.example"))
        .recipient(party -> party
                .name("Client Ltd")
                .addressLines("22 Client Road", "Manchester")
                .email("product@client.example"))
        .section("Scope", "Backend integration, template setup, and regression checks.")
        .timelineItem("Week 1", "1 week", "Data model and rendering endpoint.")
        .pricingRow("Implementation", "Fixed scope", "4,800.00")
        .emphasizedPricingRow("Total", "Excluding tax", "4,800.00")
        .acceptanceTerm("Proposal valid for 30 days.")
        .footerNote("Prepared with GraphCompose.")
        .build();

BusinessTheme theme = BusinessTheme.modern();
ProposalTemplateV2 template = new ProposalTemplateV2(theme);

try (DocumentSession document = GraphCompose.document(Path.of("proposal.pdf"))
        .pageSize(DocumentPageSize.A4)
        .pageBackground(theme.pageBackground())
        .margin(28, 28, 28, 28)
        .create()) {
    template.compose(document, proposal);
    document.buildPdf();
}
```

Source marker: verified against
`07-recipes/02-build-an-invoice-or-proposal.md` (marker
`recipe-proposal-template-minimal`),
`examples/src/main/java/com/demcha/examples/templates/proposal/ProposalCinematicFileExample.java`,
`src/main/java/com/demcha/compose/document/templates/builtins/ProposalTemplateV2.java`, and
`src/main/java/com/demcha/compose/document/templates/data/proposal/ProposalDocumentSpec.java`.

Compile-smoke marker: `round32-recipe-proposal`, `mode=method`, added in
Round 32.

## Server endpoint example
In production the spec usually comes from application data and the document is
streamed to a caller-owned stream. This shows the compose-first contract: the
template composes into an open session, and the caller owns output.

<!-- snippet-smoke: id=round32-recipe-invoice-stream mode=members since=current -->
```java
import com.demcha.compose.GraphCompose;
import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.templates.builtins.InvoiceTemplateV2;
import com.demcha.compose.document.templates.data.invoice.InvoiceDocumentSpec;
import com.demcha.compose.document.theme.BusinessTheme;

import java.io.OutputStream;

void streamInvoice(InvoiceDocumentSpec invoice, OutputStream out) throws Exception {
    InvoiceTemplateV2 template = new InvoiceTemplateV2(BusinessTheme.modern());

    try (DocumentSession document = GraphCompose.document().create()) {
        template.compose(document, invoice);
        document.writePdf(out);
    }
}
```

Source marker: verified against
`07-recipes/05-render-in-a-server-or-preview-flow.md`,
`12-docs-extraction/07-output-and-testing.md`,
`src/main/java/com/demcha/compose/document/templates/builtins/InvoiceTemplateV2.java`, and
`src/main/java/com/demcha/compose/document/api/DocumentSession.java`
(`writePdf(OutputStream)`).

Compile-smoke marker: `round32-recipe-invoice-stream`, `mode=members`, added in
Round 32.

## Customizing in order
If the built-in structure is close but not exact, prefer these moves in order:

1. Check whether the spec already has the field you need.
2. Change the theme choice or theme tokens for branding.
3. Wrap the template call with session-level PDF chrome (footer, metadata,
   protection). See `06-advanced-capabilities/02-pdf-chrome-production-options.md`.
4. Only fork or write a new template when the document structure itself is
   different.

## Common mistakes
- Building invoices manually with low-level Flow before checking
  `InvoiceTemplateV2`.
- Mixing invoice/proposal V1 examples into new V2 code.
- Treating the template as the output owner. The caller still owns
  `DocumentSession` and decides file vs stream vs bytes.
- Putting application formatting decisions into database strings instead of
  keeping money/date formatting at the application boundary.
- Forking a template because of colors. Use `BusinessTheme` first.

## What to read next
| Next question | Read |
| --- | --- |
| "Which authoring path / template family?" | `12-docs-extraction/02-choose-authoring-path.md` |
| "How do I stream or test the output?" | `12-docs-extraction/07-output-and-testing.md` |
| "How do I theme or brand the template?" | `06-advanced-capabilities/04-fonts-custom-themes-and-template-tokens.md` |
| "How do I add a watermark/footer/protection?" | `06-advanced-capabilities/02-pdf-chrome-production-options.md` |
| "What other templates exist?" | `11-gap-backlog/03-template-preset-catalog.md` |

## Related pages
- `12-docs-extraction/02-choose-authoring-path.md`
- `12-docs-extraction/07-output-and-testing.md`
- `07-recipes/02-build-an-invoice-or-proposal.md`
- `04-core-concepts/01-session-lifecycle.md`
- `04-core-concepts/05-styles-themes-and-template-themes.md`
- `06-advanced-capabilities/02-pdf-chrome-production-options.md`
- `11-gap-backlog/03-template-preset-catalog.md`
- `11-gap-backlog/12-documentation-extraction-readiness.md`

## Source files checked
- `src/main/java/com/demcha/compose/document/templates/api/DocumentTemplate.java`
- `src/main/java/com/demcha/compose/document/templates/builtins/InvoiceTemplateV2.java`
- `src/main/java/com/demcha/compose/document/templates/data/invoice/InvoiceDocumentSpec.java`
- `src/main/java/com/demcha/compose/document/templates/builtins/ProposalTemplateV2.java`
- `src/main/java/com/demcha/compose/document/templates/data/proposal/ProposalDocumentSpec.java`
- `src/main/java/com/demcha/compose/document/theme/BusinessTheme.java`
- `src/main/java/com/demcha/compose/document/api/DocumentSession.java`
- `.llm-wiki/07-recipes/02-build-an-invoice-or-proposal.md`
- `.llm-wiki/12-docs-extraction/07-output-and-testing.md`
- `examples/src/main/java/com/demcha/examples/templates/invoice/InvoiceCinematicFileExample.java`
- `examples/src/main/java/com/demcha/examples/templates/proposal/ProposalCinematicFileExample.java`
- `target/llm-wiki-snippet-smoke/snippet-smoke-report.txt`

## Verification notes
Round 32 adds the eighth documentation-extraction guide under
`12-docs-extraction/` and the first recipe guide. It is built from the Round 8
invoice/proposal recipe and the Round 31 output guide.

The invoice and proposal snippets reuse the source recipe shapes already
compile-smoke proven in Round 22 (`recipe-invoice-template-minimal`,
`recipe-proposal-template-minimal`); the proposal timeline keeps the current
three-argument `timelineItem(phase, duration, details)` form. The new server
endpoint snippet shows the compose-first contract with `writePdf(OutputStream)`;
its template/session/stream signatures were re-checked against
`InvoiceTemplateV2.java` and `DocumentSession.java`.

Round 32 ran:

```powershell
& .\.llm-wiki\tools\snippet-smoke\snippet-smoke.ps1 -Compile
```

The command passed. The private report showed `marked=48`, `generated=48`,
`skipped=0`, and `warnings=0`. Maven emitted existing project deprecation and
JDK/Lombok warnings during `test-compile`, but the snippet-smoke report itself
had zero warnings.

No engine source, public docs, examples, tests, baselines, or `raw/` source
material were intentionally modified.
