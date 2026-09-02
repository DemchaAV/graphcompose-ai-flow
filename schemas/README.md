# Schemas

JSON Schemas that pin the on-disk contracts shared between the tools
and the agent prompts. Schemas use the
[2020-12 draft](https://json-schema.org/draft/2020-12/schema) and are
enforced in CI by `.github/workflows/ci.yml` → `schema-validation`
job.

| Schema | Owners | What it pins |
|---|---|---|
| [`revision.schema.json`](revision.schema.json) | written by `tools/revision-manager`, read by all agent prompts | per-revision metadata under `examples/<project>/revisions/<id>/revision.json`. Covers lifecycle states, parent/child relationships, the orchestrator-written `scope` marker, the loop `iteration` counter, and the failure record (stage + category). |
| [`assets-manifest.schema.json`](assets-manifest.schema.json) | written by `tools/asset-resolver`, read when the template is authored (create phase 3) | per-revision `assets-manifest.json` — icon and font records used by the generated Java template. |
| [`orchestration.schema.json`](orchestration.schema.json) | written by `revise-template` when it routes a request (see `skills/workflows/references/scope-routing.md`) | `orchestration-decision.json` — the routing decision: intent, scope, parent, ordered stages, gate. |
| [`visual-analysis.schema.json`](visual-analysis.schema.json) | written by the geometry analysis in create phase 2, read when the plan is mapped and at every review | `visual-analysis.json` — named regions, relational geometry, anchors, shape ownership, open questions. |
| [`architecture-plan.schema.json`](architecture-plan.schema.json) | written at the end of create phase 2, read when the template is authored | `architecture-plan.json` — region → render method → primitives, base constants, theme tokens, lane and document kind. |
| [`visual-review.schema.json`](visual-review.schema.json) | written by Visual Review Agent, read by the iteration loop | `visual-review.json` — verdict, ranked mismatches, gate evidence, and the failure category when the loop is blocked. |
| [`flow-config.schema.json`](flow-config.schema.json) | written by `scripts/lib/workspace.mjs`, read by every script that resolves a workspace | `graphcompose-flow/flow.config.json` in the user's Java project — the manifest whose presence marks a workspace, plus any version or skill-pack pin. |
| [`template-manifest.schema.json`](template-manifest.schema.json) | written by `scripts/publish-template.mjs`, read through `scripts/lib/template-bundle.mjs` | `templates/<template-id>/template.json` — the published bundle's consumer contract: which class to call, which provider loads the spec, which data file to copy and rename, where the assets are, and which dependencies a build file must declare. |
| [`layout-snapshot.schema.json`](layout-snapshot.schema.json) | written by `tools/preview-renderer` from GraphCompose's own measurement | `layout-snapshot.json` in a revision folder — where every node actually ended up: measured bounds, content box, insets, hierarchy and page span. |
| [`resolved-version.schema.json`](resolved-version.schema.json) | written by `scripts/preflight.mjs`, read by every step that would otherwise resolve the version again | `graphcompose-flow/resolved-version.json` — which GraphCompose build this workspace's work is against: the pin, the build file it came from, the jar it resolves to, whether that names one build, and the decision when it does not. |

### The layout snapshot is measured, not described

Every other schema here pins something the harness or an agent *writes*.
This one pins something GraphCompose *measured*: the projection of
`DocumentSession.layoutSnapshot()`, which the engine produces after
layout and pagination and before any backend renders bytes.

That difference decides how to react when it fails to validate. A
`visual-analysis.json` that violates its schema is an agent that wrote
the wrong shape. A `layout-snapshot.json` that violates this one is the
**engine** having changed its shape — check `formatVersion`, which is
GraphCompose's own contract version carried through verbatim, before
touching anything here.

The field names mirror the engine's records exactly, on purpose: a
projection that renamed anything would have to be kept in step with an
upstream release by hand, and nothing would notice when it was not.

### The published manifest has two shapes on disk

`template.json` is the one contract that outlives the harness: a
consumer builds against a bundle long after the run that produced it.
Three bundles were published before the consumer contract existed, so
the schema accepts both `schemaVersion` values — `1.0.0` carries a flat
`className` / `specClass` / `specProviderClass` triple, a deprecated
`dataFile` and dependency keys in a shorthand that is not a Maven
coordinate; `1.1.0` adds `entrypoint`, `data`, `resources`,
`graphComposeVersion`, `pageCount` and `version`.

Readers must not branch on that. `scripts/lib/template-bundle.mjs`
back-fills the contract from what is on disk, so a caller cannot tell
which shape it received. Expanding a manifest anywhere else is how the
bundle README came to print `io.github.demchaav:jackson` as a
dependency a consumer should declare, while the pom generator reading
the same file expanded it correctly.

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
`visual-review.json`, `template.json`, `layout-snapshot.json` — (excluding
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
