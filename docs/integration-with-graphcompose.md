# Integration with GraphCompose

This is a companion repo, not a fork. It does not modify the
GraphCompose Java library. It documents and demonstrates an AI
workflow that uses GraphCompose as the target language.

## Where GraphCompose lives

GraphCompose itself is maintained at
[https://github.com/DemchaAV/GraphCompose](https://github.com/DemchaAV/GraphCompose).
The skill packs in this repository currently target GraphCompose
`1.6.x` (the `defaultGraphComposeVersion` in `skills/skill-manifest.json`).
A `1.5.x` skill pack is also planned per the structure in
[versioned-skills.md](versioned-skills.md). When GraphCompose ships a
new minor version, a new skill pack directory is added under
`skills/versions/` rather than mutating the existing one.

## How this strengthens GraphCompose positioning

```text
GraphCompose
  = serious Java document layout engine

GraphCompose-AI-Template-Flow
  = experimental AI workflow showing why GraphCompose is a strong semantic target for AI agents
```

The main project benefits because this repo demonstrates:

- semantic authoring
- maintainable templates
- AI-friendly DSL
- visual verification
- revision safety
- rollback
- versioned usage instructions
- testable document generation

## Final positioning

```text
GraphCompose-AI-Template-Flow is an experimental companion project for GraphCompose.

It demonstrates how AI agents can turn visual document references into maintainable Java templates through a strict workflow:

Analyze → Version → Skills → Plan → Generate → Render → Compare → Revise → Approve / Rollback

The project treats GraphCompose as a semantic target language for AI-assisted document generation.

It does not promise magic screenshot-to-code conversion.

It focuses on engineering discipline:

- versioned skills
- API validation
- semantic mapping
- visual parity
- testable output
- revision history
- rollback safety
```

## What this repo never modifies in GraphCompose

This repository never:

- changes library code in the GraphCompose repository
- adds, removes, or upgrades GraphCompose library dependencies
- ships forked copies of GraphCompose classes
- vendors GraphCompose JARs as committed binaries

What it does ship:

- versioned skill packs that describe the GraphCompose API as it
  exists at a given version
- example templates that consume GraphCompose as a dependency
- prompts, validation reports, and revision artifacts under
  `examples/`

If something in the GraphCompose library needs to change, the change
happens in the upstream repository and is then reflected here through
a new skill pack version, not by patching the library from this
companion repo. See [versioned-skills.md](versioned-skills.md) and
[skill-validation.md](skill-validation.md) for the drift handling
flow.
