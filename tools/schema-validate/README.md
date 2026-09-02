# tools/schema-validate

One JSON Schema validator, shared by the CI sweep and by everything the harness
runs at work time.

## Why it is a shipped tool

Validation used to live only in `.github/scripts`. That is the right home for a
sweep over the repository and the wrong one for anything a workflow runs:
`adapters/lib/runtime.mjs` decides what an install consists of, and `.github` is
not in it. A barrier that loaded Ajv from there answered *"the schema validator
is not installed"* for every artifact in every real installation — and passed on
the one machine where somebody had once run `npm ci` in that directory by hand.

It was also four separate configurations of the same validator, free to drift,
and two of them already had: the sweep ran `strict: true` while two tests under
`scripts/test/` ran `strict: false`, so a schema could pass its own test and
fail the gate that consumes it.

Living here fixes both. `npm run setup` installs it with the other Node tools,
the adapters copy it into an install with its `node_modules`, and CI and the
runtime compile against the same Ajv with the same options.

## The options, and why

| Option | Value | Because |
|---|---|---|
| `allErrors` | `true` | A refusal should name everything wrong with the document, not the first thing. |
| `strict` | `true` | A keyword that cannot apply to the type beside it, or an `if` with no `then`, is a schema that validates everything and catches nothing. Finding that at author time is the point. |
| `strictRequired` | `false` | `revision.schema.json` and `visual-analysis.schema.json` require conditionally through `if`/`then`, naming properties the branch does not redeclare. That check reads it as a bug; it is the schema working. |

A union written as `"type": ["string", "null"]` compiles — `strictTypes` logs it
rather than refusing it. `anyOf` is a readability choice, not a rule this
imposes.

## Use

```js
import { validatorFor, validatorForProperty } from "../../tools/schema-validate/src/index.mjs";

const validate = validatorFor("schemas/assets-manifest.schema.json");
const { valid, errors, detail } = validate(document);
```

`errors` is the sentence a person reads; `detail` is Ajv's own array, for a
caller that formats per violation — the CI sweep prints `instancePath` and
`params` for each one.

`validatorForProperty(file, "page")` compiles one top-level property as its own
schema, which is how a producer checks the block it emits against the schema its
consumer reads. The parent's `$schema` is stripped here, because Ajv refuses a
subschema that still declares it and every caller would otherwise have to
remember.

From inside `scripts/`, reach it through
[`scripts/lib/schema-validator.mjs`](../../scripts/lib/schema-validator.mjs)
instead: it resolves the install root, and returns `null` rather than throwing
when the tool is not built. A barrier that cannot validate must hold, never pass.

## Tests

```bash
cd tools/schema-validate && npm test
```

What is tested is not "does Ajv work" — it is the three decisions this module
makes on every caller's behalf, because those are what a caller now inherits
instead of choosing.
