#!/usr/bin/env node
/**
 * Project-agnostic render entry point.
 *
 *   node scripts/render.mjs <project-id> [revision-id]
 *   node scripts/render.mjs --project cv-reference --revision revision-009
 *
 * All doc-kind-specific knobs live in the project's
 * template-project.json under the `render` block (see
 * scripts/lib/render-runtime.mjs for the contract).
 *
 * The project is looked up in the resolved workspace: --root, else
 * GRAPHCOMPOSE_FLOW_ROOT, else a graphcompose-flow/ directory found above the
 * cwd, else this repository's own examples/ (see scripts/lib/workspace.mjs).
 *
 * Backward compat: scripts/render-cv-reference.mjs and
 * scripts/render-invoice-reference.mjs are thin shims that delegate
 * here. New reference projects do NOT need a per-project script —
 * just a `render` block in their template-project.json.
 *
 * RENDER_NO_SKIP=1 forces the full pipeline regardless of revision scope.
 */

import { runRender } from "./lib/render-runtime.mjs";
import {
  describeWorkspaceLine,
  installRoot,
  requireProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const repoRoot = installRoot();

const { projectId, revisionId, root, dataFile, suffix } = parseArgs(process.argv.slice(2));
if (!projectId) {
  console.error(
    "usage: node scripts/render.mjs <project-id> [revision-id] [--root <workspace>]\n" +
      "       node scripts/render.mjs --project <id> --revision <id>",
  );
  process.exit(2);
}

const workspace = resolveWorkspace({ explicitRoot: root });
const banner = describeWorkspaceLine(workspace);
if (banner) console.log(banner);

let projectDir;
try {
  projectDir = requireProjectDir(workspace, projectId);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

runRender({ repoRoot, projectId, revisionId, projectDir, dataFileOverride: dataFile, outputSuffix: suffix });

function parseArgs(args) {
  let projectId = null;
  let revisionId = null;
  let root = null;
  let dataFile = null;
  let suffix = "";
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
    if (arg === "--root") {
      root = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--data-file") {
      dataFile = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--suffix") {
      suffix = args[i + 1];
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) positional.push(arg);
  }
  projectId = projectId ?? positional[0] ?? null;
  revisionId = revisionId ?? positional[1] ?? null;
  if (!revisionId) revisionId = "revision-001";
  return { projectId, revisionId, root, dataFile, suffix };
}
