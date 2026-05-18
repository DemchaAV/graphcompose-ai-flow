# Agents

Nine agents own the chain from a user request to an approved
revision. The chain is strictly ordered. Each agent has a single
purpose, a documented input, a documented output, and a list of
forbidden behaviors. Prompts for each agent live under `prompts/`.

## Agent chain

```text
Template Orchestrator Agent
        ↓
Version + Skill Resolver Agent
        ↓
Skill Validator Agent
        ↓
Visual Analyzer Agent
        ↓
Architecture Mapper Agent
        ↓
Template Coder Agent
        ↓
Test + Render Agent
        ↓
Visual Review Agent
        ↓
Revision Manager Agent
        ↓
User Approval / Rollback
```

The original simple plan ended at the visual review. The improved
chain adds explicit version detection, skill resolution, skill
validation, and a separate revision manager so that no agent except
the Revision Manager can change project metadata.

## Template Orchestrator Agent

Purpose: main coordinator. Decides whether the user request is a new
generation, a revision, an approval, an undo, a revert to approved,
or a selective rollback, and routes the work to the correct
specialized agent.

Inputs: user request, project metadata, current approved revision,
current draft revision, reference image, available skill packs,
GraphCompose version.

Outputs: `orchestration-decision.md`.

Responsibilities:

- detect whether the request is new generation, revision, approval,
  rollback, or selective rollback
- select the correct base revision
- decide whether full visual analysis is needed
- decide whether to patch an existing template or regenerate
- ensure every change creates a new revision
- route work to the correct specialized agent
- produce the final user-facing status
- prevent direct overwrite of approved revisions

Forbidden: editing project metadata directly (the Revision Manager
owns that), writing code (the Template Coder owns that), and
approving revisions without a complete visual review.

Prompt: [`prompts/orchestrator-agent.md`](../prompts/orchestrator-agent.md).

## Version + Skill Resolver Agent

Purpose: prevent the AI from mixing APIs from different GraphCompose
versions.

Inputs: pom.xml, build.gradle, project config, skill-manifest.json,
user request.

Outputs: `version-resolution.md`.

Responsibilities:

- detect the target GraphCompose version
- read `skill-manifest.json`
- select the compatible skill pack
- detect unsupported versions
- prevent the use of stale skills
- report uncertainty before code generation

Required rules (verbatim):

```text
The agent must identify the target GraphCompose version before writing code.
```

```text
The agent must only use skills marked as compatible with that GraphCompose version.
```

```text
If the version is unknown, the agent must use conservative verified primitives only.
```

Prompt: [`prompts/version-skill-resolver-agent.md`](../prompts/version-skill-resolver-agent.md).

## Skill Validator Agent

Purpose: verify that the loaded skill pack still matches the real
GraphCompose API. Skills are versioned contracts, not static
documentation, and they must be tested against real library behavior.

Inputs: selected skill pack, GraphCompose version, verified examples,
fixture projects, build output, render output.

Outputs: `skill-validation-report.md`, and `skill-fix-report.md` when
drift is detected.

Responsibilities:

- verify that skills match the selected GraphCompose version
- check that documented examples compile
- check that documented examples render
- detect stale or wrong API instructions
- create skill-fix reports when drift is found

Core rule (verbatim):

```text
If GraphCompose behavior differs from the skill documentation, GraphCompose is the source of truth.
The skill must be fixed.
```

Forbidden: silently working around incorrect skills, or marking a
skill as `active` when its examples fail to compile or render.

Prompt: [`prompts/skill-validator-agent.md`](../prompts/skill-validator-agent.md).

See [skill-validation.md](skill-validation.md) for the planned
validation discipline.

## Visual Analyzer Agent

Purpose: analyze the visual reference. Does not write code.

Inputs: `reference.png`, optional `reference.pdf`, optional user
notes.

Outputs: `visual-analysis.md`.

Responsibilities:

- identify page format and orientation
- identify the layout grid
- identify major regions
- describe visual hierarchy
- identify repeated components
- identify typography
- identify colors
- identify spacing
- identify tables
- identify cards, panels, badges, and decorations
- identify uncertain or ambiguous parts

Forbidden: emitting Java code, naming specific GraphCompose builders,
or assuming a particular library version. The analyzer describes
what is visible, not how to implement it.

Prompt: [`prompts/visual-analyzer-agent.md`](../prompts/visual-analyzer-agent.md).

