/**
 * tools/schema-validate — one validator, for CI and for a running harness.
 *
 * ## Why this is a shipped tool and not a dev dependency
 *
 * Schema validation used to live only in `.github/scripts`, which is correct
 * for a CI sweep over the repository and wrong for anything a workflow runs.
 * `adapters/lib/runtime.mjs` decides what an install consists of, and `.github`
 * is not in it: an installed harness has `scripts/`, `schemas/` and the tools,
 * and no `node_modules` for the CI directory.
 *
 * So a barrier that loaded Ajv from there answered "the schema validator is not
 * installed" for every artifact in every real installation — and, because the
 * repository's own harness-contracts job does not install those dev
 * dependencies either, its tests went red in CI while passing on a machine
 * where somebody had once run `npm ci` in that directory by hand.
 *
 * Living here fixes both. `scripts/setup.mjs` installs it with the other Node
 * tools, the adapters copy it into an install with its `node_modules`, and CI
 * and the runtime validate against the same Ajv with the same options.
 *
 * ## The contract
 *
 * `strict` is on, matching what the CI sweep has always used: a schema with a
 * union type or an unusable keyword is a schema bug, and finding it at author
 * time is the point. `strictRequired` is off because several schemas describe
 * conditionally-required fields through `if`/`then`, which that check
 * misreads.
 */

import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020.js").default;
const addFormats = require("ajv-formats");

/** One Ajv, configured once. Everything below compiles through here. */
function compile(schema) {
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
  addFormats.default(ajv);
  const validate = ajv.compile(schema);
  // `errors` is the sentence a person reads; `detail` is Ajv's own array, for a
  // caller that formats per-error — the CI sweep prints instancePath and params
  // per violation, and flattening that to a sentence would have made the gate
  // report less than it used to.
  return (doc) =>
    validate(doc)
      ? { valid: true, errors: null, detail: null }
      : { valid: false, errors: ajv.errorsText(validate.errors), detail: validate.errors };
}

/**
 * A validator over one schema file.
 *
 * @param {string} schemaFile  absolute path to a JSON Schema document
 * @returns {(doc: unknown) => {valid: boolean, errors: string|null, detail: object[]|null}}
 */
export function validatorFor(schemaFile) {
  return compile(JSON.parse(fs.readFileSync(schemaFile, "utf8")));
}

/**
 * A validator over a subschema — `page` inside the visual-analysis document,
 * say. Kept here rather than in the caller so the `$schema` key is stripped
 * consistently: Ajv refuses a subschema that still declares the dialect its
 * parent declared.
 *
 * @param {string} schemaFile
 * @param {string} property  a top-level property of that schema
 */
export function validatorForProperty(schemaFile, property) {
  const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
  const sub = schema.properties?.[property];
  if (!sub) throw new Error(`${schemaFile} has no property "${property}"`);
  return compile({ ...sub, $schema: undefined });
}
