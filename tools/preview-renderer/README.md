# preview-renderer

A small Java/Maven module that drives the GraphCompose AI Flow render-and-preview
loop. It converts a generated PDF into a PNG preview (functional today) and
provides a skeleton entry point for invoking a generated GraphCompose template
to produce that PDF (skeleton-with-detection today; waits on GraphCompose 1.6
being available on a reachable Maven repository).

## Status

| Subcommand | Function                            | Status                                                                            |
|------------|-------------------------------------|-----------------------------------------------------------------------------------|
| `preview`  | PDF page -> PNG via Apache PDFBox   | Functional, unit-tested.                                                          |
| `render`   | GraphCompose template -> PDF        | Skeleton with classpath detection. Falls back to a "skipped" message and exit 0.  |

The render subcommand cannot do useful work until GraphCompose 1.6 is published
to a Maven repository this machine can reach. Until then, it documents the
contract by attempting to resolve `com.demcha.graphcompose.DocumentSession` on
the supplied `--classpath` and emitting a clear message when that class is
absent. This is by design, not a bug.

## Build

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

### render (template -> PDF, skeleton)

```bash
java -jar target/preview-renderer.jar render \
  --revision examples/invoice-reference/revisions/revision-001 \
  --template-class com.demcha.examples.invoice.GeneratedInvoiceTemplate \
  --classpath "/path/to/graphcompose-1.6.0.jar"
```

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

Once `render` is fully wired up (Phase 6 follow-up), it will:

1. Instantiate the template class through the supplied classpath.
2. Call its compose method, capture the PDF bytes, and write them to
   `<revision-folder>/output.pdf`.
3. Invoke the `preview` code path to write `<revision-folder>/output.png` at
   the configured DPI.
4. Call `ArtifactUpdater.markArtifactsPresent(revisionFolder, ["output.pdf",
   "output.png"])` to clear those entries from `pendingArtifacts` inside
   `revision.json`.

`ArtifactUpdater` is implemented and tested today, so when the rendering step
is enabled the bookkeeping just works.

Downstream, the Phase 7 `tools/visual-diff` lane consumes the freshly-written
`output.png` and compares it against a committed baseline; that tool is built
in Node and TypeScript and is intentionally out of scope for this module.

## Tests

```bash
mvn -q -B test
```

Three test classes:

- `PreviewCommandTest` constructs a real one-page PDF with PDFBox, runs the
  conversion, and asserts the PNG file is written with a valid PNG magic
  header.
- `RenderCommandTest` runs the render command with an empty `--classpath`,
  asserting the skeleton message is printed, exit status is 0, and
  `render.log` is created in the revision folder.
- `ArtifactUpdaterTest` exercises the JSON patching against the fixture in
  `src/test/resources/sample-revision.json`, including an idempotency check
  and a two-space indentation check.

## Honesty rule

The render subcommand does not currently render PDFs. It is here so the rest
of the AI-flow plumbing can talk to a real CLI shape today, and so the
detection logic is exercised in CI. When GraphCompose 1.6 reaches a reachable
Maven repository, the `renderWithGraphCompose` method in `RenderCommand.java`
is the only place that needs new code.