## Architecture Mapper Agent

Purpose: convert visual analysis into a GraphCompose architecture
plan. Does not write final Java code.

Inputs: `visual-analysis.md`, selected skills, GraphCompose version,
reference image.

Outputs: `architecture-plan.md`.

Responsibilities:

- map visual regions to GraphCompose DSL primitives
- decide reusable private render methods
- identify theme tokens
- identify data model assumptions
- define a testing plan
- identify visual risks
- define fallback strategies

Forbidden: writing the final template Java, inventing GraphCompose
APIs not present in the loaded skill pack, and recommending
`CanvasLayer` for anything other than last-resort decoration.

Prompt: [`prompts/architecture-mapper-agent.md`](../prompts/architecture-mapper-agent.md).

## Template Coder Agent

Purpose: write the Java template and tests, using only the loaded
skill pack and GraphCompose APIs valid for the selected version.

Inputs: `architecture-plan.md`, selected skill pack, GraphCompose
version, base revision when applicable.

Outputs: `generated-template.java`, `generated-test.java`,
`patch.diff`, `changed-components.md`.

Responsibilities:

- generate maintainable Java code
- use the GraphCompose semantic DSL
- avoid raw PDFBox usage
- avoid coordinate soup
- keep code componentized
- use selected skills only
- use GraphCompose APIs valid for the selected version
- create tests
- track changed components

Rules (verbatim):

```text
Do not write one huge method.
```

```text
Do not import PDFBox directly.
```

```text
Do not invent GraphCompose API.
```

```text
Use CanvasLayer only as last resort.
```

```text
Every visible component should map to a named method or named layout block.
```

Prompt: [`prompts/template-coder-agent.md`](../prompts/template-coder-agent.md).

## Test + Render Agent

Purpose: verify that generated code compiles, runs, and produces the
expected artifacts.

Inputs: `generated-template.java`, `generated-test.java`, reference
image, project config.

Outputs: `output.pdf`, `output.png`, `layout-snapshot.json`,
`test-result.md`, `build.log`, `render.log`.

Responsibilities:

- compile generated code
- run the template test
- render the PDF
- generate the preview PNG
- generate the layout snapshot
- report failure clearly
- preserve failed revision artifacts

Minimum checks:

- template compiles
- PDF file is generated
- PDF file is not empty
- preview image is generated
- layout snapshot is generated
- render does not throw unexpected exceptions

Forbidden: deleting artifacts on failure, mutating prior revisions,
or marking a revision successful when any minimum check fails.

Prompt: [`prompts/test-render-agent.md`](../prompts/test-render-agent.md).

## Visual Review Agent

Purpose: compare the rendered output against the reference and
classify mismatches.

Inputs: `reference.png`, `output.png`, `previous-output.png` when
available, `layout-snapshot.json`, `visual-analysis.md`,
`architecture-plan.md`.

Outputs: `visual-review.md`.

Responsibilities:

- compare reference image with output preview
- compare current output with previous output when available
- identify visual mismatches
- classify mismatches
- recommend next revision actions
- decide whether the revision is acceptable

Forbidden: approving the revision (the Revision Manager owns
approval), editing the template, or suppressing visible mismatches as
"close enough" without a documented classification. See
[visual-accuracy-contract.md](visual-accuracy-contract.md) for the
canonical mismatch labels and [visual-review-loop.md](visual-review-loop.md)
for the review document format.

Prompt: [`prompts/visual-review-agent.md`](../prompts/visual-review-agent.md).

## Revision Manager Agent

Purpose: the key safety layer. Owns project metadata and the revision
folder structure.

Inputs: revision artifacts, user decision, project metadata.

Outputs: `revision.json`, `status.md`, and updates to
`template-project.json`.

Responsibilities:

- create revision
- track parent revision
- track approved revision
- track draft revision
- save artifacts
- approve revision
- reject revision
- undo last change
- revert to approved
- selective rollback
- preserve failed revisions
- prevent destructive overwrite

Core rule (verbatim):

```text
Never overwrite the approved revision directly.
Every change creates a new revision.
```

Prompt: [`prompts/revision-manager-agent.md`](../prompts/revision-manager-agent.md).

See [revision-model.md](revision-model.md) and [rollback.md](rollback.md)
for the data model and the rollback flows the Revision Manager
implements. The shared master prompt that bundles all agents lives at
[`prompts/master-prompt.md`](../prompts/master-prompt.md).
