/**
 * scripts/lib/schema-validator.mjs — reach the shipped validator, or say so.
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
 * Returns null rather than throwing when the tool is not built. The caller has
 * to decide what an unavailable validator means for the question it is
 * answering, and for a barrier the answer is "hold", never "pass".
 */

import fs from "node:fs";
import path from "node:path";

import { installRoot } from "./workspace.mjs";

const TOOL = path.join(installRoot(), "tools", "schema-validate", "src", "index.mjs");

let cached;

/** The tool's exports, or null when it has not been installed. */
async function load() {
  if (cached !== undefined) return cached;
  if (!fs.existsSync(TOOL) || !fs.existsSync(path.join(installRoot(), "tools", "schema-validate", "node_modules"))) {
    cached = null;
    return cached;
  }
  try {
    cached = await import(`file://${TOOL.split(path.sep).join("/")}`);
  } catch {
    cached = null;
  }
  return cached;
}

let mod = null;

/**
 * Load the tool once, before any validator is asked for. False means it is not
 * installed — decide what that means for the question being asked, and for a
 * barrier the answer is "hold", never "pass".
 */
export async function ready() {
  mod = await load();
  return mod !== null;
}

/**
 * A validator over a schema file, or over one of its top-level properties —
 * `page` inside the visual-analysis document, say, which is how a producer
 * checks the block it emits against the schema its consumer reads.
 *
 * Synchronous, because every caller is a small CLI that has already awaited
 * `ready()`. Returns null when the tool is not installed.
 *
 * @param {string} schemaFile
 * @param {string} [property]  a top-level property, to validate a subdocument
 * @returns {((doc: unknown) => {valid: boolean, errors: string|null})|null}
 */
export function schemaValidator(schemaFile, property) {
  if (!mod) return null;
  return property ? mod.validatorForProperty(schemaFile, property) : mod.validatorFor(schemaFile);
}
