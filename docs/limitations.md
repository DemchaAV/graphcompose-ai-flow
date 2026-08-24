# Limitations

Honest limitations matter because the entire framing of this project
depends on not overpromising. The visual accuracy contract in
[visual-accuracy-contract.md](visual-accuracy-contract.md) is strict
precisely because the project does not claim that an AI agent can
turn an arbitrary screenshot into perfect production-ready Java code
in one shot — see [overview.md](overview.md#what-this-is-not). The
list below records where the workflow falls short today, so that
users and contributors can plan around it.

## Known limitations

- not perfect automatic conversion
- human review remains required
- exact font matching may be limited
- exact pixel parity may depend on renderer
- visual comparison may require manual review
- unsupported GraphCompose versions require skill updates
- agent can only use APIs documented in selected skill pack
- custom icon and font choices must be sourced and documented

## What the tooling can and cannot do today

Three tools ship under [`../tools/`](../tools/) and pass CI:

- [`revision-manager`](../tools/revision-manager/) implements `init`,
  `status`, `new-revision`, `approve`, `reject`, `undo`,
  `fail`, `revert-approved`, `restore-component`, `history`, and
  `diff`. Verified by 27 unit tests plus a smoke sequence in CI. The
  `RevisionStatus` union includes `FAILED` and `REVERTED`; the CLI
  writes `FAILED` through the `fail` verb and exposes `REVERTED` for
  orchestrators that need a rollback marker.
- [`preview-renderer`](../tools/preview-renderer/) implements
  `preview` (PDF → PNG via PDFBox 3) functionally. The `render`
  subcommand loads the supplied classpath, keeps the clear
  "graphcompose runtime not detected" skip path when the runtime is
  absent, and executes compiled GraphCompose templates when the
  runtime is present. It supports both `compose(DocumentSession)` and
  data-driven `compose(DocumentSession, Spec)` through
  `--spec-provider`.
- [`visual-diff`](../tools/visual-diff/) implements pixel comparison
  with pixelmatch, the parity-score formula, and the classification
  rules from [visual-accuracy-contract.md](visual-accuracy-contract.md).
  21 unit tests; functional.
- The five fixture projects under
  [`../examples/skill-fixtures/`](../examples/skill-fixtures/) compile
  and run with Maven against GraphCompose 1.9.0 from Maven Central:
  `io.github.demchaav:graph-compose:1.9.0`. Pre-1.6.7 pins still
  resolve via JitPack as `com.github.DemchaAV:GraphCompose:vX.Y.Z`.

What is intentionally NOT in this repository today:

- a compiler for raw `generated-template.java` artifacts or an
  automatic business-data generator. The
  [render path](../tools/preview-renderer/) expects compiled template
  classes on `--classpath` and, for data-driven templates, an
  explicit `--spec-provider`.
- full skill validation. Fixture compile/run smoke exists, but no
  fixture has completed the full render + preview + visual-diff cycle
  against a committed visual baseline. All 14 skills in the manifest
  remain `status: needs-validation`.
- a hosted CLI, a model adapter, or inference infrastructure.
- a real reference image at
  `examples/invoice-reference/reference/reference.png` — only the
  textual reference description (`reference.md`) is committed.

## Design asset sourcing

When a reference requires icons, the agent should search/select
icons through [Iconify](https://iconify.design/) and record the icon
set/name in `visual-analysis.md` or `architecture-plan.md`. When a
reference requires a custom font, the agent should use
[Google Fonts](https://fonts.google.com/) as the default source when
licensing permits. GraphCompose can add fonts to a font library, so
the plan must record the font family, weights, source, and fallback
chain instead of silently substituting a generic PDF base font.

## Out of scope

This repository does not maintain the GraphCompose library itself.
It contributes skill packs, example templates, prompts, and a
documented workflow. Library changes happen upstream at
[https://github.com/DemchaAV/GraphCompose](https://github.com/DemchaAV/GraphCompose).
See [integration-with-graphcompose.md](integration-with-graphcompose.md)
for the boundary between this repository and the library.

This repository also does not provide a hosted service, a model
adapter, or any inference infrastructure. The agents described in
[`skills/workflows/`](../skills/workflows/README.md) are contracts, not binaries — they
describe what an AI assistant must do, not where it runs.
