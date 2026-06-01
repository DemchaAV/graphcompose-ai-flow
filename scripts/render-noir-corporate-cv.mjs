#!/usr/bin/env node
/**
 * Backward-compat shim for `scripts/render.mjs noir-corporate-cv [revisionId]`.
 *
 * Forwards every argument to the generic render runtime. See
 * scripts/render-cv-reference.mjs for the rationale.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRender } from "./lib/render-runtime.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const revisionId = parseRevisionId(process.argv.slice(2));
runRender({ repoRoot, projectId: "noir-corporate-cv", revisionId });

function parseRevisionId(args) {
  let revision = "revision-007";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--revision" || arg === "-r") {
      revision = args[i + 1] ?? revision;
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) revision = arg;
  }
  return revision;
}
