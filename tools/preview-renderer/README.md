# preview-renderer

A small Java/Maven module that drives the GraphCompose AI Flow render-and-preview
loop. It converts a generated PDF into a PNG preview (functional today) and
invokes compiled GraphCompose template classes to produce that PDF when the
GraphCompose runtime is present on the supplied classpath.

## Status

| Subcommand | Function                            | Status                                                                 |
|------------|-------------------------------------|------------------------------------------------------------------------|
| `preview`  | PDF page -> PNG via Apache PDFBox   | Functional, unit-tested.                                               |
| `render`   | GraphCompose template -> PDF + PNG  | Functional for compiled templates on `--classpath`; skips if absent.  |

The render subcommand attempts to resolve
`com.demcha.compose.document.api.DocumentSession` (the canonical FQCN of the
real GraphCompose 1.6 session class) on the supplied `--classpath`. If the
runtime is absent, it emits the historical skipped message and exits 0. If the
runtime is present, it creates a `DocumentSession`, invokes the template's
`compose(...)` method, writes the PDF, renders the PNG preview, and clears those
artifacts from `revision.json`.

## Build

Java 21 or newer is required when the GraphCompose-backed render tests
are enabled because the GraphCompose 1.6.0 JitPack artifact is compiled
for Java 21.

```bash
cd tools/preview-renderer
mvn -q -B clean test
mvn -q -B -DskipTests=true package
```

The shaded jar lands at `target/preview-renderer.jar`. PDFBox is bulky, so a
size around 8 to 14 MB is expected.

## Usage

### preview (PDF -> PNG)

```bash
java -jar target/preview-renderer.jar preview \
  --pdf path/to/input.pdf \
  --out path/to/output.png \
  --dpi 150 \
  --page 0
```

`--dpi` defaults to 150, `--page` defaults to 0 (first page). On success the
absolute path of the written PNG is printed to stdout and the process exits 0.

### render (template -> PDF + PNG)

```bash
java -jar target/preview-renderer.jar render \
  --revision examples/invoice-reference/revisions/revision-001 \
  --template-class com.demcha.examples.invoice.GeneratedInvoiceTemplate \
  --classpath-file target/runtime-classpath.txt \
  --spec-provider com.demcha.examples.invoice.SampleInvoiceSpecProvider \
  --output output.pdf \
  --preview output.png \
  --dpi 150 \
  --page 0
```

GraphCompose 1.7.0 ships through Maven Central as `io.github.demchaav:graph-compose:1.7.0`.
The expected jar name is `graph-compose-1.7.0.jar` (resolved by Maven from
`https://repo1.maven.org/maven2`), and the canary classpath check looks for
`com.demcha.compose.document.api.DocumentSession` inside it. Pre-1.6.7 pins
continue to resolve via JitPack as `com.github.DemchaAV:GraphCompose:vX.Y.Z`
(`GraphCompose-vX.Y.Z.jar`).

`--classpath` or `--classpath-file` must include both the compiled template
classes and the GraphCompose runtime/dependencies. `--classpath-file` is useful
on Windows because GraphCompose's transitive classpath can exceed the command
line length limit. If both flags are present, their entries are joined with the
platform classpath separator. This tool does not compile `generated-template.java`
by itself; compilation belongs to the Test + Render agent before this command
runs.

Templates with `compose(DocumentSession)` need no spec provider. Templates with
`compose(DocumentSession, Spec)` must pass `--spec-provider <fqcn>`. The provider
class is loaded from the same classpath and may expose one of these shapes:

- public static `create()` or `spec()`
- public instance `create()` or `spec()`
- `java.util.function.Supplier`

`--output` and `--preview` default to `output.pdf` and `output.png` inside the
revision folder. Relative paths are resolved from the revision folder.
`--dpi` defaults to 150, and `--page` defaults to 0.

When the supplied `--classpath` does not include the GraphCompose runtime, the
tool prints these two lines verbatim and exits 0:

```text
graphcompose runtime not detected on classpath; render skipped.
supply --classpath pointing at graphcompose-<version>.jar to enable rendering.
```

It also writes a small `render.log` into the revision folder so an orchestrator
can confirm the call actually ran.

On Windows use `;` as the classpath separator; on Linux and macOS use `:`. The
tool uses the platform default automatically.

## How this hands off to other tools

`render` now:

1. Instantiates the template class through the supplied classpath.
2. Calls its compose method inside a real GraphCompose `DocumentSession`.
3. Writes `<revision-folder>/output.pdf` by default.
4. Invokes the `preview` code path to write `<revision-folder>/output.png` at
   the configured DPI.
5. Calls `ArtifactUpdater.markArtifactsPresent(revisionFolder, ["output.pdf",
   "output.png"])` to clear those entries from `pendingArtifacts` inside
   `revision.json`.

Downstream, the Phase 7 `tools/visual-diff` lane consumes the freshly-written
`output.png` and compares it against a committed baseline; that tool is built
in Node and TypeScript and is intentionally out of scope for this module.

## Tests

```bash
mvn -q -B test
```

Three production test classes plus render fixture classes:

- `PreviewCommandTest` constructs a real one-page PDF with PDFBox, runs the
  conversion, and asserts the PNG file is written with a valid PNG magic
  header.
- `RenderCommandTest` runs the render command with an empty `--classpath`,
  asserting the skeleton message is printed, exit status is 0, and
  `render.log` is created in the revision folder. It also runs two real
  GraphCompose render cases through an isolated URLClassLoader: one
  `compose(DocumentSession)` template and one
  `compose(DocumentSession, Spec)` template via `--spec-provider`.
- `ArtifactUpdaterTest` exercises the JSON patching against the fixture in
  `src/test/resources/sample-revision.json`, including an idempotency check
  and a two-space indentation check.

## Honesty rule

The render subcommand renders compiled template classes; it does not compile
raw `generated-template.java` files, generate business data, or decide whether a
visual match is acceptable. Those steps still belong to the surrounding
workflow: compile first, provide a spec for data-driven templates, then run
visual review against the resulting preview.
