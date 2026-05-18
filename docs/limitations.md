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

## Not a tool, yet

In Phase 1 there is no CLI, no automated rendering, no automated
diff. The CLI surface described in the plan (commands such as
`graphcompose-flow init`, `new-revision`, `approve`, `undo`,
`revert-approved`, `restore-component`, `validate-skills`, `render`,
`compare`) is documented but not shipped. The render/preview
workflow and visual diff land in Phase 6 and Phase 7. See
[roadmap.md](roadmap.md) for the phase schedule.

Until tooling lands, the entire workflow is performed manually by an
operator following the prompts under `prompts/` and the discipline
described in [workflow.md](workflow.md). Files are written by hand
into revision folders.

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
