#!/usr/bin/env node
/**
 * tools/schema-validate/test/validator.test.mjs — the options are the contract.
 *
 * This module exists because four callers each configured their own Ajv and
 * were free to drift: the CI sweep ran `strict: true`, two tests under
 * `scripts/test/` ran `strict: false`, and the runtime barrier resolved Ajv from
 * a directory no installation has. A schema could pass its own test and fail the
 * gate that consumes it, and a barrier could refuse every artifact on a machine
 * that was not the author's.
 *
 * So what is tested here is not "does Ajv work". It is the three decisions this
 * module makes on everyone's behalf — strict on, strictRequired off, and both
 * shapes of error carried out — because those are what a caller now inherits
 * instead of choosing.
 *
 *   node --test test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validatorFor, validatorForProperty } from "../src/index.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "schema-validate-"));
process.on("exit", () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/** Write a schema to disk, because the exported API takes a path, not an object. */
function schemaFile(name, schema) {
  const file = path.join(tmp, `${name}.schema.json`);
  fs.writeFileSync(file, JSON.stringify(schema, null, 2));
  return file;
}

const PERSON = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string" },
    page: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["format"],
      properties: { format: { type: "string" } },
    },
  },
};

test("a valid document comes back valid, with nothing to report", () => {
  const validate = validatorFor(schemaFile("person", PERSON));
  const result = validate({ name: "Ada" });

  assert.equal(result.valid, true);
  assert.equal(result.errors, null);
  assert.equal(result.detail, null);
});

test("a refusal carries both a sentence and the structured errors", () => {
  // Two consumers, two needs. `check-analysis` prints one line per artifact, so
  // it wants the sentence; the CI sweep prints instancePath and params per
  // violation, so it wants the array. An earlier draft returned only the
  // sentence, which would have made the gate report less than it did before.
  const validate = validatorFor(schemaFile("person", PERSON));
  const result = validate({ nickname: "Ada" });

  assert.equal(result.valid, false);
  assert.match(result.errors, /name/);
  assert.ok(Array.isArray(result.detail), "the raw Ajv errors did not come back");
  assert.ok(
    result.detail.some((e) => e.params?.missingProperty === "name"),
    `the structured errors do not say what is missing: ${JSON.stringify(result.detail)}`,
  );
});

test("strict mode is on, so a schema bug is a compile error and not a silent pass", () => {
  // Both of these refuse a schema that would otherwise validate everything and
  // catch nothing: a keyword that cannot apply to the type beside it, and an
  // `if` with nothing to do. Strict is set here rather than per caller so a
  // schema cannot compile in one place and throw in another — which is what a
  // caller running `strict: false` was quietly buying.
  const mistyped = schemaFile("mistyped", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { notes: { type: "string", maxItems: 3 } },
  });
  assert.throws(() => validatorFor(mistyped), /strict mode/i);

  const danglingIf = schemaFile("dangling-if", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    if: { properties: { kind: { const: "flow" } } },
  });
  assert.throws(() => validatorFor(danglingIf), /strict mode/i);
});

test("a union type still compiles, so the gate is not what forbids one", () => {
  // Worth pinning, because it is easy to assume otherwise and then rewrite a
  // schema for a rule that does not exist. `strictTypes` logs a union rather
  // than refusing it. Writing `anyOf` instead is a readability choice — the
  // branches can carry their own descriptions — not a requirement this module
  // imposes.
  const file = schemaFile("union", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { notes: { type: ["string", "null"] } },
  });

  assert.equal(validatorFor(file)({ notes: null }).valid, true);
});

test("strictRequired stays off, because several schemas require through if/then", () => {
  // `revision.schema.json` and `visual-analysis.schema.json` both do this: a
  // conditional `required` naming a property the branch does not redeclare.
  // strictRequired reads that as a bug, and it is the schema working correctly.
  const file = schemaFile("conditional", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { sizeSource: { type: "string" }, sizeDecision: { type: "string" } },
    if: { properties: { sizeSource: { const: "user-confirmed-standard" } }, required: ["sizeSource"] },
    then: { required: ["sizeDecision"] },
  });

  const validate = validatorFor(file);
  assert.equal(validate({ sizeSource: "measured-standard" }).valid, true);
  assert.equal(validate({ sizeSource: "user-confirmed-standard" }).valid, false);
});

test("a subschema validates on its own, with the parent's dialect stripped", () => {
  // A producer checks the block it emits against the schema its consumer reads —
  // `reference.mjs analyze` emits a `page` block and the visual-analysis schema
  // is what will judge it. Ajv refuses a subschema that still declares the
  // dialect its parent declared, so the strip happens here rather than in each
  // caller, where one of them will forget.
  const validate = validatorForProperty(schemaFile("person", PERSON), "page");

  assert.equal(validate({ format: "A4" }).valid, true);
  assert.equal(validate({}).valid, false);
});

test("a subschema keeps the parent's $defs, so its $refs still resolve", () => {
  // assets-manifest's `icons` and `fonts` are `$ref`s into the parent's $defs,
  // and so are blocks of revision and layout-snapshot. Lifting the property out
  // without them compiled to "can't resolve reference #/$defs/icon" — a helper
  // whose docstring promised any top-level property, false for three schemas.
  const file = schemaFile("with-defs", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    $defs: { icon: { type: "object", required: ["file"], properties: { file: { type: "string" } } } },
    properties: { icons: { type: "object", additionalProperties: { $ref: "#/$defs/icon" } } },
  });
  const validate = validatorForProperty(file, "icons");

  assert.equal(validate({ phone: { file: "assets/icons/phone.svg" } }).valid, true);
  assert.equal(validate({ phone: {} }).valid, false);
});

test("asking twice for one schema compiles it once", () => {
  const file = schemaFile("memo", PERSON);
  assert.equal(validatorFor(file), validatorFor(file), "the same path came back as two validators");
  assert.equal(validatorForProperty(file, "page"), validatorForProperty(file, "page"));
});

test("asking for a property the schema does not have says so by name", () => {
  assert.throws(
    () => validatorForProperty(schemaFile("person", PERSON), "margins"),
    /has no property "margins"/,
  );
});
