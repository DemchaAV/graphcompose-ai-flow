# Workflow skills

Four skills, one per thing a user actually asks for. They replace an
eleven-prompt agent chain that required a human to read the contract and
an agent to interpret it.

| Skill | Fires on | Opens a revision? |
|---|---|---|
| [`create-template`](create-template/SKILL.md) | "recreate this screenshot", "build a template from this reference" | yes — `new` |
| [`revise-template`](revise-template/SKILL.md) | "change the email", "make it navy", "widen the sidebar", "rename that helper" | yes — the narrowest scope that fits |
| [`review-template`](review-template/SKILL.md) | "what's still different?", "how close are we?" | no |
| [`approve-template`](approve-template/SKILL.md) | "approve", "save", "сохрани" | no — it closes one |

## Why four and not eleven

Most of the old chain never needed a model. Version resolution, skill
validation, asset fetching, rendering, diffing, revision bookkeeping and
publishing are deterministic — they are CLI calls, and the skills call
them. What is left for judgement is reading a reference, mapping it to
primitives, writing the template, and interpreting a diff.

The old stage names still exist as pipeline stages in
[`config/pipeline.json`](../../config/pipeline.json); what changed is
that they are steps a workflow runs, not agents someone dispatches.

## Shared references

Progressive disclosure: each SKILL.md stays short and links here for the
parts that would otherwise be repeated four times.

| Reference | Covers |
|---|---|
| [`workspace.md`](references/workspace.md) | install root vs workspace root, resolution order, resolving the GraphCompose version and skill pack |
| [`scope-routing.md`](references/scope-routing.md) | picking a scope, the gate each implies, recording the decision |
| [`iteration-loop.md`](references/iteration-loop.md) | one mismatch per pass, priority order, bounds, failure categories |
| [`authoring-rules.md`](references/authoring-rules.md) | no invented API, relational geometry, anchors, data-spec contract, named render methods |

The routing itself is not documented in prose anywhere: it lives in
`config/pipeline.json` and is printed by
`node scripts/run-pipeline.mjs <project-id>`.

## GraphCompose knowledge is separate

These skills describe *workflow*. What GraphCompose can do lives in the
versioned packs under [`../versions/`](../versions/), loaded per document
kind rather than wholesale. The split is deliberate: workflow changes
with this project, the API changes with the library.
