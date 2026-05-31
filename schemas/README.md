# Schemas

JSON Schemas that pin the on-disk contracts shared between the tools
and the agent prompts. Schemas use the
[2020-12 draft](https://json-schema.org/draft/2020-12/schema) and are
enforced in CI by `.github/workflows/ci.yml` → `schema-validation`
job.

| Schema | Owners | What it pins |
|---|---|---|
| [`revision.schema.json`](revision.schema.json) | written by `tools/revision-manager`, read by all agent prompts | per-revision metadata under `examples/<project>/revisions/<id>/revision.json`. Covers lifecycle states, parent/child relationships, the orchestrator-written `scope` marker, and the failure record. |
| [`assets-manifest.schema.json`](assets-manifest.schema.json) | written by `tools/asset-resolver`, read by Template Coder Agent | per-revision `assets-manifest.json` — icon and font records used by the generated Java template. |

## Running locally

```bash
cd .github/scripts
npm install
node validate-schemas.mjs    # walks the repo from the root
```

The validator is zero-config: it walks the repo from the root, picks
up any `revision.json` or `assets-manifest.json` it finds (excluding
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
