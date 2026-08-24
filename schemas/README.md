# Schemas

JSON Schemas that pin the on-disk contracts shared between the tools
and the agent prompts. Schemas use the
[2020-12 draft](https://json-schema.org/draft/2020-12/schema) and are
enforced in CI by `.github/workflows/ci.yml` → `schema-validation`
job.

| Schema | Owners | What it pins |
|---|---|---|
| [`revision.schema.json`](revision.schema.json) | written by `tools/revision-manager`, read by all agent prompts | per-revision metadata under `examples/<project>/revisions/<id>/revision.json`. Covers lifecycle states, parent/child relationships, the orchestrator-written `scope` marker, the loop `iteration` counter, and the failure record (stage + category). |
| [`assets-manifest.schema.json`](assets-manifest.schema.json) | written by `tools/asset-resolver`, read by Template Coder Agent | per-revision `assets-manifest.json` — icon and font records used by the generated Java template. |
| [`orchestration.schema.json`](orchestration.schema.json) | written by Template Orchestrator Agent | `orchestration-decision.json` — the routing decision: intent, scope, parent, ordered stages, gate. |
| [`visual-analysis.schema.json`](visual-analysis.schema.json) | written by Visual Analyzer Agent, read by Architecture Mapper and Visual Review | `visual-analysis.json` — named regions, relational geometry, anchors, shape ownership, open questions. |
| [`architecture-plan.schema.json`](architecture-plan.schema.json) | written by Architecture Mapper Agent, read by Template Coder | `architecture-plan.json` — region → render method → primitives, base constants, theme tokens, lane and document kind. |
| [`visual-review.schema.json`](visual-review.schema.json) | written by Visual Review Agent, read by the iteration loop | `visual-review.json` — verdict, ranked mismatches, gate evidence, and the failure category when the loop is blocked. |

## Structured artifacts and their Markdown siblings

The last four schemas pin the machine-readable half of artifacts that
used to be Markdown only. Each stage writes the `.json` first and the
`.md` beside it as the human rendering: the loop needs to read a
decision back, and prose is not something a script can act on.

The split is deliberate and asymmetric — the schemas require only the
decision-bearing fields (a verdict, a region id, a render method) and
leave everything descriptive optional, so the Markdown stays the
richer document and the JSON stays something an agent can produce
without ceremony. Vocabularies that appear in more than one place —
the failure categories, the scope names, the gate kinds — are asserted
to agree by `scripts/test/pipeline-config.test.mjs`, and the schemas
themselves are exercised by `.github/scripts/test/artifact-schemas.test.mjs`.

The routing source of truth remains [`config/pipeline.json`](../config/pipeline.json);
`orchestration-decision.json` records which route was taken, not what
the routes are.

## Running locally

```bash
npm run validate:schemas     # from the repo root
```

or, equivalently, from `.github/scripts` (where the ajv dependency
lives — run `npm install` there once):

```bash
node validate-schemas.mjs    # walks the repo from the root
npm test                     # the schema contract tests
```

The validator is zero-config: it walks the repo from the root, picks
up any file whose name matches a known contract — `revision.json`,
`assets-manifest.json`, `orchestration-decision.json`,
`visual-analysis.json`, `architecture-plan.json`,
`visual-review.json` — (excluding
`.git`, `node_modules`, `target`, `dist`, `build`, `out`, `.mvn`,
`.gradle`, `.idea`, `.vscode`, and `docs/private`), and validates
each one against its matching schema.

## When schemas change

1. Update the schema file under `schemas/`.
2. Re-run `node .github/scripts/validate-schemas.mjs` from the repo
   root. Any existing on-disk file that violates the new shape
   surfaces immediately — fix the data OR widen the schema, but do
   NOT silence the validator.
3. Update the affected tool's README pointer (`tools/asset-resolver/README.md`
   or `tools/revision-manager/README.md`) and the relevant agent prompt
   if a new required field changes the contract.
4. CI re-runs the validator on every PR, so no further wiring is
   needed.

## Why schemas, not TypeScript-only types

`tools/revision-manager/src/types.ts` already declares TypeScript
interfaces for `Revision` and `TemplateProject`. Those types pin
the shape from the writer side, but only inside the revision-manager
process. JSON Schemas pin the shape **on disk**, where multiple
tools (revision-manager, preview-renderer, visual-diff,
asset-resolver) and the agent prompts converge. Two writers cannot
silently disagree about a field name when the schema validator
enforces the union.
