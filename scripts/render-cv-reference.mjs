#!/usr/bin/env node
/**
 * Backward-compat shim for `scripts/render.mjs cv-reference [revisionId]`.
 *
 * Older docs and Makefiles call this path directly; new callers should
 * use `node scripts/render.mjs cv-reference <revision>` (or any project
 * id with a `render` block in its template-project.json). This shim
 * stays for source compatibility and forwards every argument.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRender } from "./lib/render-runtime.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const revisionId = parseRevisionId(process.argv.slice(2));
runRender({ repoRoot, projectId: "cv-reference", revisionId });

function parseRevisionId(args) {
  let revision = "revision-002";
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
