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

## What the tooling can and cannot do today

Three tools ship under [`../tools/`](../tools/) and pass CI:

- [`revision-manager`](../tools/revision-manager/) implements `init`,
  `status`, `new-revision`, `approve`, `reject`, `undo`,
  `revert-approved`, `restore-component`, `history`, and `diff`.
  Verified by 22 unit tests plus a smoke sequence in CI. The
  `RevisionStatus` union does NOT yet include `FAILED` or `REVERTED`
  markers; see [implementation-status.md](implementation-status.md)
  for the gap.
- [`preview-renderer`](../tools/preview-renderer/) implements
  `preview` (PDF → PNG via PDFBox 3) functionally. The `render`
  subcommand (template → PDF) is a skeleton: it loads the supplied
  classpath, looks up the GraphCompose `DocumentSession` canary
  class, and exits with a clear "graphcompose runtime not detected"
  message when the canary cannot be loaded. The skeleton flips to
  functional once GraphCompose 1.6 is on a reachable Maven
  repository.
- [`visual-diff`](../tools/visual-diff/) implements pixel comparison
  with pixelmatch, the parity-score formula, and the classification
  rules from [visual-accuracy-contract.md](visual-accuracy-contract.md).
  21 unit tests; functional.

What is intentionally NOT in this repository today:

- a published Maven coordinate for GraphCompose itself — the
  [render path](../tools/preview-renderer/) cannot resolve the
  library because `io.github.demchaav:graphcompose:1.6.0` is not yet
  on Maven Central / JitPack.
- skill-validation execution. The discipline lives under
  [../validation/](../validation/) but no fixture has been
  executed against the real library. All 14 skills in the manifest
  remain `status: needs-validation`.
- a hosted CLI, a model adapter, or inference infrastructure.
- a real reference image at
  `examples/invoice-reference/reference/reference.png` — only the
  textual reference description (`reference.md`) is committed.

## Out of scope

This repository does not maintain the GraphCompose library itself.
It contributes skill packs, example templates, prompts, and a
documented workflow. Library changes happen upstream at
[https://github.com/DemchaAV/GraphCompose](https://github.com/DemchaAV/GraphCompose).
See [integration-with-graphcompose.md](integration-with-graphcompose.md)
for the boundary between this repository and the library.

This repository also does not provide a hosted service, a model
adapter, or any inference infrastructure. The agents described in
[agents.md](agents.md) are role definitions, not binaries — they
describe what an AI assistant must do, not where it runs.
