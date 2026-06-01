#!/usr/bin/env node
/**
 * Project-agnostic render entry point.
 *
 *   node scripts/render.mjs <project-id> [revision-id]
 *   node scripts/render.mjs --project cv-reference --revision revision-009
 *
 * All doc-kind-specific knobs live in
 * examples/<project-id>/template-project.json under the `render` block
 * (see scripts/lib/render-runtime.mjs for the contract).
 *
 * Backward compat: scripts/render-cv-reference.mjs and
 * scripts/render-invoice-reference.mjs are thin shims that delegate
 * here. New reference projects do NOT need a per-project script —
 * just a `render` block in their template-project.json.
 *
 * RENDER_NO_SKIP=1 forces the full pipeline regardless of revision scope.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRender } from "./lib/render-runtime.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const { projectId, revisionId } = parseArgs(process.argv.slice(2));
if (!projectId) {
  console.error(
    "usage: node scripts/render.mjs <project-id> [revision-id]\n" +
      "       node scripts/render.mjs --project <id> --revision <id>",
  );
  process.exit(2);
}

runRender({ repoRoot, projectId, revisionId });

function parseArgs(args) {
  let projectId = null;
  let revisionId = null;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--project" || arg === "-p") {
      projectId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--revision" || arg === "-r") {
      revisionId = args[i + 1];
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) positional.push(arg);
  }
  projectId = projectId ?? positional[0] ?? null;
  revisionId = revisionId ?? positional[1] ?? null;
  if (!revisionId) revisionId = "revision-001";
  return { projectId, revisionId };
}
