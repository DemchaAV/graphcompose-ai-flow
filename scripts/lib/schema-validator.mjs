/**
 * scripts/lib/schema-validator.mjs — reach the shipped validator, or say why not.
 *
 * `tools/schema-validate` carries Ajv and is installed by `npm run setup` and
 * copied into every adapter install. This is the one place that resolves it, so
 * a caller never reaches into another package's `node_modules` — which is the
 * mistake this file exists to stop repeating. The first version of the analysis
 * barrier loaded Ajv from `.github/scripts/node_modules`, a directory no
 * installation has and no setup step populates, and it therefore refused every
 * artifact for every user while passing on the one machine where somebody had
 * run `npm ci` there by hand.
 *
 * Returns null rather than throwing when the tool cannot be used, and keeps the
 * reason: "never installed" and "installed but will not load" are fixed by
 * different people. The first is `npm run setup`; the second — a broken `ajv`,
 * a syntax error in the tool — is not, and a barrier that answered both with
 * "run setup" sent one reader to run a command that could not help. The caller
 * decides what an unavailable validator means for its question, and for a
 * barrier the answer is "hold", never "pass".
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { installRoot } from "./workspace.mjs";

const TOOL_DIR = path.join(installRoot(), "tools", "schema-validate");
const TOOL = path.join(TOOL_DIR, "src", "index.mjs");

/** The tool's exports once loaded; null when it cannot be; undefined before `ready()`. */
let mod;
/** Why it could not be loaded, or null. */
let failure = null;

/**
 * Load the tool once, before any validator is asked for. False means it is not
 * usable; `loadFailure()` says why.
 */
export async function ready() {
  if (mod !== undefined) return mod !== null;
  if (!fs.existsSync(TOOL)) {
    failure = `tools/schema-validate is not part of this install — ${TOOL} is missing`;
    mod = null;
  } else if (!fs.existsSync(path.join(TOOL_DIR, "node_modules"))) {
    failure = "the schema validator is not installed — run npm run setup";
    mod = null;
  } else {
    try {
      // pathToFileURL, not string concatenation: a `#` or `%` in the install
      // root — a username, a roaming profile — and a UNC path each broke the
      // hand-built form, and the failure was then reported as "run setup".
      mod = await import(pathToFileURL(TOOL).href);
      failure = null;
    } catch (err) {
      failure = `the schema validator is installed but failed to load — ${err.message}`;
      mod = null;
    }
  }
  return mod !== null;
}

/** The reason `ready()` answered false, in one sentence a caller can print. */
export function loadFailure() {
  return failure;
}

/**
 * A validator over a schema file, or over one of its top-level properties —
 * `page` inside the visual-analysis document, say, which is how a producer
 * checks the block it emits against the schema its consumer reads.
 *
 * Synchronous, because every caller is a small CLI that has already awaited
 * `ready()`. Returns null when the tool is not usable.
 *
 * @param {string} schemaFile
 * @param {string} [property]  a top-level property, to validate a subdocument
 * @returns {((doc: unknown) => {valid: boolean, errors: string|null, detail: object[]|null})|null}
 */
export function schemaValidator(schemaFile, property) {
  if (!mod) return null;
  return property ? mod.validatorForProperty(schemaFile, property) : mod.validatorFor(schemaFile);
}
